import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { leerDocumento, guardarDocumento } from '@/lib/supabase'
import { hashPassword, type Usuario } from '@/lib/auth'

const DOC = 'usuarios_curifor.json'

/**
 * Crear cuenta.
 *
 * La cuenta se crea DESACTIVADA y sin ningún permiso. El administrador la
 * habilita desde Administración.
 *
 * En Streamlit el alta era inmediata: cualquiera que escribiera un correo
 * @curifor.com no registrado veía "Primera vez — crea tu contraseña" y entraba,
 * sin que nadie verificara que esa persona existiera. Con la app publicada en
 * internet, eso alcanza para que un desconocido se cree un usuario. Así el
 * flujo sigue siendo cómodo (la persona se registra sola) pero el acceso lo da
 * alguien.
 */
export async function POST(req: Request) {
  let email = ''
  let nombre = ''
  let password = ''
  try {
    const b = (await req.json()) as { email?: string; nombre?: string; password?: string }
    email = (b.email ?? '').trim().toLowerCase()
    nombre = (b.nombre ?? '').trim()
    password = b.password ?? ''
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud inválida.' }, { status: 400 })
  }

  if (!email.endsWith('@curifor.com')) {
    return NextResponse.json({ ok: false, motivo: 'Solo cuentas @curifor.com.' }, { status: 400 })
  }
  if (!nombre) {
    return NextResponse.json({ ok: false, motivo: 'Escribe tu nombre.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, motivo: 'La contraseña debe tener al menos 8 caracteres.' },
      { status: 400 },
    )
  }

  const doc = await leerDocumento<{ usuarios?: Usuario[] }>(DOC)
  if (!doc?.usuarios) {
    return NextResponse.json({ ok: false, motivo: 'No se pudo leer los usuarios.' }, { status: 502 })
  }

  const yaExiste = doc.usuarios.some((u) => (u.email ?? '').trim().toLowerCase() === email)
  if (yaExiste) {
    // Mismo mensaje que el alta correcta: si dijera "ya existe", esto serviría
    // para averiguar qué correos están registrados.
    return NextResponse.json({ ok: true, pendiente: true })
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const ahora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  doc.usuarios.push({
    email,
    nombre,
    activo: false, // el administrador la habilita
    password_hash: hashPassword(password, salt),
    salt,
    temp_pwd: false,
    creado: ahora,
    sucursales_permitidas: [],
  })

  const ok = await guardarDocumento(DOC, doc, `Alta pendiente: ${email}`)
  if (!ok) return NextResponse.json({ ok: false, motivo: 'No se pudo crear la cuenta.' }, { status: 502 })
  return NextResponse.json({ ok: true, pendiente: true })
}
