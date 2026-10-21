// App-level settings. Chain endpoints and the perp network come from
// perp-core's loadConfig; this file only adds what the Telegram app needs.

import { loadEnv, envNum } from "./perp-core/index.js";

loadEnv();

function required(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return v;
}

export const appConfig = {
  telegramToken: () => required("TELEGRAM_BOT_TOKEN"),
  masterKey: () => required("MASTER_KEY"),
  dataDir: process.env.DATA_DIR ?? "data",
  explorerTx: process.env.EXPLORER_TX_URL ?? "https://explorer.testnet.somnia.network/tokyo/tx/",
  appUrl: "https://app.testnet.dreamdex.io",
  /** How often the TP/SL + liquidation watcher wakes up. */
  watchIntervalMs: envNum("WATCH_INTERVAL_MS", 15_000),
  /** Warn when the mark is within this fraction of the liquidation price. */
  liqWarnFraction: envNum("LIQ_WARN_FRACTION", 0.05),
  /** Taker slippage for market orders, in bps. */
  slippageBps: envNum("SLIPPAGE_BPS", 50),
};
