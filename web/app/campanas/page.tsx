import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento } from '@/lib/supabase'
import Tabla, { type Campana } from './Tabla'

export const dynamic = 'force-dynamic'

type Doc = {
  fecha_actualizacion?: string
  archivo_origen?: string
  campanas?: Campana[]
}

export default async function Campanas() {
  const usuario = await exigirUsuario('puede_campanas')
  const doc = await leerDocumento<Doc>('campanas_curifor.json')
  const todas = doc?.campanas ?? []

  // Mismo criterio que app.py: si el usuario tiene sucursales asignadas, solo ve
  // esas. La comparacion va en mayusculas porque el dato viene de planillas y
  // llega con may/min inconsistentes.
  const permitidas = (usuario.sucursales_permitidas ?? []).map((s) => s.trim().toUpperCase())
  const campanas = permitidas.length
    ? todas.filter((c) => permitidas.includes((c.sucursal ?? '').trim().toUpperCase()))
    : todas

  const origen = [doc?.archivo_origen, doc?.fecha_actualizacion && `Actualizado ${doc.fecha_actualizacion}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <Marco
      titulo="Revisión de Campañas Ford"
      bajada={origen ? `Agenda Ford · ${origen}` : 'Agenda Ford'}
      usuario={usuario}
      ancho="completo"
    >
      {todas.length === 0 ? (
        <div className="rounded-lg border border-borde bg-panel p-6">
          <h2 className="font-semibold">Todavía no hay datos de campañas</h2>
          <p className="mt-2 text-texto-suave">
            El administrador debe correr la consolidación con el archivo de la Agenda Ford
            disponible en su carpeta.
          </p>
        </div>
      ) : campanas.length === 0 ? (
        <p className="rounded-lg border border-borde bg-panel p-6 text-texto-suave">
          No hay casos de campañas para las sucursales que puedes ver
          {permitidas.length ? ` (${permitidas.join(', ')})` : ''}.
        </p>
      ) : (
        <Tabla campanas={campanas} sucursalesPermitidas={permitidas} />
      )}
    </Marco>
  )
}
