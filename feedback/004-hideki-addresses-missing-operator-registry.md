# SOMNIA_HIDEKI_TESTNET_ADDRESSES has no OperatorPermissionsRegistry, so stop orders need a hardcoded address
Severity: normal
Area: SDK

## Steps to reproduce
1. `import { SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk"` (0.32.1)
2. `Object.keys(SOMNIA_HIDEKI_TESTNET_ADDRESSES).filter(k => /operator/i.test(k))`

## Expected
The Hideki address set includes the OperatorPermissionsRegistry, `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a`, which the dev docs list in the Hideki contracts table. Stop orders need it.

## Actual
The filter returns `[]`. The bot kit works around this with a hardcoded per-network map in `packages/perp-core/src/config.ts`. Its comment says `placePerpStopOrder` throws `NotConfiguredError` unless the registry is passed explicitly. Every integrator who wants TP/SL has to copy the address out of the docs table. If the registry is redeployed, those copies break quietly.

## Evidence
- The one-line check above.
- `dreamdex-bot-kit/packages/perp-core/src/config.ts`, `OPERATOR_REGISTRY` map and its comment.
- Dev docs, Hideki contracts table: `OperatorPermissionsRegistry 0x6B2F…8D3a`.

## Environment
@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet / Hideki (chain 50383).
