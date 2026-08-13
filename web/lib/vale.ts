/**
 * Vales de escritura para el tablero. Server-only.
 *
 * Reemplazan al GITHUB_TOKEN que la app de Streamlit inyectaba en el HTML del
 * Planificador. Un vale sirve para UN usuario y UNA sucursal, expira solo, y
 * solo abre los documentos que habilita tablero_documento_permitido(). Quien
 * valida es Postgres, no el navegador.
 *
 * Esquema en plataforma/herramientas/setup_supabase_tablero.sql.
 */
import crypto from 'node:crypto'

const URL_BASE = process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const HORAS_VALE = 8

export async function emitirVale(usuario: string, sucursal: string): Promise<string> {
  if (!URL_BASE || !SERVICE_KEY || !usuario) return ''
  try {
    const vale = crypto.randomBytes(24).toString('base64url')
    const expira = new Date(Date.now() + HORAS_VALE * 3600 * 1000).toISOString()
    const url = new URL(`${URL_BASE}/rest/v1/taller_vales`)
    url.searchParams.set('on_conflict', 'vale')
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ vale, usuario, sucursal, expira }),
      cache: 'no-store',
    })
    return r.ok ? vale : ''
  } catch {
    return ''
  }
}

/**
 * Nombre del documento de tablero de una sucursal.
 *
 * Debe dar EXACTAMENTE el mismo resultado que `_ctrl_slug()` de app.py,
 * `ctrl_slug_sucursal()` de consolidar_OTs.py y `_ctrlSlug()` del JS del
 * tablero. Si difieren, se escribe en un documento y se lee de otro.
 *   "TALCA (2)" -> control_taller_TALCA_2.json
 */
export function ctrlSlug(sucursal: string): string {
  const s = (sucursal ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // quita diacriticos, como el filtro de combining de Python
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `control_taller_${s || 'SIN_SUCURSAL'}.json`
}
