import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'

const DOC = 'comentarios_log.json'

type Comentario = { folio_ot?: string; autor?: string; fecha?: string; comentario?: string }

/** Agrega un comentario a una OT. El autor lo pone el servidor, no el cliente. */
export async function POST(req: Request) {
  const usuario = await exigirUsuario('puede_control')

  let folio = ''
  let texto = ''
  try {
    const b = (await req.json()) as { folio?: string; comentario?: string }
    folio = (b.folio ?? '').trim()
    texto = (b.comentario ?? '').trim()
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }
  if (!folio || !texto) {
    return NextResponse.json({ ok: false, motivo: 'Falta el folio o el comentario.' }, { status: 400 })
  }
  if (texto.length > 2000) {
    return NextResponse.json({ ok: false, motivo: 'El comentario es demasiado largo.' }, { status: 400 })
  }

  const doc = await leerDocumento<{ comentarios?: Comentario[] }>(DOC)
  if (!doc?.comentarios) {
    // Sin lectura no se escribe: reemplazar el log por un solo comentario
    // borraría el historial completo.
    return NextResponse.json({ ok: false, motivo: 'No se pudo leer el historial.' }, { status: 502 })
  }

  const nuevo: Comentario = {
    folio_ot: folio,
    autor: usuario.email,
    fecha: new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
    comentario: texto,
  }
  doc.comentarios.push(nuevo)

  const ok = await guardarDocumento(DOC, doc, `Comentario en OT ${folio} — ${usuario.email}`)
  if (!ok) return NextResponse.json({ ok: false, motivo: 'No se pudo guardar.' }, { status: 502 })
  return NextResponse.json({ ok: true, comentario: nuevo })
}
