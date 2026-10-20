# Orden de compra → PDF

App web que completa `public/plantilla.png` con los datos de la orden y descarga un PDF. Pide login, guarda cada PDF en un historial compartido y arranca sola después de instalarla.

## Instalación

Cloná el repo y ejecutá el script de tu sistema. Instala Node.js 20 si falta, las dependencias, compila la app, crea `users.json` y la deja escuchando en el puerto **8081**.

### Linux

```bash
git clone https://github.com/emijunke/jpg.git
cd jpg
bash install/install-linux.sh
```

Queda como servicio de usuario `orden-compra` (arranca al iniciar sesión, y con linger también sin sesión gráfica).

```bash
systemctl --user status orden-compra
systemctl --user restart orden-compra
journalctl --user -u orden-compra -f
```

### Windows

Abrí PowerShell en la carpeta del repo:

```powershell
git clone https://github.com/emijunke/jpg.git
cd jpg
powershell -ExecutionPolicy Bypass -File .\install\install-windows.ps1
```

Queda como tarea programada `OrdenCompra`, que arranca al iniciar sesión.

```powershell
Start-ScheduledTask -TaskName OrdenCompra
Stop-ScheduledTask -TaskName OrdenCompra
```

Abrí http://127.0.0.1:8081/

## Usuarios

El instalador copia `users.example.json` a `users.json` si todavía no existe. Ese archivo **no se sube a git**.

```json
[
  { "username": "admin", "password": "cambiar" },
  { "username": "juan", "password": "clave123" }
]
```

Solo el usuario `admin` puede borrar órdenes del historial. No hace falta reiniciar para que un cambio de `users.json` tenga efecto.

## Historial

Cada PDF generado se guarda fuera del código y se lista en `/historial` para todos los usuarios autenticados.

- Linux: `~/.local/share/orden-compra/historial/`
- Windows: `%USERPROFILE%\.local\share\orden-compra\historial\`

## Después de actualizar el código

```bash
git pull
npm ci --ignore-scripts
npm run build
```

En Linux: `systemctl --user restart orden-compra`  
En Windows: `Stop-ScheduledTask -TaskName OrdenCompra; Start-ScheduledTask -TaskName OrdenCompra`

## Campos de la orden

| Campo | Origen |
|-------|--------|
| N° de orden | Automático `0001-000019032`, +1 por cada PDF generado |
| Fecha | Fecha de creación (hoy) |
| Fecha de recepción | Ingresada por el usuario |
| Fecha de vigencia | Ingresada por el usuario |
| Razón social | Ingresada por el usuario |
| Renglones | Código automático, descripción y cantidad |

El contador del N° se guarda en `localStorage` del navegador.

Las coordenadas sobre la plantilla están en `src/fieldLayout.json`.
