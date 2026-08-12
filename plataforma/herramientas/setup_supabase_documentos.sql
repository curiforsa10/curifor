-- =============================================================
-- Tabla `documentos` — backend de estado de la app Streamlit.
-- Ejecutar UNA VEZ en Supabase: SQL Editor → New query → Run.
-- Idempotente: se puede correr de nuevo sin romper nada.
--
-- Reemplaza a los .json que hoy viven en el repo de GitHub. Cada fila es un
-- documento completo (mismo contenido que el archivo), indexado por su nombre.
-- La usan:
--   · app.py          → _sb_leer / _sb_guardar, por API REST con la service_role
--   · supabase_sync.py → dual-write del consolidador, por conexión Postgres
--
-- Modelo de seguridad — IMPORTANTE:
--   Esta tabla contiene `usuarios_curifor.json` (hash + salt de las cuentas) y
--   `audit_log.json`. NO debe ser legible con la clave anon, que es pública
--   (está en js/agenda-config.js, a la vista de cualquiera en el navegador).
--   Por eso: RLS ENCENDIDO y CERO policies. Sin policies, anon y authenticated
--   no pueden hacer nada; solo pasan la service_role (que saltea RLS) y el rol
--   postgres del pooler. No agregar policies a esta tabla sin revisar esto.
-- =============================================================

create table if not exists public.documentos (
  nombre      text primary key,          -- "usuarios_curifor.json", "audit_log.json", ...
  data        jsonb not null,            -- el contenido del documento
  mensaje     text,                      -- de dónde vino el último cambio (equivale al commit)
  actualizado timestamptz not null default now()
);

-- Búsquedas por fecha de actualización (monitoreo / depuración).
create index if not exists idx_documentos_actualizado
  on public.documentos (actualizado desc);

-- `actualizado` al día en cada UPDATE, venga de donde venga.
create or replace function public.documentos_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end $$;
drop trigger if exists trg_documentos_touch on public.documentos;
create trigger trg_documentos_touch before update on public.documentos
  for each row execute function public.documentos_touch();

-- RLS encendido y sin policies: nadie entra con anon/authenticated (ver nota arriba).
alter table public.documentos enable row level security;

-- Verificación: debe devolver rowsecurity = true y 0 policies.
--   select relrowsecurity from pg_class where relname = 'documentos';
--   select count(*) from pg_policies where tablename = 'documentos';
