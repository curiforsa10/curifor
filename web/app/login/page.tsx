'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const j = (await r.json()) as { ok: boolean; motivo?: string }
      if (j.ok) {
        router.replace('/')
        router.refresh()
      } else {
        setError(j.motivo ?? 'No se pudo iniciar sesión.')
        setEnviando(false)
      }
    } catch {
      setError('No se pudo conectar. Revisa tu conexión.')
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-azul-800">Control y Gestión Post Venta</h1>
          <p className="mt-1 text-texto-suave">Curifor S.A</p>
        </div>

        <form
          onSubmit={enviar}
          className="rounded-lg border border-borde bg-panel p-6 shadow-sm"
          noValidate
        >
          <label htmlFor="email" className="block font-medium">
            Correo
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@curifor.com"
            autoComplete="username"
            autoFocus
            required
            className="mt-1.5 w-full rounded-md border border-borde-fuerte px-3 py-2
                       focus:border-azul-700 focus:outline-none"
          />

          <label htmlFor="password" className="mt-4 block font-medium">
            Contraseña
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-borde-fuerte py-2 pl-3 pr-11
                         focus:border-azul-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center
                         justify-center text-texto-tenue hover:text-texto"
            >
              {/* Heroicons (SVG, no emoji) */}
              {verClave ? (
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.22A10.5 10.5 0 0 0 1.93 12c1.29 4.06 5.06 7 9.54 7 1.66 0 3.22-.4 4.6-1.12M6.23 6.23A10.45 10.45 0 0 1 11.47 5c4.48 0 8.25 2.94 9.54 7a10.52 10.52 0 0 1-4.29 5.27M6.23 6.23 3 3m3.23 3.23 3.65 3.65m7.62 7.62L21 21m-3.5-3.5-3.65-3.65m0 0a3 3 0 1 0-4.24-4.24" />
                </svg>
              ) : (
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5s8.58 3.01 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5s-8.58-3.01-9.96-7.18Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              )}
            </button>
          </div>

          {/* El error va junto al formulario, no en un banner arriba del todo. */}
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-peligro">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-5 min-h-11 w-full cursor-pointer rounded-md bg-azul-700 px-4 font-semibold
                       text-white transition-colors duration-150 hover:bg-azul-800
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="mt-4 text-center text-texto-tenue">Solo cuentas @curifor.com.</p>
          <p className="mt-3 text-center">
            ¿No tienes cuenta?{' '}
            <a href="/registro" className="text-azul-700 hover:underline">Crear una</a>
          </p>
        </form>
      </div>
    </main>
  )
}
