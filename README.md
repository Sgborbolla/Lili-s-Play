# Lily's Plays

Sitio web de **Lily's Plays**, salón gamer y bistró: bienvenida, menú, pedidos, productos, categorías y ajustes.

## Estado actual

- Página de bienvenida terminada en `public/bienvenida.html`.
- Tema visual inspirado en PlayStation, con dorado PS4 como contenido principal: dos estaciones PS4.
- Precios preparados para **USD**, **CUC** o **ambos** (`currency_mode`: `USD`, `CUC`, `BOTH`).
- Cada producto guarda precio en USD (`price_cents`) y precio en CUC (`price_cuc_cents`).
- Backend Express con SQLite para menú, pedidos, productos, categorías, usuarios administradores y ajustes.
- Página pública anónima: los clientes no crean cuentas ni inician sesión.
- Menú con vista expandida del producto: imagen, precio, descripción, etiquetas y cantidad, con animación de ida y vuelta a la tarjeta.
- Horario visible en la bienvenida y horario de cocina editables desde **Ajustes**.
- Banner de redes con enlaces configurables desde **Ajustes**, incluido el sitio web.
- Panel de administración completo con una cuenta principal y opción de crear otras.

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
