# Docs say a perp-pool transaction costs 0.0003–0.003 STT; real placeOrderFor orders cost 0.017–0.025 STT
Severity: normal
Area: docs

## Steps to reproduce
1. Read app.testnet.dreamdex.io/docs/developers/perps-testnet, "Get test funds": "Gas is billed on what a transaction uses, not on its gas limit: transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each."
2. Read `eth_gasPrice` on `https://api.hideki2.infra.testnet.somnia.network`, then the receipts of some ordinary `placeOrderFor` market orders.

## Expected
Orders cost 0.0003–0.003 STT, so the "Send it 5 STT" in Link a bot covers thousands of orders.

## Actual
`eth_gasPrice` is `0x165a0bc00` = 6 gwei, and orders use 2.9–4.1M gas:

| Tx | Market | Gas used | Fee |
|---|---|---|---|
| 0x0651789850cbecf5d55614eee9fa91755fb8d20239e60e6aad0310bd2ae6127a | ETH-PERP | 2,882,573 | 0.017295 STT |
| 0x7a0b04047f3a6897421d09189d5578443c40faf5eb005c0b581a3f6f19a24729 | SOL-PERP | 3,055,445 | 0.018332 STT |
| 0xc564b98f598de76c639c522654ae7d693c6693096d546a7771f154b626b91a36 | BTC-PERP | 3,836,201 | 0.023017 STT |
| 0x157a3747e43cd88931cf840962255371c0f7964e795f102b1eb3404740b7dc60 | XRP-PERP | 4,088,401 | 0.024530 STT |

That is 6–80 times the documented range. The page contradicts itself too: it says successful `placeOrderFor` calls "used up to about 1.56M gas", and 1.56M × 6 gwei is already 0.0094 STT. At these costs the 5 STT from Link a bot lasts about 200–290 orders, not thousands. This matters for anyone budgeting gas for a market maker or a bot that re-quotes.

## Evidence
The transactions above are public on explorer.testnet.somnia.network/tokyo. They are real bot orders from another bounty participant's published evidence, picked only as samples. Receipt of the BTC one, read via RPC: `gasUsed 3836201, effectiveGasPrice 6000000000, fee 0.023017206 STT, status 0x1`.

## Environment
Somnia Tokyo testnet / Hideki (chain 50383), JSON-RPC `eth_gasPrice` and `eth_getTransactionReceipt`, 2026-10-21.
