import { guid, pick } from '@theseus/util'
import { createCommandRecord   } from '@theseus/kafka'
import { createCommandEnvelope } from '@theseus/contracts'

/**
 * the command side of the gateway:
 * it builds an envelope, publishes it,
 * and parks on the waiter for a correlated reply.
 *
 * @param { string  } service - requested_by on every envelope
 * @param { Producer} producer
 * @param { Replies } waiter
 */
export function createCommands(service, producer, waiter) {
    return { fire, route }

    /**
     * @param {string} command_type
     * @param {object} payload
     * @return {object}
     */
    function envelope(command_type, payload) {
        return createCommandEnvelope({
            cmd         : guid(),
            requested_by: service,
            command_type, // validation failure → Fail 417 → http 400
            payload,
        })
    }

    /*
        register the waiter, then publish.
        the memory broker in tests delivers
        the reply before publish() resolves
    */
    async function publishAndWait(cmd, types) {
        const reply = waiter.wait(cmd.correlation_id, types)
        await producer.publish(createCommandRecord(cmd))
        return reply
    }

    /**
     * fires a command. with reply types,
     * it waits for one and returns it too.
     * with none, it does not wait.
     *
     * @param {string} ct  - the command type
     * @param {object} pay - the command payload
     * @param {...string} et  - event types to wait for
     * @return {Promise<[ object, object | undefined ]>}
     */
    async function fire(ct, pay, ...et) {

        const cmd = envelope(ct, pay)
        const rs = et.length
            ? await publishAndWait(cmd, et)
            : await producer.publish(createCommandRecord(cmd))

        return [ cmd, rs ]
    }

    /**
     * builds a route handler for one command.
     * every path param joins the payload.
     * keys names the body fields to copy,
     * space separated. the pid comes from the
     * token, and wins over both.
     * never waits for a reply.
     *
     * @param {{ requested: string }} cmmd - the command's tree entry
     * @param {number} [code] - the http status to reply with
     * @param {string} [keys] - body fields to copy
     * @return {MWare}
     */
    function route(cmmd, code, keys) {
        return async (rq, rs) => {
            const payload = {
                ...rq.params,
                ...(keys
                    ? pick(rq.body, ...keys.match(/\w+/g))
                    : rq.body),
                pid: rq.claims.pid,
            }
            const [ cmd ] = await fire(cmmd.requested, payload)
            rs.json(code ?? 202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id })
        }
    }
}

/**
 * @typedef { import('garage').MWare                      } MWare
 * @typedef { import('../types/replies.js').Replies       } Replies
 * @typedef { import('../types/routes.js').RoutesProducer } Producer
 */
