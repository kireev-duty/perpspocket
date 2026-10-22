// Hold `somnia_watch` subscriptions on the BTC and ETH pools for N minutes
// (default 45) and log every onError with its full shape, plus pushes per
// minute, to see whether streams drop and whether they come back by
// themselves. Read-only. Usage: npx tsx scripts/reactivity-soak.ts [minutes]
import { createReactivity } from "@somnia-chain/markets-sdk/reactivity";
import { encodeFunctionData, parseAbi } from "viem";
import * as engine from "../src/engine.js";

const minutes = Number(process.argv[2] ?? 45);
const CALL = encodeFunctionData({ abi: parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]), functionName: "tryGetMarkPrice" });
const ts = () => new Date().toISOString();

const reactivity = createReactivity(engine.exchange.client);
const counts = new Map<string, number>();
const lastPush = new Map<string, number>();

for (const sym of ["BTC", "ETH"]) {
  const m = await engine.market(sym);
  counts.set(sym, 0);
  const res = await reactivity.watch({
    eventContractSources: [m.info.poolAddress],
    ethCalls: [{ to: m.info.poolAddress, data: CALL }],
    onlyPushChanges: true,
    onData: () => {
      counts.set(sym, counts.get(sym)! + 1);
      lastPush.set(sym, Date.now());
    },
    onError: (e: Error) => {
      const silent = lastPush.has(sym) ? `${Math.round((Date.now() - lastPush.get(sym)!) / 1000)} s since last push` : "no push yet";
      console.log(`${ts()} ERROR ${sym} name=${e?.name} message=${JSON.stringify(e?.message)} cause=${JSON.stringify(String((e as { cause?: unknown })?.cause ?? ""))} (${silent})`);
    },
  });
  console.log(`${ts()} ${sym} subscribed: ${res instanceof Error ? `FAILED ${res.message}` : "ok"}`);
}

for (let i = 1; i <= minutes; i++) {
  await new Promise((r) => setTimeout(r, 60_000));
  console.log(`${ts()} minute ${i}: ${[...counts].map(([s, n]) => `${s} ${n}`).join(", ")}`);
  for (const s of counts.keys()) counts.set(s, 0);
}
process.exit(0);
