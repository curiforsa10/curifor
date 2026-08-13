# web — Curifor Plataforma (Next.js)

Reescritura de la app de Streamlit para desplegar en Vercel. Convive con
`app.py`: se migra **módulo por módulo**, y hasta que un módulo esté acá, lo
sigue sirviendo Streamlit. Ninguno de los dos rompe al otro — comparten los
mismos datos en Supabase.

## Por qué

Streamlit re-ejecuta las 21.166 líneas de `app.py` en cada interacción, con
~15 MB de JSON en memoria. De ahí vienen el `debounce` de 5 minutos del
heartbeat, los `@st.cache_data(ttl=60)` y la lentitud anotada en los comentarios
del propio código. El 26% de `app.py` ya era HTML/JS escrito a mano para
esquivar las limitaciones de los widgets — el Planificador entero.

## Estado

| Módulo | Estado |
|---|---|
| Login | ✅ |
| Planificador | en curso |
| Pre-picking, Control, Cotizador, Cuenta Ficha, Campañas, Loaners, Indicadores | pendientes |

## Cómo correr

```bash
npm install
npm run dev
```

Necesita `web/.env.local` (no se versiona):

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...          # servidor; saltea RLS
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # navegador; pública por diseño
SESSION_SECRET=...                # firma la cookie de sesión
```

> **`node_modules` va fuera de OneDrive.** La carpeta del repo está sincronizada,
> y OneDrive bloquea archivos mientras indexa: `npm install` falla con
> `ENOTEMPTY`. Acá `web/node_modules` es un *junction* a `C:\dev\curifor-web-nm`.
> Si hay que recrearlo:
> ```
> mklink /J "...\web\node_modules" "C:\dev\curifor-web-nm"
> ```

## Autenticación

Las cuentas siguen en `usuarios_curifor.json` (documento de Supabase), con el
mismo PBKDF2-SHA256 de 100.000 iteraciones que usa `app.py`. Se verificó que
Node y Python producen hashes idénticos, así que **las 64 cuentas entran con su
contraseña actual**: no hay que resetear nada.

Dos diferencias deliberadas con Streamlit:

- **Login en un paso.** El de Streamlit pedía primero el correo y después la
  clave, lo que revelaba qué cuentas existen.
- **Sin auto-registro.** El de Streamlit ofrecía *"Primera vez — crea tu
  contraseña"* a cualquier correo `@curifor.com` no registrado, sin verificar
  que la persona existiera. Con la app pública, eso alcanzaba para que un
  desconocido se creara una cuenta. Acá las cuentas las crea un administrador.

La sesión es una cookie httpOnly firmada con HMAC-SHA256. No hay estado en el
servidor, que es lo que permite correr en funciones serverless.

Los permisos (`puede_planificador`, `puede_prepicking`, …) se releen en cada
carga en vez de viajar en la cookie: si a alguien le quitan un módulo, deja de
verlo sin esperar a que expire la sesión.

## Datos

`lib/supabase.ts` habla con la tabla `documentos` por PostgREST.

- El **servidor** usa `SUPABASE_SERVICE_KEY`, que saltea RLS. Nunca importar
  `lib/supabase.ts` desde un componente cliente.
- El **navegador** usa la clave anon + un vale, solo para el tablero del
  Planificador (funciones `tablero_*`). Ver `plataforma/herramientas/setup_supabase_tablero.sql`.

Al guardar se manda `Prefer: return=minimal`. Sin eso, PostgREST devuelve la fila
recién escrita y serializar de vuelta un documento grande (`stock_repuestos` son
~9,4 MB) supera el `statement_timeout` de Postgres: el guardado falla con 57014.

El **sello** de `tablero_guardar` se compara **como texto** contra un formato que
termina en `+00`, y PostgREST entrega `+00:00`. Por eso existe `aSello()`; sin esa
conversión ningún guardado calza a la primera.

## Diseño

Herramienta de trabajo interna, uso diario y prolongado, tablas densas. Estilo
**Data-Dense + Minimalismo**.

- **Color**: azul Curifor para el chrome, grises neutros para el texto. Ámbar
  reservado para lo que exige atención — de adorno, deja de avisar.
- **Tipografía**: Fira Sans en la interfaz, Fira Code para datos tabulares
  (folios, patentes, montos): el ancho fijo alinea las columnas.
- **Base 14px** en vez de 16: en tablas densas 16 desperdicia ancho de columna.
  No se baja de 14 para no castigar la lectura sostenida.
- Contraste verificado en `app/globals.css`; foco siempre visible (se navega
  mucho con Tab); `prefers-reduced-motion` respetado.

## Deploy en Vercel

Root directory: `web/`. Las variables de `.env.local` van en
*Settings → Environment Variables*.

Cuidado con el tope de **4,5 MB por respuesta** de las funciones serverless:
`stock_repuestos` (9,4 MB) y `datos_dashboard` (4,3 MB) **no** pueden pasar por
una función. Esos datos los pide el navegador directo a Supabase, o se consultan
filtrados.
