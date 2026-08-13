'use client'

import { useMemo, useState } from 'react'

export type Campana = {
  sucursal?: string
  fecha_programacion?: string
  hora?: string
  asesor?: string
  modelo?: string
  patente?: string
  chasis?: string
  propietario?: string
  servicio?: string
  campanas?: string
  orden_servicio?: string
  revisado?: string
  estado_color?: 'rojo' | 'azul' | 'amarillo' | 'verde' | string
  estado_texto?: string
  recall_obligatorio?: boolean
  recall_codigos?: string
  fecha_cierre?: string
}

/** Mismo orden de prioridad que la tabla de Streamlit: lo urgente primero. */
const ESTADOS = [
  { color: 'rojo', texto: 'Campaña No Realizada', punto: 'bg-red-600' },
  { color: 'azul', texto: 'Cita de Hoy', punto: 'bg-blue-600' },
  { color: 'amarillo', texto: 'No revisada', punto: 'bg-amber-500' },
  { color: 'verde', texto: 'Cita Revisada', punto: 'bg-green-700' },
] as const

const ORDEN: Record<string, number> = { rojo: 0, azul: 1, amarillo: 2, verde: 3 }

export default function Tabla({
  campanas,
  sucursalesPermitidas,
}: {
  campanas: Campana[]
  sucursalesPermitidas: string[]
}) {
  const [sucursal, setSucursal] = useState('')
  const [estado, setEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloRecall, setSoloRecall] = useState(false)

  const sucursales = useMemo(
    () => [...new Set(campanas.map((c) => c.sucursal ?? '').filter(Boolean))].sort(),
    [campanas],
  )

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return campanas
      .filter((c) => !sucursal || c.sucursal === sucursal)
      .filter((c) => !estado || c.estado_color === estado)
      .filter((c) => !soloRecall || c.recall_obligatorio === true)
      .filter((c) => {
        if (!q) return true
        // Busca en los campos por los que uno buscaría a mano en la planilla.
        return [c.patente, c.propietario, c.campanas, c.modelo, c.orden_servicio, c.chasis, c.asesor]
          .some((v) => (v ?? '').toLowerCase().includes(q))
      })
      .sort((a, b) => (ORDEN[a.estado_color ?? ''] ?? 9) - (ORDEN[b.estado_color ?? ''] ?? 9))
  }, [campanas, sucursal, estado, busqueda, soloRecall])

  const cuenta = (color: string) => filtradas.filter((c) => c.estado_color === color).length
  const conRecall = filtradas.filter((c) => c.recall_obligatorio).length

  const entrada =
    'min-h-11 rounded-md border border-borde-fuerte bg-panel px-3 focus:border-azul-700 focus:outline-none'

  return (
    <>
      {sucursalesPermitidas.length > 0 && (
        <p className="mb-3 text-texto-tenue">
          Acceso limitado a: {sucursalesPermitidas.join(', ')}
        </p>
      )}

      {/* Resumen. Cuenta sobre lo filtrado, no sobre el total: si no, el número
          de arriba no coincide con lo que se ve en la tabla. */}
      <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ESTADOS.map((e) => (
          <li key={e.color} className="rounded-lg border border-borde bg-panel px-3 py-2">
            <span className="flex items-center gap-2 text-texto-suave">
              <span className={`size-2 rounded-full ${e.punto}`} aria-hidden="true" />
              {e.texto}
            </span>
            <strong className="tabular text-lg">{cuenta(e.color)}</strong>
          </li>
        ))}
        <li className="rounded-lg border border-ambar bg-panel px-3 py-2">
          <span className="text-ambar-700">Recall obligatorio (FSA)</span>
          <strong className="tabular block text-lg text-ambar-700">{conRecall}</strong>
        </li>
      </ul>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          <span className="text-texto-suave">Sucursal</span>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className={entrada}>
            <option value="">Todas</option>
            {sucursales.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col">
          <span className="text-texto-suave">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={entrada}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.color} value={e.color}>{e.texto}</option>
            ))}
          </select>
        </label>

        <label className="flex min-w-64 flex-1 flex-col">
          <span className="text-texto-suave">Buscar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Patente, propietario, campaña, OT…"
            className={entrada}
          />
        </label>

        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={soloRecall}
            onChange={(e) => setSoloRecall(e.target.checked)}
            className="size-4 cursor-pointer"
          />
          <span>Solo Recall Obligatorio (FSA)</span>
        </label>
      </div>

      <p className="mb-2 text-texto-tenue">
        {filtradas.length === campanas.length
          ? `${campanas.length} citas`
          : `${filtradas.length} de ${campanas.length} citas`}
      </p>

      {/* La tabla scrollea sola; la página nunca scrollea de lado. */}
      <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
        <table className="w-max min-w-full border-collapse">
          <thead>
            <tr className="bg-azul-800 text-left text-white">
              {['Estado', 'Recall FSA', 'Sucursal', 'N° OT', 'Fecha', 'Patente', 'Modelo',
                'Propietario', 'Campañas/Boletín', 'Asesor'].map((h) => (
                <th key={h} className="sticky top-0 whitespace-nowrap px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c, i) => {
              const e = ESTADOS.find((x) => x.color === c.estado_color)
              return (
                <tr key={`${c.orden_servicio}-${c.patente}-${i}`} className="border-t border-borde hover:bg-panel-alt">
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-full ${e?.punto ?? 'bg-slate-400'}`} aria-hidden="true" />
                      {c.estado_texto ?? '—'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ambar-700">
                    {c.recall_obligatorio ? c.recall_codigos || 'FSA' : ''}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">{c.sucursal}</td>
                  <td className="tabular whitespace-nowrap px-3 py-1.5">{c.orden_servicio}</td>
                  <td className="tabular whitespace-nowrap px-3 py-1.5">{c.fecha_programacion}</td>
                  <td className="tabular whitespace-nowrap px-3 py-1.5 font-semibold">{c.patente}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{c.modelo}</td>
                  <td className="px-3 py-1.5">{c.propietario}</td>
                  <td className="px-3 py-1.5">{c.campanas}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{c.asesor}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtradas.length === 0 && (
        <p className="mt-3 rounded-lg border border-borde bg-panel p-4 text-texto-suave">
          Ninguna cita coincide con los filtros.
        </p>
      )}
    </>
  )
}
