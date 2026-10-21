// Telegram front end. Commands parse, the engine trades, and every write is
// confirmed with a button first and answered with its transaction link.

import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import { getAddress, isAddress } from "viem";
import { appConfig } from "./config.js";
import { users, trades, triggers, type User } from "./db.js";
import * as engine from "./engine.js";
import { UserError } from "./engine.js";
import { pnlCard, fmtPrice } from "./card.js";
import type { Side } from "./perp-core/index.js";

export const bot = new Bot(appConfig.telegramToken());
let botUsername = "PerpsPocketBot";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const signed = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const tx = (hash: string) => `<a href="${engine.txUrl(hash)}">${hash.slice(0, 10)}…</a>`;
const refLink = (tgId: number) => `t.me/${botUsername}?start=ref_${tgId}`;

async function reply(ctx: Context, html: string, extra: Record<string, unknown> = {}) {
  return ctx.reply(html, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
}

function requireUser(ctx: Context): User {
  const u = users.get(ctx.from!.id);
  if (!u) throw new UserError("Send /start first.");
  return u;
}

function requireLinked(ctx: Context): User {
  const u = requireUser(ctx);
  if (!u.owner) throw new UserError("Link your DreamDEX account first: <code>/link 0xYourAccount</code>");
  return u;
}

/** Run a handler and turn failures into a message instead of a dead chat. */
function safe(fn: (ctx: Context) => Promise<unknown>) {
  return async (ctx: Context) => {
    try {
      await fn(ctx);
    } catch (err) {
      if (err instanceof UserError) return void (await reply(ctx, `⚠️ ${err.message}`));
      console.error(err);
      const msg = err instanceof Error ? err.message.split("\n")[0]!.slice(0, 300) : String(err);
      await reply(ctx, `❌ Something went wrong: <code>${esc(msg)}</code>`);
    }
  };
}

const args = (ctx: Context) => (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);

// ---------------------------------------------------------------- onboarding

const onboarding = (u: User) => `<b>Your PerpsPocket bot key</b>
<code>${u.bot_address}</code>

This key can <b>place, cancel and reduce</b> perps orders for your DreamDEX account. It can <b>never withdraw or send</b> your funds.

<b>3 steps (2 minutes)</b>
1. Open <a href="${appConfig.appUrl}">app.testnet.dreamdex.io</a> → wallet → <b>Link a bot</b> → paste the address above, keep <b>Perps</b> ticked → <b>Add bot</b>. Use <b>Send it</b> to give it ~0.5 STT for gas.
2. Join the <b>Perps Arena</b> for free paper USDso, or move USDso <b>Spot → Perps</b>.
3. Send <code>/link 0xYourDreamDEXAccount</code>

Then: <code>/long BTC 50</code> · <code>/pos</code> · <code>/tp BTC 90000</code> · /help`;

bot.command("start", safe(async (ctx) => {
  let u = users.get(ctx.from!.id);
  if (!u) {
    const payload = (ctx.match ?? "").toString();
    const refBy = payload.startsWith("ref_") ? Number(payload.slice(4)) : null;
    const key = engine.newBotKey();
    users.create({
      tg_id: ctx.from!.id,
      username: ctx.from!.username ?? ctx.from!.first_name ?? null,
      enc_key: key.enc,
      bot_address: key.address,
      ref_by: refBy && refBy !== ctx.from!.id && users.get(refBy) ? refBy : null,
    });
    u = users.get(ctx.from!.id)!;
  }
  await reply(ctx, `👋 <b>PerpsPocket</b> — trade dreamDEX perps on Somnia from Telegram.\n\n${onboarding(u)}`);
}));

bot.command("help", safe(async (ctx) => {
  await reply(ctx, `<b>Trading</b>
<code>/long BTC 50</code> — market long $50 notional
<code>/short ETH 100 @ 2600</code> — limit short at 2600
<code>/close BTC</code> · <code>/close BTC 50</code> — close all / 50%
<code>/tp BTC 95000</code> · <code>/sl BTC 80000</code> — take-profit / stop-loss
<code>/clear BTC</code> — remove TP/SL

<b>Account</b>
/pos — positions, PnL, liquidation price
/orders · <code>/cancel [BTC]</code> — open orders
/status — margin, gas, link check
/pnl — shareable PnL card · /top — leaderboard · /invite

<b>Market</b>
/markets · <code>/price SOL</code>

You can also just type <code>long sol 25</code>.`);
}));

bot.command("link", safe(async (ctx) => {
  const u = requireUser(ctx);
  const [addr] = args(ctx);
  if (!addr || !isAddress(addr)) throw new UserError("Usage: <code>/link 0xYourDreamDEXAccount</code> (the wallet you use in the app).");
  const owner = getAddress(addr);
  if (owner.toLowerCase() === u.bot_address.toLowerCase()) throw new UserError("That's the bot key itself. Send your app wallet address.");
  users.setOwner(u.tg_id, owner);
  await reply(ctx, "🔍 Checking the link on-chain…");
  await sendStatus(ctx, users.get(u.tg_id)!);
}));

async function sendStatus(ctx: Context, u: User) {
  const [cov, gas, eq] = await Promise.all([
    engine.linkCoverage(u),
    engine.gasBalance(u.bot_address),
    engine.equity(u).catch(() => undefined),
  ]);
  const linkLine = cov.linked.length === 0
    ? `❌ Not linked yet. In the app: wallet → <b>Link a bot</b> → <code>${u.bot_address}</code>`
    : cov.missing.length === 0
      ? `✅ Linked on all ${cov.linked.length} perp markets`
      : `🟡 Linked on ${cov.linked.length} markets; missing ${cov.missing.join(", ")} (add the bot again in the app)`;
  await reply(ctx, `<b>Account</b> <code>${u.owner}</code>
${linkLine}
${gas < 0.01 ? "❌" : "✅"} Bot gas: ${gas.toFixed(4)} STT${gas < 0.01 ? " — send it some STT" : ""}
${eq ? `💰 Perps equity: ${usd(eq.total)} (free ${usd(eq.free)}, in orders ${usd(eq.locked)})` : "💰 Equity: unavailable"}`);
}

bot.command("status", safe(async (ctx) => sendStatus(ctx, requireLinked(ctx))));

// ---------------------------------------------------------------- market data

bot.command("markets", safe(async (ctx) => {
  const all = await engine.markets();
  const { fundingApr } = await import("./perp-core/index.js");
  const lines = await Promise.all(
    all.map(async (m) => {
      const px = await engine.mark(m).catch(() => 0);
      const apr = fundingApr(m.info).apr * 100;
      return `<b>${m.info.baseSymbol}</b> ${px ? fmtPrice(px) : "—"} · funding ${apr >= 0 ? "+" : ""}${apr.toFixed(1)}% APR · ${Math.round(10_000 / m.info.initialMarginBps)}x max`;
    }),
  );
  await reply(ctx, `<b>dreamDEX perps (testnet)</b>\n${lines.join("\n")}`);
}));

bot.command("price", safe(async (ctx) => {
  const [sym] = args(ctx);
  if (!sym) throw new UserError("Usage: <code>/price BTC</code>");
  const m = await engine.market(sym);
  const { fundingApr } = await import("./perp-core/index.js");
  const [px, t] = await Promise.all([engine.mark(m), engine.touch(m)]);
  const f = fundingApr(m.info);
  await reply(ctx, `<b>${m.display}</b>
Mark ${fmtPrice(px)}
Bid ${t.bid ? fmtPrice(t.bid) : "—"} · Ask ${t.ask ? fmtPrice(t.ask) : "—"}
Funding ${(f.apr * 100).toFixed(2)}% APR (${f.positive ? "longs pay shorts" : "shorts pay longs"})
Max leverage ${Math.round(10_000 / m.info.initialMarginBps)}x`, {
    reply_markup: new InlineKeyboard().text(`Long $25`, `pre:long:${m.info.baseSymbol}:25`).text(`Short $25`, `pre:short:${m.info.baseSymbol}:25`),
  });
}));

// ---------------------------------------------------------------- orders

interface Pending { tgId: number; side: Side; symbol: string; usd: number; limit?: number; at: number }
const pending = new Map<string, Pending>();
let nonce = 0;

async function preview(ctx: Context, side: Side, symbol: string, notional: number, limit?: number) {
  const u = requireLinked(ctx);
  if (!(notional > 0)) throw new UserError(`Usage: <code>/${side} BTC 50</code> (USDso notional) or <code>/${side} BTC 50 @ 85000</code>`);
  const m = await engine.market(symbol);
  const px = await engine.mark(m);
  const id = String(++nonce);
  pending.set(id, { tgId: u.tg_id, side, symbol: m.info.baseSymbol, usd: notional, limit, at: Date.now() });
  const size = notional / (limit ?? px);
  await reply(ctx, `${side === "long" ? "🟢" : "🔴"} <b>${side.toUpperCase()} ${m.display}</b>
Notional ${usd(notional)} ≈ ${size.toPrecision(4)} ${m.info.baseSymbol}
${limit ? `Limit @ ${fmtPrice(limit)}` : `Market (mark ${fmtPrice(px)}, max slippage ${appConfig.slippageBps / 100}%)`}`, {
    reply_markup: new InlineKeyboard().text("✅ Confirm", `go:${id}`).text("✖ Cancel", `no:${id}`),
  });
}

function parseOrder(parts: string[]): { symbol: string; usd: number; limit?: number } {
  const [symbol, amount, ...rest] = parts;
  if (!symbol || !amount) throw new UserError("Usage: <code>/long BTC 50</code> or <code>/short ETH 100 @ 2600</code>");
  const at = rest.join("").replace("@", "");
  return { symbol, usd: Number(amount.replace("$", "")), limit: at ? Number(at) : undefined };
}

for (const side of ["long", "short"] as const) {
  bot.command(side, safe(async (ctx) => {
    const o = parseOrder(args(ctx));
    await preview(ctx, side, o.symbol, o.usd, o.limit);
  }));
}

bot.callbackQuery(/^pre:(long|short):(\w+):(\d+)$/, safe(async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, side, sym, amt] = ctx.match as RegExpMatchArray;
  await preview(ctx, side as Side, sym!, Number(amt));
}));

bot.callbackQuery(/^no:(\d+)$/, safe(async (ctx) => {
  pending.delete((ctx.match as RegExpMatchArray)[1]!);
  await ctx.answerCallbackQuery("Cancelled");
  await ctx.editMessageReplyMarkup();
}));

bot.callbackQuery(/^go:(\d+)$/, safe(async (ctx) => {
  const id = (ctx.match as RegExpMatchArray)[1]!;
  const p = pending.get(id);
  pending.delete(id);
  if (!p || p.tgId !== ctx.from?.id || Date.now() - p.at > 120_000) {
    await ctx.answerCallbackQuery("Expired, send the order again");
    return;
  }
  await ctx.answerCallbackQuery("Sending…");
  await ctx.editMessageReplyMarkup();
  const u = requireLinked(ctx);
  const r = await engine.open(u, p.symbol, p.side, p.usd, p.limit);
  if (r.filled > 0) {
    trades.add({ tg_id: u.tg_id, symbol: p.symbol, side: p.side, kind: "open", quantity: r.filled, price: r.avgPrice, tx: r.hash });
  }
  const status = r.resting
    ? r.filled > 0 ? `Partly filled ${r.filled} ${p.symbol}, rest resting @ ${fmtPrice(r.avgPrice)}` : `Resting limit order #${r.orderId}`
    : `Filled ${r.filled} ${p.symbol} @ ${fmtPrice(r.avgPrice)}`;
  await reply(ctx, `✅ <b>${p.side.toUpperCase()} ${p.symbol}</b> — ${status}\nTx ${tx(r.hash)}\n\nSet protection: <code>/tp ${p.symbol} …</code> <code>/sl ${p.symbol} …</code>`, {
    reply_markup: new InlineKeyboard().text("📊 Positions", "pos").text("🖼 PnL card", `card:${p.symbol}`),
  });
}));

async function doClose(ctx: Context, symbol: string, fraction: number, reason = "") {
  const u = requireLinked(ctx);
  const r = await engine.close(u, symbol, fraction);
  const sym = symbol.toUpperCase();
  trades.add({ tg_id: u.tg_id, symbol: sym, side: r.side, kind: "close", quantity: r.filled, price: r.avgPrice, tx: r.hash, pnl: r.realizedPnl });
  if (fraction >= 1) triggers.clear(u.tg_id, sym);
  await reply(ctx, `${reason}✅ Closed ${r.filled} ${sym} @ ${fmtPrice(r.avgPrice)}\nRealized ≈ <b>${signed(r.realizedPnl)}</b>\nTx ${tx(r.hash)}`);
}

bot.command("close", safe(async (ctx) => {
  const [sym, pct] = args(ctx);
  if (!sym) throw new UserError("Usage: <code>/close BTC</code> or <code>/close BTC 50</code> (percent)");
  await doClose(ctx, sym, pct ? Math.min(100, Number(pct)) / 100 : 1);
}));

bot.callbackQuery(/^close:(\w+):(\d+)$/, safe(async (ctx) => {
  await ctx.answerCallbackQuery("Closing…");
  const [, sym, pct] = ctx.match as RegExpMatchArray;
  await doClose(ctx, sym!, Number(pct) / 100);
}));

// ---------------------------------------------------------------- positions

async function sendPositions(ctx: Context) {
  const u = requireLinked(ctx);
  const [pos, eq] = await Promise.all([engine.positions(u), engine.equity(u).catch(() => undefined)]);
  if (pos.length === 0) return void (await reply(ctx, `No open positions.${eq ? ` Equity ${usd(eq.total)}.` : ""}\nTry <code>/long BTC 25</code>`));
  const trig = triggers.forUser(u.tg_id);
  const kb = new InlineKeyboard();
  const blocks = pos.map((p) => {
    const sym = p.market.info.baseSymbol;
    const tp = trig.find((t) => t.symbol === sym && t.kind === "tp");
    const sl = trig.find((t) => t.symbol === sym && t.kind === "sl");
    kb.text(`Close ${sym}`, `close:${sym}:100`).text(`50%`, `close:${sym}:50`).text(`🖼`, `card:${sym}`).row();
    return `${p.side === "long" ? "🟢" : "🔴"} <b>${p.side.toUpperCase()} ${sym}</b> ${p.size} (${usd(p.notional)})
Entry ${fmtPrice(p.entry)} · Mark ${fmtPrice(p.mark)}
PnL <b>${signed(p.pnl)}</b>${p.roePct !== null ? ` (${p.roePct.toFixed(1)}%)` : ""} · funding ${signed(-p.funding)}
Liq ${p.liqPrice ? fmtPrice(p.liqPrice) : "—"} · TP ${tp ? fmtPrice(tp.price) : "—"} · SL ${sl ? fmtPrice(sl.price) : "—"}`;
  });
  await reply(ctx, `${blocks.join("\n\n")}${eq ? `\n\n💰 Equity ${usd(eq.total)}` : ""}`, { reply_markup: kb });
}

bot.command(["pos", "positions"], safe(sendPositions));
bot.callbackQuery("pos", safe(async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendPositions(ctx);
}));

bot.command("orders", safe(async (ctx) => {
  const orders = await engine.openOrders(requireLinked(ctx));
  if (orders.length === 0) return void (await reply(ctx, "No open orders."));
  await reply(ctx, orders.map((o) => `#${o.orderId} ${o.side.toUpperCase()} ${o.remaining} ${o.market.info.baseSymbol} @ ${fmtPrice(o.price)}`).join("\n") + "\n\n<code>/cancel</code> or <code>/cancel BTC</code>");
}));

bot.command("cancel", safe(async (ctx) => {
  const [sym] = args(ctx);
  const hashes = await engine.cancelAll(requireLinked(ctx), sym);
  await reply(ctx, hashes.length ? `✅ Cancelled ${hashes.length} order(s)\n${hashes.map(tx).join("\n")}` : "Nothing to cancel.");
}));

// ---------------------------------------------------------------- TP / SL

for (const kind of ["tp", "sl"] as const) {
  bot.command(kind, safe(async (ctx) => {
    const u = requireLinked(ctx);
    const [sym, priceStr] = args(ctx);
    const price = Number(priceStr);
    if (!sym || !(price > 0)) throw new UserError(`Usage: <code>/${kind} BTC 90000</code>`);
    const m = await engine.market(sym);
    const p = (await engine.positions(u)).find((x) => x.market.info.baseSymbol === m.info.baseSymbol);
    if (!p) throw new UserError(`No open ${m.display} position to protect.`);
    const above = (kind === "tp") === (p.side === "long");
    if (above ? price <= p.mark : price >= p.mark) {
      throw new UserError(`For a ${p.side}, ${kind === "tp" ? "take-profit" : "stop-loss"} must be ${above ? "above" : "below"} the mark (${fmtPrice(p.mark)}).`);
    }
    if (kind === "sl" && p.liqPrice && (p.side === "long" ? price <= p.liqPrice : price >= p.liqPrice)) {
      throw new UserError(`That stop is past your liquidation price (${fmtPrice(p.liqPrice)}), it would never fire.`);
    }
    triggers.set(u.tg_id, m.info.baseSymbol, kind, price);
    await reply(ctx, `🎯 ${kind === "tp" ? "Take-profit" : "Stop-loss"} for ${p.side} ${m.info.baseSymbol} set at <b>${fmtPrice(price)}</b>. PerpsPocket watches the mark 24/7 and closes the position when it's hit.`);
  }));
}

bot.command("clear", safe(async (ctx) => {
  const [sym] = args(ctx);
  if (!sym) throw new UserError("Usage: <code>/clear BTC</code>");
  triggers.clear(requireUser(ctx).tg_id, sym.toUpperCase());
  await reply(ctx, `TP/SL for ${esc(sym.toUpperCase())} removed.`);
}));

// ---------------------------------------------------------------- social

async function sendCard(ctx: Context, symbol?: string) {
  const u = requireLinked(ctx);
  const pos = await engine.positions(u);
  const p = symbol ? pos.find((x) => x.market.info.baseSymbol === symbol.toUpperCase()) : pos.sort((a, b) => b.pnl - a.pnl)[0];
  if (!p) throw new UserError("No open position to share. Open one with <code>/long BTC 25</code>.");
  const eq = await engine.equity(u).catch(() => undefined);
  const png = pnlCard({
    symbol: p.market.display,
    side: p.side,
    entry: p.entry,
    mark: p.mark,
    pnl: p.pnl,
    roePct: p.roePct,
    leverage: eq && eq.total > 0 ? p.notional / eq.total : undefined,
    handle: u.username ?? "trader",
    refLink: refLink(u.tg_id),
  });
  await ctx.replyWithPhoto(new InputFile(png, "pnl.png"), {
    caption: `My ${p.side} ${p.market.display} on @DreamDEXSomnia, traded from Telegram with PerpsPocket 👇\n${refLink(u.tg_id)}`,
  });
}

bot.command("pnl", safe(async (ctx) => sendCard(ctx, args(ctx)[0])));
bot.callbackQuery(/^card:(\w+)$/, safe(async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendCard(ctx, (ctx.match as RegExpMatchArray)[1]);
}));

bot.command("top", safe(async (ctx) => {
  const rows = trades.leaderboard(Date.now() - 7 * 86_400_000);
  const t = trades.totals();
  if (rows.length === 0) return void (await reply(ctx, "No closed trades this week yet. Be the first: <code>/long BTC 25</code>"));
  const medal = ["🥇", "🥈", "🥉"];
  await reply(ctx, `<b>🏆 PerpsPocket weekly leaderboard</b> (realized PnL)\n${rows
    .map((r, i) => `${medal[i] ?? `${i + 1}.`} ${esc(r.username ?? `trader${r.tg_id % 10_000}`)} ${signed(r.pnl)} · ${r.n} closes`)
    .join("\n")}\n\n${t.n} trades by ${t.traders} traders so far`);
}));

bot.command("invite", safe(async (ctx) => {
  const u = requireUser(ctx);
  await reply(ctx, `Invite friends to trade perps from Telegram:\n${refLink(u.tg_id)}\n\nYou've invited <b>${users.referrals(u.tg_id)}</b> trader(s).`);
}));

// ---------------------------------------------------------------- plain text

// "long sol 25", "short eth 100 @ 2600", "close btc 50"
bot.on("message:text", safe(async (ctx) => {
  const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
  const verb = parts[0]!.toLowerCase();
  if (verb === "long" || verb === "short") {
    const o = parseOrder(parts.slice(1));
    return preview(ctx, verb, o.symbol, o.usd, o.limit);
  }
  if (verb === "close" && parts[1]) return doClose(ctx, parts[1], parts[2] ? Number(parts[2]) / 100 : 1);
  await reply(ctx, "Try <code>long btc 25</code>, /pos or /help");
}));

export async function startBot() {
  const me = await bot.api.getMe();
  botUsername = me.username;
  await bot.api.setMyCommands([
    { command: "long", description: "Open a long: /long BTC 50" },
    { command: "short", description: "Open a short: /short ETH 50" },
    { command: "pos", description: "Positions, PnL, liquidation price" },
    { command: "close", description: "Close: /close BTC [percent]" },
    { command: "tp", description: "Take-profit: /tp BTC 95000" },
    { command: "sl", description: "Stop-loss: /sl BTC 80000" },
    { command: "pnl", description: "Shareable PnL card" },
    { command: "top", description: "Weekly leaderboard" },
    { command: "markets", description: "All perp markets" },
    { command: "status", description: "Link, gas and margin check" },
    { command: "help", description: "All commands" },
  ]);
  bot.catch((e) => console.error("bot error", e.error));
  void bot.start({ onStart: () => console.log(`@${botUsername} is running`) });
}
