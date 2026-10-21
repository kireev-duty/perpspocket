import { startBot } from "./bot.js";
import { startWatcher } from "./watcher.js";
import { markets } from "./engine.js";

const all = await markets();
console.log(`PerpsPocket: ${all.length} perp markets on Hideki testnet`);
await startBot();
startWatcher();
