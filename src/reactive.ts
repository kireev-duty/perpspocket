// Somnia Reactivity mark feed. One `somnia_watch` subscription per perp pool:
// every log the pool emits arrives with `tryGetMarkPrice()` already evaluated
// at that same block, and `onlyPushChanges` drops pushes where the mark did
// not move. The watcher reacts to each push instead of waiting for its poll.

import { createReactivity } from "@somnia-chain/markets-sdk/reactivity";
import type { ReactivityNotification } from "@somnia-chain/markets-sdk/reactivity";
import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address } from "viem";
import { exchange } from "./engine.js";

const ABI = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const CALLDATA = encodeFunctionData({ abi: ABI, functionName: "tryGetMarkPrice" });

export interface MarkPush {
  pool: Address;
  mark: number;
  at: number;
}

type Listener = (push: MarkPush) => void;

const subs = new Map<string, { unsubscribe: () => Promise<unknown>; pushes: number; last: number }>();
const listeners: Listener[] = [];
let reactivity: ReturnType<typeof createReactivity> | undefined;

export function onMark(fn: Listener) {
  listeners.push(fn);
}

function decode(n: ReactivityNotification): number | undefined {
  const raw = n.result.simulationResults[0];
  if (!raw) return undefined;
  const [ok, price] = decodeFunctionResult({ abi: ABI, functionName: "tryGetMarkPrice", data: raw });
  return ok && price > 0n ? Number(price) / 1e18 : undefined;
}

/** Start following a pool's mark. Safe to call again for a pool already followed. */
export async function follow(pool: Address): Promise<boolean> {
  const key = pool.toLowerCase();
  if (subs.has(key)) return true;
  reactivity ??= createReactivity(exchange.client);
  const res = await reactivity.watch({
    eventContractSources: [pool],
    ethCalls: [{ to: pool, data: CALLDATA }],
    onlyPushChanges: true,
    onData: (n: ReactivityNotification) => {
      const mark = decode(n);
      const s = subs.get(key);
      if (!mark || !s) return;
      s.pushes++;
      s.last = Date.now();
      for (const fn of listeners) fn({ pool, mark, at: s.last });
    },
    onError: (e: Error) => {
      console.error(`reactivity ${pool}: ${e.message}`);
      subs.delete(key);
    },
  });
  if (res instanceof Error) {
    console.error(`reactivity subscribe ${pool} failed: ${res.message}`);
    return false;
  }
  subs.set(key, { unsubscribe: res.unsubscribe, pushes: 0, last: 0 });
  return true;
}

export async function unfollow(pool: Address) {
  const s = subs.get(pool.toLowerCase());
  subs.delete(pool.toLowerCase());
  await s?.unsubscribe().catch(() => undefined);
}

/** Pools followed and how many pushes each delivered, for /status and logs. */
export function streams(): Array<{ pool: string; pushes: number; last: number }> {
  return [...subs.entries()].map(([pool, s]) => ({ pool, pushes: s.pushes, last: s.last }));
}
