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

/**
 * OJO: el documento trae DOS formatos numericos distintos y hay que usar la
 * funcion que corresponde a cada campo.
 *
 *   NETO         '172.316'          el punto separa miles  -> 172.316
 *   costo_total  '108464.14967009'  el punto es decimal    -> 108.464
 *
 * Aplicar el criterio chileno a los costos de repuestos los multiplica por
 * 10^8: los vales de 881 OT sumaban 3.782 billones de pesos.
 */

/** Campos de la planilla (NETO, montos): el punto separa miles. */
export function aNumero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** Costos de repuestos: vienen con punto decimal, tal como los da el sistema. */
export function aDecimal(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function pesos(n: number): string {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

/**
 * Campos que necesitan Resumen, los filtros y la tabla de Detalle.
 *
 * El documento completo pesa 4,3 MB para 2.043 OT, y el tope de respuesta de una
 * funcion serverless en Vercel es 4,5 MB: sin recortar, el modulo principal deja
 * de cargar en produccion apenas entren unas OT mas.
 *
 * Cuatro campos se llevan el 53% del peso y ninguno se muestra aca:
 *   repuestos_historico  918 KB   repuestos_actual  670 KB
 *   anticipo             514 KB   repuestos_compras 180 KB
 * Alimentan las pestañas de Repuestos y Documentos, que los piden aparte cuando
 * se abren.
 */
export const CAMPOS_LISTADO = [
  'FOLIO OT', 'SUCURSAL', 'RANGO', 'DIAS APERTURA', 'FECHA OT',
  'TIPO VENTA', 'TIPO CLIENTE', 'MARCA', 'MODELO', 'PATENTE', 'ASESOR',
  'ESTADO', 'NETO', 'GLOSA TRABAJO', 'CATEGORIA', 'OBSERVACION OT',
  'NOTAS', 'AVANCE - GESTIÓN', 'ULTIMA_EDICION',
] as const

/** Deja solo los campos del listado. Reduce el envio a menos de la mitad. */
export function aligerar(ots: OT[]): OT[] {
  return ots.map((o) => {
    // Se arma como registro suelto y se tipa al final: copiar campo a campo
    // sobre OT choca con los tipos concretos de cada columna.
    const r: Record<string, unknown> = { 'FOLIO OT': String(o['FOLIO OT'] ?? '') }
    for (const c of CAMPOS_LISTADO) {
      const v = o[c]
      // Se omiten los vacios: en 2.043 filas, las claves sueltas suman.
      if (v !== undefined && v !== null && v !== '') r[c] = v
    }
    return r as OT
  })
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
