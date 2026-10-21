// Shareable PnL card. Every card carries the trader's referral link, so a
// screenshot posted to X or a group chat brings the next trader in.

import { createCanvas } from "@napi-rs/canvas";

export interface CardInput {
  symbol: string;
  side: "long" | "short";
  entry: number;
  mark: number;
  pnl: number;
  roePct: number | null;
  leverage?: number;
  handle: string;
  refLink: string;
}

const W = 1200;
const H = 630;
// DejaVu Sans is what the Docker image ships; Arial covers Windows and macOS.
const FONT = "Arial, Helvetica, 'DejaVu Sans', sans-serif";

export function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (p >= 1) return p.toFixed(3);
  return p.toPrecision(4);
}

export function pnlCard(c: CardInput): Buffer {
  const canvas = createCanvas(W, H);
  const g = canvas.getContext("2d");
  const up = c.pnl >= 0;
  const accent = up ? "#22e39b" : "#ff5c7a";

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0f1d");
  bg.addColorStop(1, up ? "#0d2a24" : "#2a0d18");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // soft glow behind the big number
  const glow = g.createRadialGradient(360, 330, 20, 360, 330, 420);
  glow.addColorStop(0, up ? "rgba(34,227,155,0.25)" : "rgba(255,92,122,0.25)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#ffffff";
  g.font = `bold 40px ${FONT}`;
  g.fillText("PerpsPocket", 64, 90);
  g.fillStyle = "#8a93b5";
  g.font = `28px ${FONT}`;
  g.fillText("dreamDEX perps on Somnia", 64, 132);

  // market pill
  const pill = `${c.side.toUpperCase()}  ${c.symbol}${c.leverage ? `  ${c.leverage.toFixed(1)}x` : ""}`;
  g.font = `bold 34px ${FONT}`;
  const pw = g.measureText(pill).width + 48;
  g.fillStyle = accent;
  roundRect(g, 64, 180, pw, 64, 32);
  g.fill();
  g.fillStyle = "#0b0f1d";
  g.fillText(pill, 88, 224);

  g.fillStyle = accent;
  g.font = `bold 150px ${FONT}`;
  const roe = c.roePct === null ? "" : `${c.roePct >= 0 ? "+" : ""}${c.roePct.toFixed(1)}%`;
  g.fillText(roe || `${up ? "+" : "-"}$${Math.abs(c.pnl).toFixed(2)}`, 56, 420);

  g.fillStyle = "#ffffff";
  g.font = `bold 40px ${FONT}`;
  g.fillText(`${up ? "+" : "-"}$${Math.abs(c.pnl).toFixed(2)} USDso`, 64, 482);

  g.font = `30px ${FONT}`;
  g.fillStyle = "#8a93b5";
  g.fillText("Entry", 780, 250);
  g.fillText("Mark", 780, 360);
  g.fillStyle = "#ffffff";
  g.font = `bold 44px ${FONT}`;
  g.fillText(fmtPrice(c.entry), 780, 300);
  g.fillText(fmtPrice(c.mark), 780, 410);

  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(0, H - 90, W, 90);
  g.fillStyle = "#c9cfe8";
  g.font = `28px ${FONT}`;
  g.fillText(`@${c.handle}`, 64, H - 34);
  g.textAlign = "right";
  g.fillText(c.refLink, W - 64, H - 34);

  return canvas.toBuffer("image/png");
}

function roundRect(g: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
