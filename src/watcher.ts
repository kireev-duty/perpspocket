// Bot-side TP/SL and liquidation alerts.
//
// A linked bot key cannot arm the protocol's stop orders (only the account
// itself can), so PerpsPocket watches the mark and closes with a reducing IOC
// when a trigger is crossed. It also warns a trader whose mark gets close to
// the liquidation price, at most once every 30 minutes per market.

import { appConfig } from "./config.js";
import { users, triggers, trades, liqAlerts } from "./db.js";
import * as engine from "./engine.js";
import { fmtPrice } from "./card.js";
import { bot } from "./bot.js";

let tick = 0;
let running = false;

const notify = (tgId: number, html: string) =>
  bot.api.sendMessage(tgId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch((e) => console.error("notify", e.message));

async function checkTriggers() {
  const active = triggers.active();
  if (active.length === 0) return;
  const marks = new Map<string, number>();
  for (const sym of new Set(active.map((t) => t.symbol))) {
    const m = await engine.market(sym).catch(() => undefined);
    const px = m && (await engine.mark(m).catch(() => undefined));
    if (px) marks.set(sym, px);
  }
  for (const byUser of groupBy(active, (t) => t.tg_id)) {
    const u = users.get(byUser[0]!.tg_id);
    if (!u?.owner) continue;
    const pos = await engine.positions(u).catch(() => undefined);
    if (!pos) continue;
    for (const t of byUser) {
      const p = pos.find((x) => x.market.info.baseSymbol === t.symbol);
      if (!p) {
        triggers.clear(u.tg_id, t.symbol);
        continue;
      }
      const px = marks.get(t.symbol);
      if (!px) continue;
      const above = (t.kind === "tp") === (p.side === "long");
      if (above ? px < t.price : px > t.price) continue;
      try {
        const r = await engine.close(u, t.symbol, 1);
        trades.add({ tg_id: u.tg_id, symbol: t.symbol, side: r.side, kind: t.kind, quantity: r.filled, price: r.avgPrice, tx: r.hash, pnl: r.realizedPnl });
        triggers.clear(u.tg_id, t.symbol);
        await notify(u.tg_id, `${t.kind === "tp" ? "🎯 Take-profit" : "🛑 Stop-loss"} hit on ${p.side} ${t.symbol} at ${fmtPrice(px)}
Closed ${r.filled} @ ${fmtPrice(r.avgPrice)} · realized ≈ <b>${r.realizedPnl >= 0 ? "+" : "-"}$${Math.abs(r.realizedPnl).toFixed(2)}</b>
Tx <a href="${engine.txUrl(r.hash)}">${r.hash.slice(0, 10)}…</a>`);
      } catch (err) {
        console.error(`trigger ${t.kind} ${t.symbol} for ${u.tg_id}`, err);
        await notify(u.tg_id, `⚠️ Your ${t.kind.toUpperCase()} on ${t.symbol} fired at ${fmtPrice(px)} but the close failed: ${(err as Error).message.slice(0, 200)}. I'll retry next check.`);
      }
    }
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

function groupBy<T, K>(xs: T[], key: (x: T) => K): T[][] {
  const m = new Map<K, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.values()];
}

export function startWatcher() {
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await checkTriggers();
      if (tick++ % 4 === 0) await checkLiquidations();
    } catch (err) {
      console.error("watcher", err);
    } finally {
      running = false;
    }
  }, appConfig.watchIntervalMs);
}
