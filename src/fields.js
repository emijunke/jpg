/**
 * Campos de la orden de compra.
 * - automatic: se completan solos (no se piden al usuario)
 * - required: obligatorio si es editable
 */
export const FIELD_DEFS = [
  {
    id: "numeroOrden",
    label: "N° de orden",
    type: "text",
    automatic: true,
    required: true,
  },
  {
    id: "fecha",
    label: "Fecha de creación",
    type: "date",
    automatic: true,
    required: true,
  },
  {
    id: "fechaRecepcion",
    label: "Fecha de recepción",
    type: "date",
    required: true,
  },
  {
    id: "fechaVigencia",
    label: "Fecha de vigencia",
    type: "date",
    required: true,
  },
  {
    id: "razonSocial",
    label: "Razón social",
    type: "text",
    placeholder: "Nombre del proveedor / cliente",
    required: true,
    autocomplete: "organization",
  },
];

export const EDITABLE_FIELDS = FIELD_DEFS.filter((f) => !f.automatic);

export const MAX_CANTIDAD = 999;

export function emptyValues() {
  return Object.fromEntries(FIELD_DEFS.map((f) => [f.id, ""]));
}

export function formatCodigo(index) {
  return String(index + 1).padStart(3, "0");
}

export function formatCantidad(raw) {
  const n = Number.parseInt(String(raw).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n < 1) return "";
  return String(Math.min(n, MAX_CANTIDAD)).padStart(3, "0");
}

/** Crea un renglón vacío con código según índice (0 → 001). */
export function createRenglon(index) {
  return {
    codigo: formatCodigo(index),
    descripcion: "",
    cantidad: "",
  };
}

export function renumberRenglones(rows) {
  return rows.map((row, i) => ({
    ...row,
    codigo: formatCodigo(i),
  }));
}

export function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const DATE_IDS = new Set(["fecha", "fechaRecepcion", "fechaVigencia"]);

export function displayValue(id, raw) {
  if (DATE_IDS.has(id) && raw) return formatDateDisplay(raw);
  return raw ?? "";
}

export function validateRenglones(rows) {
  if (!rows.length) return "Agregá al menos un renglón.";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const n = i + 1;
    if (!String(row.descripcion ?? "").trim()) {
      return `Renglón ${n}: falta la descripción.`;
    }
    const cant = Number.parseInt(String(row.cantidad).replace(/\D/g, ""), 10);
    if (!Number.isFinite(cant) || cant < 1 || cant > MAX_CANTIDAD) {
      return `Renglón ${n}: la cantidad debe ser un número entre 1 y ${MAX_CANTIDAD}.`;
    }
  }
  return null;
}
