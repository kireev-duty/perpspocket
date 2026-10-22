# Docs say each account's position cap is "a tenth" of the open interest cap; on 19 of 21 markets it is not
Severity: normal
Area: docs

> **Duplicate.** Found independently on 2026-10-21, but [NORMAL-10](https://github.com/rohan911438/DreamDex-Findings/blob/main/feedback/NORMAL-10-docs-oi-cap-table-stale.md) by rohan911438 filed on 2026-10-20 covers the same issue and was first. Kept here as a record of the work; not claimed for payment.

## Steps to reproduce
1. Read the trader docs, app.testnet.dreamdex.io/docs/trading/perps-testnet: "A single account is capped at a tenth of it on most markets."
2. Read the developer docs, app.testnet.dreamdex.io/docs/developers/perps-testnet, "Common pitfalls": "Each account has a position cap per market, a tenth of the market's open interest cap on most markets."
3. Run `npx tsx scripts/audit.ts` in this repo. It reads `getPerpPoolParameters()` from every perp pool and prints `maxOpenInterest / maxPositionSize`.

## Expected
The ratio is about 10 on most markets, as both pages say.

## Actual
Only TAO-PERP is at 10. The others:

| OI cap / position cap | Markets |
|---|---|
| 40 (cap = 1/40 of OI) | ZRO, LIT, VVV, 1000PEPE, PUMP, WLD |
| 20 (cap = 1/20 of OI) | NEAR, XLM, AVAX, LINK, SUI, ADA, BNB (19.8), DOGE, XRP, HYPE, SOL, ETH |
| about 5 | BTC (493.63 / 100 BTC) |
| 4 | ZEC (1,680 / 420 ZEC) |
| 10 | TAO |

So on most markets the per-account cap is 2–4 times smaller than the docs imply. A trader or bot that sizes off "a tenth of OI" hits `MaxPositionSizeExceeded()` (0x714b36d6) well before the size it planned. The docs could link to `getMaxPerpOrderSize().maxPositionSize` instead of giving a ratio.

## Evidence
`scripts/audit.ts` output, 2026-10-21 (excerpt):
```
ZRO  | IM 2000 | MM 1000 | OIcap 1002397.99 | posCap 25059.9  | ratio 40.00
ETH  | IM 500  | MM 250  | OIcap 7991.22    | posCap 399.56   | ratio 20.00
BTC  | IM 500  | MM 250  | OIcap 493.63     | posCap 100      | ratio 4.94
TAO  | IM 2000 | MM 1000 | OIcap 2185.49    | posCap 218.55   | ratio 10.00
```

## Environment
@somnia-chain/markets-sdk 0.32.1 (`listPerpMarkets`) plus direct `getPerpPoolParameters()` reads, Somnia Tokyo testnet / Hideki (chain 50383). Read-only.
