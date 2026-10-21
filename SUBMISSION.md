# DoraHacks submission

**Name:** PerpsPocket

**Tagline:** Social perps on Somnia: trade dreamDEX perps from Telegram, copy any trade in a group with one tap, and never hand over a withdrawable key.

**Tracks:** MVP (bots and agents / consumer perps) + Feedback

**Description:**
PerpsPocket is a Telegram bot for dreamDEX perps on Somnia Tokyo testnet, built around one idea: perps are more fun with friends.

- **Trade in one message.** `/long BTC 50` → confirm → filled, with the tx link. Positions show PnL net of funding, ROE and liquidation price. Closing takes one tap.
- **Social by design.** Add the bot to any Telegram group. Every member's trade posts there with a **🔁 Copy** button: one tap gives you the same order, at the same size, on your own account. `/follow @trader 25` mirrors every open and close of a trader you trust. Each group has its own weekly leaderboard.
- **Exits that react instantly.** TP/SL run on **Somnia Reactivity**: a `somnia_watch` subscription per pool pushes `tryGetMarkPrice()` evaluated at the same block, and the bot closes the moment a level is crossed. The bot also warns before liquidation, with one-tap reduce buttons.
- **Non-custodial.** Each user gets their own bot key and links it with "Link a bot". The on-chain grant covers only placeOrderFor / cancelOrderFor / reduceOrderFor, so the key can never withdraw. A copied trade is placed by the copier's own key on the copier's own account.
- Built on @somnia-chain/markets-sdk 0.32.1: getMaxPerpOrderSize sizing, per-market decimals and tick/lot grids, position analytics, liquidation price.

The Feedback track reports are in `feedback/`, each with a repro. The main one is major: the bot kit's perp-core passes the Shannon address set on Hideki, so perp markets silently disappear when the indexer is down.

**Repo:** https://github.com/kireev-duty/perpspocket
**Bot:** https://t.me/PerpsPocketBot
**Demo:** <video link>

---

# Demo video script (90–120 s, screen recording of Telegram Desktop + browser)

| Time | On screen | Voice-over / caption |
|---|---|---|
| 0–10 s | Bot chat, `/start` → bot key shown | "PerpsPocket: dreamDEX perps on Somnia, from Telegram. Each trader gets their own bot key." |
| 10–25 s | dreamDEX app → Bot access → Link a bot → Add bot; back in Telegram `/status` ✅ | "Link it once in the app. The key can trade, but it can never withdraw." |
| 25–40 s | `/long BTC 25` → Confirm → ✅ Filled + tx link → click the link, explorer shows success | "One message, one tap, a real order on Somnia Tokyo testnet." |
| 40–55 s | `/pos` (PnL, liq price) → `/tp BTC …` → the TP fires with ⚡ | "Take-profit and stop-loss run on Somnia Reactivity: the mark is pushed every block and the exit fires at once." |
| 55–80 s | **Group chat**: your trade posted with 🔁 Copy → a second account taps Copy → Confirm → filled | "The social part: in a group, every trade comes with a Copy button. One tap and a friend is in the same trade on their own account." |
| 80–95 s | `/follow @you 25` → you close → the follower's position closes automatically | "Or follow a trader: every open and close is mirrored at your size." |
| 95–110 s | `/top` in the group, then `/pnl` card | "A group leaderboard and shareable PnL cards keep people coming back." |
| 110–120 s | Repo README + feedback/ folder | "Open source, plus reproducible SDK and docs reports for the Feedback track." |

Tips: record in 1080p. Hide private chats in the sidebar. A second Telegram account (a friend's or a second number) is needed for the Copy/Follow part.

---

# X posts (tag @DreamDEXSomnia)

**Post 1: launch (attach the group screenshot with the Copy button)**
> Perps are better with friends 👥
>
> PerpsPocket brings @DreamDEXSomnia perps into Telegram groups:
> 🟢 you open a trade → it posts to the group
> 🔁 friends tap Copy → same trade on their own account
> 👣 /follow a trader → every open & close mirrored
>
> Non-custodial: each bot key can trade but never withdraw.
> https://t.me/PerpsPocketBot

**Post 2: Somnia Reactivity (attach the TP-fired screenshot)**
> Your stop-loss shouldn't wait for a poll.
>
> PerpsPocket subscribes to every @DreamDEXSomnia perp pool with Somnia Reactivity: the mark arrives with each block, and TP/SL fire the moment it's crossed ⚡
>
> Plus a liquidation ping with one-tap Close 50% / Close all.
> Code: https://github.com/kireev-duty/perpspocket

**Post 3: PnL card + leaderboard (attach the /pnl card)**
> Closed a long on @DreamDEXSomnia from Telegram, and here's the card 👇
>
> Every group gets its own weekly leaderboard: the top traders get followers, and followers copy them automatically.
>
> Try it on Somnia testnet: https://t.me/PerpsPocketBot
