'use client'

import { useMemo, useState } from 'react'
import {
  COLUMNAS_EDITABLES, COLOR_RANGO, RANGOS, aNumero, opcionesDe, pesos,
  type ColumnaEditable, type OT,
} from '@/lib/ots'

type Cambios = Record<string, Partial<Record<ColumnaEditable, string>>>

const POR_PAGINA = 50

type Grupo = ReturnType<typeof agrupar>[number]

/** Tabla de agrupación, compartida por Por sucursal, Por asesor y Análisis. */
function TablaGrupos({
  filas,
  etiqueta,
  compacta = false,
}: {
  filas: Grupo[]
  etiqueta: string
  compacta?: boolean
}) {
  const totalCriticas = filas.reduce((s, f) => s + f.criticas, 0)
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-azul-800 text-left text-white">
            <th className="px-3 py-2 font-semibold">{etiqueta}</th>
            <th className="px-3 py-2 text-right font-semibold">OT</th>
            <th className="px-3 py-2 text-right font-semibold">+90d</th>
            {!compacta && (
              <>
                <th className="px-3 py-2 text-right font-semibold">Días prom.</th>
                <th className="px-3 py-2 text-right font-semibold">Sin gestión</th>
                <th className="px-3 py-2 text-right font-semibold">Neto</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre} className="border-t border-borde hover:bg-panel-alt">
              <td className="px-3 py-1.5">{f.nombre}</td>
              <td className="tabular px-3 py-1.5 text-right">{f.total.toLocaleString('es-CL')}</td>
              <td className="tabular px-3 py-1.5 text-right">
                {/* Las críticas son el motivo de mirar esta tabla: se destacan
                    solo cuando existen, para que el color signifique algo. */}
                <span className={f.criticas > 0 ? 'font-semibold text-peligro' : 'text-texto-tenue'}>
                  {f.criticas.toLocaleString('es-CL')}
                </span>
              </td>
              {!compacta && (
                <>
                  <td className="tabular px-3 py-1.5 text-right">{f.diasProm}</td>
                  <td className="tabular px-3 py-1.5 text-right">{f.sinGestion.toLocaleString('es-CL')}</td>
                  <td className="tabular px-3 py-1.5 text-right">{pesos(f.neto)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-borde-fuerte bg-panel-alt font-semibold">
            <td className="px-3 py-1.5">{filas.length} {filas.length === 1 ? 'grupo' : 'grupos'}</td>
            <td className="tabular px-3 py-1.5 text-right">
              {filas.reduce((s, f) => s + f.total, 0).toLocaleString('es-CL')}
            </td>
            <td className="tabular px-3 py-1.5 text-right">{totalCriticas.toLocaleString('es-CL')}</td>
            {!compacta && (
              <>
                <td />
                <td className="tabular px-3 py-1.5 text-right">
                  {filas.reduce((s, f) => s + f.sinGestion, 0).toLocaleString('es-CL')}
                </td>
                <td className="tabular px-3 py-1.5 text-right">
                  {pesos(filas.reduce((s, f) => s + f.neto, 0))}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

type Vista = 'resumen' | 'detalle' | 'sucursal' | 'asesor' | 'analisis'

/** Agrupa las OT por un campo y arma las cifras que se miran por grupo. */
function agrupar(ots: OT[], campo: keyof OT) {
  const mapa = new Map<string, OT[]>()
  for (const o of ots) {
    const k = String(o[campo] ?? '').trim() || '(sin asignar)'
    const l = mapa.get(k)
    if (l) l.push(o)
    else mapa.set(k, [o])
  }
  return [...mapa.entries()]
    .map(([nombre, filas]) => {
      const dias = filas.map((o) => aNumero(o['DIAS APERTURA']))
      return {
        nombre,
        total: filas.length,
        criticas: filas.filter((o) => o.RANGO === '91 o más').length,
        neto: filas.reduce((s, o) => s + aNumero(o.NETO), 0),
        diasProm: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0,
        sinGestion: filas.filter((o) => !String(o['AVANCE - GESTIÓN'] ?? '').trim()).length,
      }
    })
    // Por criticas primero: es el orden en que conviene atacarlas.
    .sort((a, b) => b.criticas - a.criticas || b.total - a.total)
}

export default function Panel({ ots, puedeEditar }: { ots: OT[]; puedeEditar: boolean }) {
  const [vista, setVista] = useState<Vista>('resumen')
  const [sucursal, setSucursal] = useState('')
  const [rango, setRango] = useState('')
  const [marca, setMarca] = useState('')
  const [asesor, setAsesor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)

  const [cambios, setCambios] = useState<Cambios>({})
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState(false)

  const opciones = useMemo(
    () => ({
      sucursales: opcionesDe(ots, 'SUCURSAL'),
      marcas: opcionesDe(ots, 'MARCA'),
      asesores: opcionesDe(ots, 'ASESOR'),
      categorias: opcionesDe(ots, 'CATEGORIA'),
    }),
    [ots],
  )

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return ots.filter((o) => {
      if (sucursal && o.SUCURSAL !== sucursal) return false
      if (rango && o.RANGO !== rango) return false
      if (marca && o.MARCA !== marca) return false
      if (asesor && o.ASESOR !== asesor) return false
      if (categoria && String(o.CATEGORIA ?? '') !== categoria) return false
      if (!q) return true
      return [o['FOLIO OT'], o.PATENTE, o.ASESOR, o.MODELO, o['GLOSA TRABAJO'], o.NOTAS]
        .some((v) => String(v ?? '').toLowerCase().includes(q))
    })
  }, [ots, sucursal, rango, marca, asesor, categoria, busqueda])

  const resumen = useMemo(() => {
    const porRango = Object.fromEntries(
      RANGOS.map((r) => [r, filtradas.filter((o) => o.RANGO === r).length]),
    )
    const neto = filtradas.reduce((s, o) => s + aNumero(o.NETO), 0)
    const dias = filtradas.map((o) => aNumero(o['DIAS APERTURA']))
    return {
      total: filtradas.length,
      porRango,
      neto,
      diasProm: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0,
      diasMax: dias.length ? Math.max(...dias) : 0,
      sinGestion: filtradas.filter((o) => !String(o['AVANCE - GESTIÓN'] ?? '').trim()).length,
      sinCategoria: filtradas.filter((o) => !String(o.CATEGORIA ?? '').trim()).length,
    }
  }, [filtradas])

  const paginadas = filtradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const nCambios = Object.keys(cambios).length

  function editar(folio: string, col: ColumnaEditable, valor: string) {
    setCambios((prev) => ({ ...prev, [folio]: { ...(prev[folio] ?? {}), [col]: valor } }))
    setAviso('')
  }

  const valorDe = (o: OT, col: ColumnaEditable): string =>
    cambios[o['FOLIO OT']]?.[col] ?? String(o[col] ?? '')

  async function guardar() {
    if (nCambios === 0) return
    setGuardando(true)
    setError(false)
    try {
      const r = await fetch('/api/ots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios }),
      })
      const j = (await r.json()) as { ok: boolean; motivo?: string; guardadas?: number }
      if (j.ok) {
        setCambios({})
        setAviso(`Guardadas ${j.guardadas} OT`)
      } else {
        setError(true)
        setAviso(j.motivo ?? 'No se pudo guardar.')
      }
    } catch {
      setError(true)
      setAviso('No se pudo conectar. Revisa tu conexión.')
    } finally {
      setGuardando(false)
    }
  }

  function limpiar() {
    setSucursal(''); setRango(''); setMarca(''); setAsesor(''); setCategoria(''); setBusqueda('')
    setPagina(0)
  }

  const sel = 'min-h-11 rounded-md border border-borde-fuerte bg-panel px-2 focus:border-azul-700 focus:outline-none'
  const celda = 'w-full rounded border border-borde px-2 py-1 focus:border-azul-700 focus:outline-none'

  return (
    <>
      {/* Filtros: se aplican a las dos vistas, por eso van arriba de las pestañas */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {([
          ['Sucursal', sucursal, setSucursal, opciones.sucursales],
          ['Rango', rango, setRango, [...RANGOS]],
          ['Marca', marca, setMarca, opciones.marcas],
          ['Asesor', asesor, setAsesor, opciones.asesores],
          ['Categoría', categoria, setCategoria, opciones.categorias],
        ] as const).map(([etiqueta, valor, set, lista]) => (
          <label key={etiqueta} className="flex flex-col">
            <span className="text-texto-suave">{etiqueta}</span>
            <select
              value={valor}
              onChange={(e) => { set(e.target.value); setPagina(0) }}
              className={sel}
            >
              <option value="">Todas</option>
              {lista.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        ))}
        <label className="flex min-w-56 flex-1 flex-col">
          <span className="text-texto-suave">Buscar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(0) }}
            placeholder="Folio, patente, asesor, glosa…"
            className={sel}
          />
        </label>
        <button
          type="button"
          onClick={limpiar}
          className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-3
                     transition-colors duration-150 hover:border-azul-700 hover:text-azul-700"
        >
          Limpiar
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {([
            ['resumen', 'Resumen'],
            ['detalle', 'Detalle y edición'],
            ['sucursal', 'Por sucursal'],
            ['asesor', 'Por asesor'],
            ['analisis', 'Análisis'],
          ] as const).map(([id, txt]) => (
            <button
              key={id}
              role="tab"
              aria-selected={vista === id}
              onClick={() => setVista(id)}
              className={`min-h-11 cursor-pointer rounded-md px-4 font-medium transition-colors duration-150 ${
                vista === id
                  ? 'bg-azul-700 text-white'
                  : 'border border-borde-fuerte hover:border-azul-700 hover:text-azul-700'
              }`}
            >
              {txt}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-texto-suave">
            {filtradas.length === ots.length
              ? `${ots.length.toLocaleString('es-CL')} OT`
              : `${filtradas.length.toLocaleString('es-CL')} de ${ots.length.toLocaleString('es-CL')} OT`}
          </span>
          {aviso && (
            <span role="status" className={error ? 'text-peligro' : 'text-exito'}>{aviso}</span>
          )}
          {puedeEditar && vista === 'detalle' && (
            <button
              type="button"
              onClick={guardar}
              disabled={nCambios === 0 || guardando}
              className="min-h-11 cursor-pointer rounded-md bg-azul-700 px-4 font-semibold text-white
                         transition-colors duration-150 hover:bg-azul-800
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : nCambios ? `Guardar ${nCambios} OT` : 'Sin cambios'}
            </button>
          )}
        </div>
      </div>

      {vista === 'sucursal' || vista === 'asesor' ? (
        <TablaGrupos
          filas={agrupar(filtradas, vista === 'sucursal' ? 'SUCURSAL' : 'ASESOR')}
          etiqueta={vista === 'sucursal' ? 'Sucursal' : 'Asesor'}
        />
      ) : vista === 'analisis' ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <TablaGrupos filas={agrupar(filtradas, 'MARCA')} etiqueta="Marca" compacta />
          <TablaGrupos filas={agrupar(filtradas, 'CATEGORIA')} etiqueta="Categoría" compacta />
          <TablaGrupos filas={agrupar(filtradas, 'TIPO VENTA')} etiqueta="Tipo de venta" compacta />
        </div>
      ) : vista === 'resumen' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RANGOS.map((r) => (
            <div key={r} className="rounded-lg border border-borde bg-panel p-3">
              <span className="flex items-center gap-2 text-texto-suave">
                <span className={`size-2 rounded-full ${COLOR_RANGO[r]}`} aria-hidden="true" />
                {r} días
              </span>
              <strong className="tabular text-2xl">{resumen.porRango[r].toLocaleString('es-CL')}</strong>
            </div>
          ))}
          {([
            ['Monto neto', pesos(resumen.neto)],
            ['Días promedio', resumen.diasProm.toLocaleString('es-CL')],
            ['Día más antiguo', resumen.diasMax.toLocaleString('es-CL')],
            ['Sin gestión', resumen.sinGestion.toLocaleString('es-CL')],
            ['Sin categoría', resumen.sinCategoria.toLocaleString('es-CL')],
          ] as const).map(([t, v]) => (
            <div key={t} className="rounded-lg border border-borde bg-panel p-3">
              <span className="text-texto-suave">{t}</span>
              <strong className="tabular block text-xl">{v}</strong>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
            <table className="w-max min-w-full border-collapse">
              <thead>
                <tr className="bg-azul-800 text-left text-white">
                  {['Rango', 'Folio', 'Sucursal', 'Días', 'Patente', 'Marca', 'Modelo', 'Asesor',
                    'Neto', 'Categoría', 'Observación', 'Notas', 'Avance / Gestión', 'Última edición']
                    .map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {paginadas.map((o) => {
                  const folio = o['FOLIO OT']
                  const tocada = Boolean(cambios[folio])
                  return (
                    <tr key={folio} className={`border-t border-borde ${tocada ? 'bg-amber-50' : ''}`}>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <span
                            className={`size-2 shrink-0 rounded-full ${COLOR_RANGO[String(o.RANGO)] ?? 'bg-slate-300'}`}
                            aria-hidden="true"
                          />
                          {o.RANGO || '—'}
                        </span>
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-1.5 font-semibold">{folio}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{o.SUCURSAL}</td>
                      <td className="tabular whitespace-nowrap px-3 py-1.5 text-right">{o['DIAS APERTURA']}</td>
                      <td className="tabular whitespace-nowrap px-3 py-1.5">{o.PATENTE}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{o.MARCA}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{o.MODELO}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{o.ASESOR}</td>
                      <td className="tabular whitespace-nowrap px-3 py-1.5 text-right">{pesos(aNumero(o.NETO))}</td>
                      {COLUMNAS_EDITABLES.map((col) => (
                        <td key={col} className="px-2 py-1">
                          <input
                            value={valorDe(o, col)}
                            onChange={(e) => editar(folio, col, e.target.value)}
                            disabled={!puedeEditar}
                            className={`${celda} ${col === 'CATEGORIA' ? 'w-28' : 'w-56'} disabled:bg-panel-alt`}
                          />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-1.5 text-texto-tenue">
                        {String(o.ULTIMA_EDICION ?? '—')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación: 2.043 OT en una sola tabla dejan el navegador inservible. */}
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0}
              className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="tabular text-texto-suave">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
              className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>

          {nCambios > 0 && (
            <p className="mt-2 text-texto-tenue">
              Los cambios de las páginas que visitaste se conservan hasta que guardes.
            </p>
          )}
        </>
      )}
    </>
  )
}
