// Read-only check: lists every perp market with its mark, funding and grid.
// Sends nothing. Run before anything else to prove the SDK can reach Hideki.
import { createExchange, perpMarkets, liveMark, fundingApr, fromRaw, shutdown } from "../src/perp-core/index.js";

const ctx = createExchange();
const markets = await perpMarkets(ctx.exchange, true);
console.log(`network ${ctx.config.network} | ${markets.length} live perp markets`);
for (const m of markets) {
  const mark = await liveMark(ctx.exchange, m);
  const i = m.info;
  console.log(
    `${m.display.padEnd(14)} mark ${String(mark ?? "stale").padEnd(14)} base dec ${String(i.baseDecimals).padEnd(3)}` +
      ` min ${fromRaw(i.minQuantity, i.baseDecimals)} lot ${fromRaw(i.lotSize, i.baseDecimals)} tick ${fromRaw(i.tickSize, 18)}` +
      ` IM ${i.initialMarginBps}bps funding APR ${(fundingApr(i).apr * 100).toFixed(2)}%`,
  );
}
if (ctx.exchange.walletAddress) console.log(`account ${ctx.exchange.walletAddress}`);
await shutdown(ctx);
process.exit(0);
