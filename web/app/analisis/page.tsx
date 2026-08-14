import { redirect } from 'next/navigation'
import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { esAdmin } from '@/lib/auth'
import { leerDocumento } from '@/lib/supabase'
import Evolucion, { type Registro } from './Evolucion'

export const dynamic = 'force-dynamic'

export default async function Analisis() {
  const usuario = await exigirUsuario()
  // En app.py este módulo solo figura para el admin: ni siquiera aparece en el
  // selector para el resto.
  if (!esAdmin(usuario)) redirect('/')

  const doc = await leerDocumento<{ registros?: Registro[] }>('historial_cierres.json')
  const registros = (doc?.registros ?? []).slice().reverse()

  return (
    <Marco
      titulo="Análisis de Gestión"
      bajada="Evolución de cierres por actualización"
      usuario={usuario}
      ancho="completo"
    >
      {registros.length === 0 ? (
        <div className="rounded-lg border border-borde bg-panel p-6">
          <h2 className="font-semibold">Todavía no hay historial de cierres</h2>
          <p className="mt-2 text-texto-suave">
            Se acumula con cada corrida de la consolidación diaria.
          </p>
        </div>
      ) : (
        <Evolucion registros={registros} />
      )}
    </Marco>
  )
}
