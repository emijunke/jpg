#!/usr/bin/env bash
# Instala la app en Linux: Node.js 20+, dependencias, build y servicio de arranque.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== Orden de compra: instalación Linux =="
echo "Directorio: $ROOT"

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "Number(process.versions.node.split('.')[0])")"
    if [ "$major" -ge 20 ]; then
      echo "Node.js $(node -v) ya está instalado."
      return
    fi
    echo "Node.js es anterior a la versión 20. Se instala Node 20 con nvm."
  else
    echo "No hay Node.js. Se instala Node 20 con nvm (sin permisos de root)."
  fi

  if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  nvm install 20
  nvm alias default 20
}

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
fi

install_node

if ! command -v node >/dev/null 2>&1; then
  echo "No se pudo encontrar node en el PATH." >&2
  exit 1
fi

NODE_BIN="$(dirname "$(command -v node)")"
echo "Usando node: $(command -v node) ($(node -v))"

echo "Instalando dependencias..."
npm ci --ignore-scripts

echo "Compilando la aplicación..."
npm run build

if [ ! -f "$ROOT/users.json" ]; then
  cp "$ROOT/users.example.json" "$ROOT/users.json"
  echo "Se creó users.json a partir de users.example.json."
  echo "Cambiá las contraseñas antes de exponer el puerto."
fi

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
UNIT_FILE="$UNIT_DIR/orden-compra.service"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Orden de compra (plantilla PDF)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
Environment=HOME=$HOME
ExecStart=$NODE_BIN/node $ROOT/server.mjs
Restart=always
RestartSec=5
KillMode=control-group

[Install]
WantedBy=default.target
EOF

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd no está disponible. La app quedó compilada."
  echo "Para iniciarla a mano: cd \"$ROOT\" && npm start"
  exit 0
fi

systemctl --user daemon-reload
systemctl --user enable --now orden-compra.service
loginctl enable-linger "$USER" 2>/dev/null || true

echo
echo "Instalación lista."
echo "  Local:  http://127.0.0.1:8081/"
echo "  Usuarios: $ROOT/users.json"
echo "  Historial: $HOME/.local/share/orden-compra/historial/"
echo
echo "Comandos:"
echo "  systemctl --user status orden-compra"
echo "  systemctl --user restart orden-compra"
echo "  journalctl --user -u orden-compra -f"
echo
echo "Si el puerto 8081 debe verse desde otra máquina, abrilo en el firewall."
