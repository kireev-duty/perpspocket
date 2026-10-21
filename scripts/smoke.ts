// Smoke test without Telegram or funds: read paths for a fresh, unlinked key,
// a refused order, and a PnL card render to data/card-sample.png.
import { writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encrypt, type User } from "../src/db.js";
import * as engine from "../src/engine.js";
import { pnlCard } from "../src/card.js";

const step = async <T>(name: string, fn: () => Promise<T>) => {
  const t = Date.now();
  try {
    const v = await fn();
    console.log(`${name} (${Date.now() - t}ms)`, v);
  } catch (e) {
    console.log(`${name} FAILED (${Date.now() - t}ms)`, (e as Error).message);
  }
};

const pk = generatePrivateKey();
const user: User = {
  tg_id: 1, username: "smoke", enc_key: encrypt(pk), bot_address: privateKeyToAccount(pk).address,
  owner: "0x1111111111111111111111111111111111111111", ref_by: null, created_at: 0,
};
await step("coverage", () => engine.linkCoverage(user));
await step("equity", () => engine.equity(user));
await step("positions", () => engine.positions(user));
await step("orders", async () => (await engine.openOrders(user)).length);
const btc = await engine.market("btc");
await step("touch", () => engine.touch(btc));
await step("mark", () => engine.mark(btc));
await step("open (should refuse: not linked)", () => engine.open(user, "BTC", "long", 25));
writeFileSync("data/card-sample.png", pnlCard({
  symbol: "BTC-PERP", side: "long", entry: 84210.5, mark: 86990.1, pnl: 41.27, roePct: 33.0, leverage: 5,
  handle: "satoshi", refLink: "t.me/PerpsPocketBot?start=ref_42",
}));
console.log("card ok");
process.exit(0);
