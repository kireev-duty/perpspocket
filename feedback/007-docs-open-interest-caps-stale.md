# Docs open-interest caps are 2–4 times below the live ones, though the table says it is "read from the live markets"
Severity: normal
Area: docs

## Steps to reproduce
1. Open app.testnet.dreamdex.io/docs/trading/perps-testnet, "Markets" table, column "Open interest cap". Below the table: "These figures are read from the live markets".
2. Run `npx tsx scripts/audit.ts` in this repo to read `getPerpPoolParameters().maxOpenInterest` from every pool.

## Expected
The table matches the chain.

## Actual
| Market | Docs | Live `maxOpenInterest` | Live / docs |
|---|---|---|---|
| BTC-PERP | 246.81545 BTC | 493.6309 | 2× |
| ETH-PERP | 3,995.6125 ETH | 7,991.225 | 2× |
| SOL-PERP | 47,654.44 SOL | 95,308.88 | 2× |
| XRP-PERP | 344,632 XRP | 1,378,528 | 4× |
| NEAR-PERP | 250,410 NEAR | 1,001,640 | 4× |
| ZRO-PERP | 250,599.5 ZRO | 1,002,398 | 4× |
| ZEC-PERP | 420 ZEC | 1,680 | 4× |
| TAO-PERP | 2,185.491 TAO | 2,185.491 | 1× |

The docs' ZEC "OI cap" of 420 is the live *per-account* cap (`maxPositionSize` = 420), so at least one row seems to read the wrong field. Wherever the table is generated from, it is not the live `maxOpenInterest`.

## Evidence
`scripts/audit.ts` output, 2026-10-21, with the docs page read the same day.

## Environment
@somnia-chain/markets-sdk 0.32.1 plus direct `getPerpPoolParameters()` reads, Somnia Tokyo testnet / Hideki (chain 50383). Read-only.
