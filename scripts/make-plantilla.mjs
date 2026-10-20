/**
 * Genera plantilla.png con coordenadas de campos conocidas (A4-ish 1024x1536).
 */
import { createCanvas } from "canvas";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 1024;
const H = 1536;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// Fondo papel
ctx.fillStyle = "#f7f4ef";
ctx.fillRect(0, 0, W, H);
// Textura sutil
for (let i = 0; i < 4000; i++) {
  const x = Math.random() * W;
  const y = Math.random() * H;
  ctx.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.02})`;
  ctx.fillRect(x, y, 1, 1);
}

// Barra superior
ctx.fillStyle = "#1a6b6b";
ctx.fillRect(0, 0, W, 18);

// Título
ctx.fillStyle = "#2c2c2c";
ctx.font = "bold 42px 'Times New Roman', Georgia, serif";
ctx.textAlign = "center";
ctx.fillText("CERTIFICADO DE DATOS", W / 2, 160);

// Línea bajo título
ctx.strokeStyle = "#3a3a3a";
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(120, 190);
ctx.lineTo(W - 120, 190);
ctx.stroke();

const fields = [
  { id: "nombre", label: "Nombre completo:", y: 320 },
  { id: "documento", label: "Documento / DNI:", y: 410 },
  { id: "fecha", label: "Fecha:", y: 500 },
  { id: "domicilio", label: "Domicilio:", y: 590 },
  { id: "localidad", label: "Localidad:", y: 680 },
];

const left = 120;
const right = W - 120;
const labelGap = 12;

ctx.textAlign = "left";
ctx.font = "28px 'Times New Roman', Georgia, serif";
ctx.fillStyle = "#4a4a4a";

const meta = {};

for (const f of fields) {
  const label = f.label;
  ctx.fillText(label, left, f.y);
  const labelW = ctx.measureText(label).width;
  const textX = left + labelW + labelGap;
  const lineY = f.y + 8;
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(textX, lineY);
  ctx.lineTo(right, lineY);
  ctx.stroke();
  meta[f.id] = {
    x: textX,
    y: f.y,
    maxWidth: right - textX,
    fontSize: 26,
  };
}

// Observaciones
const obsY = 800;
ctx.fillStyle = "#4a4a4a";
ctx.font = "28px 'Times New Roman', Georgia, serif";
ctx.fillText("Observaciones:", left, obsY);
const obsLineStart = obsY + 40;
meta.observaciones = {
  x: left,
  y: obsLineStart,
  maxWidth: right - left,
  fontSize: 24,
  lineHeight: 48,
  lines: 3,
};
for (let i = 0; i < 3; i++) {
  const ly = obsLineStart + 8 + i * 48;
  ctx.strokeStyle = "#555";
  ctx.beginPath();
  ctx.moveTo(left, ly);
  ctx.lineTo(right, ly);
  ctx.stroke();
}

// Firma / Fecha pie
const footY = 1280;
const colW = (right - left - 80) / 2;
ctx.beginPath();
ctx.moveTo(left, footY);
ctx.lineTo(left + colW, footY);
ctx.moveTo(right - colW, footY);
ctx.lineTo(right, footY);
ctx.stroke();

ctx.textAlign = "center";
ctx.font = "24px 'Times New Roman', Georgia, serif";
ctx.fillStyle = "#4a4a4a";
ctx.fillText("Firma", left + colW / 2, footY + 36);
ctx.fillText("Fecha", right - colW / 2, footY + 36);

meta.firma = {
  x: left,
  y: footY - 8,
  maxWidth: colW,
  fontSize: 22,
  align: "center",
};
meta.fechaFirma = {
  x: right - colW,
  y: footY - 8,
  maxWidth: colW,
  fontSize: 22,
  align: "center",
};

const outPng = join(__dirname, "../public/plantilla.png");
const outMeta = join(__dirname, "../src/fieldLayout.json");
writeFileSync(outPng, canvas.toBuffer("image/png"));
writeFileSync(
  outMeta,
  JSON.stringify({ width: W, height: H, fields: meta }, null, 2)
);
console.log("Wrote", outPng);
console.log("Wrote", outMeta);
