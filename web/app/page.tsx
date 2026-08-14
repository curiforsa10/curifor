import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { leerSesion, buscarUsuario, esAdmin, ADMIN_EMAIL, COOKIE_SESION, type Usuario } from '@/lib/auth'
import {
  IconoPlanificador, IconoControl, IconoCuentaFicha, IconoInformes, IconoCampanas,
  IconoLoaners, IconoIndicadores, IconoAsistente, IconoAdmin, IconoAnalisis,
  IconoCotizador, IconoSinAcceso,
} from '@/components/iconos'

export const dynamic = 'force-dynamic'

type Modulo = {
  href: string
  nombre: string
  detalle: string
  permiso?: keyof Usuario
  Icono: (p: { className?: string }) => React.ReactElement
  /** Todavía no migrado desde Streamlit. */
  pendiente?: boolean
  /** Solo lo ve el administrador. */
  soloAdmin?: boolean
}

const MODULOS: Modulo[] = [
  { href: '/planificador', nombre: 'Planificador', detalle: 'Tablero de taller, pre-picking y producción', permiso: 'puede_planificador', Icono: IconoPlanificador },
  { href: '/control', nombre: 'Control de OTs', detalle: 'Órdenes pendientes, edición y análisis', permiso: 'puede_control', Icono: IconoControl },
  { href: '/cuenta-ficha', nombre: 'Cuenta Ficha', detalle: 'Saldos e historial por cliente', permiso: 'puede_cuenta_ficha', Icono: IconoCuentaFicha },
  { href: '/informes', nombre: 'Informes de Gestión', detalle: 'Reportes AG e IMOP Ford', permiso: 'puede_cuenta_ficha', Icono: IconoInformes },
  { href: '/campanas', nombre: 'Campañas', detalle: 'Revisión de campañas Ford', permiso: 'puede_campanas', Icono: IconoCampanas },
  { href: '/loaners', nombre: 'Loaners', detalle: 'Flota de vehículos de cortesía', permiso: 'puede_loaners', Icono: IconoLoaners },
  { href: '/indicadores', nombre: 'Indicadores', detalle: 'Informe de Power BI', permiso: 'puede_indicadores', Icono: IconoIndicadores },
  { href: '/asistente', nombre: 'Asistente App', detalle: 'Consulta por lote de patentes o folios', permiso: 'puede_asistente_app', Icono: IconoAsistente },
  { href: '/analisis', nombre: 'Análisis de Gestión', detalle: 'Evolución de cierres', Icono: IconoAnalisis, soloAdmin: true },
  { href: '/admin', nombre: 'Administración', detalle: 'Usuarios, permisos y auditoría', Icono: IconoAdmin, soloAdmin: true },
  { href: '/cotizador', nombre: 'Cotizador', detalle: 'Mantenciones por marca y modelo', permiso: 'puede_cotizador', Icono: IconoCotizador, pendiente: true },
]

export default async function Inicio() {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) redirect('/login')

  // Los permisos se releen en cada carga, no viajan en la cookie: si a alguien
  // le quitan un módulo, deja de verlo sin esperar a que expire la sesión.
  const usuario = await buscarUsuario(sesion.email)
  if (!usuario || usuario.activo === false) redirect('/login')
  const admin = esAdmin(usuario)

  // El administrador ve todo. Para el resto se separa lo que puede usar de lo
  // que existe pero no tiene habilitado: ocultarlo hacía parecer que la
  // plataforma tenía menos módulos de los que tiene.
  const puede = (m: Modulo) =>
    admin || (m.soloAdmin ? false : m.permiso ? usuario[m.permiso] === true : true)

  const disponibles = MODULOS.filter((m) => puede(m) && !m.pendiente)
  const sinAcceso = MODULOS.filter((m) => !puede(m) && !m.pendiente)
  const pendientes = MODULOS.filter((m) => m.pendiente)

  return (
    <div className="min-h-dvh">
      <header className="border-b border-borde bg-azul-800 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-curifor.jpg" alt="Curifor" className="h-8 w-auto rounded" />
            <div>
              <h1 className="font-bold leading-tight">Control y Gestión Post Venta</h1>
              <p className="text-azul-100">Curifor S.A</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-azul-100">{usuario.nombre}</span>
              <span className="block text-azul-100">
                {usuario.sucursal_home || (usuario.sucursales_permitidas ?? []).join(', ') || 'Todas las sucursales'}
              </span>
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

      {/* La portada respira: la densidad alta es para las tablas, no para acá. */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {admin && (
          <p className="mb-5 rounded-lg border border-azul-100 bg-azul-100/40 px-4 py-2.5 text-azul-800">
            Estás como administrador: ves todos los módulos, sin importar tus permisos.
          </p>
        )}

        <Grilla modulos={disponibles} />

        {sinAcceso.length > 0 && (
          <>
            <h2 className="mt-8 mb-1 font-semibold text-texto-suave">Sin acceso</h2>
            <p className="mb-3 text-texto-tenue">
              Existen en la plataforma pero tu cuenta no los tiene habilitados. Pedíselos a
              {' '}<a href={`mailto:${ADMIN_EMAIL}`} className="text-azul-700 hover:underline">{ADMIN_EMAIL}</a>.
            </p>
            <Grilla modulos={sinAcceso} apagado />
          </>
        )}

        {pendientes.length > 0 && (
          <>
            <h2 className="mt-8 mb-1 font-semibold text-texto-suave">Todavía en la app anterior</h2>
            <p className="mb-3 text-texto-tenue">
              Aún no migrados. Se siguen usando desde la aplicación de Streamlit.
            </p>
            <Grilla modulos={pendientes} apagado />
          </>
        )}
      </main>
    </div>
  )
}

function Grilla({ modulos, apagado = false }: { modulos: Modulo[]; apagado?: boolean }) {
  if (modulos.length === 0) return null
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {modulos.map((m) => {
        const Icono = apagado ? IconoSinAcceso : m.Icono
        const contenido = (
          <>
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                apagado ? 'bg-panel-alt text-texto-tenue' : 'bg-azul-100 text-azul-700'
              }`}
            >
              <Icono className="size-5" />
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold ${apagado ? 'text-texto-tenue' : 'text-azul-800'}`}>
                {m.nombre}
              </span>
              <span className="mt-0.5 block text-texto-suave">{m.detalle}</span>
            </span>
          </>
        )
        return (
          <li key={m.href}>
            {apagado ? (
              <div
                className="flex h-full items-start gap-3 rounded-xl border border-dashed
                           border-borde-fuerte bg-panel-alt p-4"
                aria-disabled="true"
              >
                {contenido}
              </div>
            ) : (
              <a
                href={m.href}
                className="flex h-full items-start gap-3 rounded-xl border border-borde bg-panel p-4
                           shadow-sm transition-all duration-150
                           hover:-translate-y-0.5 hover:border-azul-500 hover:shadow-md"
              >
                {contenido}
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
