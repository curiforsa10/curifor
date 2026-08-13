import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'
import { leerCuentaFicha, type Revisado } from '@/lib/cuenta-ficha'

const DOC = 'cuenta_ficha_revisados.json'

/**
 * GET  ?rut=…  detalle de un cliente (movimientos y OT).
 *
 * El listado viaja sin esta parte porque son 1,8 MB para 870 clientes. Se pide
 * al abrir uno, que es cuando hace falta.
 */
export async function GET(req: Request) {
  await exigirUsuario('puede_cuenta_ficha')
  const rut = new URL(req.url).searchParams.get('rut')?.trim()
  if (!rut) return NextResponse.json({ ok: false, motivo: 'Falta el rut.' }, { status: 400 })

  const { clientes } = await leerCuentaFicha()
  const c = clientes.find((x) => x.rut === rut)
  if (!c) return NextResponse.json({ ok: false, motivo: 'Cliente no encontrado.' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    movimientos: c.movimientos ?? [],
    ots: c.ots ?? [],
    patentes: c.patentes ?? [],
  })
}

/** POST  marca o desmarca un cliente como revisado. La marca es compartida. */
export async function POST(req: Request) {
  const usuario = await exigirUsuario('puede_cuenta_ficha')

  let rut = ''
  let nota = ''
  let quitar = false
  try {
    const b = (await req.json()) as { rut?: string; nota?: string; quitar?: boolean }
    rut = (b.rut ?? '').trim()
    nota = (b.nota ?? '').trim()
    quitar = b.quitar === true
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }
  if (!rut) return NextResponse.json({ ok: false, motivo: 'Falta el rut.' }, { status: 400 })

  const doc = await leerDocumento<{ revisados?: Record<string, Revisado> }>(DOC)
  const revisados: Record<string, Revisado> = { ...(doc?.revisados ?? {}) }

  if (quitar) {
    delete revisados[rut]
  } else {
    revisados[rut] = {
      usuario: usuario.email,
      fecha: new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      nota,
    }
  }

  const ok = await guardarDocumento(DOC, { revisados }, `Cuenta Ficha — ${usuario.email}`)
  if (!ok) return NextResponse.json({ ok: false, motivo: 'No se pudo guardar.' }, { status: 502 })
  return NextResponse.json({ ok: true, revisado: quitar ? null : revisados[rut] })
}
