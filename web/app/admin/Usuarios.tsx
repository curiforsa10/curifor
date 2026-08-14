'use client'

import { useMemo, useState } from 'react'
import type { Usuario } from '@/lib/auth'

const PERMISOS: Array<{ clave: keyof Usuario; etiqueta: string }> = [
  { clave: 'puede_planificador', etiqueta: 'Planificador' },
  { clave: 'puede_editar_planificador', etiqueta: 'Editar planificador' },
  { clave: 'puede_prepicking', etiqueta: 'Pre-picking' },
  { clave: 'puede_control', etiqueta: 'Control de OTs' },
  { clave: 'puede_cotizador', etiqueta: 'Cotizador' },
  { clave: 'puede_campanas', etiqueta: 'Campañas' },
  { clave: 'puede_cuenta_ficha', etiqueta: 'Cuenta Ficha' },
  { clave: 'puede_indicadores', etiqueta: 'Indicadores' },
  { clave: 'puede_loaners', etiqueta: 'Loaners' },
  { clave: 'puede_recepcion', etiqueta: 'Recepción' },
  { clave: 'puede_agenda_taller', etiqueta: 'Agenda taller' },
  { clave: 'puede_asistente_app', etiqueta: 'Asistente' },
  { clave: 'puede_confirmar_citas', etiqueta: 'Confirmar citas' },
  { clave: 'puede_disponibilidad_tecnicos', etiqueta: 'Disponibilidad técnicos' },
]

type Registro = { fecha?: string; usuario?: string; accion?: string; detalle?: string }

export default function Usuarios({
  usuarios: iniciales,
  registros,
}: {
  usuarios: Usuario[]
  registros: Registro[]
}) {
  const [usuarios, setUsuarios] = useState(iniciales)
  const [vista, setVista] = useState<'usuarios' | 'auditoria'>('usuarios')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState(false)

  const sucursales = useMemo(
    () => [...new Set(usuarios.flatMap((u) => u.sucursales_permitidas ?? []))].sort(),
    [usuarios],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return usuarios
      .filter((u) => !q || [u.email, u.nombre, u.sucursal_home].some((v) =>
        String(v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false) ||
        (a.email ?? '').localeCompare(b.email ?? ''))
  }, [usuarios, busqueda])

  async function pedir(cuerpo: Record<string, unknown>, alOk: (r: Record<string, unknown>) => void) {
    setError(false)
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const j = (await r.json()) as { ok: boolean; motivo?: string; claveTemporal?: string }
      if (j.ok) alOk(j)
      else { setError(true); setAviso(j.motivo ?? 'No se pudo guardar.') }
    } catch {
      setError(true)
      setAviso('No se pudo conectar.')
    }
  }

  function cambiar(email: string, cambio: Partial<Usuario>) {
    setUsuarios((prev) => prev.map((u) => (u.email === email ? { ...u, ...cambio } : u)))
  }

  const activos = usuarios.filter((u) => u.activo !== false).length
  // Cuentas creadas desde /registro que esperan aprobación. Se avisan arriba
  // porque, si no, quien se registró queda esperando sin que nadie se entere.
  const pendientes = usuarios.filter((u) => u.activo === false)
  const btn = 'min-h-11 cursor-pointer rounded-md px-4 font-medium transition-colors duration-150'

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="tablist">
          {([['usuarios', `Usuarios (${activos} activos)`], ['auditoria', 'Auditoría']] as const)
            .map(([id, txt]) => (
              <button
                key={id}
                role="tab"
                aria-selected={vista === id}
                onClick={() => setVista(id)}
                className={`${btn} ${vista === id ? 'bg-azul-700 text-white'
                  : 'border border-borde-fuerte hover:border-azul-700 hover:text-azul-700'}`}
              >
                {txt}
              </button>
            ))}
        </div>
        {aviso && (
          <span role="status" className={error ? 'text-peligro' : 'text-exito'}>{aviso}</span>
        )}
      </div>

      {vista === 'usuarios' && pendientes.length > 0 && (
        <p className="mb-3 rounded-lg border border-ambar bg-amber-50 px-4 py-2.5 text-ambar-700">
          {pendientes.length === 1
            ? '1 cuenta espera aprobación'
            : `${pendientes.length} cuentas esperan aprobación`}
          : {pendientes.map((u) => u.email).join(', ')}. Marcá «Activo» para habilitarlas.
        </p>
      )}

      {vista === 'auditoria' ? (
        <>
          <p className="mb-2 text-texto-suave">Últimos {registros.length} registros</p>
          <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
            <table className="w-max min-w-full border-collapse">
              <thead>
                <tr className="bg-azul-800 text-left text-white">
                  {['Fecha', 'Usuario', 'Acción', 'Detalle'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => (
                  <tr key={`${r.fecha}-${i}`} className="border-t border-borde">
                    <td className="tabular whitespace-nowrap px-3 py-1.5">{r.fecha}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{r.usuario}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{r.accion}</td>
                    <td className="px-3 py-1.5">{r.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <label className="mb-3 flex max-w-md flex-col">
            <span className="text-texto-suave">Buscar usuario</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Correo, nombre o sucursal…"
              className="min-h-11 rounded-md border border-borde-fuerte bg-panel px-3
                         focus:border-azul-700 focus:outline-none"
            />
          </label>

          <ul className="grid gap-2">
            {filtrados.map((u) => {
              const inactivo = u.activo === false
              const esteAbierto = abierto === u.email
              return (
                <li key={u.email} className={`rounded-lg border bg-panel ${inactivo ? 'border-borde opacity-60' : 'border-borde'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setAbierto(esteAbierto ? null : u.email)}
                      aria-expanded={esteAbierto}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <strong className="block truncate">{u.nombre || u.email}</strong>
                      <span className="tabular block truncate text-texto-tenue">
                        {u.email}
                        {u.sucursal_home ? ` · ${u.sucursal_home}` : ''}
                        {u.temp_pwd ? ' · clave temporal' : ''}
                        {u.ultimo_login ? ` · último ingreso ${u.ultimo_login}` : ''}
                      </span>
                    </button>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!inactivo}
                        onChange={(e) => {
                          const valor = e.target.checked
                          cambiar(u.email, { activo: valor })
                          pedir({ tipo: 'activo', email: u.email, valor }, () =>
                            setAviso(valor ? 'Usuario activado' : 'Usuario desactivado'))
                        }}
                        className="size-4 cursor-pointer"
                      />
                      <span>{inactivo ? 'Inactivo' : 'Activo'}</span>
                    </label>
                  </div>

                  {esteAbierto && (
                    <div className="border-t border-borde px-3 py-3">
                      <fieldset>
                        <legend className="mb-2 font-semibold">Permisos</legend>
                        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                          {PERMISOS.map((p) => (
                            <label key={String(p.clave)} className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={u[p.clave] === true}
                                onChange={(e) => {
                                  const valor = e.target.checked
                                  cambiar(u.email, { [p.clave]: valor } as Partial<Usuario>)
                                  pedir({ tipo: 'permiso', email: u.email, permiso: p.clave, valor },
                                    () => setAviso(`${p.etiqueta}: ${valor ? 'habilitado' : 'quitado'}`))
                                }}
                                className="size-4 cursor-pointer"
                              />
                              <span>{p.etiqueta}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <fieldset className="mt-3">
                        <legend className="mb-2 font-semibold">
                          Sucursales{' '}
                          <span className="font-normal text-texto-tenue">
                            (sin ninguna marcada, ve todas)
                          </span>
                        </legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {sucursales.map((s) => {
                            const tiene = (u.sucursales_permitidas ?? []).includes(s)
                            return (
                              <label key={s} className="flex cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={tiene}
                                  onChange={(e) => {
                                    const actuales = u.sucursales_permitidas ?? []
                                    const nuevas = e.target.checked
                                      ? [...actuales, s]
                                      : actuales.filter((x) => x !== s)
                                    cambiar(u.email, { sucursales_permitidas: nuevas })
                                    pedir({ tipo: 'sucursales', email: u.email, sucursales: nuevas },
                                      () => setAviso('Sucursales actualizadas'))
                                  }}
                                  className="size-4 cursor-pointer"
                                />
                                <span>{s}</span>
                              </label>
                            )
                          })}
                        </div>
                      </fieldset>

                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            pedir({ tipo: 'reset', email: u.email }, (j) => {
                              cambiar(u.email, { temp_pwd: true })
                              // Se muestra una sola vez: no queda guardada en
                              // ningún lado, hay que entregarla al usuario ahora.
                              setAviso(`Clave temporal de ${u.email}: ${j.claveTemporal}`)
                            })
                          }
                          className="min-h-11 cursor-pointer rounded-md border border-borde-fuerte px-4
                                     transition-colors duration-150 hover:border-azul-700 hover:text-azul-700"
                        >
                          Restablecer contraseña
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
