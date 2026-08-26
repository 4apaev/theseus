// the "Upsert" proposal - Map.prototype.getOrInsert / getOrInsertComputed.
// shipped in Node (v26.7 confirmed), not yet in TypeScript's lib.es*.d.ts
// or @types/node. a global augmentation, so any package gets it for free -
// not domain-specific, this is just where the first caller lives.
export {}

declare global {
    interface Map<K, V> {
        /** returns the value at `key`, or inserts `value` and returns it */
        getOrInsert(key: K, value: V): V
        /** returns the value at `key`, or inserts `callbackfn(key)` and returns it */
        getOrInsertComputed(key: K, callbackfn: (key: K) => V): V
    }
}
