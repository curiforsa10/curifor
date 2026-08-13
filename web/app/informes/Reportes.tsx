'use client'

import { useState } from 'react'
import { MESES, celda, type Informes } from '@/lib/informes'

export default function Reportes({ datos }: { datos: Informes }) {
  const sucursales = Object.keys(datos.ag ?? {}).sort()
  const [sucursal, setSucursal] = useState(sucursales[0] ?? '')

  const suc = datos.ag?.[sucursal]
  const hojas = Object.keys(suc?.hojas ?? {})
  const [hoja, setHoja] = useState(hojas[0] ?? '')

  // Al cambiar de sucursal la hoja elegida puede no existir en la nueva.
  const hojaActiva = hojas.includes(hoja) ? hoja : (hojas[0] ?? '')
  const contenido = suc?.hojas?.[hojaActiva]

  const resumen = datos.actual?.ag?.[sucursal]
  const sel = 'min-h-11 rounded-md border border-borde-fuerte bg-panel px-3 focus:border-azul-700 focus:outline-none'

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          <span className="text-texto-suave">Sucursal</span>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className={sel}>
            {sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="flex gap-1" role="tablist">
          {hojas.map((h) => (
            <button
              key={h}
              role="tab"
              aria-selected={h === hojaActiva}
              onClick={() => setHoja(h)}
              className={`min-h-11 cursor-pointer rounded-md px-4 font-medium transition-colors duration-150 ${
                h === hojaActiva
                  ? 'bg-azul-700 text-white'
                  : 'border border-borde-fuerte hover:border-azul-700 hover:text-azul-700'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
        {suc?.archivo && (
          <p className="min-h-11 content-center text-texto-tenue">
            {suc.archivo}{suc.periodo ? ` · ${suc.periodo}` : ''}
          </p>
        )}
      </div>

      {/* Resumen del período actual, si vino en el documento */}
      {resumen && (
        <div className="mb-3 overflow-x-auto rounded-lg border border-borde bg-panel">
          <table className="w-full border-collapse">
            <caption className="px-3 py-2 text-left font-semibold">
              Período {datos.actual?.periodo ?? ''}
            </caption>
            <thead>
              <tr className="bg-panel-alt text-left">
                <th className="px-3 py-1.5 font-semibold">Marca</th>
                {['cliente', 'garantia', 'interno', 'seguro', 'total'].map((c) => (
                  <th key={c} className="px-3 py-1.5 text-right font-semibold capitalize">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(resumen).map(([marca, v]) => (
                <tr key={marca} className="border-t border-borde">
                  <td className="px-3 py-1.5">{marca}</td>
                  {['cliente', 'garantia', 'interno', 'seguro', 'total'].map((c) => (
                    <td key={c} className="tabular px-3 py-1.5 text-right">
                      {celda(v[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!contenido?.filas?.length ? (
        <p className="rounded-lg border border-borde bg-panel p-6 text-texto-suave">
          Esta hoja no trae filas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
          <table className="w-max min-w-full border-collapse">
            <caption className="px-3 py-2 text-left font-semibold">
              {contenido.titulo}
              {contenido.codigo && <span className="ml-2 text-texto-tenue">{contenido.codigo}</span>}
            </caption>
            <thead>
              <tr className="bg-azul-800 text-left text-white">
                <th className="sticky left-0 z-10 bg-azul-800 px-3 py-2 font-semibold">Concepto</th>
                {MESES.map((m) => (
                  <th key={m} className="px-3 py-2 text-right font-semibold">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contenido.filas.map((f, i) => {
                // Las filas 'cabecera' separan secciones del reporte: no llevan
                // cifras y se destacan para poder recorrer la tabla larga.
                const esCabecera = f.tipo === 'cabecera'
                return (
                  <tr
                    key={`${f.label}-${i}`}
                    className={esCabecera ? 'bg-panel-alt font-semibold' : 'border-t border-borde'}
                  >
                    <td className={`sticky left-0 px-3 py-1.5 ${esCabecera ? 'bg-panel-alt' : 'bg-panel'}`}>
                      {f.label}
                    </td>
                    {MESES.map((m, j) => (
                      <td key={m} className="tabular px-3 py-1.5 text-right">
                        {celda(f.valores?.[j])}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
