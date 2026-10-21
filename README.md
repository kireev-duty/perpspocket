# PerpsPocket

**Trade dreamDEX perps on Somnia from Telegram, with a bot key that can never withdraw your funds.**

PerpsPocket is a Telegram bot for the dreamDEX perpetual futures on Somnia Tokyo testnet (Hideki, chain 50383). You type `/long BTC 50` and get a filled order with an explorer link. You can set a take-profit or stop-loss, and the bot watches it 24/7. It alerts you before liquidation and makes a shareable PnL card you can post.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail), MVP track (category: bots and agents / consumer perps). The `feedback/` folder has the Feedback-track reports found while building it.

## Who it's for

- **Mobile and casual traders.** They want to open, check and close a perp in two taps, without a desktop trading UI or a browser wallet popup.
- **Active traders.** They need TP/SL that survives a closed laptop and a ping before liquidation.
- **Groups and communities.** PnL cards and a weekly leaderboard turn trades into posts. Each card carries the trader's invite link, which brings in the next trader.

## Why it's safe: the linked bot key

PerpsPocket never asks for your wallet's private key or seed phrase.

1. `/start` generates a **fresh key just for you** and stores it encrypted (AES-256-GCM).
2. You link that key's address to your DreamDEX account in the app (**wallet → Link a bot → Perps**).
3. The link is an on-chain operator grant for three functions on the perp pools: `placeOrderFor`, `cancelOrderFor` and `reduceOrderFor`. The key **cannot withdraw, transfer or change your settings**. You can unlink it in the app at any time.

The bot checks the grant on-chain for every market (`isOperatorAuthorized`) before it trades, and `/status` shows the result.

## Features

| Command | What it does |
| --- | --- |
| `/long BTC 50`, `/short ETH 100 @ 2600` | Market or limit order by USDso notional. Shows a preview and a confirm button, then the fill price and a tx link |
| `long sol 25` | The same in plain text, no slash needed |
| `/pos` | Positions with entry, mark, PnL net of funding, ROE, **liquidation price**, TP/SL, and one-tap close buttons |
| `/close BTC [50]` | Closes all or a percentage with a reducing IOC, aligned to the lot grid. Shows realized PnL |
| `/tp BTC 95000`, `/sl BTC 80000` | Bot-side take-profit and stop-loss, checked against the mark every 15 s. A stop past the liquidation price is refused |
| liquidation alert | A push when the mark gets within 5% of the liquidation price, with *Close 50% / Close all* buttons |
| `/pnl` | PnL card image with your invite link, ready to post |
| `/top`, `/invite` | Weekly realized-PnL leaderboard and referral link |
| `/markets`, `/price SOL` | All 21 perp markets: mark, bid and ask, funding APR, max leverage |
| `/status` | Link coverage per market, bot gas (STT), perps equity |

Why bot-side TP/SL: a linked operator key cannot arm the protocol's stop orders, because only the account itself can. PerpsPocket watches the mark and closes with a reducing IOC when a trigger is crossed.

## How it works

```
Telegram ─► grammy bot (src/bot.ts) ─► engine (src/engine.ts)
                                         │ reads: one shared SomniaMarkets client (markets-sdk 0.32.1),
                                         │        account passed explicitly per user
                                         │ sizing: getMaxPerpOrderSize (pool's own rule)
                                         │ writes: placeOrderFor / cancelOrderFor signed by the user's bot key
watcher (src/watcher.ts) ── every 15 s ──┘ TP/SL triggers + liquidation distance
SQLite (node:sqlite): users, encrypted keys, trades with tx hashes, triggers
```

- Sizing never happens locally. `getMaxPerpOrderSize` sizes against the pool's own rule, and it reports problems such as a voucher-blocked market before anything is sent.
- Prices and quantities are converted with each market's own decimals (6 to 24) and aligned to the tick and lot grid.
- Market orders cross the touch with configurable slippage (default 0.5%), so an IOC doesn't revert `ImmediateOrCancelNoFill` when the book moves.
- Close size comes from the on-chain position. PnL comes from `listPerpPositionAnalytics`, and liquidation price from `getLiquidationPrice`.
- `src/perp-core/` is vendored from the MIT-licensed [dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit), with one fix: it uses the Hideki address set on Hideki (see `feedback/001`).

## Run it

Needs Node 22+ (it uses the built-in `node:sqlite`).

```bash
git clone https://github.com/kireev-duty/perpspocket && cd perpspocket
npm install
cp .env.example .env     # TELEGRAM_BOT_TOKEN from @BotFather, MASTER_KEY = 32+ random chars
npm run doctor           # read-only: lists every perp market, proves the SDK reaches Hideki
npm start                # starts the bot + the TP/SL watcher
```

Then in Telegram: `/start`, link the shown address in the app, send `/link 0xYourAccount`, then `/long BTC 25`.

Without Telegram, `npm run once -- BTC long 25` / `npm run once -- BTC close` / `npm run once -- status` trades through the same engine, using `PRIVATE_KEY` (a linked bot key) and `OWNER_ADDRESS` from `.env`. `npx tsx scripts/smoke.ts` runs every read path plus a refused order and renders a sample card.

## Live on Somnia Tokyo testnet

| Action | Tx |
| --- | --- |
| _filled after the first live session_ | |

## X posts

- _link 1_
- _link 2_
- _link 3_

## Roadmap

- Somnia Reactivity subscriptions to pool events, for instant fill notifications instead of polling.
- Copy-trading: follow a top trader from `/top` with your own size.
- Mainnet as soon as dreamDEX perps launch there.

## License

MIT. `src/perp-core/` © DreamDEX S.A. (MIT, see `src/perp-core/LICENSE-dreamdex-bot-kit`).
