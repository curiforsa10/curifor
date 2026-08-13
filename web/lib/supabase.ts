/**
 * Acceso a Supabase.
 *
 * Dos caminos, a proposito:
 *
 *  - `leerDocumento` / `guardarDocumento` corren SOLO en el servidor y usan la
 *    service_role, que saltea RLS. Nunca importar esto desde un componente
 *    cliente: la clave no debe llegar al navegador.
 *
 *  - El navegador habla con Supabase por su cuenta cuando hace falta (tablero
 *    del Planificador), con la clave anon + un vale. Ver lib/vale.ts.
 *
 * Se usa fetch contra PostgREST en vez del SDK: es una sola llamada por
 * documento y evita arrastrar una dependencia para esto.
 */

const URL_BASE = process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

export function supabaseConfigurado(): boolean {
  return Boolean(URL_BASE && SERVICE_KEY)
}

function cabeceras(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  }
}

/** Contenido de un documento, o null si no existe / falla. */
export async function leerDocumento<T = unknown>(nombre: string): Promise<T | null> {
  if (!supabaseConfigurado()) return null
  try {
    const url = new URL(`${URL_BASE}/rest/v1/documentos`)
    url.searchParams.set('nombre', `eq.${nombre}`)
    url.searchParams.set('select', 'data')
    const r = await fetch(url, { headers: cabeceras(), cache: 'no-store' })
    if (!r.ok) return null
    const filas = (await r.json()) as Array<{ data: T }>
    return filas.length ? filas[0].data : null
  } catch {
    return null
  }
}

/** Documento + sello, para los que se guardan con bloqueo optimista. */
export async function leerDocumentoConSello<T = unknown>(
  nombre: string,
): Promise<{ data: T | null; sello: string }> {
  if (!supabaseConfigurado()) return { data: null, sello: '' }
  try {
    const url = new URL(`${URL_BASE}/rest/v1/documentos`)
    url.searchParams.set('nombre', `eq.${nombre}`)
    url.searchParams.set('select', 'data,actualizado')
    const r = await fetch(url, { headers: cabeceras(), cache: 'no-store' })
    if (!r.ok) return { data: null, sello: '' }
    const filas = (await r.json()) as Array<{ data: T; actualizado: string }>
    if (!filas.length) return { data: null, sello: '' }
    return { data: filas[0].data, sello: aSello(filas[0].actualizado) }
  } catch {
    return { data: null, sello: '' }
  }
}

export async function guardarDocumento(
  nombre: string,
  data: unknown,
  mensaje: string,
): Promise<boolean> {
  if (!supabaseConfigurado()) return false
  try {
    const url = new URL(`${URL_BASE}/rest/v1/documentos`)
    url.searchParams.set('on_conflict', 'nombre')
    const r = await fetch(url, {
      method: 'POST',
      headers: cabeceras({
        'Content-Type': 'application/json',
        // return=minimal no es cosmetico: sin el, PostgREST devuelve la fila
        // recien escrita, y serializar de vuelta un documento grande
        // (stock_repuestos son ~9.4 MB) supera el statement_timeout de Postgres
        // y el guardado falla con 57014.
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify({ nombre, data, mensaje }),
    })
    return r.ok
  } catch {
    return false
  }
}

/**
 * Convierte el `actualizado` que devuelve PostgREST al formato EXACTO con el
 * que `tablero_guardar` compara el sello.
 *
 * La comparacion en Postgres es TEXTUAL contra
 * to_char(actualizado, 'YYYY-MM-DD"T"HH24:MI:SS.US+00'), que termina en '+00',
 * mientras PostgREST entrega ISO terminado en '+00:00'. Sin esta conversion el
 * sello no calza nunca y todo primer guardado responde 'conflicto'.
 */
export function aSello(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?/.exec(iso)
  if (!m) return iso
  const micros = (m[2] ?? '').padEnd(6, '0').slice(0, 6)
  return `${m[1]}.${micros}+00`
}
