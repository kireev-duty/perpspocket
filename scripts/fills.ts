// Decode the fills of a perp order transaction from its receipt (read-only):
//   npx tsx scripts/fills.ts <txHash> [...]
import { decodePlaceOrder } from "@somnia-chain/markets-sdk";
import { createPublicClient, http, type Hex } from "viem";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import * as engine from "../src/engine.js";

const rpc = createPublicClient({ chain: hidekiTestnet, transport: http("https://api.hideki2.infra.testnet.somnia.network") });
for (const hash of process.argv.slice(2) as Hex[]) {
  const receipt = await rpc.getTransactionReceipt({ hash });
  const m = await engine.marketByPool(receipt.to!);
  const { fills } = decodePlaceOrder(receipt, receipt.to!);
  const qty = fills.reduce((s, f) => s + f.quantityFilled, 0n);
  console.log(m?.display, "base decimals", m?.info.baseDecimals, "filled", Number(qty) / 10 ** (m?.info.baseDecimals ?? 18), "raw", qty.toString());
}
process.exit(0);
