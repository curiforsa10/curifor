import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'
import { COLUMNAS_EDITABLES, type ColumnaEditable, type OT } from '@/lib/ots'

const DOC = 'datos_dashboard.json'

type Cambios = Record<string, Partial<Record<ColumnaEditable, string>>>

/**
 * Guarda ediciones de OTs.
 *
 * Mismo criterio que app.py: se relee el documento y se tocan SOLO las cuatro
 * columnas de gestion de las OT que el usuario edito. Todo lo demas queda como
 * venga en ese momento, incluido lo que otro haya guardado hace un segundo.
 * Con 2.043 OTs y varias personas trabajando a la vez, mandar el documento
 * entero garantiza pisarse.
 */
export async function POST(req: Request) {
  const usuario = await exigirUsuario('puede_control')

  let cambios: Cambios
  try {
    const body = (await req.json()) as { cambios?: Cambios }
    cambios = body.cambios ?? {}
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }

  const folios = Object.keys(cambios)
  if (folios.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'No se detectaron cambios para guardar.' }, { status: 400 })
  }

  const doc = await leerDocumento<{ ots?: OT[]; total_ots?: number; fecha_actualizacion?: string }>(DOC)
  if (!doc?.ots) {
    // No se pudo leer: NO se escribe. Guardar a ciegas aca significa reemplazar
    // 2.043 OTs por lo que tenga esta pestaña en memoria.
    return NextResponse.json(
      { ok: false, motivo: 'No se pudo leer el listado actual. No se guardó nada.' },
      { status: 502 },
    )
  }

  const sello = `${usuario.email} — ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`
  let aplicados = 0

  for (const ot of doc.ots) {
    const folio = String(ot['FOLIO OT'] ?? '').trim()
    const cambio = cambios[folio]
    if (!cambio) continue
    for (const [col, val] of Object.entries(cambio)) {
      // Lista blanca: aunque el cliente mande otra columna, no se toca.
      if (!COLUMNAS_EDITABLES.includes(col as ColumnaEditable)) continue
      ot[col] = String(val ?? '')
    }
    ot.ULTIMA_EDICION = sello
    aplicados++
  }

  if (aplicados === 0) {
    return NextResponse.json(
      { ok: false, motivo: 'Ninguno de los folios enviados existe en el listado.' },
      { status: 409 },
    )
  }

  const ok = await guardarDocumento(DOC, doc, `Edición de ${usuario.email}`)
  if (!ok) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo guardar. Intenta de nuevo.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, guardadas: aplicados })
}
