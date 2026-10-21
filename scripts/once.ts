// One real trade through the same engine the bot uses, without Telegram:
//   npm run once -- BTC long 25     open $25 long at market
//   npm run once -- BTC close       close the whole position
//   npm run once -- status          positions and equity
// Needs PRIVATE_KEY (a bot key linked in the app) and OWNER_ADDRESS (your account).

import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { encrypt, type User } from "../src/db.js";
import * as engine from "../src/engine.js";

const pk = (process.env.PRIVATE_KEY ?? "").trim() as `0x${string}`;
const owner = (process.env.OWNER_ADDRESS ?? "").trim();
if (!pk || !owner) throw new Error("Set PRIVATE_KEY (linked bot key) and OWNER_ADDRESS (your DreamDEX account) in .env");

const user: User = {
  tg_id: 0,
  username: "cli",
  enc_key: encrypt(pk),
  bot_address: privateKeyToAccount(pk).address,
  owner: getAddress(owner),
  ref_by: null,
  created_at: Date.now(),
};

const [a, b, c] = process.argv.slice(2);
console.log(`bot key ${user.bot_address} → account ${user.owner}`);
console.log("gas", await engine.gasBalance(user.bot_address), "STT");

if (!a || a === "status") {
  console.log("coverage", await engine.linkCoverage(user));
  console.log("equity", await engine.equity(user));
  console.log("positions", (await engine.positions(user)).map((p) => ({ ...p, market: p.market.display })));
  console.log("orders", (await engine.openOrders(user)).map((o) => ({ ...o, market: o.market.display })));
} else if (b === "long" || b === "short") {
  const r = await engine.open(user, a, b, Number(c ?? 25));
  console.log(r, engine.txUrl(r.hash));
} else if (b === "close") {
  const r = await engine.close(user, a, c ? Number(c) / 100 : 1);
  console.log(r, engine.txUrl(r.hash));
} else {
  console.log("usage: npm run once -- [status | BTC long 25 | BTC short 25 | BTC close [pct]]");
}
process.exit(0);
