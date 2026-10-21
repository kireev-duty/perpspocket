# Explorer shows perp trades as size 0 on every market whose base asset has fewer than 18 decimals
Severity: normal
Area: app

## Steps to reproduce
Open these filled `placeOrderFor` transactions on the Tokyo testnet explorer and read the "What this transaction did → TRADE" line:
1. ETH-PERP (18 base decimals): https://explorer.testnet.somnia.network/tokyo/tx/0x0651789850cbecf5d55614eee9fa91755fb8d20239e60e6aad0310bd2ae6127a
2. SOL-PERP (9 decimals): https://explorer.testnet.somnia.network/tokyo/tx/0x7a0b04047f3a6897421d09189d5578443c40faf5eb005c0b581a3f6f19a24729
3. BTC-PERP (8 decimals): https://explorer.testnet.somnia.network/tokyo/tx/0xc564b98f598de76c639c522654ae7d693c6693096d546a7771f154b626b91a36
4. XRP-PERP (6 decimals): https://explorer.testnet.somnia.network/tokyo/tx/0x157a3747e43cd88931cf840962255371c0f7964e795f102b1eb3404740b7dc60

## Expected
The filled size in base units: 0.0416 ETH, 0.47 SOL, 0.00061 BTC and 38.4 XRP (sizes from the order's own fill events).

## Actual
- ETH: `ETH-PERP · 0.0416 @ 2,402.66` (correct)
- SOL: `SOL-PERP · 0 @ 104.19`
- BTC: `BTC-PERP · 0 @ 81,862.3`
- XRP: `0x7058…e060 · 0 @ 1.3016` (here the market name is also missing, so it falls back to an address)

The size looks like it is always scaled by 10^18. The developer docs warn about exactly this mistake ("Never assume 18"). Only the 18-decimal market renders correctly, and 12 of the 21 perp markets have fewer decimals. For bounty participants this is the page judges open to check "live orders, transaction hashes", and on most markets it reports every fill as size 0.

## Evidence
Page text read from each link above on 2026-10-21. The real sizes, decoded from each receipt with the SDK's `decodePlaceOrder` (`npx tsx scripts/fills.ts <hash>` in this repo):
```
ETH-PERP base decimals 18 filled 0.0416  raw 41600000000000000
SOL-PERP base decimals 9  filled 0.47    raw 470000000
BTC-PERP base decimals 8  filled 0.00061 raw 61000
XRP-PERP base decimals 6  filled 38.4    raw 38400000
```
470000000 / 10^18 = 4.7e-10, which rounds to the "0" the explorer shows.

## Environment
explorer.testnet.somnia.network/tokyo, Somnia Tokyo testnet / Hideki (chain 50383), Chrome.
