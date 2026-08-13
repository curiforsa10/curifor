# -*- coding: utf-8 -*-
"""
Carga inicial de la tabla `documentos` de Supabase (migración del backend).

Sube a Supabase los JSON que app.py ya sabe leer de ahí — la lista blanca
SUPABASE_DOCS. Mientras un documento NO esté en la tabla, app.py lo sigue
leyendo de GitHub (fallback), así que este script es el que "enciende" la
migración para cada archivo.

POR DEFECTO LEE LA VERSIÓN VIVA DESDE GITHUB, no el archivo del disco: la app
auto-commitea usuarios/audit/notificaciones durante todo el día, así que la
copia local casi siempre está atrasada. Con --local usa el archivo de la carpeta.

Uso:
    python plataforma/herramientas/migrar_documentos_supabase.py            # los 4 del grupo A, desde GitHub
    python plataforma/herramientas/migrar_documentos_supabase.py --local    # desde los archivos de la carpeta
    python plataforma/herramientas/migrar_documentos_supabase.py --dry-run  # solo muestra qué haría
    python plataforma/herramientas/migrar_documentos_supabase.py audit_log.json   # uno puntual

Credenciales — NUNCA se pasan por la línea de comandos (quedarían en el
historial de la shell). Se leen, en este orden:
    1. variables de entorno SUPABASE_URL / SUPABASE_SERVICE_KEY / GITHUB_TOKEN
    2. .streamlit/secrets.toml (está en .gitignore)
"""
import os
import sys
import json
import base64

import requests

# --- Contexto -----------------------------------------------------------
_AQUI = os.path.dirname(os.path.abspath(__file__))
_RAIZ = os.path.abspath(os.path.join(_AQUI, "..", ".."))   # carpeta del repo
_SECRETS = os.path.join(_RAIZ, ".streamlit", "secrets.toml")

# Misma lista blanca que app.py (SUPABASE_DOCS). Si se amplía allá, ampliar acá.
# Quedan afuera control_taller*.json y prepicking_estados.json: los escribe el JS
# del Planificador contra la Contents API, con el sha del archivo.
GRUPO_A = [
    "usuarios_curifor.json",
    "notificaciones.json",
    "audit_log.json",
    "cuenta_ficha_revisados.json",
    "online_users.json",
    "comentarios_log.json",
    "loaners.json",
    "informes_gestion.json",
    "datos_dashboard.json",
    "stock_repuestos.json",
    "cotizador_data.json",
    "produccion_tecnicos.json",
    "cuenta_ficha.json",
    "agenda_hoy.json",
    "campanas_curifor.json",
    "historial_cierres.json",
    "ranking_cierres.json",
    "tempario.json",
    "tecnicos_sucursal_manual.json",
    "taller_data.json",
]

GITHUB_USUARIO = os.environ.get("GITHUB_USUARIO", "curiforsa10")
GITHUB_REPO    = os.environ.get("GITHUB_REPO", "curifor")


def _leer_secrets():
    """Parser mínimo de .streamlit/secrets.toml: CLAVE = "valor" de primer nivel."""
    vals = {}
    if not os.path.exists(_SECRETS):
        return vals
    with open(_SECRETS, "r", encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, _, v = linea.partition("=")
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def _cfg(nombre, secrets):
    return (os.environ.get(nombre) or secrets.get(nombre) or "").strip()


# --- Origen de los datos ------------------------------------------------
def _desde_disco(nombre):
    ruta = os.path.join(_RAIZ, nombre)
    if not os.path.exists(ruta):
        return None, f"no existe en {_RAIZ}"
    with open(ruta, "r", encoding="utf-8") as f:
        return json.load(f), f"local ({os.path.getsize(ruta):,} bytes)"


def _desde_github(nombre, token):
    """Lee el JSON vivo por Git Data API (autenticado, sin límite de 1 MB y sin
    pasar por el CDN público — mismo criterio que app.py)."""
    if not token:
        return None, "falta GITHUB_TOKEN"
    base = f"https://api.github.com/repos/{GITHUB_USUARIO}/{GITHUB_REPO}"
    hdrs = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    r = requests.get(f"{base}/contents/{nombre}", headers=hdrs,
                     params={"ref": "main"}, timeout=20, verify=False)
    if r.status_code == 404:
        return None, "no existe en el repo"
    r.raise_for_status()
    sha = r.json().get("sha")
    b = requests.get(f"{base}/git/blobs/{sha}", headers=hdrs, timeout=40, verify=False)
    b.raise_for_status()
    crudo = b.json().get("content", "").replace("\n", "")
    return json.loads(base64.b64decode(crudo).decode("utf-8")), f"GitHub (blob {sha[:7]})"


# --- Destino ------------------------------------------------------------
def _upsert(url, key, nombre, datos, mensaje):
    r = requests.post(
        f"{url}/rest/v1/documentos",
        params={"on_conflict": "nombre"},
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            # return=minimal: sin esto PostgREST devuelve la fila recien escrita,
            # y serializar de vuelta un documento grande (stock_repuestos, ~9.4 MB)
            # supera el statement_timeout de Postgres -> 57014. Con esto, el mismo
            # upsert pasa de fallar por timeout a resolverse en ~6 s.
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json={"nombre": nombre, "data": datos, "mensaje": mensaje},
        timeout=300, verify=False,
    )
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")


def _verificar(url, key, nombre):
    """Relee lo que quedó guardado. Devuelve el tamaño del JSON en Supabase."""
    r = requests.get(
        f"{url}/rest/v1/documentos",
        params={"nombre": f"eq.{nombre}", "select": "data,actualizado"},
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=40, verify=False,
    )
    r.raise_for_status()
    filas = r.json()
    if not filas:
        return None, None
    return len(json.dumps(filas[0]["data"], ensure_ascii=False)), filas[0].get("actualizado")


def main():
    args = [a for a in sys.argv[1:]]
    local   = "--local" in args
    dry_run = "--dry-run" in args
    pedidos = [a for a in args if not a.startswith("--")] or GRUPO_A

    secrets = _leer_secrets()
    url = _cfg("SUPABASE_URL", secrets).rstrip("/")
    key = _cfg("SUPABASE_SERVICE_KEY", secrets)
    token = _cfg("GITHUB_TOKEN", secrets)

    if not url or not key:
        print("ERROR: faltan SUPABASE_URL / SUPABASE_SERVICE_KEY.")
        print(f"       Cargarlas como variables de entorno, o en {_SECRETS}")
        print("       (ese archivo esta en .gitignore; usar secrets.toml.example de plantilla).")
        return 1

    origen = "el disco" if local else "GitHub (version viva)"
    print(f"Origen : {origen}")
    print(f"Destino: {url}/rest/v1/documentos" + ("   [DRY-RUN, no escribe]" if dry_run else ""))
    print()

    fallos = 0
    for nombre in pedidos:
        if nombre not in GRUPO_A:
            print(f"  ! {nombre}: NO esta en la lista blanca SUPABASE_DOCS de app.py.")
            print(f"    Subirlo ahora dejaria a la app leyendo un dato que nadie actualiza. Se omite.")
            fallos += 1
            continue
        try:
            datos, detalle = (_desde_disco(nombre) if local
                              else _desde_github(nombre, token))
            if datos is None:
                print(f"  ! {nombre}: {detalle}")
                fallos += 1
                continue
            peso = len(json.dumps(datos, ensure_ascii=False))
            if dry_run:
                print(f"  · {nombre}: {detalle} -> {peso:,} chars (no se escribio)")
                continue
            _upsert(url, key, nombre, datos, f"migracion inicial desde {detalle}")
            guardado, cuando = _verificar(url, key, nombre)
            ok = "OK" if guardado == peso else f"REVISAR (subio {peso:,}, quedo {guardado:,})"
            print(f"  · {nombre}: {detalle} -> {peso:,} chars  [{ok}]  {cuando or ''}")
        except Exception as e:
            print(f"  ! {nombre}: {e}")
            fallos += 1

    print()
    if fallos:
        print(f"Terminado con {fallos} problema(s).")
    elif dry_run:
        print("Dry-run OK. Correr sin --dry-run para escribir.")
    else:
        print("Listo. app.py ya lee estos documentos desde Supabase")
        print("(siempre que SUPABASE_URL y SUPABASE_SERVICE_KEY esten en los secrets del deploy).")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
