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

- [x] Añadir rate limit a `/api/orders` y al acceso al panel.
- [x] Añadir cabeceras de seguridad (CSP, X-Frame-Options, Referrer-Policy, etc.).
- [x] Proteger el panel en `127.0.0.1:3001` y forzar el cambio de contraseña inicial.
- [ ] Revisar permisos y validación de subidas de imágenes.

## Datos y pedidos

- [x] Soportar moneda por pedido; cada pedido guarda código, símbolo y locale.
- [x] Paginar el listado de pedidos de 50 en 50, con filtros por estado.
- [x] Añadir respaldos automáticos de la base de datos antes de borrar registros.
- [x] Limpiar detalles huérfanos al borrar pedidos y confirmar integridad.

## Reportes

- [x] `lib/reports.js` conectado al panel y a la generación automática.
- [x] `scripts/build_reports.py` genera el Excel acumulativo con gráficos.
- [x] Reportes desde Admin → Reportes, automáticos al pagar/reembolsar y por CLI.
- [x] Excel acumulativo con hojas diaria, semanal, mensual y anual.
- [x] Reembolsos en rojo y con importe negativo en el Excel y en el panel.

## Pagos

- [x] Aprobar pagos desde Admin → Pedidos con método y fecha.
- [x] Registrar reembolsos y devolver un pedido a pendiente de pago.
- [x] El dashboard suma solo pedidos pagados en “Ingresos de hoy”.
- [x] Historial de pagos, reembolsos y anulaciones en `order_payment_events`.

## Mantenimiento

- [x] Eliminar `pureimage` y revisar dependencias.
- [x] `npm test` funciona con la prueba de humo.
- [ ] Probar el QR en LAN y confirmar que abre la URL correcta.

## Distribución portable

- [ ] Generar el `.exe` dentro de la carpeta del proyecto, junto a `data/`, `Reportes/`, `public/` y `views/`.
- [ ] Incluir Python embebido o `scripts/build_reports.exe` para que el Excel funcione sin instalar Python.
- [ ] Probar mover la carpeta completa a otra PC y confirmar que se conservan base de datos, fotos y Excel.
