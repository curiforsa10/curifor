import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import Consulta from './Consulta'

export const dynamic = 'force-dynamic'

export default async function Asistente() {
  const usuario = await exigirUsuario('puede_asistente_app')
  return (
    <Marco
      titulo="Asistente App"
      bajada="Consulta varias patentes o folios de una vez"
      usuario={usuario}
      ancho="completo"
    >
      <Consulta />
    </Marco>
  )
}
