import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento } from '@/lib/supabase'
import type { OT } from '@/lib/ots'

/**
 * Datos de OT que el listado principal NO envía.
 *
 * `aligerar()` recorta repuestos, anticipo y folios de facturación porque son el
 * 53% de los 4,11 MB del documento. Las pestañas que sí los necesitan los piden
 * acá, y cada una recibe solo su parte:
 *
 *   ?vista=repuestos   881 OT con repuestos pendientes   ~678 KB
 *   ?vista=facturas    114 OT con factura X              ~13 KB
 *   ?folio=1234        todo lo extra de UNA OT
 */
export async function GET(req: Request) {
  const usuario = await exigirUsuario('puede_control')
  const url = new URL(req.url)
  const vista = url.searchParams.get('vista')
  const folio = url.searchParams.get('folio')?.trim()

  const doc = await leerDocumento<{ ots?: OT[] }>('datos_dashboard.json')
  let ots = doc?.ots ?? []
  if (ots.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo leer el listado.' }, { status: 502 })
  }

  // Mismo recorte por sucursal que la página: la API no puede ser una puerta
  // trasera para ver OT de sucursales que el usuario no tiene asignadas.
  const permitidas = (usuario.sucursales_permitidas ?? []).map((s) => s.trim().toUpperCase())
  if (permitidas.length) {
    ots = ots.filter((o) => permitidas.includes(String(o.SUCURSAL ?? '').trim().toUpperCase()))
  }

  if (folio) {
    const o = ots.find((x) => String(x['FOLIO OT'] ?? '').trim() === folio)
    if (!o) return NextResponse.json({ ok: false, motivo: 'OT no encontrada.' }, { status: 404 })
    return NextResponse.json({
      ok: true,
      repuestos: o.repuestos_actual ?? [],
      historico: o.repuestos_historico ?? [],
      compras: o.repuestos_compras ?? [],
      anticipo: o.anticipo ?? null,
      folios: Object.fromEntries(
        Object.entries(o).filter(([k]) => k.startsWith('FOLIOS_') || k.startsWith('N_') || k.startsWith('FECHA_FACT')),
      ),
    })
  }

  if (vista === 'repuestos') {
    const filas = ots
      .filter((o) => Array.isArray(o.repuestos_actual) && (o.repuestos_actual as unknown[]).length)
      .map((o) => ({
        folio: o['FOLIO OT'],
        sucursal: o.SUCURSAL ?? '',
        patente: o.PATENTE ?? '',
        asesor: o.ASESOR ?? '',
        rango: o.RANGO ?? '',
        repuestos: o.repuestos_actual,
      }))
    return NextResponse.json({ ok: true, filas })
  }

  if (vista === 'facturas') {
    const filas = ots
      .filter((o) => String(o.FOLIOS_FACT_CLIENTE ?? '').trim())
      .map((o) => ({
        folio: o['FOLIO OT'],
        sucursal: o.SUCURSAL ?? '',
        patente: o.PATENTE ?? '',
        asesor: o.ASESOR ?? '',
        neto: o.NETO ?? 0,
        factura: o.FOLIOS_FACT_CLIENTE ?? '',
        fechaFactura: o.FECHA_FACT_CLIENTE ?? '',
        anticipo: (o.anticipo as { total?: number } | undefined)?.total ?? 0,
        tieneSaldo: (o.anticipo as { tiene_saldo?: boolean } | undefined)?.tiene_saldo ?? false,
      }))
    return NextResponse.json({ ok: true, filas })
  }

  return NextResponse.json({ ok: false, motivo: 'Falta vista o folio.' }, { status: 400 })
}
