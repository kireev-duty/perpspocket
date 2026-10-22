# Explorer shows Link a Bot orders as raw selectors: placeOrderFor and cancelOrderFor are not decoded, while placeOrders and cancelOrders are
Severity: normal
Area: app

## Steps to reproduce
1. Open the ETH-PERP pool on the Tokyo testnet explorer: https://explorer.testnet.somnia.network/tokyo/address/0xd6cb1dd58580b84d76068ac21594219ce03aeddf
2. Read the METHOD column of the transaction list.
3. Open a `placeOrders` transaction, e.g. https://explorer.testnet.somnia.network/tokyo/tx/0xc925438822fc4b952322cf291f0b3dd60f404360d7d8b4b6939ab4a4d261b5ba
4. Open a `placeOrderFor` transaction sent by a linked bot key, e.g. https://explorer.testnet.somnia.network/tokyo/tx/0x8a420b591b28acd600515da18e7adddee49a2a19b74fe6679096019db5dad63b
5. Open a `cancelOrderFor` transaction, e.g. https://explorer.testnet.somnia.network/tokyo/tx/0x6e45fe43b2b314a7ff3da8d68f4223c4bb5527f0312413f57f82368849ed1c2d

## Expected
The operator functions are labelled and decoded like the account's own functions: `placeOrderFor(address owner, bool isBid, …)` and `cancelOrderFor(address owner, uint256 orderId)`, with the owner, side, price, quantity and order ID readable. This is how the explorer shows `placeOrders` and `cancelOrders` from the same pool.

## Actual
- `placeOrders` rows: METHOD `placeOrders`. The tx page shows `Method placeOrders(tuple[] arg0) · 0x24ea3d1f` and the decoded `arg0` tuples.
- `placeOrderFor` rows: METHOD `0x80054449`. The tx page shows `Method 0x80054449` and only the 324-byte hex input.
- `cancelOrderFor` rows: METHOD `0xe37b444b`, 68-byte hex input, no decoding.

This hits every bot that follows the recommended "Link a bot" setup. The ETH-PERP list on 2026-10-22 has `placeOrderFor` and `cancelOrderFor` rows from several unrelated bot keys, for example `0x24b300a69e071a7d535b51e438ea9a047d154e2fc4bb788c73ad1161e8dfebf0`, `0x0544e916fa611addd9983b7fa798292017aa39692ff4b98365e0092e8234efec` and `0x4c7e425e267ab93d64fca14b80059546a9c71a0b826b9537f4c4b08e7dd0d6fd`. A trader checking what a bot did on their account, or a judge checking a bounty's "live orders, transaction hashes", sees an unnamed selector and cannot tell a market order from a limit order or a cancel without decoding the calldata by hand. The "What this transaction did" box doesn't fill the gap: it shows only `MARGIN LOCKED · 1.2499 USDso` for the limit order and `MARGIN RELEASED` for the cancel.

## Evidence
- Page text of the transactions above, read on 2026-10-22.
- Selectors: `0x80054449` = `placeOrderFor`, `0xe37b444b` = `cancelOrderFor`, as in the operator ABI of the dreamDEX bot kit (`packages/perp-core/src/operator.ts`) and `src/perp-core/operator.ts` in this repo.
- The two PerpsPocket transactions above are from bot key `0x24ba44F796F34c64e6F484fC5e150d79F8E6b520` acting for account `0x6C811C1Df920c54265A79Ec98c2aEd98968F730F`.

## Environment
explorer.testnet.somnia.network/tokyo, Somnia Tokyo testnet / Hideki (chain 50383), Chrome.
