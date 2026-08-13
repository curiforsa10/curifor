import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento } from '@/lib/supabase'
import { aligerar, type OT } from '@/lib/ots'
import Panel from './Panel'

export const dynamic = 'force-dynamic'

export default async function Control() {
  const usuario = await exigirUsuario('puede_control')
  const doc = await leerDocumento<{ ots?: OT[]; fecha_actualizacion?: string }>('datos_dashboard.json')
  const todas = doc?.ots ?? []

  // Mismo criterio que el resto de la app: con sucursales asignadas, solo esas.
  const permitidas = (usuario.sucursales_permitidas ?? []).map((s) => s.trim().toUpperCase())
  const ots = permitidas.length
    ? todas.filter((o) => permitidas.includes(String(o.SUCURSAL ?? '').trim().toUpperCase()))
    : todas

  return (
    <Marco
      titulo="Control y Gestión Post Venta"
      bajada={
        doc?.fecha_actualizacion
          ? `${ots.length.toLocaleString('es-CL')} OT pendientes · Actualizado ${doc.fecha_actualizacion}`
          : `${ots.length.toLocaleString('es-CL')} OT pendientes`
      }
      usuario={usuario}
      ancho="completo"
    >
      {todas.length === 0 ? (
        <div className="rounded-lg border border-borde bg-panel p-6">
          <h2 className="font-semibold">Todavía no hay datos de OTs</h2>
          <p className="mt-2 text-texto-suave">
            El administrador debe correr la consolidación diaria para publicar el listado.
          </p>
        </div>
      ) : (
        // Se envía solo lo que el listado usa: el documento completo no cabe en
        // una respuesta de función serverless (ver CAMPOS_LISTADO).
        <Panel ots={aligerar(ots)} puedeEditar />
      )}
    </Marco>
  )
}
