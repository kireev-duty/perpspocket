// The social loop: trades show up in the trader's groups with a one-tap Copy
// button, and followers' bots mirror a leader's opens and closes at their own
// size. Every copy is still an order the follower's own linked key places for
// the follower's own account, so nobody can trade anyone else's funds.

import { InlineKeyboard, type Api } from "grammy";
import { users, trades, follows, groups, type User } from "./db.js";
import * as engine from "./engine.js";
import { UserError } from "./engine.js";
import { fmtPrice } from "./card.js";
import type { Side } from "./perp-core/index.js";

const name = (u: User) => (u.username ? `@${u.username.replace(/^@/, "")}` : `trader${u.tg_id % 10_000}`);
const txLink = (hash: string) => `<a href="${engine.txUrl(hash)}">tx</a>`;

async function send(api: Api, chatId: number, html: string, kb?: InlineKeyboard) {
  await api
    .sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: kb })
    .catch((e) => console.error(`send ${chatId}: ${e.message}`));
}

/** Copy button payload. Telegram caps callback data at 64 bytes, so it stays terse. */
export const copyData = (symbol: string, side: Side, usd: number) => `cp:${symbol}:${side === "long" ? "L" : "S"}:${Math.round(usd)}`;

/** Called after a leader's open filled: post it to their groups, then mirror it to followers. */
export async function afterOpen(api: Api, leader: User, symbol: string, side: Side, usdNotional: number, fill: engine.TradeResult, exceptChat?: number) {
  const kb = new InlineKeyboard().text(`🔁 Copy $${Math.round(usdNotional)}`, copyData(symbol, side, usdNotional)).text(`👣 Follow`, `fl:${leader.tg_id}`);
  const html = `${side === "long" ? "🟢" : "🔴"} ${name(leader)} opened <b>${side.toUpperCase()} ${symbol}</b> ≈ $${Math.round(usdNotional)} @ ${fmtPrice(fill.avgPrice)} · ${txLink(fill.hash)}`;
  for (const chat of groups.of(leader.tg_id)) if (chat !== exceptChat) await send(api, chat, html, kb);

  for (const f of follows.of(leader.tg_id)) {
    const u = users.get(f.follower);
    if (!u?.owner) continue;
    try {
      const r = await engine.open(u, symbol, side, f.usd);
      if (r.filled > 0) trades.add({ tg_id: u.tg_id, symbol, side, kind: "copy-open", quantity: r.filled, price: r.avgPrice, tx: r.hash });
      await send(api, u.tg_id, `👣 Copied ${name(leader)}: <b>${side.toUpperCase()} ${symbol}</b> $${f.usd} — filled ${r.filled} @ ${fmtPrice(r.avgPrice)} · ${txLink(r.hash)}`,
        new InlineKeyboard().text("📊 Positions", "pos").text(`Unfollow`, `uf:${leader.tg_id}`));
    } catch (err) {
      const msg = err instanceof UserError ? err.message : (err as Error).message.split("\n")[0]!.slice(0, 200);
      await send(api, u.tg_id, `⚠️ Couldn't copy ${name(leader)}'s ${side} ${symbol}: ${msg}`);
    }
  }
}

/** Called after a leader closed a whole position: followers holding the same market close too. */
export async function afterClose(api: Api, leader: User, symbol: string, pnl: number, hash: string, exceptChat?: number) {
  const html = `${pnl >= 0 ? "💰" : "🩸"} ${name(leader)} closed <b>${symbol}</b> · ${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)} · ${txLink(hash)}`;
  for (const chat of groups.of(leader.tg_id)) if (chat !== exceptChat) await send(api, chat, html);

  for (const f of follows.of(leader.tg_id)) {
    const u = users.get(f.follower);
    if (!u?.owner) continue;
    const held = (await engine.positions(u).catch(() => [])).some((p) => p.market.info.baseSymbol === symbol);
    if (!held) continue;
    try {
      const r = await engine.close(u, symbol, 1);
      trades.add({ tg_id: u.tg_id, symbol, side: r.side, kind: "copy-close", quantity: r.filled, price: r.avgPrice, tx: r.hash, pnl: r.realizedPnl });
      await send(api, u.tg_id, `👣 ${name(leader)} closed ${symbol}, so did you: realized ≈ <b>${r.realizedPnl >= 0 ? "+" : "-"}$${Math.abs(r.realizedPnl).toFixed(2)}</b> · ${txLink(r.hash)}`);
    } catch (err) {
      await send(api, u.tg_id, `⚠️ ${name(leader)} closed ${symbol} but your close failed: ${(err as Error).message.slice(0, 200)}. Use /close ${symbol}.`);
    }
  }
}
