import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { leerSesion, buscarUsuario, esAdmin, COOKIE_SESION, type Usuario } from '@/lib/auth'

/**
 * Módulos de la app, con el permiso que los habilita (mismos flags que app.py).
 *
 * `pendiente` marca los que todavía no se migran desde Streamlit. Se muestran
 * apagados y sin enlace en vez de omitirlos: quien los usaba a diario necesita
 * ver que existen y que faltan, no que desaparecieron sin explicación.
 */
const MODULOS: Array<{
  href: string
  nombre: string
  detalle: string
  permiso: keyof Usuario
  pendiente?: boolean
}> = [
  { href: '/planificador', nombre: 'Planificador', detalle: 'Tablero de taller · pre-picking · producción', permiso: 'puede_planificador' },
  { href: '/control', nombre: 'Control de OTs', detalle: 'Órdenes pendientes, edición y análisis', permiso: 'puede_control' },
  { href: '/cuenta-ficha', nombre: 'Cuenta Ficha', detalle: 'Saldos e historial por cliente', permiso: 'puede_cuenta_ficha' },
  { href: '/informes', nombre: 'Informes de Gestión', detalle: 'Reportes AG e IMOP Ford', permiso: 'puede_cuenta_ficha' },
  { href: '/campanas', nombre: 'Campañas', detalle: 'Revisión Ford', permiso: 'puede_campanas' },
  { href: '/loaners', nombre: 'Loaners', detalle: 'Vehículos de cortesía', permiso: 'puede_loaners' },
  { href: '/indicadores', nombre: 'Indicadores', detalle: 'Power BI', permiso: 'puede_indicadores' },
  { href: '/cotizador', nombre: 'Cotizador', detalle: 'Mantenciones por modelo', permiso: 'puede_cotizador', pendiente: true },
]

export default async function Inicio() {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) redirect('/login')

  // Los permisos se releen en cada carga, no viajan en la cookie: si a alguien
  // le quitan un módulo, deja de verlo sin esperar a que expire la sesión.
  const usuario = await buscarUsuario(sesion.email)
  if (!usuario || usuario.activo === false) redirect('/login')

  const visibles = MODULOS.filter((m) => usuario[m.permiso] === true)
  const admin = esAdmin(usuario)

  return (
    <div className="min-h-dvh">
      <header className="border-b border-borde bg-azul-800 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="font-bold">Control y Gestión Post Venta</h1>
            <p className="text-azul-100">Curifor S.A</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-azul-100 sm:inline">
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

      <main className="mx-auto max-w-6xl px-4 py-6">
        {visibles.length === 0 ? (
          <p className="rounded-lg border border-borde bg-panel p-6 text-texto-suave">
            Tu cuenta no tiene módulos habilitados todavía. Pídele acceso a tu administrador.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((m) =>
              m.pendiente ? (
                <li
                  key={m.href}
                  className="rounded-lg border border-dashed border-borde-fuerte bg-panel-alt p-4"
                  aria-disabled="true"
                >
                  <span className="font-semibold text-texto-tenue">{m.nombre}</span>
                  <span className="mt-0.5 block text-texto-tenue">{m.detalle}</span>
                  <span className="mt-1 block text-texto-tenue">
                    Todavía en la app anterior — aún no migrado
                  </span>
                </li>
              ) : (
                <li key={m.href}>
                  <a
                    href={m.href}
                    className="block rounded-lg border border-borde bg-panel p-4
                               transition-colors duration-150 hover:border-azul-500"
                  >
                    <span className="font-semibold text-azul-800">{m.nombre}</span>
                    <span className="mt-0.5 block text-texto-suave">{m.detalle}</span>
                  </a>
                </li>
              ),
            )}
            {admin && (
              <li>
                <a
                  href="/admin"
                  className="block rounded-lg border border-azul-500 bg-panel p-4
                             transition-colors duration-150 hover:border-azul-700"
                >
                  <span className="font-semibold text-azul-800">Administración</span>
                  <span className="mt-0.5 block text-texto-suave">
                    Usuarios, permisos y auditoría
                  </span>
                </a>
              </li>
            )}
          </ul>
        )}
      </main>
    </div>
  )
}
