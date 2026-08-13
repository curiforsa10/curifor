import { NextResponse } from 'next/server'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'
import { FLOTA, CAMPOS_CLIENTE, estaAsignado, type Asignacion } from '@/lib/loaners'

const DOC = 'loaners.json'

/**
 * Guarda las asignaciones de loaners.
 *
 * La escritura va por el servidor a proposito: loaners.json no esta en la lista
 * blanca de tablero_documento_permitido(), asi que no es alcanzable con la clave
 * anon ni con un vale. Solo se toca con la service_role, que nunca sale de aca.
 *
 * Se relee el documento antes de escribir y se aplican solo los VIN que vienen
 * en el pedido. Si dos personas editan unidades distintas a la vez, ninguna pisa
 * a la otra — el patron de "mandar el documento entero" es justo lo que borraba
 * datos en la app vieja.
 */
export async function POST(req: Request) {
  const usuario = await exigirUsuario('puede_loaners')

  let cambios: Record<string, Asignacion>
  try {
    const body = (await req.json()) as { cambios?: Record<string, Asignacion> }
    cambios = body.cambios ?? {}
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }

  const vinsValidos = new Set(FLOTA.map((v) => v.vin))
  const entradas = Object.entries(cambios).filter(([vin]) => vinsValidos.has(vin))
  if (entradas.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'No hay cambios que guardar.' }, { status: 400 })
  }

  const actual = (await leerDocumento<{ loaners?: Record<string, Asignacion> }>(DOC)) ?? {}
  const loaners: Record<string, Asignacion> = { ...(actual.loaners ?? {}) }

  const sello = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  for (const [vin, entrante] of entradas) {
    const fila: Asignacion = { ...(loaners[vin] ?? {}), ...entrante }

    // Liberar una unidad borra los datos del cliente. Si se dejaran, la unidad
    // figura libre pero arrastra el prestamo anterior y los dias prestados
    // siguen creciendo.
    if (!estaAsignado(fila)) {
      for (const c of CAMPOS_CLIENTE) delete fila[c]
    }
    fila._editado_por = usuario.email
    fila._editado = sello
    loaners[vin] = fila
  }

  const ok = await guardarDocumento(DOC, { loaners }, `Loaners — ${usuario.email}`)
  if (!ok) {
    return NextResponse.json(
      { ok: false, motivo: 'No se pudo guardar. Intenta de nuevo.' },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true, guardados: entradas.length, editado: sello })
}
