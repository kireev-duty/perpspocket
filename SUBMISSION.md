# DoraHacks submission

**Name:** PerpsPocket

**Tagline:** Trade dreamDEX perps on Somnia from Telegram, with a bot key that can never withdraw your funds.

**Tracks:** MVP (bots and agents / consumer perps) + Feedback

**Description:**
PerpsPocket is a Telegram bot for dreamDEX perps on Somnia Tokyo testnet. Each user gets their own bot key and links it to their DreamDEX account with Link a Bot. The on-chain operator grant lets the key place, cancel and reduce orders, and nothing else. After that, trading takes one message: `/long BTC 50`.

- Market and limit orders by USDso notional. Each order is confirmed with a button and answered with a tx link.
- Positions with PnL net of funding, ROE and liquidation price. Close all or part in one tap.
- 24/7 take-profit and stop-loss, plus a push alert before liquidation with one-tap reduce buttons.
- Shareable PnL cards with the trader's invite link, and a weekly leaderboard.
- Built on @somnia-chain/markets-sdk 0.32.1: getMaxPerpOrderSize sizing, per-market decimals and tick/lot grids, position analytics and liquidation price.

The Feedback track has 4 reproducible reports in `feedback/`. One is major: the bot kit's perp-core passes the Shannon address set on Hideki, so perp markets silently disappear when the indexer is down. It comes with a repro script.

**Repo:** <github link>
**Demo:** <video / gif link>

---

# X posts (tag @DreamDEXSomnia)

**Post 1: launch**
> Perps from Telegram, without handing over your keys 🔑
>
> PerpsPocket lets you trade @DreamDEXSomnia perps on Somnia with one message:
> /long BTC 50 → filled, tx link back in 1 tap.
>
> Your bot key is linked on-chain and can only trade. It can never withdraw.
> Built for the dreamDEX Perps Builder Bounty 👇
> <repo link>

**Post 2: TP/SL + liquidation alerts (attach a screenshot)**
> Your stop-loss shouldn't die when you close your laptop.
>
> PerpsPocket watches your @DreamDEXSomnia positions 24/7:
> 🎯 /tp BTC 95000
> 🛑 /sl BTC 80000
> 🚨 a ping when you're within 5% of liquidation, with Close 50% / Close all buttons
>
> All on Somnia testnet, all from Telegram.

**Post 3: PnL card (attach the /pnl card)**
> Opened a long on @DreamDEXSomnia from Telegram, and here's the card 👇
>
> /pnl turns any position into a shareable card with your invite link, and /top ranks the week's best traders.
>
> Try PerpsPocket on Somnia testnet: <bot link>
