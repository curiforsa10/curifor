import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'

export const dynamic = 'force-dynamic'

const PAGINAS = [
  '1 · Post Venta General',
  '2 · Servicio Técnico',
  '3 · DyP',
  '4 · Avance Facturación',
  '5 · Venta Repuestos',
  '6 · Pronóstico Ventas',
]

export default async function Indicadores() {
  const usuario = await exigirUsuario('puede_indicadores')
  const url = (process.env.PBI_INDICADORES_URL ?? '').trim()

  return (
    <Marco
      titulo="Indicadores Post Venta"
      bajada="Avances de facturación · Power BI en tiempo real"
      usuario={usuario}
      ancho="completo"
    >
      {!url ? (
        // Antes esto quedaba en pantalla en blanco sin explicar por que.
        <div className="rounded-lg border border-borde bg-panel p-6">
          <h2 className="font-semibold">El informe no está configurado</h2>
          <p className="mt-2 text-texto-suave">
            Falta la variable <code className="font-mono">PBI_INDICADORES_URL</code> con la
            dirección del informe publicado de Power BI. Se carga en Vercel, en{' '}
            <em>Settings → Environment Variables</em>.
          </p>
        </div>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-2">
            {PAGINAS.map((p) => (
              <li
                key={p}
                className="rounded-full border border-borde bg-panel-alt px-3 py-1 text-texto-suave"
              >
                {p}
              </li>
            ))}
          </ul>
          <p className="mb-2 text-texto-tenue">
            Navega entre páginas con las flechas o el menú inferior del informe.
          </p>
          <div className="overflow-hidden rounded-lg border border-borde bg-panel">
            <iframe
              src={url}
              title="Indicadores Post Venta"
              className="h-[calc(100dvh-230px)] min-h-[520px] w-full"
              allowFullScreen
            />
          </div>
        </>
      )}
    </Marco>
  )
}
