# SDK has no perp operator writes (placeOrderFor / cancelOrderFor / reduceOrderFor), though Link a Bot is the recommended setup
Severity: normal
Area: SDK

## Steps to reproduce
1. Follow "Trade an app wallet with a bot" in the dev docs: link a bot key to an app wallet with Link a Bot.
2. Try to place an order for the linked wallet with `@somnia-chain/markets-sdk@0.32.1`.
3. Search the typings: `grep -rn "placeOrderFor\|cancelOrderFor\|reduceOrderFor" node_modules/@somnia-chain/markets-sdk/dist/*.d.ts`

## Expected
A `Trader` method, or an `owner` option on `placePerpOrder` / `cancelOrder`, that sends the `…For` variant. It should simulate first and decode the result the way `placePerpOrder` does (named revert errors, `decodePlaceOrder` fills). Also a helper like `isOperatorAuthorized(owner, operator, pool)` to check a link.

## Actual
`Trader.placePerpOrder` signs only for the signer's own account. Every bot that trades a linked wallet re-implements the ABI, the three selectors, the gas limit and the receipt decoding with raw viem. The bot kit does this in `packages/perp-core/src/operator.ts`, and its comment says "The markets SDK has no perp `…For` writes". The docs then list three pitfalls specific to raw `placeOrderFor` calls (decimals scaling, gas, IOC no-fill). An SDK method could guard against all three. PerpsPocket had to vendor this code too.

## Evidence
- `dreamdex-bot-kit/packages/perp-core/src/operator.ts`, the comment and the hand-written ABI.
- No `…For` methods in `dist/trade.d.ts` (the grep above returns nothing).

## Environment
@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet / Hideki (chain 50383).
