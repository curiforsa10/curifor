import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { leerSesion, buscarUsuario, hashPassword, esAdmin, ADMIN_EMAIL, COOKIE_SESION, type Usuario } from '@/lib/auth'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'

const DOC = 'usuarios_curifor.json'

/** Los 15 flags que el admin puede tocar. Lista blanca: nada fuera de acá se
 *  escribe, aunque el cliente lo mande. */
const PERMISOS = [
  'puede_planificador', 'puede_editar_planificador', 'puede_prepicking', 'puede_control',
  'puede_cotizador', 'puede_campanas', 'puede_cuenta_ficha', 'puede_informes_gestion',
  'puede_indicadores', 'puede_loaners', 'puede_recepcion', 'puede_agenda_taller',
  'puede_asistente_app', 'puede_confirmar_citas', 'puede_disponibilidad_tecnicos',
] as const

/** Solo el admin entra acá. Devuelve su usuario o null. */
async function exigirAdmin(): Promise<Usuario | null> {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) return null
  const u = await buscarUsuario(sesion.email)
  if (!u || u.activo === false) return null
  return esAdmin(u) ? u : null
}

type Accion =
  | { tipo: 'activo'; email: string; valor: boolean }
  | { tipo: 'permiso'; email: string; permiso: string; valor: boolean }
  | { tipo: 'sucursales'; email: string; sucursales: string[] }
  | { tipo: 'reset'; email: string }

export async function POST(req: Request) {
  const admin = await exigirAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, motivo: 'Solo el administrador.' }, { status: 403 })
  }

  let accion: Accion
  try {
    accion = (await req.json()) as Accion
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }

  const doc = await leerDocumento<{ usuarios?: Usuario[] }>(DOC)
  if (!doc?.usuarios) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo leer los usuarios.' }, { status: 502 })
  }

  const correo = (accion.email ?? '').trim().toLowerCase()
  const u = doc.usuarios.find((x) => (x.email ?? '').trim().toLowerCase() === correo)
  if (!u) return NextResponse.json({ ok: false, motivo: 'Usuario no encontrado.' }, { status: 404 })

  let claveTemporal: string | undefined

  switch (accion.tipo) {
    case 'activo':
      // El admin no puede desactivarse a sí mismo: quedaría nadie con acceso
      // a esta pantalla y habría que arreglarlo a mano en la base.
      if (correo === ADMIN_EMAIL && accion.valor === false) {
        return NextResponse.json(
          { ok: false, motivo: 'No puedes desactivar tu propia cuenta de administrador.' },
          { status: 400 },
        )
      }
      u.activo = accion.valor
      break

    case 'permiso':
      if (!PERMISOS.includes(accion.permiso as (typeof PERMISOS)[number])) {
        return NextResponse.json({ ok: false, motivo: 'Permiso desconocido.' }, { status: 400 })
      }
      ;(u as Record<string, unknown>)[accion.permiso] = accion.valor
      break

    case 'sucursales':
      u.sucursales_permitidas = (accion.sucursales ?? []).map((s) => s.trim()).filter(Boolean)
      break

    case 'reset': {
      // Clave temporal legible pero no adivinable, y marcada como temporal.
      claveTemporal = `Curifor${crypto.randomInt(1000, 9999)}`
      const salt = crypto.randomBytes(16).toString('hex')
      u.salt = salt
      u.password_hash = hashPassword(claveTemporal, salt)
      u.temp_pwd = true
      break
    }

    default:
      return NextResponse.json({ ok: false, motivo: 'Acción desconocida.' }, { status: 400 })
  }

  const ok = await guardarDocumento(DOC, doc, `Admin ${accion.tipo} — ${admin.email}`)
  if (!ok) return NextResponse.json({ ok: false, motivo: 'No se pudo guardar.' }, { status: 502 })
  return NextResponse.json({ ok: true, claveTemporal })
}
