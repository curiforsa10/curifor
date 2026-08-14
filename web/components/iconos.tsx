/**
 * Iconos de los módulos. SVG en línea, no una librería: son diez, y traer un
 * paquete de iconos completo para eso agrega peso al bundle sin ganar nada.
 * Estilo contorno, 1,5 de trazo, en una caja de 24 para que se vean parejos.
 */
type Props = { className?: string }

function Svg({ children, className }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Calendario con marcas: el tablero de 5 días. */
export const IconoPlanificador = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="M7.5 14h3M13.5 14h3M7.5 17.5h3" />
  </Svg>
)

/** Lista con verificación: órdenes que se revisan y se cierran. */
export const IconoControl = (p: Props) => (
  <Svg {...p}>
    <path d="M8 5h11M8 12h11M8 19h11" />
    <path d="m3 4.5 1.2 1.2L6.5 3.4M3 11.5l1.2 1.2 2.3-2.3M3 18.5l1.2 1.2 2.3-2.3" />
  </Svg>
)

/** Documento con moneda: saldos por cliente. */
export const IconoCuentaFicha = (p: Props) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <circle cx="12" cy="14.5" r="2.5" />
    <path d="M12 12.6v3.8" />
  </Svg>
)

/** Barras: reportes de gestión. */
export const IconoInformes = (p: Props) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <rect x="5" y="12" width="3.5" height="6" rx="1" />
    <rect x="10.2" y="7" width="3.5" height="11" rx="1" />
    <rect x="15.5" y="3.5" width="3.5" height="14.5" rx="1" />
  </Svg>
)

/** Banderín: campañas de la marca. */
export const IconoCampanas = (p: Props) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4.5h11l-2.2 3.4L16 11.5H5z" />
  </Svg>
)

/** Vehículo: flota de cortesía. */
export const IconoLoaners = (p: Props) => (
  <Svg {...p}>
    <path d="M4 16.5h16M5.5 16.5V19a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2.5M21.5 16.5V19a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2.5" />
    <path d="M3 16.5v-3.2a2 2 0 0 1 .35-1.13L6 8h12l2.65 4.17A2 2 0 0 1 21 13.3v3.2z" />
    <path d="M6.5 13h2M15.5 13h2" />
  </Svg>
)

/** Tendencia: indicadores. */
export const IconoIndicadores = (p: Props) => (
  <Svg {...p}>
    <path d="M3 20h18" />
    <path d="m4 15.5 4.5-5 3.5 3 6-7.5" />
    <path d="M18 6h3v3" />
  </Svg>
)

/** Lupa sobre lista: consulta por lote. */
export const IconoAsistente = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6h9M4 10h6M4 14h5" />
    <circle cx="15.5" cy="14.5" r="4" />
    <path d="m18.6 17.6 2.4 2.4" />
  </Svg>
)

/** Escudo: administración. */
export const IconoAdmin = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6z" />
    <path d="m9.2 12.2 2 2 3.6-4" />
  </Svg>
)

/** Curva ascendente con puntos: análisis en el tiempo. */
export const IconoAnalisis = (p: Props) => (
  <Svg {...p}>
    <path d="M3 20h18" />
    <path d="M5 16c3-1 4-7 7-7s4 4 7 2" />
    <circle cx="5" cy="16" r="1.2" />
    <circle cx="12" cy="9" r="1.2" />
    <circle cx="19" cy="11" r="1.2" />
  </Svg>
)

/** Calculadora: cotizador. */
export const IconoCotizador = (p: Props) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8" />
    <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01" />
  </Svg>
)

/** Candado: módulo al que no se tiene acceso. */
export const IconoSinAcceso = (p: Props) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
)
