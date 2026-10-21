# SDK PERPS.md says only BTC and ETH perps are live; Hideki lists 21
Severity: normal
Area: docs

## Steps to reproduce
1. `npm i @somnia-chain/markets-sdk@0.32.1`
2. Open `node_modules/@somnia-chain/markets-sdk/docs/PERPS.md`. The first paragraph says: "Perps are live on testnet: `BTC/USDSO:USDSO` and `ETH/USDSO:USDSO`".
3. Run `npm run doctor` in this repo. It calls `loadMarkets(true)` on Hideki and prints every swap market.

## Expected
The SDK's perps guide matches what is live, or links to a place that lists the markets.

## Actual
`doctor` lists 21 live perp markets: ZRO, LIT, VVV, 1000PEPE, PUMP, ZEC, TAO, WLD, NEAR, XLM, AVAX, LINK, SUI, ADA, BNB, DOGE, XRP, HYPE, SOL, ETH, BTC. Their base decimals run 6, 7, 8, 9, 18 and 24, and their max leverage is 5x, 10x or 20x. A developer who reads only the SDK guide hardcodes two markets and 18 or 8 decimals, which is the scaling mistake the dev docs warn about. The symbol case is also inconsistent: the doc writes `USDSO`, while the SDK returns `BTC/USDso:USDso`.

## Evidence
Output of `npm run doctor` (2026-10-21), excerpt:
```
network hideki | 21 live perp markets
NEAR-PERP  mark 5.31  base dec 24 ...
PUMP-PERP  mark 0.00498 base dec 6 ...
BTC-PERP   mark 84354.97 base dec 8 ...
```

## Environment
@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet / Hideki (chain 50383).
