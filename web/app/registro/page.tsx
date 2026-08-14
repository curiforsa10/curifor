'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Registro() {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== repetir) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setEnviando(true)
    try {
      const r = await fetch('/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password }),
      })
      const j = (await r.json()) as { ok: boolean; motivo?: string }
      if (j.ok) setListo(true)
      else {
        setError(j.motivo ?? 'No se pudo crear la cuenta.')
        setEnviando(false)
      }
    } catch {
      setError('No se pudo conectar. Revisa tu conexión.')
      setEnviando(false)
    }
  }

  const campo =
    'mt-1.5 w-full rounded-md border border-borde-fuerte px-3 py-2 focus:border-azul-700 focus:outline-none'

  if (listo) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-lg border border-borde bg-panel p-6 text-center">
          <h1 className="font-bold text-azul-800">Cuenta creada</h1>
          <p className="mt-2 text-texto-suave">
            Queda pendiente de aprobación. El administrador la habilita y ahí vas a poder entrar.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block min-h-11 cursor-pointer rounded-md bg-azul-700 px-4 py-2.5
                       font-semibold text-white transition-colors duration-150 hover:bg-azul-800"
          >
            Volver al ingreso
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-azul-800">Crear cuenta</h1>
          <p className="mt-1 text-texto-suave">Control y Gestión Post Venta · Curifor S.A</p>
        </div>

        <form onSubmit={enviar} className="rounded-lg border border-borde bg-panel p-6 shadow-sm" noValidate>
          <label htmlFor="nombre" className="block font-medium">Nombre</label>
          <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
            autoComplete="name" required autoFocus className={campo} />

          <label htmlFor="email" className="mt-4 block font-medium">Correo</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@curifor.com" autoComplete="username" required className={campo} />

          <label htmlFor="password" className="mt-4 block font-medium">Contraseña</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" required className={campo} />
          <p className="mt-1 text-texto-tenue">Mínimo 8 caracteres.</p>

          <label htmlFor="repetir" className="mt-4 block font-medium">Repetir contraseña</label>
          <input id="repetir" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)}
            autoComplete="new-password" required className={campo} />

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-peligro">{error}</p>
          )}

          <button type="submit" disabled={enviando}
            className="mt-5 min-h-11 w-full cursor-pointer rounded-md bg-azul-700 px-4 font-semibold
                       text-white transition-colors duration-150 hover:bg-azul-800
                       disabled:cursor-not-allowed disabled:opacity-60">
            {enviando ? 'Creando…' : 'Crear cuenta'}
          </button>

          <p className="mt-4 text-center text-texto-tenue">
            La cuenta queda pendiente hasta que el administrador la habilite.
          </p>
          <p className="mt-3 text-center">
            <Link href="/login" className="text-azul-700 hover:underline">Ya tengo cuenta</Link>
          </p>
        </form>
      </div>
    </main>
  )
}
