// Bounded awaits. grammy handles updates one at a time and the watcher skips a
// tick while the previous one runs, so a single RPC call that never settles
// would freeze every chat and every TP/SL. Each step gets a deadline and a
// label, and anything slow is logged so a stall shows where it happened.

export class StepTimeout extends Error {
  constructor(readonly label: string, readonly ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)} s`);
  }
}

const SLOW_MS = 5_000;

export async function within<T>(label: string, ms: number, work: Promise<T>): Promise<T> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StepTimeout(label, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    const took = Date.now() - started;
    if (took > SLOW_MS) console.log(`slow: ${label} took ${took} ms`);
  }
}
