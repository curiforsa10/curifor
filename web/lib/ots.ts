/**
 * Órdenes de trabajo — tipos y utilidades del módulo Control y Gestión.
 *
 * Los nombres de campo vienen tal cual de la planilla del PBI (mayúsculas, con
 * espacios y tildes). Se conservan a proposito: `consolidar_OTs.py` los escribe
 * asi y renombrarlos aca obligaria a traducir en los dos sentidos cada vez que
 * se guarda.
 */

export type OT = {
  'FOLIO OT': string
  SUCURSAL?: string
  RANGO?: string
  'DIAS APERTURA'?: number | string
  'FECHA OT'?: string
  'TIPO VENTA'?: string
  'TIPO CLIENTE'?: string
  MARCA?: string
  MODELO?: string
  PATENTE?: string
  ASESOR?: string
  ESTADO?: string
  NETO?: number | string
  'GLOSA TRABAJO'?: string
  CATEGORIA?: string
  'OBSERVACION OT'?: string
  NOTAS?: string
  'AVANCE - GESTIÓN'?: string
  ULTIMA_EDICION?: string
  [k: string]: unknown
}

/** Las unicas cuatro columnas que la app deja editar (igual que app.py). */
export const COLUMNAS_EDITABLES = [
  'CATEGORIA',
  'OBSERVACION OT',
  'NOTAS',
  'AVANCE - GESTIÓN',
] as const
export type ColumnaEditable = (typeof COLUMNAS_EDITABLES)[number]

/** Rangos de antigüedad, del mas urgente al mas reciente. */
export const RANGOS = ['91 o más', '61-90', '31-60', '0-30'] as const

export const COLOR_RANGO: Record<string, string> = {
  '91 o más': 'bg-red-600',
  '61-90': 'bg-amber-500',
  '31-60': 'bg-blue-600',
  '0-30': 'bg-green-700',
}

/** Numero desde un campo que puede venir como texto con separadores. */
export function aNumero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

export function pesos(n: number): string {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

/** Valores distintos de un campo, ordenados y sin vacios. */
export function opcionesDe(ots: OT[], campo: keyof OT): string[] {
  const s = new Set<string>()
  for (const o of ots) {
    const v = String(o[campo] ?? '').trim()
    if (v) s.add(v)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'es'))
}
