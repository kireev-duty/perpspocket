// Bot-side TP/SL and liquidation alerts.
//
// A linked bot key cannot arm the protocol's stop orders (only the account
// itself can), so PerpsPocket watches the mark and closes with a reducing IOC
// when a trigger is crossed. The mark arrives over Somnia Reactivity: every
// pool that carries an active trigger has a `somnia_watch` subscription, and
// each push re-checks that market's triggers at once. A slower poll covers a
// silent stream and sends liquidation warnings, at most once every 30 minutes
// per market.

import { appConfig } from "./config.js";
import { users, triggers, trades, liqAlerts, type Trigger } from "./db.js";
import * as engine from "./engine.js";
import { fmtPrice } from "./card.js";
import { bot } from "./bot.js";
import { afterClose } from "./social.js";
import { follow, onMark, streams } from "./reactive.js";

const STALE_PUSH_MS = 20_000;

let tick = 0;
let polling = false;
/** Last mark per base symbol, from a push or a poll. */
const marks = new Map<string, { mark: number; at: number }>();
/** `tg:symbol` pairs with a close in flight, so a burst of pushes closes once. */
const inflight = new Set<string>();

const notify = (tgId: number, html: string) =>
  bot.api.sendMessage(tgId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch((e) => console.error("notify", e.message));

const crossed = (t: Trigger, mark: number) => {
  // Triggers set before the side was stored are judged on the next poll, which reads the position.
  if (!t.side) return false;
  const above = (t.kind === "tp") === (t.side === "long");
  return above ? mark >= t.price : mark <= t.price;
};

async function fire(t: Trigger, mark: number, via: "reactivity" | "poll") {
  const key = `${t.tg_id}:${t.symbol}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const u = users.get(t.tg_id);
    if (!u?.owner) return;
    const pos = (await engine.positions(u)).find((p) => p.market.info.baseSymbol === t.symbol);
    if (!pos) {
      triggers.clear(u.tg_id, t.symbol);
      return;
    }
    const r = await engine.close(u, t.symbol, 1);
    trades.add({ tg_id: u.tg_id, symbol: t.symbol, side: r.side, kind: t.kind, quantity: r.filled, price: r.avgPrice, tx: r.hash, pnl: r.realizedPnl });
    triggers.clear(u.tg_id, t.symbol);
    console.log(`${t.kind} ${t.symbol} for ${u.tg_id} fired at ${mark} via ${via}: ${r.hash}`);
    await notify(u.tg_id, `${t.kind === "tp" ? "🎯 Take-profit" : "🛑 Stop-loss"} hit on ${pos.side} ${t.symbol} at ${fmtPrice(mark)}${via === "reactivity" ? " ⚡" : ""}
Closed ${r.filled} @ ${fmtPrice(r.avgPrice)} · realized ≈ <b>${r.realizedPnl >= 0 ? "+" : "-"}$${Math.abs(r.realizedPnl).toFixed(2)}</b>
Tx <a href="${engine.txUrl(r.hash)}">${r.hash.slice(0, 10)}…</a>`);
    void afterClose(bot.api, u, t.symbol, r.realizedPnl, r.hash).catch((e) => console.error("afterClose", e));
  } catch (err) {
    console.error(`trigger ${t.kind} ${t.symbol} for ${t.tg_id}`, err);
    await notify(t.tg_id, `⚠️ Your ${t.kind.toUpperCase()} on ${t.symbol} fired at ${fmtPrice(mark)} but the close failed: ${(err as Error).message.slice(0, 200)}. I'll retry on the next price.`);
  } finally {
    inflight.delete(key);
  }
}

/** Make sure every market with an active trigger has a live Reactivity stream. */
async function followTriggeredMarkets() {
  const live = new Set(streams().map((s) => s.pool));
  for (const sym of new Set(triggers.active().map((t) => t.symbol))) {
    const m = await engine.market(sym).catch(() => undefined);
    if (m && !live.has(m.info.poolAddress.toLowerCase())) await follow(m.info.poolAddress);
  }
}

/** Fallback for silent streams and for triggers stored without a side. */
async function pollTriggers() {
  const active = triggers.active();
  for (const sym of new Set(active.map((t) => t.symbol))) {
    const last = marks.get(sym);
    if (last && Date.now() - last.at < STALE_PUSH_MS) continue;
    const m = await engine.market(sym).catch(() => undefined);
    const px = m && (await engine.mark(m).catch(() => undefined));
    if (px) marks.set(sym, { mark: px, at: Date.now() });
  }
  for (const t of active) {
    const px = marks.get(t.symbol)?.mark;
    if (!px) continue;
    if (!t.side) {
      // Legacy trigger: learn the side from the position once, then it is push-driven.
      const u = users.get(t.tg_id);
      const p = u && (await engine.positions(u).catch(() => [])).find((x) => x.market.info.baseSymbol === t.symbol);
      if (!p) {
        triggers.clear(t.tg_id, t.symbol);
        continue;
      }
      triggers.set(t.tg_id, t.symbol, t.kind, t.price, p.side);
      t.side = p.side;
    }
    if (crossed(t, px)) await fire(t, px, "poll");
  }
}

async function checkLiquidations() {
  for (const u of users.linked()) {
    const pos = await engine.positions(u).catch(() => []);
    for (const p of pos) {
      if (!p.liqPrice) continue;
      const dist = Math.abs(p.mark - p.liqPrice) / p.mark;
      if (dist > appConfig.liqWarnFraction) continue;
      const sym = p.market.info.baseSymbol;
      if (Date.now() - liqAlerts.lastSent(u.tg_id, sym) < 30 * 60_000) continue;
      liqAlerts.mark(u.tg_id, sym);
      await bot.api
        .sendMessage(u.tg_id, `🚨 <b>${p.side.toUpperCase()} ${sym}</b> is ${(dist * 100).toFixed(1)}% from liquidation\nMark ${fmtPrice(p.mark)} · Liq ${fmtPrice(p.liqPrice)}\nAdd margin in the app or reduce now:`, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "Close 50%", callback_data: `close:${sym}:50` }, { text: "Close all", callback_data: `close:${sym}:100` }]] },
        })
        .catch((e) => console.error("notify", e.message));
    }
  }
}

export function startWatcher() {
  onMark(async (push) => {
    const m = await engine.marketByPool(push.pool);
    if (!m) return;
    const sym = m.info.baseSymbol;
    marks.set(sym, { mark: push.mark, at: push.at });
    for (const t of triggers.active()) if (t.symbol === sym && crossed(t, push.mark)) void fire(t, push.mark, "reactivity");
  });

  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      await followTriggeredMarkets();
      await pollTriggers();
      if (tick++ % 4 === 0) await checkLiquidations();
    } catch (err) {
      console.error("watcher", err);
    } finally {
      polling = false;
    }
  }, appConfig.watchIntervalMs);
}
