
export abstract class MemoObject {
    private static readonly memoCache = new Map<string, unknown>()

    protected static memo<T>(key: string, compute: () => T): T {
        if (!this.memoCache.has(key)) {
            this.memoCache.set(key, compute())
        }
        return this.memoCache.get(key) as T
    }

}