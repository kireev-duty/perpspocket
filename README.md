# PerpsPocket

**Trade dreamDEX perps on Somnia from Telegram, with a bot key that can never withdraw your funds.**

PerpsPocket is a Telegram bot for the dreamDEX perpetual futures on Somnia Tokyo testnet (Hideki, chain 50383). You type `/long BTC 50` and get a filled order with an explorer link. Your take-profit and stop-loss react to the mark the moment Somnia Reactivity pushes it. The bot alerts you before liquidation and makes a shareable PnL card you can post.

**What makes it different: perps are social here.** Add the bot to any Telegram group and every trade a member makes posts there with a **🔁 Copy** button. Anyone can mirror it at the same size with one tap, on their own account. Or they can `/follow` the trader so every open and close is copied automatically. Each group gets its own leaderboard.

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
| `/tp BTC 95000`, `/sl BTC 80000` | Bot-side take-profit and stop-loss, fired by **Somnia Reactivity** mark pushes, with a 15 s poll as fallback. A stop past the liquidation price is refused |
| **group trading** | In a group, each member's trade posts with **🔁 Copy $25** and **👣 Follow** buttons. Copy previews the same order for the person who tapped it, on their own account |
| `/follow @trader 25`, `/following`, `/unfollow` | Copy-trading: every open of the trader is mirrored at your size, and every full close (manual, TP or SL) closes yours |
| `/top` in a group | The group's own weekly leaderboard, with Follow buttons for the top 3 |
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
Somnia Reactivity (src/reactive.ts) ── somnia_watch on each pool ──► mark push ──► watcher (src/watcher.ts)
                                   eth_calls = [pool.tryGetMarkPrice()], push_changes_only    TP/SL fire at once
social (src/social.ts) ── after every fill ──► group posts with Copy / Follow, mirrored orders for followers
SQLite (node:sqlite): users, encrypted keys, trades with tx hashes, triggers, follows, group members
```

**Somnia Reactivity.** Every pool that carries an active TP/SL gets one `somnia_watch` subscription. Each log the pool emits arrives with `tryGetMarkPrice()` already evaluated at the same block, and `onlyPushChanges` drops pushes where the mark didn't move. Measured on Hideki: 38 pushes in 30 s on BTC-PERP and ETH-PERP (`npx tsx scripts/reactivity-probe.ts 30`). A per-key lock means a burst of pushes closes a position once. If a stream goes quiet for 20 s, the poll takes over.

**Copy-trading stays non-custodial.** A copied order is placed by the follower's own linked key for the follower's own account. Nobody's key can trade anyone else's funds.

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
