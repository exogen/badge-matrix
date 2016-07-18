import path from "path";
import Canvas, { Font } from "canvas";

// Reference: https://github.com/badges/shields
const element = new Canvas(0, 0);
const ctx = element.getContext("2d");
try {
  const fontFile = path.join(__dirname, "..", "Verdana.ttf");
  const font = new Font("Verdana", fontFile);
  ctx.addFont(font);
} catch(err) {
  console.warn(`Failed to add font: ${err}`);
}
ctx.font = "11px Verdana, \"DejaVu Sans\"";

export default function measureTextWidth(text) {
  return ctx.measureText(text).width | 0;
}
