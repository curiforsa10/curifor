'use client'

import { useMemo, useState } from 'react'
import { estaAsignado, type Vehiculo, type Asignacion } from '@/lib/loaners'

type Estado = 'guardado' | 'guardando' | 'sucio' | 'error'

export default function Flota({
  inicial,
  sucursales,
}: {
  inicial: Vehiculo[]
  sucursales: string[]
}) {
  const [filas, setFilas] = useState<Vehiculo[]>(inicial)
  const [tocados, setTocados] = useState<Set<string>>(new Set())
  const [estado, setEstado] = useState<Estado>('guardado')
  const [aviso, setAviso] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas
    return filas.filter((v) =>
      [v.patente, v.vin, v.modelo, v.nombre_cliente, v.vin_cliente, v.caso_sf, v.sucursal].some(
        (x) => (x ?? '').toString().toLowerCase().includes(q),
      ),
    )
  }, [filas, busqueda])

  const disponibles = filas.filter((v) => !v.asignado).length

  function editar(vin: string, campo: keyof Asignacion, valor: string | number) {
    setFilas((prev) =>
      prev.map((v) => {
        if (v.vin !== vin) return v
        const act: Vehiculo = { ...v, [campo]: valor }
        act.asignado = estaAsignado(act)
        return act
      }),
    )
    setTocados((prev) => new Set(prev).add(vin))
    setEstado('sucio')
    setAviso('')
  }

  /** Libera la unidad: borra los datos del cliente en un solo gesto. */
  function liberar(vin: string) {
    setFilas((prev) =>
      prev.map((v) =>
        v.vin === vin
          ? {
              ...v,
              fecha_solicitud: '',
              vin_cliente: '',
              nombre_cliente: '',
              modelo_cliente: '',
              fecha_ot: '',
              caso_sf: '',
              asignado: false,
              diasPrestado: null,
            }
          : v,
      ),
    )
    setTocados((prev) => new Set(prev).add(vin))
    setEstado('sucio')
  }

  async function guardar() {
    if (tocados.size === 0) return
    setEstado('guardando')
    const cambios: Record<string, Asignacion> = {}
    for (const v of filas) {
      if (!tocados.has(v.vin)) continue
      // Solo lo editable: vin/modelo/patente son de la flota y no se mandan.
      cambios[v.vin] = {
        sucursal: v.sucursal,
        kms_salida: v.kms_salida,
        fecha_solicitud: v.fecha_solicitud,
        vin_cliente: v.vin_cliente,
        nombre_cliente: v.nombre_cliente,
        modelo_cliente: v.modelo_cliente,
        fecha_ot: v.fecha_ot,
        caso_sf: v.caso_sf,
      }
    }
    try {
      const r = await fetch('/api/loaners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios }),
      })
      const j = (await r.json()) as { ok: boolean; motivo?: string; guardados?: number }
      if (j.ok) {
        setTocados(new Set())
        setEstado('guardado')
        setAviso(`Guardado (${j.guardados} ${j.guardados === 1 ? 'unidad' : 'unidades'})`)
      } else {
        setEstado('error')
        setAviso(j.motivo ?? 'No se pudo guardar.')
      }
    } catch {
      setEstado('error')
      setAviso('No se pudo conectar. Revisa tu conexión.')
    }
  }

  const celda = 'w-full rounded border border-borde px-2 py-1 focus:border-azul-700 focus:outline-none'

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-col">
            <span className="text-texto-suave">Buscar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Patente, VIN, cliente, N° caso…"
              className="min-h-11 rounded-md border border-borde-fuerte bg-panel px-3
                         focus:border-azul-700 focus:outline-none"
            />
          </label>
          <p className="min-h-11 content-center text-texto-suave">
            {disponibles} de {filas.length} disponibles
          </p>
        </div>

        <div className="flex items-center gap-3">
          {aviso && (
            <span role="status" className={estado === 'error' ? 'text-peligro' : 'text-exito'}>
              {aviso}
            </span>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={tocados.size === 0 || estado === 'guardando'}
            className="min-h-11 cursor-pointer rounded-md bg-azul-700 px-4 font-semibold text-white
                       transition-colors duration-150 hover:bg-azul-800
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {estado === 'guardando'
              ? 'Guardando…'
              : tocados.size > 0
                ? `Guardar ${tocados.size} cambio${tocados.size === 1 ? '' : 's'}`
                : 'Sin cambios'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
        <table className="w-max min-w-full border-collapse">
          <thead>
            <tr className="bg-azul-800 text-left text-white">
              {['Estado', 'Sucursal', 'Patente', 'Modelo', 'VIN', 'Fecha solicitud', 'KMS salida',
                'VIN cliente', 'Nombre cliente', 'Modelo cliente', 'Fecha OT', 'N° caso', 'Días',
                'Última edición'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((v) => (
              <tr
                key={v.vin}
                className={`border-t border-borde ${tocados.has(v.vin) ? 'bg-amber-50' : ''}`}
              >
                <td className="whitespace-nowrap px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${v.asignado ? 'bg-red-600' : 'bg-green-700'}`}
                      aria-hidden="true"
                    />
                    {v.asignado ? 'Asignado' : 'Disponible'}
                  </span>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={v.sucursal ?? ''}
                    onChange={(e) => editar(v.vin, 'sucursal', e.target.value)}
                    className={celda}
                  >
                    <option value="">—</option>
                    {sucursales.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                {/* Datos de la flota: no se editan desde acá. */}
                <td className="tabular whitespace-nowrap px-3 py-1.5 font-semibold">{v.patente}</td>
                <td className="whitespace-nowrap px-3 py-1.5">{v.modelo}</td>
                <td className="tabular whitespace-nowrap px-3 py-1.5 text-texto-tenue">{v.vin}</td>
                <td className="px-2 py-1">
                  <input
                    type="date"
                    value={v.fecha_solicitud ?? ''}
                    onChange={(e) => editar(v.vin, 'fecha_solicitud', e.target.value)}
                    className={`${celda} tabular`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    value={v.kms_salida ?? ''}
                    onChange={(e) => editar(v.vin, 'kms_salida', e.target.value)}
                    className={`${celda} tabular w-24`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={v.vin_cliente ?? ''}
                    onChange={(e) => editar(v.vin, 'vin_cliente', e.target.value)}
                    className={`${celda} tabular w-44`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={v.nombre_cliente ?? ''}
                    onChange={(e) => editar(v.vin, 'nombre_cliente', e.target.value)}
                    className={`${celda} w-56`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={v.modelo_cliente ?? ''}
                    onChange={(e) => editar(v.vin, 'modelo_cliente', e.target.value)}
                    className={`${celda} w-32`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="date"
                    value={v.fecha_ot ?? ''}
                    onChange={(e) => editar(v.vin, 'fecha_ot', e.target.value)}
                    className={`${celda} tabular`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={v.caso_sf ?? ''}
                    onChange={(e) => editar(v.vin, 'caso_sf', e.target.value)}
                    className={`${celda} tabular w-28`}
                  />
                </td>
                <td className="tabular whitespace-nowrap px-3 py-1.5 text-center">
                  {v.diasPrestado ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-texto-tenue">
                  {v._editado ? `${v._editado_por ?? ''} · ${v._editado}` : '—'}
                  {v.asignado && (
                    <button
                      type="button"
                      onClick={() => liberar(v.vin)}
                      className="ml-2 cursor-pointer rounded border border-borde-fuerte px-2 py-0.5
                                 transition-colors duration-150 hover:border-azul-700 hover:text-azul-700"
                    >
                      Liberar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-texto-tenue">
        Al liberar una unidad se borran los datos del cliente. Los cambios se guardan solo al
        presionar Guardar.
      </p>
    </>
  )
}
