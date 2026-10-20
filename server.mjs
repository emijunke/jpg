import express from "express";
import session from "cookie-session";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { randomBytes, timingSafeEqual } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const distDir = join(root, "dist");
const usersFile = join(root, "users.json");
const loginPage = join(root, "server", "login.html");
const historialPage = join(root, "server", "historial.html");
/** Datos persistentes fuera del código (no se pierden al reiniciar/redeploy). */
const dataDir =
  process.env.ORDEN_DATA_DIR ||
  join(homedir(), ".local", "share", "orden-compra");
const historialDir = join(dataDir, "historial");
const historialFilesDir = join(historialDir, "files");
const manifestFile = join(historialDir, "manifest.json");
const sessionSecretFile = join(dataDir, "session.secret");
const ADMIN_USER = "admin";

const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || "0.0.0.0";

mkdirSync(historialFilesDir, { recursive: true });
if (!existsSync(manifestFile)) {
  writeFileSync(manifestFile, "[]\n", "utf8");
}

function loadSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (existsSync(sessionSecretFile)) {
    return readFileSync(sessionSecretFile, "utf8").trim();
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(sessionSecretFile, secret, "utf8");
  return secret;
}

const SESSION_SECRET = loadSessionSecret();

function loadUsers() {
  if (!existsSync(usersFile)) {
    throw new Error(`No existe ${usersFile}. Copiá users.example.json a users.json`);
  }
  const raw = readFileSync(usersFile, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("users.json debe ser un array de { username, password }");
  }
  return data
    .filter((u) => u && typeof u.username === "string" && typeof u.password === "string")
    .map((u) => ({
      username: u.username.trim(),
      password: String(u.password),
    }));
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function findUser(username, password) {
  const users = loadUsers();
  return users.find(
    (u) =>
      u.username.toLowerCase() === String(username).trim().toLowerCase() &&
      safeEqual(u.password, password)
  );
}

function isAdmin(username) {
  return String(username || "").trim().toLowerCase() === ADMIN_USER;
}

function loadManifest() {
  try {
    const data = JSON.parse(readFileSync(manifestFile, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveManifest(items) {
  writeFileSync(manifestFile, JSON.stringify(items, null, 2) + "\n", "utf8");
}

function sanitizeName(value, fallback = "orden") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9áéíóúñ_-]/gi, "")
    .slice(0, 60) || fallback;
}

function blobToBuffer(base64) {
  const cleaned = String(base64).replace(/^data:application\/pdf;base64,/, "");
  return Buffer.from(cleaned, "base64");
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));
app.use(
  session({
    name: "oc_session",
    keys: [SESSION_SECRET],
    maxAge: 12 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  })
);

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  return res.redirect("/login");
}

app.get("/login", (req, res) => {
  if (req.session?.user) return res.redirect("/");
  res.sendFile(loginPage);
});

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username ?? "");
  const password = String(req.body?.password ?? "");
  if (!username || !password) {
    return res.status(400).json({ error: "Completá usuario y contraseña." });
  }
  try {
    const user = findUser(username, password);
    if (!user) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    req.session.user = user.username;
    return res.json({ ok: true, username: user.username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error al validar usuarios." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "No autenticado" });
  res.json({
    username: req.session.user,
    canDelete: isAdmin(req.session.user),
  });
});

app.use(requireAuth);

app.get("/historial", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(historialPage);
});

app.get("/api/historial", (_req, res) => {
  // Historial global: todos los usuarios ven todos los PDFs
  res.set("Cache-Control", "no-store");
  const items = loadManifest().sort(
    (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
  );
  res.json(items);
});

app.post("/api/historial", (req, res) => {
  try {
    const pdfBase64 = req.body?.pdfBase64;
    if (!pdfBase64) {
      return res.status(400).json({ error: "Falta el PDF." });
    }

    const buffer = blobToBuffer(pdfBase64);
    if (buffer.length < 100 || buffer.subarray(0, 4).toString() !== "%PDF") {
      return res.status(400).json({ error: "El archivo no es un PDF válido." });
    }
    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: "El PDF es demasiado grande." });
    }

    const numeroOrden = sanitizeName(req.body?.numeroOrden, "sin-numero");
    const razonSocial = String(req.body?.razonSocial || "").trim().slice(0, 120);
    const slug = sanitizeName(razonSocial, "compra");
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const storedName = `${id}_orden-${numeroOrden}-${slug}.pdf`;
    const filePath = join(historialFilesDir, storedName);

    writeFileSync(filePath, buffer);

    const item = {
      id,
      filename: storedName,
      numeroOrden: String(req.body?.numeroOrden || ""),
      razonSocial,
      createdAt: new Date().toISOString(),
      createdBy: req.session.user,
      size: buffer.length,
    };

    const items = loadManifest();
    items.push(item);
    saveManifest(items);

    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo guardar el PDF." });
  }
});

app.get("/api/historial/:id/download", (req, res) => {
  const id = basename(String(req.params.id || ""));
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const items = loadManifest();
  const item = items.find((entry) => entry.id === id);
  if (!item) return res.status(404).json({ error: "PDF no encontrado" });

  const fileName = basename(item.filename);
  const filePath = join(historialFilesDir, fileName);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Archivo no encontrado" });
  }

  const downloadName = `orden-${sanitizeName(item.numeroOrden, "sin-numero")}.pdf`;
  res.sendFile(fileName, {
    root: historialFilesDir,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
    },
  }, (err) => {
    if (!err) return;
    console.error("Error al descargar PDF:", err.message, filePath);
    if (!res.headersSent) {
      res.status(404).json({ error: "Archivo no encontrado" });
    }
  });
});

app.delete("/api/historial/:id", (req, res) => {
  if (!isAdmin(req.session?.user)) {
    return res.status(403).json({ error: "Solo el usuario admin puede borrar órdenes." });
  }

  const id = basename(String(req.params.id || ""));
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const items = loadManifest();
  const index = items.findIndex((entry) => entry.id === id);
  if (index < 0) return res.status(404).json({ error: "PDF no encontrado" });

  const [item] = items.splice(index, 1);
  const filePath = join(historialFilesDir, basename(item.filename));
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (err) {
    console.error("No se pudo borrar el archivo:", err);
  }
  saveManifest(items);
  res.json({ ok: true });
});

app.use(express.static(distDir, { index: false }));

app.use((req, res) => {
  const index = join(distDir, "index.html");
  if (!existsSync(index)) {
    return res.status(500).send("Falta el build. Ejecutá: npm run build");
  }
  res.sendFile(index);
});

app.listen(PORT, HOST, () => {
  console.log(`Orden de compra en http://${HOST}:${PORT}`);
  console.log(`Usuarios: ${usersFile}`);
  console.log(`Datos: ${dataDir}`);
  console.log(`Historial: ${historialDir}`);
});
