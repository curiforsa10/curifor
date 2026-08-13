/**
 * Loaners — flota de vehiculos de cortesia.
 *
 * El modelo de datos viene de app.py y se conserva: la FLOTA (vin, modelo,
 * patente) es fija y vive en el codigo, mientras que `loaners.json` guarda solo
 * las asignaciones, indexadas por VIN. Asi, agregar un auto a la flota es un
 * cambio de codigo y prestarlo es un cambio de datos.
 */
import flotaJson from './loaners-flota.json'

export type Asignacion = {
  sucursal?: string
  fecha_solicitud?: string
  kms_salida?: number | string
  vin_cliente?: string
  nombre_cliente?: string
  modelo_cliente?: string
  fecha_ot?: string
  caso_sf?: string
  _editado_por?: string
  _editado?: string
}

export type Vehiculo = Asignacion & {
  vin: string
  modelo: string
  patente: string
  /** Asignado = tiene cliente encima. Es derivado, no se guarda. */
  asignado: boolean
  /** Dias desde la fecha de solicitud. null si no hay fecha o no se entiende. */
  diasPrestado: number | null
}

export const FLOTA = flotaJson as Array<Asignacion & { vin: string; modelo: string; patente: string }>

/** Sucursales conocidas. Se agregan las que aparezcan en los datos guardados. */
export function sucursalesDe(vehiculos: Vehiculo[]): string[] {
  const base = FLOTA.map((v) => v.sucursal ?? '')
  const usadas = vehiculos.map((v) => v.sucursal ?? '')
  return [...new Set([...base, ...usadas].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
}

function diasDesde(fecha: string | undefined): number | null {
  if (!fecha) return null
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const hoy = new Date()
  const dias = Math.floor((hoy.getTime() - d.getTime()) / 86_400_000)
  return dias >= 0 ? dias : null
}

/** Un vehiculo esta asignado si tiene datos del cliente encima. */
export function estaAsignado(a: Asignacion): boolean {
  return Boolean((a.nombre_cliente ?? '').trim() || (a.vin_cliente ?? '').trim())
}

/** Combina la flota fija con lo guardado. Lo guardado manda. */
export function combinar(guardado: Record<string, Asignacion> | null | undefined): Vehiculo[] {
  const datos = guardado ?? {}
  return FLOTA.map((base) => {
    const a: Asignacion = { ...base, ...(datos[base.vin] ?? {}) }
    return {
      ...a,
      vin: base.vin,
      modelo: base.modelo,
      patente: base.patente,
      asignado: estaAsignado(a),
      diasPrestado: estaAsignado(a) ? diasDesde(a.fecha_solicitud) : null,
    }
  })
}

/** Campos del cliente. Se limpian juntos al liberar una unidad. */
export const CAMPOS_CLIENTE = [
  'fecha_solicitud',
  'vin_cliente',
  'nombre_cliente',
  'modelo_cliente',
  'fecha_ot',
  'caso_sf',
] as const
