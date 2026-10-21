// Read-only audit of the live Hideki perp markets against what the docs say.
// Follows the developer docs' own "Connect" snippet, then reads each pool's
// parameters straight from the chain. Sends nothing; no key needed.
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http, parseAbi, type Address } from "viem";

const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});
const rpc = createPublicClient({ chain: hidekiTestnet, transport: http("https://api.hideki2.infra.testnet.somnia.network") });
const POOL = parseAbi([
  "function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))",
]);

const perps = await markets.client.listPerpMarkets();
const mode = process.argv[2] ?? "table";
if (mode === "row") {
  console.log(JSON.stringify(perps[0], (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  process.exit(0);
}
const anyone = "0x1111111111111111111111111111111111111111" as Address;
for (const m of perps) {
  const p = await rpc.readContract({ address: m.poolAddress as Address, abi: POOL, functionName: "getPerpPoolParameters" });
  const lev = await markets.client
    .getPerpLeverage({ marginBank: m.marginBank as Address, account: anyone, pool: m.poolAddress as Address })
    .catch((e: Error) => ({ error: e.message.slice(0, 60) }));
  const d = 10 ** Number(m.baseDecimals);
  console.log(
    [
      (m.baseSymbol ?? "?").padEnd(9),
      `IM ${p.initialMarginBps}`,
      `MM ${p.maintenanceMarginBps}`,
      `CO ${p.closeOutMarginBps}`,
      `OIcap ${Number(p.maxOpenInterest) / d}`,
      `posCap ${Number(p.maxPositionSize) / d}`,
      `ratio ${(Number(p.maxOpenInterest) / Number(p.maxPositionSize)).toFixed(2)}`,
      `taker ${p.takerFeeBpsTimes1k} maker ${p.makerFeeBpsTimes1k}`,
      `fundWin ${m.fundingWindowSec} int ${m.fundingIntervalSec}`,
      "voucherMarketAllowed" in lev ? `voucher ${lev.voucherMarketAllowed} cap ${lev.voucherLeverageCapX}x maxLev ${lev.protocolMaxLeverageX}x` : `lev ${lev.error}`,
    ].join(" | "),
  );
}
process.exit(0);
