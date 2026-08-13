import { NextResponse } from 'next/server'
import { COOKIE_SESION, opcionesCookie } from '@/lib/auth'

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), { status: 303 })
  res.cookies.set(COOKIE_SESION, '', { ...opcionesCookie, maxAge: 0 })
  return res
}
