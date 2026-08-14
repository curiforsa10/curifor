import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import fs from 'node:fs/promises'
import path from 'node:path'
import { leerSesion, buscarUsuario, COOKIE_SESION } from '@/lib/auth'
import { leerDocumento, leerDocumentoConSello } from '@/lib/supabase'
import { emitirVale, ctrlSlug } from '@/lib/vale'
import Tablero from './Tablero'

export const dynamic = 'force-dynamic'

// el Planificador junta agenda, tablero y produccion: el default de 10 s del plan Hobby queda corto si
// Supabase responde lento. 60 s es el maximo que admite el plan.
export const maxDuration = 60

export default async function Planificador() {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) redirect('/login')

  const usuario = await buscarUsuario(sesion.email)
  if (!usuario || usuario.activo === false) redirect('/login')
  if (usuario.puede_planificador !== true) redirect('/')

  const sucursal = usuario.sucursal_home ?? (usuario.sucursales_permitidas ?? [])[0] ?? ''
  const ctrlFile = ctrlSlug(sucursal)
  const puedeEditar = usuario.puede_editar_planificador === true

  // Todo en paralelo: son documentos independientes y la pagina no puede
  // empezar a pintar hasta tenerlos.
  const [agenda, ctrl, prepicking, produccion, vale, html] = await Promise.all([
    leerDocumento<Record<string, unknown>>('agenda_hoy.json'),
    leerDocumentoConSello<Record<string, unknown>>(ctrlFile),
    leerDocumentoConSello<Record<string, unknown>>('prepicking_estados.json'),
    leerDocumento<Record<string, unknown>>('produccion_tecnicos.json'),
    // El vale solo se emite si puede editar: sin permiso no hace falta credencial.
    puedeEditar ? emitirVale(usuario.email, sucursal) : Promise.resolve(''),
    fs.readFile(path.join(process.cwd(), 'app/planificador/tablero.html'), 'utf8'),
  ])

  const config = {
    sbUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    sbAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    vale,
    sucursal,
    ctrlFile,
    usuario: usuario.email,
    puedeEditar,
    puedeConfirmarCitas: usuario.puede_confirmar_citas === true,
    puedeDisponibilidad: usuario.puede_disponibilidad_tecnicos === true,
    puedePrepicking: usuario.puede_prepicking === true,
    agenda: agenda ?? {},
    ctrl: ctrl.data ?? {},
    ctrlSello: ctrl.sello,
    prepicking: prepicking.data ?? {},
    ppSello: prepicking.sello,
    produccion: produccion ?? {},
    // Pendientes: el cotizador embebido (1,1 MB) y el catalogo de stock (9,4 MB)
    // iban comprimidos dentro del HTML. Inyectarlos asi en Next hace la pagina
    // impracticable; van a pedirse aparte cuando se abra la vista que los usa.
    cotizadorGz: '',
    stockGz: '',
    logoUri: '',
    vcuP1: '',
    vcuP2: '',
  }

  return <Tablero html={html} config={config} />
}
