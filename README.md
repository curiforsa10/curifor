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

**Los 22 documentos están migrados**, incluido el tablero del Planificador. La
app ya no guarda su estado haciendo commits.

Para levantarla contra Supabase alcanza con estos tres secrets:

```toml
SUPABASE_URL = "https://ordgsglujssgzmnlmcus.supabase.co"
SUPABASE_SERVICE_KEY = "..."   # servidor; saltea RLS, nunca al navegador
SUPABASE_ANON_KEY = "..."      # pública por diseño; la usa el Planificador
```

Sin `SUPABASE_SERVICE_KEY` la capa queda inerte y todo vuelve a GitHub, así que
la migración es reversible sacando un secret.

Scripts (SQL Editor de Supabase, todos idempotentes):

| Archivo | Qué crea |
|---|---|
| `setup_supabase_documentos.sql` | Tabla `documentos` (RLS on, cero policies) |
| `setup_supabase_tablero.sql` | `taller_vales` + funciones `tablero_*` |
| `migrar_documentos_supabase.py` | Carga inicial de los datos |

### El Planificador y los vales

El JS del Planificador **ya no recibe el `GITHUB_TOKEN`**. Antes se le inyectaba
en el HTML (`const GITHUB_TOKEN = "..."`), donde cualquiera podía leerlo con Ver
código fuente — y con scope `repo` eso es control total de los repos privados de
la cuenta emisora.

Ahora el servidor emite un **vale** (`_emitir_vale` → tabla `taller_vales`) y el
navegador guarda con la clave anon + ese vale, vía `tablero_guardar`. El vale
sirve para un usuario, una sucursal, y expira. Quien valida es Postgres:

- documento fuera de la lista → `documento_no_permitido`
- vale vencido o falso → `vale_invalido`
- otro guardado entró primero → `conflicto`, con el sello nuevo para reintentar

El **sello** (timestamp) reemplaza al `sha` como bloqueo optimista. Cuidado al
tocarlo: `tablero_guardar` lo compara **como texto** contra un formato que
termina en `+00`, mientras PostgREST devuelve `+00:00`. Ver `_sello_sb` en
`app.py`; sin esa conversión el sello no calza nunca.

### Qué falta

`GITHUB_TOKEN` ya no es necesario para el Planificador. Sigue habiendo lecturas
sueltas contra GitHub como respaldo, y los documentos que genera
`consolidar_OTs.py` (`datos_dashboard`, `stock_repuestos`, `cotizador_data`…)
quedan congelados hasta que ese script corra apuntando a esta plataforma — tiene
el dual-write puesto, así que al correr actualiza GitHub y Supabase a la vez.
