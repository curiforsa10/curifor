'use client'

import { useState } from 'react'

export type Registro = {
  fecha?: string
  total_cerradas?: number
  total_nuevas?: number
  total_activas?: number
  ots_cerradas?: Array<Record<string, unknown>>
}

export default function Evolucion({ registros }: { registros: Registro[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)

  const cerradas = registros.reduce((s, r) => s + (r.total_cerradas ?? 0), 0)
  const nuevas = registros.reduce((s, r) => s + (r.total_nuevas ?? 0), 0)
  const activas = registros[0]?.total_activas ?? 0
  const maxActivas = Math.max(...registros.map((r) => r.total_activas ?? 0), 1)

  return (
    <>
      <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['Actualizaciones', registros.length],
          ['OT cerradas', cerradas],
          ['OT nuevas', nuevas],
          ['Activas hoy', activas],
        ] as const).map(([t, v]) => (
          <li key={t} className="rounded-lg border border-borde bg-panel px-3 py-2">
            <span className="text-texto-suave">{t}</span>
            <strong className="tabular block text-xl">{v.toLocaleString('es-CL')}</strong>
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-azul-800 text-left text-white">
              {['Fecha', 'Cerradas', 'Nuevas', 'Activas', 'Carga'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.map((r, i) => {
              const previo = registros[i + 1]
              const delta = previo ? (r.total_activas ?? 0) - (previo.total_activas ?? 0) : null
              const esteAbierto = abierto === r.fecha
              const detalle = r.ots_cerradas ?? []
              return (
                <tr key={`${r.fecha}-${i}`} className="border-t border-borde align-top">
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {detalle.length ? (
                      <button
                        type="button"
                        onClick={() => setAbierto(esteAbierto ? null : (r.fecha ?? null))}
                        aria-expanded={esteAbierto}
                        className="tabular cursor-pointer text-azul-700 hover:underline"
                      >
                        {r.fecha} ({detalle.length})
                      </button>
                    ) : (
                      <span className="tabular">{r.fecha}</span>
                    )}
                    {esteAbierto && (
                      <ul className="tabular mt-1 max-h-40 overflow-y-auto text-texto-tenue">
                        {detalle.slice(0, 60).map((o, j) => (
                          <li key={j}>
                            {String(o['FOLIO OT'] ?? o.folio ?? '—')} · {String(o.SUCURSAL ?? '')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right text-exito">
                    {(r.total_cerradas ?? 0).toLocaleString('es-CL')}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">
                    {(r.total_nuevas ?? 0).toLocaleString('es-CL')}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">
                    {(r.total_activas ?? 0).toLocaleString('es-CL')}
                    {/* La variación contra la corrida anterior es el dato que se
                        busca acá: si la deuda de OT sube o baja. */}
                    {delta !== null && delta !== 0 && (
                      <span className={delta > 0 ? ' text-peligro' : ' text-exito'}>
                        {' '}{delta > 0 ? '+' : ''}{delta}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {/* Barra proporcional en vez de un gráfico: se lee igual y no
                        agrega una dependencia para 13 filas. */}
                    <span
                      className="block h-2 rounded-full bg-azul-500"
                      style={{ width: `${Math.round(((r.total_activas ?? 0) / maxActivas) * 100)}%` }}
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-texto-tenue">
        La fecha se puede abrir para ver qué OT se cerraron en esa actualización.
      </p>
    </>
  )
}
