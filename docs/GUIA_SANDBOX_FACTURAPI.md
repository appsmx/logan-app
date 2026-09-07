# Guía — Sandbox de Facturapi (modo de prueba, sin trámites fiscales)

**Propósito:** Empezar a experimentar con el módulo de facturación CFDI de LOGAN (ver `DEC-LOGAN-020`) **sin necesidad de estar dado de alta en el SAT ni contratar nada**. El sandbox de Facturapi permite crear "facturas" de prueba que NO tienen validez fiscal y no tocan al SAT.

> **Regla de oro del sandbox:** todo lo que hagas aquí es de mentira. Las facturas llevan `livemode: false`, usan RFCs y certificados de prueba, y no se reportan al SAT. Es tu campo de juego para aprender e integrar.

---

## Antes de empezar — lo que NO necesitas

- ❌ No necesitas tu RFC ni estar dado de alta en el SAT.
- ❌ No necesitas Certificado de Sello Digital (CSD) real.
- ❌ No necesitas pagar ni poner tarjeta para el modo de prueba.
- ❌ No necesitas contador.

Lo único que necesitas: un **correo** (usa `hola@loganos.com` o tu Gmail) para crear la cuenta.

---

## Paso 1 — Crear cuenta en Facturapi

1. Entra a **https://www.facturapi.io** y crea una cuenta (Sign up).
2. Verifica tu correo si te lo pide.
3. Al entrar al dashboard, estarás por defecto en un entorno con **dos modos**: **Test (prueba)** y **Live (producción)**. Nos quedamos en **Test**.

---

## Paso 2 — Obtener tu API key de PRUEBA (Test Secret Key)

1. En el dashboard de Facturapi, busca la sección de **API Keys** (o "Llaves").
2. Copia la **Test Secret Key** (la de PRUEBA). Suele empezar con un prefijo que indica que es de test.
   - ⚠️ **NO uses la "Live Secret Key"** todavía — esa es la de producción y requiere suscripción + CSD real.
3. Guarda esa key de forma segura (la usarás como variable de entorno, nunca la pongas en el código directo).

> **Buena práctica (y como lo hará LOGAN):** guarda la key en una variable de entorno, p.ej. `FACTURAPI_TEST_KEY`, del lado del servidor. Nunca en el frontend ni en el repo.

---

## Paso 3 — Tu primera factura de prueba (sin escribir una app aún)

Puedes probar la API directo desde la terminal con `curl`, antes de integrarla en LOGAN.

### 3.1 Crear un cliente de prueba
```bash
curl https://www.facturapi.io/v2/customers \
  -u "TU_TEST_SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "legal_name": "Cliente Demo SA de CV",
    "tax_id": "ABC101010111",
    "tax_system": "601",
    "address": { "zip": "85900" }
  }'
```
- `tax_id` (`ABC101010111`) es un **RFC de prueba** genérico, válido solo en sandbox.
- `tax_system` `601` = un régimen fiscal de ejemplo (persona moral general).
- Guarda el `id` que te devuelve (lo usarás abajo).

### 3.2 Crear la factura (CFDI) de prueba
```bash
curl https://www.facturapi.io/v2/invoices \
  -u "TU_TEST_SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "ID_DEL_CLIENTE_DEL_PASO_ANTERIOR",
    "items": [{
      "quantity": 1,
      "product": {
        "description": "Servicio de prueba LOGAN",
        "product_key": "01010101",
        "price": 345.60
      }
    }],
    "use": "G03",
    "payment_form": "28",
    "payment_method": "PUE"
  }'
```

Si todo sale bien, la respuesta tendrá:
- `"livemode": false` → confirma que es de prueba.
- `"status": "valid"` → la factura de prueba se "timbró" correctamente.
- Un `uuid`, folio, y hasta un `verification_url`.

> **Catálogos del SAT que aparecen arriba (para tu aprendizaje):**
> - `product_key` (`01010101`) → clave de producto/servicio del catálogo SAT.
> - `use` (`G03`) → uso del CFDI ("gastos en general").
> - `payment_form` (`28`) → forma de pago ("tarjeta de débito").
> - `payment_method` (`PUE`) → método ("pago en una sola exhibición").
>
> El PAC valida estos catálogos por ti; si mandas uno inválido, te avisa con un error claro. Eso es justo lo que te ahorra el PAC: no tienes que memorizar los 50,000+ códigos del SAT.

---

## Paso 4 — Descargar el PDF / XML de prueba

Con el `id` de la factura devuelta:
```bash
# PDF
curl https://www.facturapi.io/v2/invoices/ID_FACTURA/pdf \
  -u "TU_TEST_SECRET_KEY:" -o factura-prueba.pdf

# XML
curl https://www.facturapi.io/v2/invoices/ID_FACTURA/xml \
  -u "TU_TEST_SECRET_KEY:" -o factura-prueba.xml
```
Abre el PDF: verás una factura con aspecto real, pero marcada como prueba.

---

## Paso 5 — Cuando quieras integrarlo en LOGAN (después)

El patrón para el módulo en `logan-app` sería:
1. Guardar `FACTURAPI_TEST_KEY` (y luego `FACTURAPI_LIVE_KEY`) como variables de entorno.
2. Crear un cliente HTTP en `src/lib/` (similar al patrón de `github-client.ts` que ya existe).
3. Exponer endpoints tipo `/api/facturacion/*` que reciban los datos de la venta y llamen a Facturapi.
4. **Multi-tenant desde el día uno:** cada cliente de LOGAN aporta su propio RFC/CSD; el código es el mismo (ver `DEC-LOGAN-020`).

---

## Diferencia Test vs. Live (importante para el futuro)

| | **Test (sandbox)** | **Live (producción)** |
|---|---|---|
| Validez fiscal | ❌ Ninguna (`livemode: false`) | ✅ Real ante el SAT |
| Requiere suscripción de pago | ❌ No | ✅ Sí |
| Requiere CSD real del cliente | ❌ No (usa certificados de prueba) | ✅ Sí (el cliente sube su CSD del SAT) |
| ¿Necesitas estar dado de alta en SAT? | ❌ No | El **cliente** sí (con su RFC/régimen) |
| Para qué sirve | Aprender, desarrollar, probar | Facturar de verdad |

**Puedes vivir en Test todo el tiempo que quieras** mientras desarrollas. Solo pasas a Live cuando tengas un cliente real listo para facturar.

---

## Frontera importante (recordatorio de DEC-LOGAN-020)

- LOGAN provee la **tecnología** (integrar el PAC). ✅
- LOGAN **NO da asesoría fiscal** (régimen, deducciones, obligaciones). Eso lo ve el **contador del cliente**. ❌
- Cuando TÚ vayas a cobrar formalmente por el servicio LOGAN, ahí sí conviene formalizar tu negocio ante el SAT — pero eso es por tu actividad económica, no por el módulo.

---

## Fuentes
- [Facturapi — Documentación / Inicio rápido](https://docs.facturapi.io/docs/quickstart/)
- [Facturapi — Referencia de API](https://docs.facturapi.io/api/)
- [Facturapi — Obtener Live Secret Key (para cuando pases a producción)](https://help.facturapi.io/es/articles/9231013-obtener-live-secret-key-para-conectar-facturapi-a-otro-sistema)

*Contenido reformulado y resumido para cumplimiento de licencias. Verifica siempre los pasos exactos en la documentación oficial, que puede cambiar.*
