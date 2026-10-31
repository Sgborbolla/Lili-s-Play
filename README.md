# Lily's Plays

Sistema de **menú digital y administración** para Lily's Plays, salón gamer y bistró.

El panel lo usa el administrador desde una PC. Los clientes abren el menú desde celular, tablet o PC, sin crear cuenta.

## Estado actual

- Menú público responsive con productos, categorías, ficha ampliada, carrito y pedidos.
- Panel de administración con pedidos, productos, categorías, usuarios, QR y ajustes.
- Contenido editable desde **Admin → Ajustes → Menú**: banner, textos, carrito y reservas.
- Pagos aprobados y reembolsos desde **Admin → Pedidos**, con método y fecha.
- Excel acumulativo de reportes con diario, semanal, mensual, anual, productos, categorías, pagos, estados y gráficos.
- Los reembolsos se muestran en rojo y con importe negativo en el Excel y en el panel.
- Respaldos de la base de datos antes de borrar pedidos, productos, categorías o usuarios.
- Moneda por pedido: cada pedido guarda código, símbolo y locale.
- El proyecto público se limita al menú, pedidos y panel de administración. Las páginas antiguas de bienvenida y Acerca quedaron guardadas en `futuro-web/` para usarlas después.

## Requisitos

- **Node.js 22.5 o superior**.
- **Python 3** con `xlsxwriter` para generar el Excel de reportes.
- Windows 10/11 es el entorno previsto para el panel. También funciona en Termux/Linux.

## Instalación en Windows

1. Instala Node.js 22.5 o superior.
2. Instala Python 3 y ejecuta:

```bat
pip install xlsxwriter
```

3. Abre la carpeta del proyecto y ejecuta `iniciar.bat`, o desde la terminal:

```bat
npm install
npm start
```

Abre:

- Menú: `http://localhost:3000/`
- Administración: `http://localhost:3001/admin` (solo desde la PC del servidor)
- Reportes: `http://localhost:3001/admin/reportes`

Para que los clientes entren desde celular o tablet, usa la IP local de la PC:

```text
http://IP-DE-LA-PC:3000/
```

El menú público y el panel usan puertos distintos: el 3000 se comparte por la
Wi-Fi para los clientes y el 3001 solo escucha en `127.0.0.1`, así que el panel
no se puede abrir desde otros equipos de la red.

El QR se genera desde **Admin → QR**. Revisa `GUIA-RED-LOCAL.txt` para la red y el firewall.

## Reportes

El Excel se guarda en:

```text
Reportes/pedidos-maestro.xlsx
```

Se actualiza automáticamente al aprobar un pago, registrar un reembolso, crear un pedido o al iniciar el servidor. También se puede generar desde **Admin → Reportes** o con:

```bat
npm run reports
```

o doble clic en `generar-reportes.bat`.

El libro es **acumulativo** e incluye:

- Resumen por moneda.
- Diario, semanal, mensual y anual.
- Pedidos y detalle de productos.
- Productos, categorías y productos por período.
- Pagos, reembolsos, anulaciones y métodos de pago.
- Gráficos y filtros.
- Reembolsos en rojo.

La base de datos y los respaldos están en `data/` y `data/backups/`; no se suben al repositorio.

## Pruebas

```bash
npm test
```

Comprueba la estructura de reportes, la vista de admin y los módulos principales.

## Estructura

```text
lib/            Base de datos, formato, respaldos y reportes
public/         Menú, pedidos, estilos, imágenes y fuentes
views/          Plantillas EJS del menú y del panel
futuro-web/     Páginas antiguas archivadas para la web futura
scripts/        Generador de Excel, CLI y prueba de humo
server.js       Servidor Express
data/           Base de datos y respaldos locales (no se sube)
Reportes/       Excel y JSON generados (no se sube)
```

## Carpeta portable

Todo se guarda dentro de la carpeta del proyecto:

- `data/lilys-plays.db`: base de datos, usuarios y ajustes.
- `data/backups/`: respaldos automáticos de la base de datos.
- `data/secret.key`: clave local de las sesiones del panel.
- `public/uploads/`: imágenes subidas desde el panel.
- `Reportes/`: Excel, JSON y respaldos de reportes.

Para mover la instalación a otra PC, cierra el servidor y copia la carpeta
completa. No muevas solo el ejecutable ni dejes `data/` o `Reportes/` en otra
ruta: el programa no usa `AppData` ni rutas absolutas para guardar datos.

Cuando se genere el `.exe`, hay que fijar la raíz de datos a la carpeta del
ejecutable para que `data/`, `Reportes/` y `public/uploads/` queden junto a él
y se muevan con la carpeta. Los archivos de programa pueden ir embebidos. Para
que los reportes funcionen en otra PC sin instalar Python, el empaquetado debe
incluir Python embebido o un `scripts/build_reports.exe`.

## Créditos

Fotos de referencia de Unsplash y material proporcionado por el cliente. Revisa `CREDITS.md`.

Creado y diseñado por QBASwing Designer y Freeman y Diseños © 2026.
