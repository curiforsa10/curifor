# curifor-ots

Dashboard de OTs pendientes de **Curifor S.A** — app Streamlit (`app.py`) más la
plataforma web del cotizador/agenda/taller (`plataforma/`).

> **Repositorio privado.** Los `.json` versionados aquí son datos operativos
> reales (usuarios con hash de contraseña, clientes, OTs, stock, producción por
> técnico). No pasar este repo a público.

## Contenido

| Ruta | Qué es |
|---|---|
| `app.py` | App Streamlit principal (~20.800 líneas): dashboard de OTs, planificador, prepicking, cotizador, campañas, cuenta ficha, loaners, indicadores. |
| `consolidar_OTs.py` | Consolidador diario: cruza la sábana del PBI con los archivos de sucursal por FOLIO OT y publica los JSON. Se corre en el PC de la sucursal. |
| `supabase_sync.py` | Capa de dual-write a Supabase (tabla `documentos`, JSONB). Fail-safe: sin credenciales es un no-op. |
| `plataforma/` | Sitio estático del cotizador de mantenciones, portal cliente y bandeja de taller. Habla con Supabase directo desde el navegador. |
| `*.json` | Estado de la aplicación (ver "Datos" más abajo). |

## Correr en local

```bash
pip install -r requirements.txt
```

Copiar `.streamlit/secrets.toml.example` a `.streamlit/secrets.toml` y completar
los valores (ese archivo está en `.gitignore` y nunca se commitea).

```bash
streamlit run app.py
```

La plataforma web se sirve aparte, porque el navegador bloquea los JSON con
`file://`:

```bash
python -m http.server 8010 --directory plataforma
```

## Desplegar en Streamlit Community Cloud

1. En [share.streamlit.io](https://share.streamlit.io) → **Create app** → *Deploy
   a public app from GitHub*, autorizando el acceso al repo privado.
2. Repo `curiforsa10/curifor`, branch `main`, main file `app.py`.
3. En **Advanced settings → Secrets**, pegar el contenido de
   `.streamlit/secrets.toml.example` ya con los valores reales.
4. Python 3.11 (coincide con el devcontainer).

`requirements.txt` fija `starlette<1.4.0` a propósito: la 1.4.0 rompe el arranque
de Streamlit (`GZipResponder.__init__() missing 'thread_minimum_size'`). No
subir ese tope sin probar el arranque primero.

## Datos

Hoy la persistencia va contra la **Contents API de GitHub**: `app.py` lee y
escribe los `.json` **de este repo** usando `GITHUB_TOKEN` (ver
`_leer_json_github_raw` y `_guardar_json_github_raw`). Deliberadamente **no** se
usa `raw.githubusercontent.com` — obligaba a tener el repo público. Ver la nota
de seguridad en `app.py`.

> **Esta plataforma es independiente del despliegue de producción**
> (`Cjerez-curi/curifor-ots`). El repo de datos está parametrizado
> (`GITHUB_USUARIO` / `GITHUB_REPO` en secrets, con default a este repo)
> justamente para eso: dos instancias escribiendo los mismos JSON se pisan entre
> sí. Al levantar esta app, sus datos parten del snapshot commiteado acá y
> evolucionan por su cuenta.

Archivos principales: `datos_dashboard.json` (OTs), `usuarios_curifor.json`
(cuentas y permisos), `control_taller*.json` (por sucursal), `stock_repuestos.json`,
`cotizador_data.json` (bundle del cotizador), `produccion_tecnicos.json`,
`agenda_hoy.json`, `audit_log.json`.

## Migración a Supabase (en curso)

El backend se está moviendo a Supabase (proyecto `ordgsglujssgzmnlmcus`). La
tabla `documentos` (JSONB, una fila por archivo) reemplaza a los `.json` del repo.

**Ya está en el código:**

- `app.py` tiene la capa Supabase (`_sb_leer` / `_sb_guardar`, por API REST) con
  una lista blanca `SUPABASE_DOCS` y **fallback a GitHub en ambos sentidos**.
  Sin los secrets cargados la capa queda inerte y todo funciona como hoy, así que
  publicar este código no cambia nada por sí solo.
- `consolidar_OTs.py` hace dual-write a `documentos` vía `supabase_sync.py`
  (conexión Postgres, fail-safe: sin password es un no-op).
- `plataforma/` ya opera nativo contra Supabase (`reservas_web`, auth por dominio
  `@curifor.com`, RLS).

**Para encenderla** (grupo A: `usuarios_curifor`, `notificaciones`, `audit_log`,
`cuenta_ficha_revisados`):

1. Crear la tabla — SQL Editor de Supabase →
   `plataforma/herramientas/setup_supabase_documentos.sql`.
2. Cargar los datos:
   ```bash
   python plataforma/herramientas/migrar_documentos_supabase.py --dry-run
   ```
   y luego sin `--dry-run`. Lee la versión **viva** desde GitHub (la copia local
   está atrasada: la app auto-commitea todo el día).
3. Cargar `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en los secrets del deploy.

Mientras un documento no esté en la tabla, `app.py` lo sigue leyendo de GitHub.
La migración se enciende archivo por archivo y es reversible: basta con sacar el
secret.

Los que **no** están en la lista blanca los genera `consolidar_OTs.py`
(`datos_dashboard`, `control_taller*`, `stock_repuestos`, `cotizador_data`…);
migrarlos antes de mover el consolidador dejaría a la app leyendo datos que nadie
actualiza.

Sobre las claves: la `anonKey` de `plataforma/js/agenda-config.js` es pública por
diseño (la protege RLS). La `service_role` **saltea RLS** y nunca va al repo ni al
navegador — solo a los secrets del servidor. Por eso `documentos` tiene RLS
encendido y cero policies: contiene los hashes de las cuentas.
