import { NextResponse } from 'next/server'
import zlib from 'node:zlib'
import { exigirUsuario } from '@/lib/sesion'
import { leerDocumento } from '@/lib/supabase'

type Producto = { producto?: string; descripcion?: string; bodega?: string; stock?: number }

/**
 * Catálogo completo de stock para Pre-picking, comprimido.
 *
 * En Streamlit este catálogo viajaba dentro del HTML del Planificador: 9 MB de
 * JSON que se inyectaban en la página aunque nadie abriera Pre-picking. Acá se
 * pide sólo cuando esa vista lo necesita.
 *
 * Se manda con los mismos 4 campos y el mismo gzip+base64 que esperaba el JS
 * portado, así el descompresor del navegador no cambia:
 *   9,0 MB el documento · 2,6 MB compacto · 0,69 MB comprimido
 * Bien por debajo del tope de 4,5 MB de una función serverless.
 */
export async function GET() {
  await exigirUsuario('puede_prepicking')

  const doc = await leerDocumento<{ productos?: Producto[]; fecha_actualizacion?: string }>(
    'stock_repuestos.json',
  )
  const productos = doc?.productos ?? []
  if (productos.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'No hay catálogo de stock.' }, { status: 404 })
  }

  const compacto = productos.map((p) => ({
    p: p.producto ?? '',
    d: p.descripcion ?? '',
    b: p.bodega ?? '',
    s: p.stock ?? 0,
  }))
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(compacto), 'utf8')).toString('base64')

  return NextResponse.json({
    ok: true,
    gz,
    productos: productos.length,
    actualizado: doc?.fecha_actualizacion ?? '',
  })
}
