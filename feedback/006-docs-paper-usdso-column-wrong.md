# Docs mark six markets as closed to paper USDso, but the MarginBank allows all 21
Severity: normal
Area: docs

## Steps to reproduce
1. Open app.testnet.dreamdex.io/docs/trading/perps-testnet, "Markets" table. The "Paper USDso" column says **No** for 1000PEPE-PERP, LIT-PERP, PUMP-PERP, VVV-PERP, ZEC-PERP and ZRO-PERP. The margin page says the same: "The six newest markets are not on that list."
2. Ask the contract. `MarginBank.isVoucherMarketAllowed(pool)` at `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` is what `client.getPerpLeverage(...).voucherMarketAllowed` returns, and the voucher gate in `previewPerpOrderMargin` / `getMaxPerpOrderSize` uses it.
3. Run `npx tsx scripts/audit.ts` in this repo. It prints `voucherMarketAllowed` for every pool.

## Expected
`false` for the six markets the docs list as No, so that paper USDso cannot open positions there.

## Actual
`voucherMarketAllowed: true` on all 21 markets, the six included:
```
ZRO      | ... | voucher true cap 20x maxLev 20x
LIT      | ... | voucher true cap 20x maxLev 20x
VVV      | ... | voucher true cap 20x maxLev 20x
1000PEPE | ... | voucher true cap 20x maxLev 20x
PUMP     | ... | voucher true cap 20x maxLev 20x
ZEC      | ... | voucher true cap 20x maxLev 20x
```
Either the allowlist was opened up and the docs (the table and "six newest markets" sentence) are stale, or the allowlist is wrong and Perps Arena accounts can trade markets they were not meant to. Both are worth a look. For Arena traders this is a fairness question as well as a docs one.

## Evidence
`scripts/audit.ts` output, 2026-10-21. The column the script prints comes from `getPerpLeverage({ marginBank, account, pool }).voucherMarketAllowed`, which is a direct `isVoucherMarketAllowed(pool)` read (`src/perp/margin.ts`, line 774 in the SDK source).

## Environment
@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet / Hideki (chain 50383). Read-only.
