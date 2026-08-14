import { redirect } from 'next/navigation'
import Marco from '@/components/Marco'
import { exigirUsuario } from '@/lib/sesion'
import { leerUsuarios, esAdmin } from '@/lib/auth'
import { leerDocumento } from '@/lib/supabase'
import Usuarios from './Usuarios'

export const dynamic = 'force-dynamic'

type Audit = {
  registros?: Array<{ fecha?: string; usuario?: string; accion?: string; detalle?: string }>
}

export default async function Admin() {
  const usuario = await exigirUsuario()
  // No hay un flag de permiso para esto: en app.py la pestaña Admin aparece
  // solo si el correo es el del administrador.
  if (!esAdmin(usuario)) redirect('/')

  const [usuarios, audit] = await Promise.all([
    leerUsuarios(),
    leerDocumento<Audit>('audit_log.json'),
  ])

  // Solo los últimos 100: el log tiene miles y nadie revisa más que lo reciente.
  const registros = (audit?.registros ?? []).slice(-100).reverse()

  return (
    <Marco
      titulo="Administración"
      bajada={`${usuarios.length} usuarios registrados`}
      usuario={usuario}
      ancho="completo"
    >
      <Usuarios usuarios={usuarios} registros={registros} />
    </Marco>
  )
}
