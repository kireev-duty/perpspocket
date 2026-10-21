// Exercises the social tables on a throwaway database: DATA_DIR=<tmp> npx tsx scripts/db-check.ts
import assert from "node:assert/strict";
import { users, trades, triggers, follows, groups, userByName, encrypt } from "../src/db.js";

for (const [id, name] of [[1, "alice"], [2, "bob"], [3, "carol"]] as const) {
  users.create({ tg_id: id, username: name, enc_key: encrypt("0x" + "1".repeat(64)), bot_address: "0x0000000000000000000000000000000000000001", ref_by: null });
}
follows.set(2, 1, 25);
follows.set(3, 1, 50);
follows.set(2, 1, 30);
assert.equal(follows.count(1), 2);
assert.deepEqual(follows.of(1).map((f) => [f.follower, f.usd]).sort(), [[2, 30], [3, 50]]);
assert.equal(userByName("@ALICE")?.tg_id, 1);
groups.join(-100, 1, "Perps chat");
groups.join(-100, 2, "Perps chat");
groups.join(-100, 1, "Perps chat renamed");
assert.deepEqual(groups.of(1), [-100]);
trades.add({ tg_id: 1, symbol: "BTC", side: "short", kind: "close", quantity: 0.001, price: 84000, tx: "0xa", pnl: 4.2 });
trades.add({ tg_id: 2, symbol: "ETH", side: "long", kind: "close", quantity: 0.01, price: 2500, tx: "0xb", pnl: -1 });
trades.add({ tg_id: 3, symbol: "SOL", side: "long", kind: "close", quantity: 1, price: 100, tx: "0xc", pnl: 9 });
const board = groups.leaderboard(-100, 0);
assert.deepEqual(board.map((r) => r.tg_id), [1, 2], "carol is not in the group");
triggers.set(1, "BTC", "tp", 90000, "long");
assert.equal(triggers.active()[0]!.side, "long");
follows.remove(2);
assert.equal(follows.count(1), 1);
console.log("db-check ok");
