import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'

const DOC = 'notificaciones.json'

type Notificacion = { id?: string; destinatario?: string; leida?: boolean }

/**
 * Marca notificaciones como leidas.
 *
 * Solo toca las del propio usuario: el id llega del cliente, asi que sin ese
 * filtro cualquiera podria marcar las de otro mandando ids ajenos.
 */
export async function POST(req: Request) {
  const usuario = await exigirUsuario('puede_control')

  let ids: string[]
  try {
    const body = (await req.json()) as { ids?: string[] }
    ids = (body.ids ?? []).filter(Boolean)
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'No hay notificaciones que marcar.' }, { status: 400 })
  }

  const doc = await leerDocumento<{ notificaciones?: Notificacion[] }>(DOC)
  if (!doc?.notificaciones) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo leer las notificaciones.' }, { status: 502 })
  }

  const mias = new Set(ids)
  const correo = usuario.email.toLowerCase()
  let marcadas = 0
  for (const n of doc.notificaciones) {
    if (!n.id || !mias.has(n.id)) continue
    if ((n.destinatario ?? '').toLowerCase() !== correo) continue
    if (n.leida) continue
    n.leida = true
    marcadas++
  }

  if (marcadas === 0) return NextResponse.json({ ok: true, marcadas: 0 })

  const ok = await guardarDocumento(DOC, doc, `Notificaciones leídas — ${usuario.email}`)
  if (!ok) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo guardar.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, marcadas })
}
