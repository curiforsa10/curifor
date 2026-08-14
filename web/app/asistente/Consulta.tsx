'use client'

import { useState } from 'react'
import { aNumero, COLOR_RANGO, pesos } from '@/lib/ots'

type Fila = {
  consulta: string
  encontrada: boolean
  folio?: string
  patente?: string
  sucursal?: string
  asesor?: string
  rango?: string
  dias?: number | string
  neto?: number | string
  costoVale?: number
  repuestos?: number
}

export default function Consulta() {
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [encontradas, setEncontradas] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState('')

  async function consultar() {
    if (!texto.trim()) return
    setCargando(true)
    setAviso('')
    try {
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultas: texto }),
      })
      const j = (await r.json()) as { ok: boolean; filas?: Fila[]; encontradas?: number; motivo?: string }
      if (j.ok) {
        setFilas(j.filas ?? [])
        setEncontradas(j.encontradas ?? 0)
      } else {
        setAviso(j.motivo ?? 'No se pudo consultar.')
      }
    } catch {
      setAviso('No se pudo conectar.')
    } finally {
      setCargando(false)
    }
  }

  /** Descarga en CSV lo consultado, incluidas las que no tienen OT abierta. */
  function descargar() {
    if (!filas?.length) return
    const cab = ['Consulta', 'Estado', 'Folio', 'Patente', 'Sucursal', 'Asesor', 'Rango', 'Días', 'Neto', 'Costo vales']
    const lineas = filas.map((f) => [
      f.consulta,
      f.encontrada ? 'Con OT abierta' : 'Sin OT abierta',
      f.folio ?? '', f.patente ?? '', f.sucursal ?? '', f.asesor ?? '',
      f.rango ?? '', String(f.dias ?? ''), String(f.neto ?? ''),
      String(Math.round(f.costoVale ?? 0)),
    ])
    // Punto y coma: Excel en español lo toma como separador de columnas.
    const csv = [cab, ...lineas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'consulta-asistente.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <label className="flex min-w-72 flex-1 flex-col">
          <span className="text-texto-suave">Patentes o folios — uno por línea</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder={'LYVG96\nSTSG41\n1174878'}
            className="tabular rounded-md border border-borde-fuerte bg-panel px-3 py-2
                       focus:border-azul-700 focus:outline-none"
          />
        </label>
        <div className="flex flex-col gap-2 pt-5">
          <button
            type="button"
            onClick={consultar}
            disabled={cargando || !texto.trim()}
            className="min-h-11 cursor-pointer rounded-md bg-azul-700 px-4 font-semibold text-white
                       transition-colors duration-150 hover:bg-azul-800
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando ? 'Consultando…' : 'Consultar'}
          </button>
          {filas?.length ? (
            <button
              type="button"
              onClick={descargar}
              className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4
                         transition-colors duration-150 hover:border-azul-700 hover:text-azul-700"
            >
              Descargar CSV
            </button>
          ) : null}
        </div>
      </div>

      {aviso && <p role="alert" className="mb-3 text-peligro">{aviso}</p>}

      {filas && (
        <>
          <p className="mb-2 text-texto-suave">
            {encontradas} con OT abierta · {filas.length - encontradas} sin OT abierta ·{' '}
            {filas.length} consultadas
          </p>
          <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
            <table className="w-max min-w-full border-collapse">
              <thead>
                <tr className="bg-azul-800 text-left text-white">
                  {['Consulta', 'Estado', 'Folio', 'Patente', 'Sucursal', 'Asesor', 'Rango',
                    'Días', 'Neto', 'Costo vales'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr
                    key={`${f.consulta}-${i}`}
                    className={`border-t border-borde ${f.encontrada ? '' : 'bg-panel-alt text-texto-tenue'}`}
                  >
                    <td className="tabular whitespace-nowrap px-3 py-1.5 font-semibold">{f.consulta}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {f.encontrada ? 'Con OT abierta' : 'Sin OT abierta'}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-1.5">{f.folio ?? '—'}</td>
                    <td className="tabular whitespace-nowrap px-3 py-1.5">{f.patente ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{f.sucursal ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{f.asesor ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {f.rango ? (
                        <span className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${COLOR_RANGO[f.rango] ?? 'bg-slate-300'}`} aria-hidden="true" />
                          {f.rango}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">{f.dias ?? '—'}</td>
                    <td className="tabular whitespace-nowrap px-3 py-1.5 text-right">
                      {f.encontrada ? pesos(aNumero(f.neto)) : '—'}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-1.5 text-right">
                      {f.encontrada ? pesos(f.costoVale ?? 0) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
