# Detalle de la Prebill

Una Prebill (`?prebill_id=`): totales, líneas (agregar lo liberado del cliente y quitar), descuento y
ajuste (en Borrador), idioma y tipo de cambio, responsables, vista previa de la factura con sus
avisos y bloqueos, movimientos, y avanzar el estado (Enviar a revisión → Autorizar). Eliminar solo en
Borrador. Mismo stack y diseño que las capturas, tema **Coral** (proyecto Prebills).

**Fase 1: no escribe en Books.** No hay "Facturar" ni "Deshacer factura", y una Prebill facturada
solo se consulta (cambiarla también cambiaría la factura en Books). La función lo hace cumplir.

## Backend (función `prebill_services`)

`GET prebills/:id` y `/disponible`, `/vista-factura`, `/movimientos`, `/edicion`;
`PATCH /lineas`, `/descuento-ajuste`, `/idioma`, `/tipo-cambio`; `POST /estado`; `DELETE`.
`?origin=` es a dónde regresa (si no, la lista `universal-aptus-prebills`).

`src/lib/prebills.ts` es igual en las dos Slates (copia de `06-prebills/shared/prebills.ts`).

## Comandos

```bash
npm install
npm run dev
npm test
npm run build   # salida: dist
```
