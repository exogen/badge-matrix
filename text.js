import path from "path";
import Canvas from "canvas";

// Reference: https://github.com/badges/shields
const element = new Canvas(0, 0);
const ctx = element.getContext("2d");
const CanvasFont = Canvas.Font;
try {
  const font = new CanvasFont("Verdana", path.join(__dirname, "Verdana.ttf"));
  ctx.addFont(font);
} catch(err) {
  // Do nothing.
}
ctx.font = `11px Verdana, "DejaVu Sans"`;

export default function measureTextWidth(text) {
  return ctx.measureText(text).width | 0;
}
