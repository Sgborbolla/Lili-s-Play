# Lili's Play

Sitio web de **Lili's Play**, salón gamer y bistró: bienvenida, menú, pedidos, productos, categorías y ajustes.

## Estado actual

- Página de bienvenida terminada en `public/bienvenida.html`.
- Tema visual inspirado en PlayStation, con dorado PS4 como contenido principal: dos estaciones PS4.
- Precios preparados para **USD**, **CUC** o **ambos** (`currency_mode`: `USD`, `CUC`, `BOTH`).
- Cada producto guarda precio en USD (`price_cents`) y precio en CUC (`price_cuc_cents`).
- Backend Express con SQLite para menú, pedidos, productos, categorías, usuarios y ajustes.
- La interfaz EJS de administración está en desarrollo; las rutas del servidor ya están implementadas.

## Requisitos

- Node.js 22.5 o superior.
- Termux, Linux o cualquier entorno con soporte para `node:sqlite`.

## Instalación

```bash
npm install
npm start
```

Abre:

- Bienvenida: `http://127.0.0.1:3000/bienvenida.html`
- Menú: `http://127.0.0.1:3000/`
- Administración: `http://127.0.0.1:3000/admin`

La base de datos y los archivos privados se crean en `data/` y no se suben al repositorio.

## Monedas

En ajustes se puede seleccionar:

- `USD`: solo dólares.
- `CUC`: solo pesos convertibles.
- `BOTH`: muestra ambos precios por producto.

Los precios en CUC se guardan por separado. Si un producto no tiene precio en CUC, se usa el precio en USD como valor inicial.

## Estructura

```text
lib/            Base de datos, formato y autenticación
public/         Bienvenida, estilos, imágenes y fuentes
views/          Plantillas EJS
server.js       Servidor Express
data/           Base de datos local (no se sube)
```

## Créditos

Fotos de referencia de Unsplash y material proporcionado por el cliente. Revisa `CREDITS.md`.

Creado y diseñado por QBASwing Designer y Freeman y Diseños © 2026.
