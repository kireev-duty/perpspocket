// Storage on Node's built-in SQLite. Every user's bot key is encrypted at rest
// with AES-256-GCM under a key derived from MASTER_KEY; the plaintext key only
// lives in memory while an order is being signed.

import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { appConfig } from "./config.js";

mkdirSync(appConfig.dataDir, { recursive: true });
const db = new DatabaseSync(join(appConfig.dataDir, "perpspocket.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  tg_id       INTEGER PRIMARY KEY,
  username    TEXT,
  enc_key     TEXT NOT NULL,
  bot_address TEXT NOT NULL,
  owner       TEXT,
  ref_by      INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id      INTEGER NOT NULL,
  symbol     TEXT NOT NULL,
  side       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  quantity   REAL NOT NULL,
  price      REAL NOT NULL,
  tx         TEXT NOT NULL,
  pnl        REAL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS triggers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id      INTEGER NOT NULL,
  symbol     TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('tp','sl')),
  price      REAL NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (tg_id, symbol, kind)
);
CREATE TABLE IF NOT EXISTS liq_alerts (
  tg_id   INTEGER NOT NULL,
  symbol  TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (tg_id, symbol)
);
CREATE TABLE IF NOT EXISTS follows (
  follower   INTEGER NOT NULL,
  leader     INTEGER NOT NULL,
  usd        REAL NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower, leader)
);
CREATE TABLE IF NOT EXISTS group_members (
  chat_id INTEGER NOT NULL,
  tg_id   INTEGER NOT NULL,
  title   TEXT,
  PRIMARY KEY (chat_id, tg_id)
);
`);

// Added after the first release: the position side a TP/SL was set against, so
// a mark push can be judged without reading the position first.
const triggerCols = (db.prepare("PRAGMA table_info(triggers)").all() as Array<{ name: string }>).map((c) => c.name);
if (!triggerCols.includes("side")) db.exec("ALTER TABLE triggers ADD COLUMN side TEXT");

const aesKey = () => createHash("sha256").update(appConfig.masterKey()).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", aesKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, body] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", aesKey(), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(body!), d.final()]).toString("utf8");
}

export interface User {
  tg_id: number;
  username: string | null;
  enc_key: string;
  bot_address: `0x${string}`;
  owner: `0x${string}` | null;
  ref_by: number | null;
  created_at: number;
}

export interface Trigger {
  id: number;
  tg_id: number;
  symbol: string;
  kind: "tp" | "sl";
  price: number;
  side: "long" | "short" | null;
}

export const users = {
  get: (tgId: number) => db.prepare("SELECT * FROM users WHERE tg_id = ?").get(tgId) as User | undefined,
  create: (u: Omit<User, "created_at" | "owner">) =>
    db
      .prepare("INSERT INTO users (tg_id, username, enc_key, bot_address, ref_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(u.tg_id, u.username, u.enc_key, u.bot_address, u.ref_by, Date.now()),
  setOwner: (tgId: number, owner: string | null) => db.prepare("UPDATE users SET owner = ? WHERE tg_id = ?").run(owner, tgId),
  linked: () => db.prepare("SELECT * FROM users WHERE owner IS NOT NULL").all() as unknown as User[],
  referrals: (tgId: number) => (db.prepare("SELECT COUNT(*) AS n FROM users WHERE ref_by = ?").get(tgId) as { n: number }).n,
  count: () => (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
};

export const trades = {
  add: (t: { tg_id: number; symbol: string; side: string; kind: string; quantity: number; price: number; tx: string; pnl?: number }) =>
    db
      .prepare("INSERT INTO trades (tg_id, symbol, side, kind, quantity, price, tx, pnl, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(t.tg_id, t.symbol, t.side, t.kind, t.quantity, t.price, t.tx, t.pnl ?? null, Date.now()),
  recent: (tgId: number, limit = 10) =>
    db.prepare("SELECT * FROM trades WHERE tg_id = ? ORDER BY id DESC LIMIT ?").all(tgId, limit) as Array<{
      symbol: string; side: string; kind: string; quantity: number; price: number; tx: string; pnl: number | null; created_at: number;
    }>,
  /** Realized PnL leaderboard over closes the bot executed. */
  leaderboard: (sinceMs: number, limit = 10) =>
    db
      .prepare(
        `SELECT t.tg_id, u.username, SUM(t.pnl) AS pnl, COUNT(*) AS n FROM trades t JOIN users u ON u.tg_id = t.tg_id
         WHERE t.pnl IS NOT NULL AND t.created_at >= ? GROUP BY t.tg_id ORDER BY pnl DESC LIMIT ?`,
      )
      .all(sinceMs, limit) as Array<{ tg_id: number; username: string | null; pnl: number; n: number }>,
  totals: () => db.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT tg_id) AS traders FROM trades").get() as { n: number; traders: number },
};

export const triggers = {
  set: (tgId: number, symbol: string, kind: "tp" | "sl", price: number, side: "long" | "short") =>
    db
      .prepare(
        `INSERT INTO triggers (tg_id, symbol, kind, price, side, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT (tg_id, symbol, kind) DO UPDATE SET price = excluded.price, side = excluded.side, active = 1, created_at = excluded.created_at`,
      )
      .run(tgId, symbol, kind, price, side, Date.now()),
  forUser: (tgId: number) => db.prepare("SELECT * FROM triggers WHERE tg_id = ? AND active = 1").all(tgId) as unknown as Trigger[],
  active: () => db.prepare("SELECT * FROM triggers WHERE active = 1").all() as unknown as Trigger[],
  clear: (tgId: number, symbol: string) => db.prepare("UPDATE triggers SET active = 0 WHERE tg_id = ? AND symbol = ?").run(tgId, symbol),
};

export const follows = {
  set: (follower: number, leader: number, usd: number) =>
    db
      .prepare(
        `INSERT INTO follows (follower, leader, usd, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (follower, leader) DO UPDATE SET usd = excluded.usd`,
      )
      .run(follower, leader, usd, Date.now()),
  remove: (follower: number, leader?: number) =>
    leader === undefined
      ? db.prepare("DELETE FROM follows WHERE follower = ?").run(follower)
      : db.prepare("DELETE FROM follows WHERE follower = ? AND leader = ?").run(follower, leader),
  of: (leader: number) => db.prepare("SELECT * FROM follows WHERE leader = ?").all(leader) as Array<{ follower: number; leader: number; usd: number }>,
  by: (follower: number) =>
    db
      .prepare("SELECT f.leader, f.usd, u.username FROM follows f JOIN users u ON u.tg_id = f.leader WHERE f.follower = ?")
      .all(follower) as Array<{ leader: number; usd: number; username: string | null }>,
  count: (leader: number) => (db.prepare("SELECT COUNT(*) AS n FROM follows WHERE leader = ?").get(leader) as { n: number }).n,
};

export const groups = {
  join: (chatId: number, tgId: number, title: string | null) =>
    db.prepare("INSERT INTO group_members (chat_id, tg_id, title) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET title = excluded.title").run(chatId, tgId, title),
  /** Groups a trader has traded or talked to the bot in, so their trades can be announced there. */
  of: (tgId: number) => (db.prepare("SELECT chat_id FROM group_members WHERE tg_id = ?").all(tgId) as Array<{ chat_id: number }>).map((r) => r.chat_id),
  leaderboard: (chatId: number, sinceMs: number, limit = 10) =>
    db
      .prepare(
        `SELECT t.tg_id, u.username, SUM(t.pnl) AS pnl, COUNT(*) AS n FROM trades t
         JOIN users u ON u.tg_id = t.tg_id JOIN group_members g ON g.tg_id = t.tg_id AND g.chat_id = ?
         WHERE t.pnl IS NOT NULL AND t.created_at >= ? GROUP BY t.tg_id ORDER BY pnl DESC LIMIT ?`,
      )
      .all(chatId, sinceMs, limit) as Array<{ tg_id: number; username: string | null; pnl: number; n: number }>,
};

export const userByName = (name: string) =>
  db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(name.replace(/^@/, "")) as User | undefined;

export const liqAlerts = {
  lastSent: (tgId: number, symbol: string) =>
    (db.prepare("SELECT sent_at FROM liq_alerts WHERE tg_id = ? AND symbol = ?").get(tgId, symbol) as { sent_at: number } | undefined)?.sent_at ?? 0,
  mark: (tgId: number, symbol: string) =>
    db
      .prepare("INSERT INTO liq_alerts (tg_id, symbol, sent_at) VALUES (?, ?, ?) ON CONFLICT (tg_id, symbol) DO UPDATE SET sent_at = excluded.sent_at")
      .run(tgId, symbol, Date.now()),
};
