/**
 * Cuenta Ficha — saldos por cliente e historial de OT.
 *
 * El documento guarda el contenido comprimido en gzip+base64 bajo la clave `gz`
 * (1,8 MB al descomprimir, 870 clientes). Se descomprime en el servidor.
 */
import zlib from 'node:zlib'
import { leerDocumento } from './supabase'

export type Movimiento = {
  documento?: string
  nro?: string
  saldo?: number
  fecha?: string
  local?: string
  glosa?: string
}

export type OtCliente = Record<string, unknown>

export type Cliente = {
  rut: string
  nombre?: string
  saldo?: number
  tiene_saldo?: boolean
  n_mov?: number
  sucursales?: string[]
  suc_principal?: string
  movimientos?: Movimiento[]
  patentes?: string[]
  ots?: OtCliente[]
  n_ot?: number
  n_ot_pend?: number
}

export type Resumen = {
  total_clientes?: number
  clientes_saldo?: number
  monto_total?: number
  saldo_promedio?: number
  saldo_mayor?: number
  total_movimientos?: number
  clientes_con_ot?: number
  total_ot?: number
  total_ot_pend?: number
  meses_historial?: number
}

export type Revisado = { usuario?: string; fecha?: string; nota?: string }

/** Cliente sin movimientos ni OT: lo que necesita el listado. */
export type ClienteLista = Omit<Cliente, 'movimientos' | 'ots'>

export async function leerCuentaFicha(): Promise<{
  clientes: Cliente[]
  resumen: Resumen
  actualizado: string
}> {
  const doc = await leerDocumento<{ gz?: string; resumen?: Resumen; fecha_actualizacion?: string }>(
    'cuenta_ficha.json',
  )
  if (!doc?.gz) return { clientes: [], resumen: doc?.resumen ?? {}, actualizado: '' }
  try {
    const crudo = zlib.gunzipSync(Buffer.from(doc.gz, 'base64')).toString('utf8')
    const o = JSON.parse(crudo) as { clientes?: Cliente[]; resumen?: Resumen }
    return {
      clientes: o.clientes ?? [],
      resumen: o.resumen ?? doc.resumen ?? {},
      actualizado: doc.fecha_actualizacion ?? '',
    }
  } catch {
    return { clientes: [], resumen: doc.resumen ?? {}, actualizado: doc.fecha_actualizacion ?? '' }
  }
}

/**
 * Quita movimientos y OT de cada cliente.
 *
 * Con los 870 clientes completos el envio ronda 1,8 MB; el listado solo muestra
 * rut, nombre, saldo y contadores. El detalle se pide al abrir un cliente, que
 * es cuando de verdad hace falta.
 */
export function aligerarClientes(clientes: Cliente[]): ClienteLista[] {
  return clientes.map(({ movimientos: _m, ots: _o, ...resto }) => resto)
}

export async function leerRevisados(): Promise<Record<string, Revisado>> {
  const doc = await leerDocumento<{ revisados?: Record<string, Revisado> }>(
    'cuenta_ficha_revisados.json',
  )
  return doc?.revisados ?? {}
}

export function pesos(n: number | undefined): string {
  return (n ?? 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  })
}
