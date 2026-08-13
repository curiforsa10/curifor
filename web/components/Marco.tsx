import Link from 'next/link'
import type { Usuario } from '@/lib/auth'

/**
 * Marco comun de los modulos: encabezado, identidad y salida.
 *
 * En Streamlit cada modulo repetia su propio sidebar con el logo, el boton de
 * volver, el usuario y el de cerrar sesion — unas 30 lineas calcadas por modulo,
 * y cada una con su propia `key` para que Streamlit no las confundiera. Aca eso
 * vive una sola vez.
 */
export default function Marco({
  titulo,
  bajada,
  usuario,
  children,
  ancho = 'normal',
}: {
  titulo: string
  bajada?: string
  usuario: Usuario
  children: React.ReactNode
  /** 'completo' para tableros y tablas anchas; 'normal' para el resto. */
  ancho?: 'normal' | 'completo'
}) {
  const contenedor = ancho === 'completo' ? 'w-full px-4' : 'mx-auto max-w-6xl px-4'
  return (
    <div className="min-h-dvh">
      <header className="border-b border-borde bg-azul-800 text-white">
        <div className={`${contenedor} flex items-center justify-between gap-4 py-2.5`}>
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="shrink-0 rounded px-1.5 py-1 transition-colors duration-150 hover:bg-azul-700"
              aria-label="Volver al inicio"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-curifor.jpg" alt="Curifor" className="h-7 w-auto rounded-sm" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-bold leading-tight">{titulo}</h1>
              {bajada && <p className="truncate text-azul-100">{bajada}</p>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-azul-100 md:inline">
              {usuario.nombre}
              {usuario.sucursal_home ? ` · ${usuario.sucursal_home}` : ''}
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="min-h-11 cursor-pointer rounded-md border border-azul-500 px-3
                           transition-colors duration-150 hover:bg-azul-700"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className={`${contenedor} py-4`}>{children}</main>
    </div>
  )
}
