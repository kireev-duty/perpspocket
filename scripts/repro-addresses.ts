// Repro for feedback/001: load perp markets with the indexer unreachable, once
// with the Shannon address set (what dreamdex-bot-kit passes on Hideki) and
// once with the Hideki set. The SDK's chain fallback finds the PerpPoolFactory
// from addresses.perpPoolFactory, so only the Hideki set can work.
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

for (const [name, addresses] of [["SOMNIA_TESTNET_ADDRESSES", SOMNIA_TESTNET_ADDRESSES], ["SOMNIA_HIDEKI_TESTNET_ADDRESSES", SOMNIA_HIDEKI_TESTNET_ADDRESSES]] as const) {
  const ex = new SomniaMarkets({
    chain: hidekiTestnet,
    wsRpcUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
    indexerUrl: "https://127.0.0.1:9/v1/graphql", // unreachable on purpose
    addresses,
  });
  try {
    const all = await ex.loadMarkets(true);
    const perps = Object.values(all).filter((m) => m.type === "swap");
    console.log(`${name}: ${perps.length} perp markets`, perps.slice(0, 3).map((m) => m.symbol));
  } catch (e) {
    console.log(`${name}: FAILED`, (e as Error).name, (e as Error).message.split("\n")[0]);
  }
}
process.exit(0);
