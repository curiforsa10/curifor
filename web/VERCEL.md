# Desplegar en Vercel

## 1. Importar el proyecto

En [vercel.com/new](https://vercel.com/new), importar `curiforsa10/curifor`.

**Root Directory: `web`** — es lo único que hay que cambiar. Sin eso Vercel
busca el proyecto en la raíz del repo, donde está `app.py`, y falla.

Framework: Next.js (lo detecta solo). Build y output: los que trae por defecto.

## 2. Variables de entorno

En *Settings → Environment Variables*. Los valores están en `web/.env.local`,
que no se versiona.

| Variable | Para qué | ¿Secreta? |
|---|---|---|
| `SUPABASE_URL` | Servidor | no |
| `SUPABASE_SERVICE_KEY` | Servidor; saltea RLS | **sí** |
| `NEXT_PUBLIC_SUPABASE_URL` | Navegador | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Navegador; la protege RLS | no |
| `SESSION_SECRET` | Firma la cookie de sesión | **sí** |
| `ADMIN_EMAIL` | Opcional. Por defecto `cjerez@curifor.com` | no |
| `PBI_INDICADORES_URL` | Opcional. Sin ella, Indicadores avisa que falta | no |

> **Generá un `SESSION_SECRET` nuevo para producción**, distinto al local. Si se
> filtra, cualquiera puede firmar una cookie y entrar como quien quiera:
> ```
> node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
> ```
> Cambiarlo cierra todas las sesiones abiertas, que es justo lo que se quiere si
> alguna vez hay que revocar accesos de golpe.

## 3. Región

`vercel.json` fija `iad1` (Virginia). Supabase está en `aws-0-us-east-1`, o sea
al lado. Si se despliega en otra región, cada consulta cruza el continente dos
veces y se nota en Control y Cuenta Ficha, que son los que mueven más datos.

## 4. Después del primer deploy

- Entrar y verificar el login con una cuenta real.
- Revisar que Indicadores muestre el informe (o el aviso de que falta la URL).
- Abrir Pre-picking dentro del Planificador: es lo que dispara `/api/stock`.

## Límites que importan

**Respuesta de función: 4,5 MB.** Tres documentos no caben enteros y por eso se
recortan o se piden aparte:

| Documento | Completo | Se envía |
|---|---|---|
| `datos_dashboard` | 4,11 MB | 0,81 MB — `aligerar()` deja solo `CAMPOS_LISTADO` |
| `stock_repuestos` | 9,0 MB | 0,69 MB — comprimido, por `/api/stock` |
| `cuenta_ficha` | 1,8 MB | listado sin movimientos; el detalle por API |

Si mañana alguien agrega un campo pesado al listado, el módulo deja de cargar
**solo en producción**, con un error que no apunta a la causa. Antes de sumar
columnas a `CAMPOS_LISTADO`, medir.

**Duración de función: 10 s en Hobby, 60 s en Pro.** Hoy las páginas más lentas
(Control y Cuenta Ficha) tardan entre 4 y 6 s: entran, pero sin mucho margen. Si
empiezan a dar timeout, el plan Pro lo resuelve; la solución de fondo es guardar
esos documentos ya resumidos en vez de traerlos enteros para quedarse con una
parte.

## Lo que sigue en Streamlit

Cotizador, Agenda de Taller y Recepción no se migraron. El Cotizador aparece en
la portada marcado como no disponible, para que quien lo usaba sepa dónde está.
