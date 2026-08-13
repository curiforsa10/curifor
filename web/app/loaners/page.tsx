import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento } from '@/lib/supabase'
import { combinar, sucursalesDe, type Asignacion } from '@/lib/loaners'
import Flota from './Flota'

export const dynamic = 'force-dynamic'

export default async function Loaners() {
  const usuario = await exigirUsuario('puede_loaners')
  const doc = await leerDocumento<{ loaners?: Record<string, Asignacion> }>('loaners.json')
  const vehiculos = combinar(doc?.loaners)

  return (
    <Marco
      titulo="Loaners"
      bajada="Flota de vehículos de cortesía"
      usuario={usuario}
      ancho="completo"
    >
      <Flota inicial={vehiculos} sucursales={sucursalesDe(vehiculos)} />
    </Marco>
  )
}
