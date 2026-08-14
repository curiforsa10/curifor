import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento } from '@/lib/supabase'
import { aDecimal, type OT } from '@/lib/ots'

/**
 * Consulta por lote: recibe patentes y/o folios y devuelve una fila por cada
 * uno, exista o no. Que aparezcan los "sin OT abierta" es el punto del modulo:
 * quien pega una lista de 30 patentes necesita saber cuales NO estan, y si el
 * resultado los omite hay que cruzarlos a mano.
 */
export async function POST(req: Request) {
  const usuario = await exigirUsuario('puede_asistente_app')

  let consultas: string[]
  try {
    const b = (await req.json()) as { consultas?: string }
    consultas = (b.consultas ?? '')
      .split(/[\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }
  if (consultas.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'Escribe al menos una patente o folio.' }, { status: 400 })
  }
  if (consultas.length > 500) {
    return NextResponse.json({ ok: false, motivo: 'Máximo 500 por consulta.' }, { status: 400 })
  }

  const doc = await leerDocumento<{ ots?: OT[] }>('datos_dashboard.json')
  let ots = doc?.ots ?? []
  if (ots.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo leer el listado.' }, { status: 502 })
  }

  // Mismo recorte por sucursal que el resto de la app.
  const permitidas = (usuario.sucursales_permitidas ?? []).map((s) => s.trim().toUpperCase())
  if (permitidas.length) {
    ots = ots.filter((o) => permitidas.includes(String(o.SUCURSAL ?? '').trim().toUpperCase()))
  }

  // Índices por patente y por folio: con 500 consultas contra 2.043 OT, recorrer
  // la lista por cada una son un millón de comparaciones.
  const porPatente = new Map<string, OT>()
  const porFolio = new Map<string, OT>()
  for (const o of ots) {
    const p = String(o.PATENTE ?? '').trim().toUpperCase()
    const f = String(o['FOLIO OT'] ?? '').trim().toUpperCase()
    if (p && !porPatente.has(p)) porPatente.set(p, o)
    if (f && !porFolio.has(f)) porFolio.set(f, o)
  }

  const filas = consultas.map((q) => {
    const o = porPatente.get(q) ?? porFolio.get(q)
    if (!o) return { consulta: q, encontrada: false }
    const repuestos = (o.repuestos_actual as Array<Record<string, unknown>> | undefined) ?? []
    return {
      consulta: q,
      encontrada: true,
      folio: o['FOLIO OT'],
      patente: o.PATENTE ?? '',
      sucursal: o.SUCURSAL ?? '',
      asesor: o.ASESOR ?? '',
      rango: o.RANGO ?? '',
      dias: o['DIAS APERTURA'] ?? '',
      neto: o.NETO ?? '',
      costoVale: repuestos.reduce((s, r) => s + aDecimal(r.costo_total), 0),
      repuestos: repuestos.length,
    }
  })

  return NextResponse.json({
    ok: true,
    filas,
    encontradas: filas.filter((f) => f.encontrada).length,
  })
}
