import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { leerInformes } from '@/lib/informes'
import Reportes from './Reportes'

export const dynamic = 'force-dynamic'

export default async function Informes() {
  // En app.py este módulo lo abre quien tiene Cuenta Ficha: no hay un flag
  // propio de informes en el modelo de usuarios.
  const usuario = await exigirUsuario('puede_cuenta_ficha')
  const datos = await leerInformes()

  return (
    <Marco
      titulo="Informes de Gestión"
      bajada={
        datos?.fecha_actualizacion
          ? `Reportes AG e IMOP Ford · Actualizado ${datos.fecha_actualizacion}`
          : 'Reportes AG e IMOP Ford'
      }
      usuario={usuario}
      ancho="completo"
    >
      {!datos?.ag || Object.keys(datos.ag).length === 0 ? (
        <div className="rounded-lg border border-borde bg-panel p-6">
          <h2 className="font-semibold">Todavía no hay informes cargados</h2>
          <p className="mt-2 text-texto-suave">
            Los genera la consolidación a partir de los reportes AG y del IMOP de Ford.
          </p>
        </div>
      ) : (
        <Reportes datos={datos} />
      )}
    </Marco>
  )
}
