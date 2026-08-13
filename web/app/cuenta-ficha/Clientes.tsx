'use client'

import { useMemo, useState } from 'react'
import { pesos, type ClienteLista, type Movimiento, type Resumen, type Revisado } from '@/lib/cuenta-ficha'

const POR_PAGINA = 40

export default function Clientes({
  clientes,
  resumen,
  revisados: revisadosIniciales,
}: {
  clientes: ClienteLista[]
  resumen: Resumen
  revisados: Record<string, Revisado>
}) {
  const [busqueda, setBusqueda] = useState('')
  const [soloSaldo, setSoloSaldo] = useState(true)
  const [soloSinRevisar, setSoloSinRevisar] = useState(false)
  const [pagina, setPagina] = useState(0)

  const [revisados, setRevisados] = useState(revisadosIniciales)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{ movimientos: Movimiento[]; patentes: string[] } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState('')

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes
      .filter((c) => !soloSaldo || c.tiene_saldo)
      .filter((c) => !soloSinRevisar || !revisados[c.rut])
      .filter((c) => !q || [c.rut, c.nombre, c.suc_principal].some((v) =>
        String(v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (b.saldo ?? 0) - (a.saldo ?? 0))
  }, [clientes, busqueda, soloSaldo, soloSinRevisar, revisados])

  const pagina0 = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const sumaFiltrada = filtrados.reduce((s, c) => s + (c.saldo ?? 0), 0)

  async function abrir(rut: string) {
    if (abierto === rut) { setAbierto(null); setDetalle(null); return }
    setAbierto(rut)
    setDetalle(null)
    setNota(revisados[rut]?.nota ?? '')
    setCargando(true)
    try {
      const r = await fetch(`/api/cuenta-ficha?rut=${encodeURIComponent(rut)}`)
      const j = await r.json()
      if (j.ok) setDetalle({ movimientos: j.movimientos ?? [], patentes: j.patentes ?? [] })
    } catch {
      setAviso('No se pudo cargar el detalle.')
    } finally {
      setCargando(false)
    }
  }

  async function marcar(rut: string, quitar: boolean) {
    const previos = revisados
    // Optimista, con reversión: la marca es compartida y se ve al instante.
    setRevisados((p) => {
      const n = { ...p }
      if (quitar) delete n[rut]
      else n[rut] = { usuario: '…', fecha: 'guardando', nota }
      return n
    })
    try {
      const r = await fetch('/api/cuenta-ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut, nota, quitar }),
      })
      const j = await r.json()
      if (j.ok) {
        setRevisados((p) => {
          const n = { ...p }
          if (quitar) delete n[rut]
          else n[rut] = j.revisado
          return n
        })
        setAviso(quitar ? 'Marca quitada' : 'Marcado como revisado')
      } else {
        setRevisados(previos)
        setAviso(j.motivo ?? 'No se pudo guardar.')
      }
    } catch {
      setRevisados(previos)
      setAviso('No se pudo conectar.')
    }
  }

  const entrada = 'min-h-11 rounded-md border border-borde-fuerte bg-panel px-3 focus:border-azul-700 focus:outline-none'

  return (
    <>
      <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['Clientes con saldo', (resumen.clientes_saldo ?? 0).toLocaleString('es-CL')],
          ['Monto total', pesos(resumen.monto_total)],
          ['Saldo mayor', pesos(resumen.saldo_mayor)],
          ['OT pendientes', (resumen.total_ot_pend ?? 0).toLocaleString('es-CL')],
        ] as const).map(([t, v]) => (
          <li key={t} className="rounded-lg border border-borde bg-panel px-3 py-2">
            <span className="text-texto-suave">{t}</span>
            <strong className="tabular block text-lg">{v}</strong>
          </li>
        ))}
      </ul>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col">
          <span className="text-texto-suave">Buscar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(0) }}
            placeholder="RUT, nombre o sucursal…"
            className={entrada}
          />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={soloSaldo}
            onChange={(e) => { setSoloSaldo(e.target.checked); setPagina(0) }}
            className="size-4 cursor-pointer" />
          <span>Solo con saldo</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={soloSinRevisar}
            onChange={(e) => { setSoloSinRevisar(e.target.checked); setPagina(0) }}
            className="size-4 cursor-pointer" />
          <span>Solo sin revisar</span>
        </label>
        {aviso && <span role="status" className="min-h-11 content-center text-exito">{aviso}</span>}
      </div>

      <p className="mb-2 text-texto-suave">
        {filtrados.length.toLocaleString('es-CL')} clientes · {pesos(sumaFiltrada)} en total
      </p>

      <ul className="grid gap-2">
        {pagina0.map((c) => {
          const rev = revisados[c.rut]
          const esteAbierto = abierto === c.rut
          return (
            <li key={c.rut} className={`rounded-lg border bg-panel ${rev ? 'border-exito' : 'border-borde'}`}>
              <button
                type="button"
                onClick={() => abrir(c.rut)}
                aria-expanded={esteAbierto}
                className="flex w-full cursor-pointer flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <strong className="block truncate">{c.nombre || '(sin nombre)'}</strong>
                  <span className="tabular text-texto-tenue">
                    {c.rut} · {c.suc_principal ?? '—'} · {c.n_mov ?? 0} mov.
                    {(c.n_ot_pend ?? 0) > 0 && ` · ${c.n_ot_pend} OT pendientes`}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {rev && <span className="text-exito">revisado</span>}
                  <strong className="tabular text-lg">{pesos(c.saldo)}</strong>
                </span>
              </button>

              {esteAbierto && (
                <div className="border-t border-borde px-3 py-3">
                  {cargando ? (
                    <p className="text-texto-suave">Cargando movimientos…</p>
                  ) : (
                    <>
                      {detalle?.patentes.length ? (
                        <p className="tabular mb-2 text-texto-suave">
                          Patentes: {detalle.patentes.join(' · ')}
                        </p>
                      ) : null}
                      {detalle?.movimientos.length ? (
                        <div className="overflow-x-auto rounded border border-borde">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-panel-alt text-left">
                                {['Documento', 'N°', 'Fecha', 'Local', 'Glosa', 'Saldo'].map((h) => (
                                  <th key={h} className="px-2 py-1 font-semibold">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detalle.movimientos.map((m, i) => (
                                <tr key={`${m.nro}-${i}`} className="border-t border-borde">
                                  <td className="px-2 py-1">{m.documento}</td>
                                  <td className="tabular px-2 py-1">{m.nro}</td>
                                  <td className="tabular whitespace-nowrap px-2 py-1">{m.fecha}</td>
                                  <td className="px-2 py-1">{m.local}</td>
                                  <td className="px-2 py-1">{m.glosa}</td>
                                  <td className="tabular px-2 py-1 text-right">{pesos(m.saldo)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-texto-suave">Sin movimientos registrados.</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="flex min-w-64 flex-1 flex-col">
                          <span className="text-texto-suave">Nota de revisión</span>
                          <input
                            value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            placeholder="Opcional"
                            className={entrada}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => marcar(c.rut, false)}
                          className="min-h-11 cursor-pointer rounded-md bg-azul-700 px-4 font-semibold text-white
                                     transition-colors duration-150 hover:bg-azul-800"
                        >
                          Marcar revisado
                        </button>
                        {rev && (
                          <button
                            type="button"
                            onClick={() => marcar(c.rut, true)}
                            className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4
                                       transition-colors duration-150 hover:border-peligro hover:text-peligro"
                          >
                            Quitar marca
                          </button>
                        )}
                      </div>
                      {rev && (
                        <p className="mt-2 text-texto-tenue">
                          Revisado por {rev.usuario} · {rev.fecha}
                          {rev.nota ? ` · ${rev.nota}` : ''}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}
          className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4 disabled:cursor-not-allowed disabled:opacity-40">
          Anterior
        </button>
        <span className="tabular text-texto-suave">Página {pagina + 1} de {totalPaginas}</span>
        <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          disabled={pagina >= totalPaginas - 1}
          className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4 disabled:cursor-not-allowed disabled:opacity-40">
          Siguiente
        </button>
      </div>
    </>
  )
}
