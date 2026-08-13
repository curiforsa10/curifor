'use client'

import { useEffect, useRef } from 'react'

/**
 * Monta el tablero portado desde Streamlit.
 *
 * El JS (public/planificador/tablero.js) manipula el DOM directamente: 214
 * funciones que ya funcionaban en produccion. React NO debe re-renderizar ese
 * arbol, por eso el contenedor va con dangerouslySetInnerHTML y sin estado que
 * lo toque. Es un puente deliberado, no una solucion definitiva: la idea es
 * reescribir vista por vista y ir achicando este archivo.
 */
export default function Tablero({
  html,
  config,
}: {
  html: string
  config: Record<string, unknown>
}) {
  const montado = useRef(false)

  useEffect(() => {
    // En desarrollo React monta dos veces (StrictMode). El tablero registra
    // listeners y timers globales, asi que hay que cargarlo una sola vez.
    if (montado.current) return
    montado.current = true

    ;(window as unknown as Record<string, unknown>).__PLANIF__ = config

    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = '/planificador/tablero.css'
    document.head.appendChild(css)

    const js = document.createElement('script')
    js.src = '/planificador/tablero.js'
    js.async = false
    document.body.appendChild(js)
  }, [config])

  return <div id="planificador-raiz" dangerouslySetInnerHTML={{ __html: html }} />
}
