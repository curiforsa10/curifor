# -*- coding: utf-8 -*-
"""
supabase_sync — capa de sincronización a Supabase (tabla `documentos`, JSONB).

La usa consolidar_OTs.py para escribir en Supabase EN PARALELO a GitHub
(dual-write / sombra) durante la migración del backend. Es FAIL-SAFE: si no hay
credenciales o Supabase falla, no hace nada y NUNCA interrumpe el proceso que la
llama. GitHub sigue siendo la fuente de verdad hasta completar la migración.

Credenciales (solo la password es secreta; el resto tiene defaults conocidos):
  - Password: variable de entorno SUPABASE_DB_PASSWORD, o archivo local
    `supabase_pwd.txt` junto al script (una sola línea con la password).
    NO se versiona -> agregar `supabase_pwd.txt` a .gitignore.
  - Host/user/port/db: defaults del session pooler de Curifor (abajo), o se
    pueden sobre-escribir con SUPABASE_DB_HOST / _USER / _PORT / _NAME.
Sin password -> disponible() = False y upsert() es no-op silencioso.
"""
import os
import ssl
import json

# Defaults del session pooler (IPv4; la red corporativa no tiene IPv6).
_DEF_HOST = "aws-0-us-east-1.pooler.supabase.com"
_DEF_USER = "postgres.ordgsglujssgzmnlmcus"
_DEF_PORT = 5432
_DEF_NAME = "postgres"

_DIR = os.path.dirname(os.path.abspath(__file__))
_PWD_FILE = os.path.join(_DIR, "supabase_pwd.txt")

_cfg = None       # dict con la config, o {} si no hay password
_conn = None      # conexión pg8000 reutilizable (lazy)


def _cargar_cfg():
    global _cfg
    if _cfg is not None:
        return _cfg
    pwd = os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    if not pwd and os.path.exists(_PWD_FILE):
        try:
            with open(_PWD_FILE, "r", encoding="utf-8") as f:
                pwd = f.read().strip()
        except Exception:
            pwd = ""
    if not pwd:
        _cfg = {}
        return _cfg
    _cfg = {
        "host": os.environ.get("SUPABASE_DB_HOST", _DEF_HOST),
        "user": os.environ.get("SUPABASE_DB_USER", _DEF_USER),
        "port": int(os.environ.get("SUPABASE_DB_PORT", _DEF_PORT)),
        "database": os.environ.get("SUPABASE_DB_NAME", _DEF_NAME),
        "password": pwd,
    }
    return _cfg


def disponible():
    """True si hay password configurada (la sincronización está activa)."""
    return bool(_cargar_cfg())


def _get_conn():
    """Conexión pg8000 reutilizable. Reconecta si la anterior murió."""
    global _conn
    cfg = _cargar_cfg()
    if not cfg:
        return None
    if _conn is not None:
        try:
            cur = _conn.cursor()
            cur.execute("select 1")
            cur.fetchone()
            return _conn
        except Exception:
            try:
                _conn.close()
            except Exception:
                pass
            _conn = None
    import pg8000.dbapi
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    _conn = pg8000.dbapi.connect(
        user=cfg["user"], password=cfg["password"], host=cfg["host"],
        port=cfg["port"], database=cfg["database"], ssl_context=ctx, timeout=40,
    )
    _conn.autocommit = True
    return _conn


def upsert(nombre_archivo, datos, mensaje="dual-write consolidar_OTs"):
    """Upsert de un documento (dict/list) en la tabla `documentos`.
    Retorna True si se escribió, False si no hay config o hubo error.
    NUNCA lanza: pensado para llamarse justo después de subir a GitHub sin
    poner en riesgo ese flujo."""
    try:
        conn = _get_conn()
        if conn is None:
            return False
        blob = json.dumps(datos, ensure_ascii=False)
        cur = conn.cursor()
        cur.execute(
            """insert into public.documentos (nombre, data, mensaje)
               values (%s, %s::jsonb, %s)
               on conflict (nombre) do update
                 set data = excluded.data, actualizado = now(), mensaje = excluded.mensaje""",
            (nombre_archivo, blob, mensaje),
        )
        return True
    except Exception:
        return False


def upsert_archivo(ruta_json, nombre_archivo=None, mensaje="dual-write consolidar_OTs"):
    """Como upsert() pero leyendo el JSON desde un archivo ya escrito en disco.
    Útil para enganchar justo después de que consolidar sube el archivo a GitHub."""
    try:
        with open(ruta_json, "r", encoding="utf-8") as f:
            datos = json.load(f)
    except Exception:
        return False
    if nombre_archivo is None:
        nombre_archivo = os.path.basename(ruta_json)
    return upsert(nombre_archivo, datos, mensaje)


def cerrar():
    """Cierra la conexión reutilizable (al terminar el proceso)."""
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = None
