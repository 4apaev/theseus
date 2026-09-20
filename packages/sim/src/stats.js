/**
 * @typedef {{ method: string, path: string, status: number, ms: number }} Sample
 */

export class Stats {
    http     = /** @type { Sample[] } */ ([])
    asked    = /** @type { Record<string, number> } */ ({})
    answered = /** @type { Record<string, number> } */ ({})
    errors   = /** @type { object[] } */ ([])
    latency  = /** @type { { action: string, ms: number }[] } */ ([])
    timeouts = 0

    request(method, path, status, ms) {
        this.http.push({ method, path: mask(path), status, ms })
    }

    ask(action) {
        this.asked[ action ] = (this.asked[ action ] ?? 0) + 1
    }

    answer(event_type, action, ms) {
        this.answered[ event_type ] = (this.answered[ event_type ] ?? 0) + 1
        this.latency.push({ action, ms })
    }

    error(where, status, message) {
        this.errors.push({ where: mask(where), status, message })
    }
}

// ids differ per run - group by shape, not by value
function mask(path) {
    return path
        .replace(/\/ship\/[^/]+/, '/ship/:sid')
        .replace(/\/station\/[^/]+/, '/station/:stid')
        .replace(/modules\/(?!preview)[^/?]+/, 'modules/:slot')
}
