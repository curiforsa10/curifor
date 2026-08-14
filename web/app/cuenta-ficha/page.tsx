import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { leerCuentaFicha, leerRevisados, aligerarClientes } from '@/lib/cuenta-ficha'
import Clientes from './Clientes'

export const dynamic = 'force-dynamic'

// Cuenta Ficha descomprime 1,8 MB: el default de 10 s del plan Hobby queda corto si
// Supabase responde lento. 60 s es el maximo que admite el plan.
export const maxDuration = 60

export default async function CuentaFicha() {
  const usuario = await exigirUsuario('puede_cuenta_ficha')
  const [{ clientes, resumen, actualizado }, revisados] = await Promise.all([
    leerCuentaFicha(),
    leerRevisados(),
  ])

  return (
    <Marco
      titulo="Cuenta Ficha"
      bajada={
        actualizado
          ? `Saldos e historial por cliente · Actualizado ${actualizado}`
          : 'Saldos e historial por cliente'
      }
      usuario={usuario}
      ancho="completo"
    >
      {clientes.length === 0 ? (
        <div className="rounded-lg border border-borde bg-panel p-6">
          <h2 className="font-semibold">Todavía no hay datos de Cuenta Ficha</h2>
          <p className="mt-2 text-texto-suave">Los genera la consolidación diaria.</p>
        </div>
      ) : (
        // Sin movimientos ni OT: son 1,8 MB para 870 clientes y el listado no
        // los usa. El detalle se pide al abrir cada cliente.
        <Clientes
          clientes={aligerarClientes(clientes)}
          resumen={resumen}
          revisados={revisados}
        />
      )}
    </Marco>
  )
}
