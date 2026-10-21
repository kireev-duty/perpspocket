// Subscribe to the BTC and ETH pools over Somnia Reactivity for 60 s and print
// every mark push. Read-only: proves the stream the TP/SL watcher relies on.
import * as engine from "../src/engine.js";
import { follow, onMark, streams } from "../src/reactive.js";

const pools = await Promise.all(["BTC", "ETH"].map((s) => engine.market(s)));
onMark((p) => {
  const m = pools.find((x) => x.info.poolAddress.toLowerCase() === p.pool.toLowerCase());
  console.log(new Date(p.at).toISOString(), m?.display, p.mark);
});
for (const m of pools) console.log(m.display, "subscribed:", await follow(m.info.poolAddress));
await new Promise((r) => setTimeout(r, Number(process.argv[2] ?? 60) * 1000));
console.log(streams());
process.exit(0);
