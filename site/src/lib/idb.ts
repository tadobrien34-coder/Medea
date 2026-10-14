/** Tiny promise key-value store on IndexedDB (falls back to memory if it is unavailable). */
const mem = new Map<string, unknown>()
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('medea', 1)
        r.onupgradeneeded = () => r.result.createObjectStore('kv')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      } catch (e) { rej(e) }
    })
  }
  return dbp
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db()
    return await new Promise<T | undefined>((res, rej) => {
      const q = d.transaction('kv').objectStore('kv').get(key)
      q.onsuccess = () => res(q.result as T | undefined)
      q.onerror = () => rej(q.error)
    })
  } catch { return mem.get(key) as T | undefined }
}

export async function kvSet(key: string, val: unknown): Promise<void> {
  mem.set(key, val)
  try {
    const d = await db()
    await new Promise<void>((res, rej) => {
      const tx = d.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(val, key)
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
    })
  } catch { /* private mode: memory only */ }
}

export async function kvDel(key: string): Promise<void> {
  mem.delete(key)
  try {
    const d = await db()
    await new Promise<void>((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = () => res(); tx.onerror = () => res() })
  } catch { /* ignore */ }
}
