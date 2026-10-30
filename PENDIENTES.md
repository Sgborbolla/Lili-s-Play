# Pendientes

## Mando DualSense

- [x] SVG/CSS del mando en vista superior, integrado en la bienvenida.
- [x] Botones, cruceta, palancas, gatillos, touchpad, PS, create/options y mute interactivos.
- [x] Inclinación 3D, luz del touchpad, rumble visual y vibración táctil.
- [x] SFX sintetizados con Web Audio para cada control, sin archivos externos.
- [x] Botón para activar/desactivar el sonido.
- [ ] Probar en un Android real: vibración, sonido y respuesta táctil.
- [ ] Probar en iPhone: el sonido debe funcionar; la vibración no está disponible en Safari.
- [ ] Revisar el encaje del mando en pantallas pequeñas y el alto total del hero.
- [ ] Decidir si se sustituyen los SFX sintetizados por grabaciones reales (requiere samples con licencia).

## Bienvenida y galería retro

- [ ] Revisar en móvil que las portadas no tapen el nombre ni los botones.
- [ ] Confirmar los juegos elegidos para cada consola.
- [ ] Verificar derechos de uso de las portadas descargadas.
- [ ] Añadir texto alternativo o descripción accesible para las portadas, que hoy son fondos CSS.
- [ ] Optimizar el peso de las imágenes si la página tarda en cargar.

## Seguridad

- [ ] Añadir rate limit a `/api/orders` y a los formularios públicos.
- [ ] Añadir cabeceras de seguridad (CSP, X-Frame-Options, Referrer-Policy, etc.).
- [ ] Revisar la contraseña admin por defecto antes de publicar en producción.
- [ ] Revisar permisos y validación de subidas de imágenes.

## Datos y pedidos

- [ ] Soportar moneda por pedido; hoy hay un backfill fijo a CUC en `lib/db.js`.
- [ ] Paginar el listado de pedidos; ahora muestra solo los últimos 100.
- [ ] Añadir respaldos automáticos de la base de datos antes de borrar registros.
- [ ] Confirmar que el borrado de pedidos no deja datos huérfanos.

## Reportes

- [ ] `lib/reports.js` no se usa actualmente.
- [ ] Falta `scripts/build_reports.py` para generar los Excel/JSON.
- [ ] Definir si los reportes se generan desde el panel o por cron.

## Pagos

- [ ] No hay rutas ni pantallas de pago.
- [ ] El dashboard suma pedidos impagos; definir estados y cobros.

## Mantenimiento

- [ ] `pureimage` aparece como dependencia sin uso claro.
- [ ] Revisar `node_modules` con paquetes extraneous.
- [ ] Configurar un comando real de pruebas (`npm test` hoy falla a propósito).
- [ ] Probar el QR en LAN/HTTPS y confirmar que abre la URL correcta.
