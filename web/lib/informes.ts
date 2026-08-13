/**
 * Informes de Gestión — reportes AG por sucursal e IMOP de Ford.
 *
 * Igual que Cuenta Ficha, el contenido va comprimido en gzip+base64 bajo `gz`.
 */
import zlib from 'node:zlib'
import { leerDocumento } from './supabase'

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const

export type Fila = { label?: string; tipo?: string; valores?: Array<number | null> }
export type Hoja = { titulo?: string; codigo?: string; filas?: Fila[] }
export type SucursalAg = { sucursal?: string; periodo?: string; archivo?: string; hojas?: Record<string, Hoja> }

export type Informes = {
  fecha_actualizacion?: string
  ag?: Record<string, SucursalAg>
  ford?: { archivo?: string; periodo?: string; meses?: Record<string, unknown> }
  actual?: { periodo?: string; ag?: Record<string, Record<string, Record<string, number>>> }
}

export async function leerInformes(): Promise<Informes | null> {
  const doc = await leerDocumento<{ gz?: string; actualizado?: string }>('informes_gestion.json')
  if (!doc?.gz) return null
  try {
    return JSON.parse(zlib.gunzipSync(Buffer.from(doc.gz, 'base64')).toString('utf8')) as Informes
  } catch {
    return null
  }
}

/** Formatea una celda del reporte: los nulos son celdas sin dato, no ceros. */
export function celda(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  return String(v)
}
