# Bot kit perp-core uses the Shannon address set on Hideki, so perp markets vanish when the indexer is unreachable
Severity: major
Area: SDK

## Steps to reproduce
1. In `dreamdex-bot-kit`, `packages/perp-core/src/exchange.ts` `createExchange()` builds `SomniaMarkets` with `addresses: SOMNIA_TESTNET_ADDRESSES` for every network, including `NETWORK=hideki` (the default). The comment says the same singletons sit at the same addresses on Hideki.
2. Compare the two sets in `@somnia-chain/markets-sdk@0.32.1`. They differ on Hideki: `perpPoolFactory` is `0x516d…a07b` (Shannon) vs `0xE631…6560` (Hideki), `marginBank` is `0xdd4A…5C4E` vs `0x4787…1394`, and `collateral`, `marketCreator` and `priceFeedScheduler` differ too.
3. Run `npx tsx scripts/repro-addresses.ts` from this repo. It calls `loadMarkets(true)` on Hideki with the indexer unreachable, once with each address set.

## Expected
Both runs list the 21 Hideki perp markets. `SomniaMarkets.loadMarkets` is documented as "chain-complete through the PerpPoolFactory, so it survives an empty or unreachable indexer". Failing that, the call should throw.

## Actual
```
SOMNIA_TESTNET_ADDRESSES: 0 perp markets []
SOMNIA_HIDEKI_TESTNET_ADDRESSES: 21 perp markets [ 'BTC/USDso:USDso', 'ETH/USDso:USDso', 'SOL/USDso:USDso' ]
```
With the address set the bot kit passes, the chain fallback reads a factory address that has no perp pools on Hideki. It returns an empty market list without an error. During an indexer outage every `perp-*` strategy then reports `PERP_SYMBOL=… does not match a live perp market. Live markets: (none)` and exits, or a running guard stops seeing its markets, which is the time a risk bot is needed most. Any other SDK path that falls back to `addresses.marginBank` or `addresses.collateral` would also point at Shannon contracts.

Suggested fix: pass `SOMNIA_HIDEKI_TESTNET_ADDRESSES` when `NETWORK=hideki` (one line, as done in `src/perp-core/exchange.ts` here) and correct the comment. Separately, the SDK could throw instead of returning 0 markets when the configured factory has no code or no pools on the connected chain.

## Evidence
- `scripts/repro-addresses.ts` (repro, read-only) and the output above.
- Upstream code: `dreamdex-bot-kit/packages/perp-core/src/exchange.ts`, `addresses: SOMNIA_TESTNET_ADDRESSES`.
- The dev docs for Hideki say to use `SOMNIA_HIDEKI_TESTNET_ADDRESSES` (app.testnet.dreamdex.io/docs/developers/perps-testnet, "Connect").

## Environment
@somnia-chain/markets-sdk 0.32.1, dreamdex-bot-kit main (cloned 2026-10-21), Somnia Tokyo testnet / Hideki (chain 50383), Node 24.20, Windows 10. Read-only, no wallet needed.
