import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { leerSesion, buscarUsuario, COOKIE_SESION, type Usuario } from './auth'

/**
 * Guardia de las paginas de modulo. Devuelve el usuario o corta con redirect.
 *
 * Los permisos se releen de la base en cada carga, no viajan en la cookie: si a
 * alguien le quitan un modulo, deja de entrar de inmediato en vez de esperar a
 * que expire la sesion.
 */
export async function exigirUsuario(permiso?: keyof Usuario): Promise<Usuario> {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) redirect('/login')

  const usuario = await buscarUsuario(sesion.email)
  if (!usuario || usuario.activo === false) redirect('/login')
  if (permiso && usuario[permiso] !== true) redirect('/')

  return usuario
}
