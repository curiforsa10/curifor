import { NextResponse } from 'next/server'
import { buscarUsuario, verificarPassword, crearSesion, opcionesCookie, COOKIE_SESION } from '@/lib/auth'
import { supabaseConfigurado } from '@/lib/supabase'

/**
 * Login en UN paso (correo + contraseña juntos).
 *
 * La app de Streamlit lo hacia en dos: primero el correo y despues la clave.
 * Eso filtraba que cuentas existen, y sobre todo ofrecia "Primera vez — crea tu
 * contraseña personal" a CUALQUIER correo @curifor.com que no estuviera
 * registrado, sin verificar que la persona existiera ni mandar confirmacion.
 * Con la app publica, eso alcanzaba para que un desconocido se creara una
 * cuenta. Aca no hay auto-registro: las cuentas las crea un administrador.
 *
 * Por el mismo motivo la respuesta de error es siempre la misma, exista o no el
 * correo.
 */
export async function POST(req: Request) {
  if (!supabaseConfigurado()) {
    return NextResponse.json(
      { ok: false, motivo: 'Falta configurar SUPABASE_URL y SUPABASE_SERVICE_KEY.' },
      { status: 503 },
    )
  }

  let email = ''
  let password = ''
  try {
    const body = (await req.json()) as { email?: string; password?: string }
    email = (body.email ?? '').trim().toLowerCase()
    password = body.password ?? ''
  } catch {
    return NextResponse.json({ ok: false, motivo: 'Solicitud invalida.' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ ok: false, motivo: 'Ingresa tu correo y tu contraseña.' }, { status: 400 })
  }
  if (!email.endsWith('@curifor.com')) {
    return NextResponse.json({ ok: false, motivo: 'Solo cuentas @curifor.com.' }, { status: 400 })
  }

  const usuario = await buscarUsuario(email)
  const credencialesOk =
    usuario != null &&
    usuario.activo !== false &&
    verificarPassword(password, usuario.password_hash ?? '', usuario.salt ?? '')

  if (!usuario || !credencialesOk) {
    // Mismo mensaje exista o no la cuenta: no se confirma quien esta registrado.
    return NextResponse.json({ ok: false, motivo: 'Correo o contraseña incorrectos.' }, { status: 401 })
  }

  const res = NextResponse.json({
    ok: true,
    usuario: {
      email: usuario.email,
      nombre: usuario.nombre,
      sucursal_home: usuario.sucursal_home ?? '',
      debe_cambiar_password: usuario.temp_pwd === true,
    },
  })
  res.cookies.set(COOKIE_SESION, crearSesion(usuario), opcionesCookie)
  return res
}
