# loadMarkets() returns zero perp markets with no error when the configured perpPoolFactory has no pools on the connected chain
Severity: major
Area: SDK

## Steps to reproduce
1. `npm i @somnia-chain/markets-sdk@0.32.1`
2. Build `SomniaMarkets` for Hideki (`hidekiTestnet`, chain 50383) with an indexer that is unreachable, so the documented chain fallback is used. Pass an address set whose `perpPoolFactory` has no perp pools on this chain. For example, `SOMNIA_TESTNET_ADDRESSES` (Shannon), which is exactly what `dreamdex-bot-kit/packages/perp-core/src/exchange.ts` passes on Hideki today.
3. Call `loadMarkets(true)` and count the `swap` markets. `npx tsx scripts/repro-addresses.ts` in this repo does steps 2–3 for both address sets.

## Expected
`loadMarkets` is documented as "chain-complete through the PerpPoolFactory, so it survives an empty or unreachable indexer". If the factory it is pointed at has no code or no pools on the connected chain, it should throw, for example a `NotConfiguredError` that names the factory address and the chain ID. It should not report a healthy, empty venue.

## Actual
```
SOMNIA_TESTNET_ADDRESSES: 0 perp markets []
SOMNIA_HIDEKI_TESTNET_ADDRESSES: 21 perp markets [ 'BTC/USDso:USDso', 'ETH/USDso:USDso', 'SOL/USDso:USDso' ]
```
With a mismatched address set the call resolves to an empty list. A bot cannot tell "the indexer is down and my config is wrong" from "there are no markets". In the bot kit, this means every `perp-*` strategy exits with `Live markets: (none)` during an indexer outage. A running guard also stops seeing the positions it is meant to protect, at the moment it is most needed.

The trigger in the wild is the bot kit's address-set choice. That choice was reported separately, so this item is only about the SDK swallowing a misconfiguration: the SDK can detect it cheaply (`eth_getCode` on the factory, or a pool count of 0 compared with the chain ID), and it should fail loudly.

## Evidence
- `scripts/repro-addresses.ts` (read-only) and the output above, run 2026-10-21.
- `SOMNIA_TESTNET_ADDRESSES.perpPoolFactory` = `0x516d…a07b`. `SOMNIA_HIDEKI_TESTNET_ADDRESSES.perpPoolFactory` = `0xE631…6560`.

## Environment
@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet / Hideki (chain 50383), Node 24.20, Windows 10. Read-only, no wallet needed.
