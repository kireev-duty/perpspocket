// The trading engine. One read-only SomniaMarkets client serves every user:
// each read passes the user's DreamDEX account explicitly, and every write is
// a `…For` call signed by that user's own bot key (see perp-core/operator.ts).
// The bot key is an operator grant on the account: it can place, cancel and
// reduce orders, and it cannot withdraw or transfer anything.

import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES, ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { createPublicClient, formatUnits, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  loadConfig,
  makeChain,
  perpMarkets,
  sizeOrder,
  alignPrice,
  sizeForNotional,
  createTradingKey,
  linkStatus,
  placeFor,
  cancelFor,
  liveMark,
  fromRaw,
  toRaw,
  type PerpMarket,
  type TradingKey,
  type Side,
} from "./perp-core/index.js";
import { appConfig } from "./config.js";
import { decrypt, encrypt, type User } from "./db.js";
import { within } from "./timeout.js";

const config = loadConfig();
const chain = makeChain(config);

export const exchange = new SomniaMarkets({
  indexerUrl: config.indexerUrl,
  chain,
  wsRpcUrl: config.wsRpcUrl,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});

/** Thrown for anything the user can fix; the bot shows `message` as-is. */
export class UserError extends Error {}

/** Deadlines for the steps of a trade: chain reads, and a write including its receipt. */
const READ_MS = 30_000;
const WRITE_MS = 90_000;

// ---------------------------------------------------------------- markets

let cache: { at: number; markets: PerpMarket[] } | undefined;

export async function markets(maxAgeMs = 30_000): Promise<PerpMarket[]> {
  if (!cache || Date.now() - cache.at > maxAgeMs) {
    cache = { at: Date.now(), markets: await perpMarkets(exchange, true) };
  }
  return cache.markets;
}

export async function market(symbol: string): Promise<PerpMarket> {
  const base = symbol.trim().toUpperCase().replace(/-PERP$/, "").split("/")[0];
  const all = await markets();
  const hit = all.find((m) => m.info.baseSymbol.toUpperCase() === base);
  if (!hit) throw new UserError(`No perp market "${symbol}". Try /markets.`);
  return hit;
}

export async function marketByPool(pool: string): Promise<PerpMarket | undefined> {
  return (await markets()).find((m) => m.info.poolAddress.toLowerCase() === pool.toLowerCase());
}

/** Every perp market settles to one MarginBank today; read it off the rows. */
async function marginBank(): Promise<Address> {
  const [first] = await markets();
  if (!first) throw new Error("no perp markets listed");
  return first.info.marginBank;
}

export async function mark(m: PerpMarket): Promise<number> {
  const live = await liveMark(exchange, m);
  if (!live) throw new UserError(`${m.display} has no live mark price right now, try again in a minute.`);
  return live;
}

export async function touch(m: PerpMarket): Promise<{ bid?: number; ask?: number }> {
  const book = await exchange.fetchOrderBook(m.symbol, 1);
  return { bid: book.bids[0]?.[0], ask: book.asks[0]?.[0] };
}

// ---------------------------------------------------------------- keys

export function newBotKey(): { enc: string; address: `0x${string}` } {
  const pk = generatePrivateKey();
  return { enc: encrypt(pk), address: privateKeyToAccount(pk).address };
}

export function exportKey(user: User): `0x${string}` {
  return decrypt(user.enc_key) as `0x${string}`;
}

function keyFor(user: User): TradingKey {
  if (!user.owner) throw new UserError("Link your DreamDEX account first: /link 0xYourAccount");
  return createTradingKey({ owner: user.owner, privateKey: exportKey(user), chain, rpcUrl: config.rpcUrl });
}

const rpc = createPublicClient({ chain, transport: http(config.rpcUrl) });

/** STT the bot key holds for gas. */
export async function gasBalance(address: Address): Promise<number> {
  return Number(formatUnits(await rpc.getBalance({ address }), 18));
}

/** How many perp markets this user's bot key may trade for their account. */
export async function linkCoverage(user: User): Promise<{ linked: string[]; missing: string[] }> {
  const key = keyFor(user);
  const all = await markets();
  const statuses = await Promise.all(all.map((m) => linkStatus(key, m.info.poolAddress)));
  return {
    linked: all.filter((_, i) => statuses[i]!.place && statuses[i]!.cancel).map((m) => m.info.baseSymbol),
    missing: all.filter((_, i) => !(statuses[i]!.place && statuses[i]!.cancel)).map((m) => m.info.baseSymbol),
  };
}

// ---------------------------------------------------------------- account reads

export async function equity(user: User) {
  if (!user.owner) throw new UserError("Link your DreamDEX account first: /link 0xYourAccount");
  const e = await exchange.client.getAccountEquity(user.owner, { scope: "perps", marginBank: await marginBank() });
  return { free: fromRaw(e.equity, 18), locked: fromRaw(e.lockedCollateral, 18), total: fromRaw(e.totalEquity, 18) };
}

export interface PositionView {
  market: PerpMarket;
  side: Side;
  size: number;
  entry: number;
  mark: number;
  notional: number;
  pnl: number;
  funding: number;
  roePct: number | null;
  liqPrice: number | null;
}

export async function positions(user: User): Promise<PositionView[]> {
  if (!user.owner) throw new UserError("Link your DreamDEX account first: /link 0xYourAccount");
  const bank = await marginBank();
  const rows = await exchange.client.listPerpPositionAnalytics({ marginBank: bank, account: user.owner });
  const out: PositionView[] = [];
  for (const r of rows) {
    if (!r.priceable || r.size === 0n) continue;
    const m = await marketByPool(r.pool);
    if (!m) continue;
    const liq = await exchange.client
      .getLiquidationPrice({ marginBank: bank, account: user.owner, pool: r.pool })
      .catch(() => null);
    out.push({
      market: m,
      side: r.size > 0n ? "long" : "short",
      size: Math.abs(fromRaw(r.size, m.info.baseDecimals)),
      entry: fromRaw(r.avgEntryPrice, 18),
      mark: fromRaw(r.markPrice, 18),
      notional: fromRaw(r.notional, 18),
      pnl: fromRaw(r.equityContribution, 18),
      funding: fromRaw(r.accruedFunding, 18),
      roePct: r.returnOnMarginBps === null ? null : Number(r.returnOnMarginBps) / 100,
      liqPrice: liq === null ? null : fromRaw(liq, 18),
    });
  }
  return out;
}

export async function openOrders(user: User) {
  if (!user.owner) throw new UserError("Link your DreamDEX account first: /link 0xYourAccount");
  const all = await markets();
  const res = await exchange.client.getOpenOrdersOnchain(all.map((m) => m.info.poolAddress), user.owner);
  return Promise.all(
    res.orders.map(async (o) => {
      const m = (await marketByPool(o.pool))!;
      return {
        market: m,
        orderId: o.orderId,
        side: (o.isBid ? "long" : "short") as Side,
        price: fromRaw(o.price, 18),
        remaining: fromRaw(o.quantityRemaining, m.info.baseDecimals),
      };
    }),
  );
}

// ---------------------------------------------------------------- writes

export interface TradeResult {
  hash: `0x${string}`;
  side: Side;
  quantity: number;
  avgPrice: number;
  filled: number;
  orderId?: bigint;
  resting: boolean;
}

/** Cross price for a taker: the touch plus slippage, or the mark when the side is empty. */
async function takerPrice(m: PerpMarket, side: Side): Promise<bigint> {
  const t = await touch(m);
  const ref = (side === "long" ? t.ask : t.bid) ?? (await mark(m));
  const slip = 1 + ((side === "long" ? 1 : -1) * appConfig.slippageBps) / 10_000;
  return alignPrice(toRaw(ref * slip, 18), m.info);
}

function friendly(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const known: Array<[string, string]> = [
    ["ImmediateOrCancelNoFill", "Nothing on the book to fill against right now. Try again or use a limit price."],
    ["InsufficientCollateral", "Not enough margin in your Perps account. Move USDso Spot → Perps in the app."],
    ["MaxPositionSizeExceeded", "That would exceed the per-account position cap for this market."],
    ["IsolatedMarketBlocked", "Your account is in isolated mode on another market."],
    ["OnlyApprovedContracts", "The bot key is not linked for this market. Open the app → Link a bot again."],
    ["NotAuthorized", "The bot key is not linked for this market. Open the app → Link a bot again."],
    ["insufficient funds", "Your bot key has no STT for gas. Send it a little STT (Link a bot → Send it)."],
  ];
  const hit = known.find(([k]) => msg.includes(k));
  if (hit) throw new UserError(hit[1]);
  throw err;
}

export async function open(
  user: User,
  symbol: string,
  side: Side,
  notionalUsd: number,
  limitPrice?: number,
): Promise<TradeResult> {
  const m = await within("read markets", READ_MS, market(symbol));
  const key = keyFor(user);
  const tag = `${side} ${m.info.baseSymbol}`;
  const status = await within(`${tag}: link check`, READ_MS, linkStatus(key, m.info.poolAddress));
  if (!status.place) throw new UserError(`Your bot key is not linked for ${m.display}. In the app: wallet → Link a bot → add ${key.operator} again.`);

  const price = limitPrice ? alignPrice(toRaw(limitPrice, 18), m.info) : await within(`${tag}: book`, READ_MS, takerPrice(m, side));
  const wanted = sizeForNotional(notionalUsd, m.info, limitPrice ?? (await within(`${tag}: mark`, READ_MS, mark(m))));
  if (wanted === 0n) {
    const min = fromRaw(m.info.minQuantity, m.info.baseDecimals);
    throw new UserError(`$${notionalUsd} is below ${m.display}'s minimum size of ${min} ${m.info.baseSymbol}.`);
  }
  const sized = await within(`${tag}: sizing`, READ_MS, sizeOrder(exchange, { market: m, account: key.owner, side, price, wanted, tradingKey: key }));
  if (!sized.ok) throw new UserError(`Can't place: ${sized.reason}.`);

  const orderType = limitPrice ? ORDER_TYPE.LIMIT : ORDER_TYPE.MARKET;
  const res = await within(
    `${tag}: placeOrderFor`,
    WRITE_MS,
    placeFor(key, { pool: m.info.poolAddress, isBid: side === "long", price, quantity: sized.quantity, orderType }),
  ).catch(friendly);
  return summarize(res, m, side, sized.quantity, price, orderType === ORDER_TYPE.LIMIT);
}

function summarize(
  res: Awaited<ReturnType<typeof placeFor>>,
  m: PerpMarket,
  side: Side,
  quantity: bigint,
  price: bigint,
  limit: boolean,
): TradeResult {
  const filledRaw = res.fills.reduce((s, f) => s + f.quantityFilled, 0n);
  const notional = res.fills.reduce((s, f) => s + f.quantityFilled * f.fillPrice, 0n);
  const avg = filledRaw > 0n ? Number(notional / filledRaw) / 1e18 : fromRaw(price, 18);
  return {
    hash: res.hash,
    side,
    quantity: fromRaw(quantity, m.info.baseDecimals),
    filled: fromRaw(filledRaw, m.info.baseDecimals),
    avgPrice: avg,
    orderId: res.orderId,
    resting: limit && filledRaw < quantity,
  };
}

export interface CloseResult extends TradeResult {
  realizedPnl: number;
}

/** Close `fraction` of the position with a reducing IOC. */
export async function close(user: User, symbol: string, fraction = 1): Promise<CloseResult> {
  const m = await within("read markets", READ_MS, market(symbol));
  const key = keyFor(user);
  const bank = m.info.marginBank;
  const tag = `close ${m.info.baseSymbol}`;
  const pos = await within(
    `${tag}: position`,
    READ_MS,
    exchange.client.getPerpPositionAnalytics({ marginBank: bank, account: key.owner, pool: m.info.poolAddress }),
  );
  if (pos.size === 0n) throw new UserError(`No open ${m.display} position.`);
  const abs = pos.size < 0n ? -pos.size : pos.size;
  const lot = BigInt(m.info.lotSize);
  let qty = fraction >= 1 ? abs : (abs * BigInt(Math.round(fraction * 10_000))) / 10_000n;
  qty = lot > 0n ? (qty / lot) * lot : qty;
  if (qty < BigInt(m.info.minQuantity)) {
    throw new UserError(`${Math.round(fraction * 100)}% is below the ${m.display} minimum size. Close the whole position instead.`);
  }

  const side: Side = pos.size > 0n ? "short" : "long";
  const preview = await within(
    `${tag}: PnL preview`,
    READ_MS,
    exchange.client.previewPerpClosePnl({ pool: m.info.poolAddress, marginBank: bank, account: key.owner, quantity: qty }),
  ).catch(() => undefined);
  const price = await within(`${tag}: book`, READ_MS, takerPrice(m, side));
  const res = await within(
    `${tag}: placeOrderFor`,
    WRITE_MS,
    placeFor(key, { pool: m.info.poolAddress, isBid: side === "long", price, quantity: qty, orderType: ORDER_TYPE.MARKET }),
  ).catch(friendly);
  const out = summarize(res, m, side, qty, price, false);
  // The preview prices the close at the mark, but the IOC fills at the book plus
  // slippage. Take the price move from the actual fill, and funding plus fee
  // (which barely depend on the fill price) from the preview.
  const priced = preview && preview.priceable ? preview : undefined;
  let realizedPnl = 0;
  if (out.filled > 0 && pos.priceable) {
    const direction = pos.size > 0n ? 1 : -1;
    const gross = (out.avgPrice - fromRaw(pos.avgEntryPrice, 18)) * out.filled * direction;
    realizedPnl = gross - (priced ? fromRaw(priced.fundingSettled + priced.fee, 18) : 0);
  } else if (out.filled > 0 && priced) {
    realizedPnl = fromRaw(priced.netProceeds, 18);
  }
  return { ...out, realizedPnl };
}

export async function cancelAll(user: User, symbol?: string): Promise<`0x${string}`[]> {
  const key = keyFor(user);
  const orders = (await within("cancel: open orders", READ_MS, openOrders(user))).filter(
    (o) => !symbol || o.market.info.baseSymbol === symbol.toUpperCase(),
  );
  const hashes: `0x${string}`[] = [];
  for (const o of orders) {
    hashes.push(await within(`cancel ${o.market.info.baseSymbol}: cancelOrderFor`, WRITE_MS, cancelFor(key, o.market.info.poolAddress, o.orderId)).catch(friendly));
  }
  return hashes;
}

export function txUrl(hash: string): string {
  return `${appConfig.explorerTx}${hash}`;
}
