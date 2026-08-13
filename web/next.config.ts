import type { NextConfig } from 'next'

/*
  Certificados en la red de Curifor — SOLO desarrollo local.

  La red corporativa hace inspeccion SSL: reemplaza el certificado de los sitios
  por uno firmado por su propia CA. Node no la conoce y corta cualquier fetch a
  Supabase con "self-signed certificate in certificate chain". Es la misma razon
  por la que todo el codigo Python del proyecto llama con verify=False.

  Esto NO aplica en Vercel: alli los certificados son normales y la verificacion
  queda activa. La guarda de NODE_ENV lo garantiza — si esta linea llegara a
  correr en produccion, se estaria aceptando cualquier certificado, que es
  exactamente lo que no se quiere.

  Lo correcto a futuro es exportar la CA corporativa y apuntar NODE_EXTRA_CA_CERTS
  a ella, en vez de desactivar la verificacion.
*/
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const nextConfig: NextConfig = {}

export default nextConfig
