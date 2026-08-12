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
escribe los `.json` del repo usando `GITHUB_TOKEN` (ver `_leer_json_github_raw`
y `_guardar_json_github_raw`). Deliberadamente **no** se usa
`raw.githubusercontent.com` — obligaba a tener el repo público. Ver la nota de
seguridad en `app.py:342`.

Archivos principales: `datos_dashboard.json` (OTs), `usuarios_curifor.json`
(cuentas y permisos), `control_taller*.json` (por sucursal), `stock_repuestos.json`,
`cotizador_data.json` (bundle del cotizador), `produccion_tecnicos.json`,
`agenda_hoy.json`, `audit_log.json`.

## Migración a Supabase (en curso)

El backend se está moviendo a Supabase (proyecto `ordgsglujssgzmnlmcus`):

- `supabase_sync.py` ya escribe en paralelo a la tabla `documentos` (JSONB)
  desde el consolidador. GitHub sigue siendo la fuente de verdad.
- `plataforma/` ya opera nativo contra Supabase (`reservas_web`, auth por
  dominio `@curifor.com`, RLS). Esquema en
  `plataforma/herramientas/setup_supabase_*.sql`.
- Falta la capa de **lectura** en `app.py` para cortar la dependencia de la
  Contents API.

La `anonKey` en `plataforma/js/agenda-config.js` es pública por diseño (la
protege RLS). La `service_role` nunca va al repo.
