/** Contador persistente del N° de orden (localStorage). */
const STORAGE_KEY = "ordenCompra.nextSeq";
const PREFIX = "0001-";
/** Primera orden: 0001-000019032 */
export const INITIAL_SEQ = 19032;

export function formatOrden(seq) {
  return `${PREFIX}${String(seq).padStart(9, "0")}`;
}

export function peekNextSeq() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null || raw === "") return INITIAL_SEQ;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= INITIAL_SEQ ? n : INITIAL_SEQ;
}

export function peekNextOrden() {
  return formatOrden(peekNextSeq());
}

/** Reserva el número actual e incrementa el contador para la próxima orden. */
export function consumeOrden() {
  const seq = peekNextSeq();
  localStorage.setItem(STORAGE_KEY, String(seq + 1));
  return formatOrden(seq);
}
