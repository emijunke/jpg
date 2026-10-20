import { jsPDF } from "jspdf";
import layout from "./fieldLayout.json";
import { displayValue, formatCantidad } from "./fields.js";

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${current} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawBoxedText(ctx, text, box, y) {
  if (!text) return;
  const weight = box.fontWeight === "bold" ? "bold " : "";
  ctx.font = `${weight}${box.fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = box.align === "center" ? "center" : "left";
  const x = box.align === "center" ? box.x + box.maxWidth / 2 : box.x;
  let draw = String(text);
  while (ctx.measureText(draw).width > box.maxWidth && draw.length > 1) {
    draw = draw.slice(0, -2) + "…";
  }
  ctx.fillText(draw, x, y);
}

/**
 * Dibuja plantilla + datos en un canvas (misma escala que fieldLayout).
 */
export async function renderFilledCanvas(values, plantillaUrl = "/plantilla.png") {
  const img = await loadImage(plantillaUrl);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, layout.width, layout.height);

  ctx.fillStyle = "#111111";
  ctx.textBaseline = "alphabetic";

  for (const [id, box] of Object.entries(layout.fields)) {
    const text = displayValue(id, values[id]);
    if (!text) continue;

    const weight = box.fontWeight === "bold" ? "bold " : "";
    ctx.font = `${weight}${box.fontSize}px Arial, Helvetica, sans-serif`;

    if (box.lines) {
      const lines = wrapText(ctx, text, box.maxWidth);
      const maxLines = box.lines;
      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        ctx.textAlign = "left";
        ctx.fillText(lines[i], box.x, box.y + i * (box.lineHeight || box.fontSize + 6));
      }
      continue;
    }

    drawBoxedText(ctx, text, box, box.y);
  }

  const cfg = layout.renglones;
  const rows = Array.isArray(values.renglones) ? values.renglones : [];
  if (cfg && rows.length) {
    const cols = cfg.columns;
    const limit = Math.min(rows.length, cfg.maxRows);
    for (let i = 0; i < limit; i++) {
      const y = cfg.firstY + i * cfg.rowHeight;
      const row = rows[i];
      drawBoxedText(ctx, row.codigo, cols.codigo, y);
      drawBoxedText(ctx, row.descripcion, cols.descripcion, y);
      drawBoxedText(ctx, formatCantidad(row.cantidad) || row.cantidad, cols.cantidad, y);
    }
  }

  return canvas;
}

export async function buildPdf(values) {
  const canvas = await renderFilledCanvas(values);
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
  return pdf;
}

export async function downloadPdf(values, filename = "orden-de-compra.pdf") {
  const pdf = await buildPdf(values);
  const blob = pdf.output("blob");
  pdf.save(filename);
  return blob;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}
