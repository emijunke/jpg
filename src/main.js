import "./style.css";
import {
  FIELD_DEFS,
  EDITABLE_FIELDS,
  emptyValues,
  todayIso,
  formatDateDisplay,
  createRenglon,
  renumberRenglones,
  validateRenglones,
  MAX_CANTIDAD,
} from "./fields.js";
import { peekNextOrden, consumeOrden } from "./orden.js";
import { downloadPdf } from "./pdf.js";
import layout from "./fieldLayout.json";

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function saveToHistorial(blob, values) {
  const pdfBase64 = await blobToBase64(blob);
  const res = await fetch("/api/historial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64,
      numeroOrden: values.numeroOrden,
      razonSocial: values.razonSocial,
    }),
  });
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo guardar en el historial");
  }
}

function formatAutoInput(field, value) {
  if (field.automatic && field.type === "date") return formatDateDisplay(value);
  return value ?? "";
}

const maxRows = layout.renglones?.maxRows ?? 25;

const state = {
  ...emptyValues(),
  renglones: [createRenglon(0)],
};

function syncAutomaticFields() {
  state.numeroOrden = peekNextOrden();
  state.fecha = todayIso();
}

syncAutomaticFields();

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <a class="topbar-link" href="/historial">Historial de PDFs</a>
      <button type="button" class="topbar-link topbar-btn" id="btn-logout-top">
        Cerrar sesión
      </button>
    </div>
    <form id="data-form" class="form" novalidate>
      <section class="section" aria-labelledby="cabecera-title">
        <h2 class="section-title" id="cabecera-title">Datos de la orden</h2>
        <div class="form-fields" id="form-fields"></div>
      </section>

      <section class="section renglones" aria-labelledby="renglones-title">
        <div class="renglones-head">
          <h2 class="section-title" id="renglones-title">Renglones</h2>
          <p class="renglones-hint">Código automático · hasta ${maxRows}</p>
        </div>
        <div id="renglones-list" class="renglones-list"></div>
        <div class="renglones-actions">
          <button type="button" class="btn-secondary" id="btn-add-row">
            + Agregar renglón
          </button>
        </div>
      </section>

      <p class="form-error" id="form-error" hidden></p>
      <div class="actions">
        <button type="submit" class="btn-primary" id="btn-pdf">
          Generar PDF
        </button>
      </div>
    </form>
  </div>
`;

const formFields = document.querySelector("#form-fields");
const renglonesList = document.querySelector("#renglones-list");
const form = document.querySelector("#data-form");
const formError = document.querySelector("#form-error");
const btnPdf = document.querySelector("#btn-pdf");
const btnAddRow = document.querySelector("#btn-add-row");
const btnLogout = document.querySelector("#btn-logout-top");

async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  location.href = "/login";
}

btnLogout?.addEventListener("click", logout);

for (const field of FIELD_DEFS) {
  const wrap = document.createElement("label");
  wrap.className = field.automatic ? "field field-auto" : "field";
  wrap.htmlFor = field.id;

  const title = document.createElement("span");
  title.className = "field-label";
  title.textContent = field.automatic
    ? `${field.label} (automático)`
    : field.label;

  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = field.rows ?? 3;
  } else {
    input = document.createElement("input");
    input.type = field.automatic && field.type === "date" ? "text" : field.type;
  }

  input.id = field.id;
  input.name = field.id;
  input.required = Boolean(field.required) && !field.automatic;
  input.readOnly = Boolean(field.automatic);
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.autocomplete) input.autocomplete = field.autocomplete;
  input.value = formatAutoInput(field, state[field.id]);

  if (!field.automatic) {
    input.addEventListener("input", () => {
      state[field.id] = input.value;
    });
  }

  wrap.append(title, input);
  formFields.append(wrap);
}

function renderRenglones() {
  renglonesList.innerHTML = "";
  state.renglones.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "renglon";
    item.dataset.index = String(index);

    item.innerHTML = `
      <div class="renglon-codigo field field-auto">
        <span class="field-label">Código</span>
        <input type="text" value="${row.codigo}" readonly tabindex="-1" />
      </div>
      <div class="renglon-desc field">
        <span class="field-label">Descripción</span>
        <input
          type="text"
          data-key="descripcion"
          value="${escapeAttr(row.descripcion)}"
          placeholder="Descripción del ítem"
          maxlength="120"
          required
        />
      </div>
      <div class="renglon-cant field">
        <span class="field-label">Cantidad</span>
        <input
          type="number"
          data-key="cantidad"
          value="${escapeAttr(row.cantidad)}"
          min="1"
          max="${MAX_CANTIDAD}"
          step="1"
          placeholder="001"
          required
        />
      </div>
      <button type="button" class="btn-icon" data-remove title="Quitar renglón" ${
        state.renglones.length === 1 ? "disabled" : ""
      }>×</button>
    `;

    item.querySelectorAll("input[data-key]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.key;
        let value = input.value;
        if (key === "cantidad") {
          value = value.replace(/\D/g, "").slice(0, 3);
          input.value = value;
        }
        state.renglones[index][key] = value;
      });
    });

    item.querySelector("[data-remove]")?.addEventListener("click", () => {
      if (state.renglones.length <= 1) return;
      state.renglones.splice(index, 1);
      state.renglones = renumberRenglones(state.renglones);
      renderRenglones();
    });

    renglonesList.append(item);
  });

  btnAddRow.disabled = state.renglones.length >= maxRows;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

btnAddRow.addEventListener("click", () => {
  if (state.renglones.length >= maxRows) return;
  state.renglones.push(createRenglon(state.renglones.length));
  renderRenglones();
  const last = renglonesList.querySelector(
    ".renglon:last-child input[data-key='descripcion']"
  );
  last?.focus();
});

function refreshAutoInputs() {
  syncAutomaticFields();
  for (const field of FIELD_DEFS.filter((f) => f.automatic)) {
    const el = document.getElementById(field.id);
    if (el) el.value = formatAutoInput(field, state[field.id]);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const missing = EDITABLE_FIELDS.filter(
    (f) => f.required && !String(state[f.id] ?? "").trim()
  );
  if (missing.length) {
    formError.hidden = false;
    formError.textContent = `Faltan datos: ${missing.map((m) => m.label).join(", ")}.`;
    document.getElementById(missing[0].id)?.focus();
    return;
  }

  const rowError = validateRenglones(state.renglones);
  if (rowError) {
    formError.hidden = false;
    formError.textContent = rowError;
    return;
  }

  btnPdf.disabled = true;
  btnPdf.textContent = "Generando…";
  try {
    const values = {
      ...state,
      numeroOrden: consumeOrden(),
      fecha: todayIso(),
      renglones: state.renglones.map((row, i) => ({
        codigo: createRenglon(i).codigo,
        descripcion: String(row.descripcion).trim(),
        cantidad: row.cantidad,
      })),
    };
    state.numeroOrden = values.numeroOrden;
    state.fecha = values.fecha;

    const slug = (values.razonSocial || "orden")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9áéíóúñ-]/gi, "")
      .slice(0, 40);
    const nro = values.numeroOrden.replace(/[^\d-]/g, "");
    const filename = `orden-${nro}-${slug || "compra"}.pdf`;
    const blob = await downloadPdf(values, filename);
    await saveToHistorial(blob, values);

    for (const field of EDITABLE_FIELDS) {
      state[field.id] = "";
      const el = document.getElementById(field.id);
      if (el) el.value = "";
    }
    state.renglones = [createRenglon(0)];
    renderRenglones();
    refreshAutoInputs();
  } catch (err) {
    formError.hidden = false;
    formError.textContent = err.message || "No se pudo generar el PDF.";
  } finally {
    btnPdf.disabled = false;
    btnPdf.textContent = "Generar PDF";
  }
});

renderRenglones();
