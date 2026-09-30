import { summarizeResult, type TestResult } from "./results";

let current: TestResult | null = null;
const key = "current-result";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("oneminute-current", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("result");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Browser result storage is blocked."));
  });
}
export async function saveResult(test: TestResult): Promise<boolean> {
  current = test;
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction("result", "readwrite");
      const store = transaction.objectStore("result");
      store.put(test, key);
      store.put(test, test.id);
      const all = store.getAll();
      all.onsuccess = () => {
        const runs = (all.result as TestResult[])
          .filter((run) => run.id !== test.id)
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
        const seen = new Set<string>([test.id]);
        for (const run of runs) {
          if (seen.has(run.id)) continue;
          seen.add(run.id);
          if (seen.size > 20) store.delete(run.id);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error);
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
export async function readResult(): Promise<TestResult | null> {
  if (current) {
    current.results.forEach(summarizeResult);
    return current;
  }
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    const value = await new Promise<TestResult | undefined>(
      (resolve, reject) => {
        const request = db!
          .transaction("result")
          .objectStore("result")
          .get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    if (value?.mode !== "live" || !value.results?.length) return null;
    value.results.forEach(summarizeResult);
    current = value;
    return current;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function listResults(): Promise<TestResult[]> {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    const values = await new Promise<TestResult[]>((resolve, reject) => {
      const request = db!.transaction("result").objectStore("result").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return [...new Map(values.map((run) => [run.id, run])).values()]
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, 20);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}
