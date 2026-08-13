-- =============================================================
-- Tablero del Planificador — escritura desde el navegador SIN token de GitHub.
-- Ejecutar en Supabase: SQL Editor → New query → Run. Idempotente.
--
-- Estas funciones ya existian en la base pero NO estaban versionadas en ningun
-- repo (igual que la tabla `documentos`). Se vuelcan aca tal como estan en
-- produccion para que dejen de vivir solo en la nube.
--
-- POR QUE EXISTE ESTO
--   El JS del Planificador guardaba el tablero contra la Contents API de GitHub,
--   y para eso app.py le inyectaba el GITHUB_TOKEN en el HTML. Un token con
--   scope 'repo' es control total de todos los repos privados de la cuenta, a la
--   vista de cualquiera que abriera el codigo fuente de la pagina.
--   Ahora el servidor emite un VALE (tabla taller_vales) y el navegador guarda
--   con la clave anon + ese vale. Quien valida es Postgres, no el navegador.
--
-- EL VALE
--   Atado a un usuario y una sucursal, con expiracion. No sirve para nada fuera
--   de los documentos que habilita tablero_documento_permitido().
--
-- EL SELLO (bloqueo optimista)
--   Cumple el rol que tenia el sha de GitHub: el cliente manda el sello que
--   leyo, y si otro guardado entro primero recibe {ok:false, motivo:'conflicto'}
--   con el sello nuevo para reintentar.
--   OJO: la comparacion es TEXTUAL contra
--   to_char(actualizado, 'YYYY-MM-DD"T"HH24:MI:SS.US+00'), que termina en '+00'.
--   PostgREST devuelve ISO terminado en '+00:00'. Quien lea el sello por REST
--   debe convertirlo (ver _sello_sb en app.py) o el sello no calzara nunca.
--
-- QUE NO PUEDE HACER UN VALE
--   tablero_documento_permitido() limita a los tableros. usuarios_curifor.json,
--   audit_log.json y el resto quedan fuera: no son alcanzables con la clave anon
--   ni con un vale valido.
-- =============================================================

-- Vales de escritura. Los emite app.py con la service_role (_emitir_vale).
create table if not exists public.taller_vales (
  vale     text primary key,
  usuario  text not null,
  sucursal text,
  creado   timestamptz not null default now(),
  expira   timestamptz
);
create index if not exists idx_taller_vales_expira on public.taller_vales (expira);

-- RLS encendido y sin policies: la tabla no se toca con anon/authenticated.
-- Las funciones de abajo son SECURITY DEFINER, asi que igual pueden leerla.
alter table public.taller_vales enable row level security;

CREATE OR REPLACE FUNCTION public.tablero_documento_permitido(p_nombre text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- control_taller.json  : tablero antiguo compartido
  -- control_taller_X.json: uno por sucursal (migracion del 10/08/2026, _ctrl_slug)
  -- prepicking_estados.json
  select p_nombre in ('control_taller.json', 'prepicking_estados.json')
      or p_nombre ~ '^control_taller_[A-Z0-9_]+\.json$'
$function$;

CREATE OR REPLACE FUNCTION public.tablero_guardar(p_vale text, p_nombre text, p_data jsonb, p_sello text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usuario text;
  v_actual  timestamptz;
  v_nuevo   timestamptz;
begin
  if not public.tablero_documento_permitido(p_nombre) then
    return jsonb_build_object('ok', false, 'motivo', 'documento_no_permitido');
  end if;

  v_usuario := public.tablero_usuario_del_vale(p_vale);
  if v_usuario is null then
    return jsonb_build_object('ok', false, 'motivo', 'vale_invalido');
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'motivo', 'datos_invalidos');
  end if;

  select actualizado into v_actual from public.documentos
   where nombre = p_nombre for update;

  if v_actual is not null and p_sello is distinct from
       to_char(v_actual, 'YYYY-MM-DD"T"HH24:MI:SS.US+00') then
    return jsonb_build_object('ok', false, 'motivo', 'conflicto',
                              'sello', to_char(v_actual, 'YYYY-MM-DD"T"HH24:MI:SS.US+00'));
  end if;

  insert into public.documentos (nombre, data, mensaje)
       values (p_nombre, p_data, 'tablero · ' || v_usuario)
  on conflict (nombre) do update
     set data = excluded.data, actualizado = now(), mensaje = excluded.mensaje
  returning actualizado into v_nuevo;

  return jsonb_build_object('ok', true,
                            'sello', to_char(v_nuevo, 'YYYY-MM-DD"T"HH24:MI:SS.US+00'));
end $function$;

CREATE OR REPLACE FUNCTION public.tablero_leer(p_vale text, p_nombre text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usuario text;
  v_data    jsonb;
  v_sello   timestamptz;
begin
  if not public.tablero_documento_permitido(p_nombre) then
    return jsonb_build_object('ok', false, 'motivo', 'documento_no_permitido');
  end if;

  v_usuario := public.tablero_usuario_del_vale(p_vale);
  if v_usuario is null then
    return jsonb_build_object('ok', false, 'motivo', 'vale_invalido');
  end if;

  select data, actualizado into v_data, v_sello
    from public.documentos where nombre = p_nombre;

  if v_data is null then
    -- No es lo mismo "no existe" que "no pude leerlo": el tablero se niega a
    -- guardar cuando no pudo leer, justamente para no borrar las otras
    -- sucursales. Se distingue.
    return jsonb_build_object('ok', true, 'existe', false, 'data', '{}'::jsonb, 'sello', null);
  end if;

  return jsonb_build_object('ok', true, 'existe', true, 'data', v_data,
                            'sello', to_char(v_sello, 'YYYY-MM-DD"T"HH24:MI:SS.US+00'));
end $function$;

CREATE OR REPLACE FUNCTION public.tablero_usuario_del_vale(p_vale text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select usuario from public.taller_vales
   where vale = p_vale and expira > now()
$function$;

-- Permisos: el navegador (anon) solo puede llamar a estas tres. La lista blanca
-- NO es ejecutable por anon a proposito — se consulta por dentro de las otras.
grant execute on function public.tablero_leer(text, text)              to anon, authenticated;
grant execute on function public.tablero_guardar(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.tablero_usuario_del_vale(text)        to anon, authenticated;

-- Verificacion rapida (debe dar t, t, f):
--   select public.tablero_documento_permitido('control_taller_CURICO.json'),
--          public.tablero_documento_permitido('prepicking_estados.json'),
--          public.tablero_documento_permitido('usuarios_curifor.json');
