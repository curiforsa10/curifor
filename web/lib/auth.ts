/**
 * Autenticacion. Server-only: nada de este archivo debe importarse desde un
 * componente cliente.
 *
 * Las cuentas siguen viviendo en el documento `usuarios_curifor.json`, con el
 * MISMO esquema de hash que usa la app de Streamlit (PBKDF2-SHA256, 100.000
 * iteraciones, salt en hexadecimal usado como texto). Se verifico que Node y
 * Python producen el mismo hash, de modo que las 64 cuentas entran con su
 * contraseña actual y no hace falta ningun reseteo.
 *
 * La sesion es una cookie httpOnly firmada con HMAC-SHA256. No se guarda estado
 * en el servidor, que es lo que permite correr en funciones serverless.
 */
import crypto from 'node:crypto'
import { leerDocumento } from './supabase'

export const COOKIE_SESION = 'curifor_sesion'
const HORAS_SESION = 12

/**
 * Quién entra a Administración. En app.py estaba escrito a mano en el código;
 * acá sale de una variable para poder cambiarlo sin tocar el fuente (y para
 * poder probarlo). El default es el mismo de siempre.
 */
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'cjerez@curifor.com').toLowerCase()

export function esAdmin(u: Usuario | null | undefined): boolean {
  return Boolean(u && (u.email ?? '').toLowerCase() === ADMIN_EMAIL)
}

export type Usuario = {
  email: string
  nombre: string
  activo: boolean
  temp_pwd?: boolean
  creado?: string
  ultimo_login?: string
  sucursal_home?: string
  sucursales_permitidas?: string[]
  password_hash?: string
  salt?: string
  puede_planificador?: boolean
  puede_editar_planificador?: boolean
  puede_prepicking?: boolean
  puede_control?: boolean
  puede_cotizador?: boolean
  puede_campanas?: boolean
  puede_cuenta_ficha?: boolean
  puede_indicadores?: boolean
  puede_loaners?: boolean
  puede_recepcion?: boolean
  puede_agenda_taller?: boolean
  puede_asistente_app?: boolean
  puede_confirmar_citas?: boolean
  puede_disponibilidad_tecnicos?: boolean
}

/** Lo que viaja en la cookie. Deliberadamente minimo. */
export type Sesion = {
  email: string
  nombre: string
  exp: number
}

// ---------------------------------------------------------------- contraseñas

/**
 * Equivalente exacto de _hash_pwd() de app.py:
 *   hashlib.pbkdf2_hmac("sha256", password.utf8, salt.utf8, 100_000).hex()
 * El salt se usa como TEXTO (la cadena hexadecimal), no como bytes decodificados.
 */
export function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(salt, 'utf8'), 100_000, 32, 'sha256')
    .toString('hex')
}

export function verificarPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false
  const calculado = Buffer.from(hashPassword(password, salt), 'hex')
  const guardado = Buffer.from(hash, 'hex')
  // timingSafeEqual exige el mismo largo; si difieren, ya no coincide.
  if (calculado.length !== guardado.length) return false
  return crypto.timingSafeEqual(calculado, guardado)
}

// ---------------------------------------------------------------- usuarios

export async function leerUsuarios(): Promise<Usuario[]> {
  const doc = await leerDocumento<{ usuarios?: Usuario[] }>('usuarios_curifor.json')
  return doc?.usuarios ?? []
}

export async function buscarUsuario(email: string): Promise<Usuario | null> {
  const buscado = (email ?? '').trim().toLowerCase()
  if (!buscado) return null
  const usuarios = await leerUsuarios()
  return usuarios.find((u) => (u.email ?? '').trim().toLowerCase() === buscado) ?? null
}

// ---------------------------------------------------------------- sesion

function secretoSesion(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('Falta SESSION_SECRET')
  return s
}

function firmar(datos: string): string {
  return crypto.createHmac('sha256', secretoSesion()).update(datos).digest('base64url')
}

export function crearSesion(u: Usuario): string {
  const sesion: Sesion = {
    email: u.email,
    nombre: u.nombre,
    exp: Date.now() + HORAS_SESION * 3600 * 1000,
  }
  const cuerpo = Buffer.from(JSON.stringify(sesion), 'utf8').toString('base64url')
  return `${cuerpo}.${firmar(cuerpo)}`
}

/** Sesion valida, o null si la firma no calza o expiro. */
export function leerSesion(cookie: string | undefined): Sesion | null {
  if (!cookie) return null
  const corte = cookie.lastIndexOf('.')
  if (corte < 1) return null
  const cuerpo = cookie.slice(0, corte)
  const firma = cookie.slice(corte + 1)

  const esperada = Buffer.from(firmar(cuerpo))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length) return null
  if (!crypto.timingSafeEqual(esperada, recibida)) return null

  try {
    const s = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Sesion
    return s.exp > Date.now() ? s : null
  } catch {
    return null
  }
}

export const opcionesCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: HORAS_SESION * 3600,
}
