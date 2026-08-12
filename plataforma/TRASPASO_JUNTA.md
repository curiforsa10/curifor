# Traspaso — Junta Ignacio + Cristian (migración Supabase + módulos in-repo)

Rama con todo el trabajo: **`migracion-supabase`** en `C:\dev\curifor-ots` (repo `Cjerez-curi/curifor-ots`). **3 commits, sin pushear.** No pushear hasta completar los pasos de abajo juntos.

## Qué YA está vivo en producción (no requiere esta junta)
- **Backend Supabase** aplicado directo (SQL vía pooler): tabla de flujo `reservas_web` (estados nueva→agendada→recibida→en_taller→cerrada, policies staff, trigger, índices), Storage bucket privado `recepciones` (fotos), tablas `clientes` (32.320) y `vehiculos` (42.880). Scripts: `plataforma/herramientas/setup_supabase_flujo.sql`, `setup_supabase_storage.sql`, `setup_supabase_reservas.sql`.
- **Módulos** (agenda/recepción/fotos/recepción por patente/autocompletado) sirviéndose por el iframe a **platoniaaa** (puente temporal). Funcionan hoy; se reemplazan por el bundle in-repo en esta junta.

## Pasos de la junta (en orden)

### 1. Sincronizar la rama
```bash
cd C:\dev\curifor-ots
git checkout migracion-supabase
git fetch origin
git rebase origin/main        # la app auto-commitea main todo el día; resolver si algo choca en app.py
python -m py_compile app.py    # debe pasar
```

### 2. Reconciliar el cotizador (IMPORTANTE — no pisar producción)
El fuente local del cotizador (`plataforma/index.html` + `js/app.js` + `data/`) **difiere** del `cotizador_data.json` que está en producción. **Cristian confirma cuál es el fuente de verdad del cotizador.** No regenerar `cotizador_data.json` hasta alinear el fuente. (El taller sí es fuente de verdad; `taller_data.json` coincide.)

### 3. Activar el backend Supabase de app.py (grupo A)
Solo entonces la app deja de leer/escribir esos 4 JSON en GitHub y usa Supabase.
1. **Re-migrar frescos** los 4 docs (por si cambiaron): `python <scratchpad>/remigrar_grupoA.py '<password-de-la-BD>'`
   (la password NO va escrita aquí; sacarla del gestor de claves o de `supabase_pwd.txt`, que está en `.gitignore`)
2. **Cargar el secret** en Streamlit Cloud → *Settings → Secrets* (TOML):
   ```toml
   SUPABASE_URL = "https://ordgsglujssgzmnlmcus.supabase.co"
   SUPABASE_SERVICE_KEY = "eyJ...(service_role, NUNCA en el repo)"
   ```
3. Sin el secret, la capa queda inerte (usa GitHub como hoy) → publicar el código no rompe nada.

### 4. Probar el taller embebido (bundle in-repo) en Streamlit
Con la app corriendo, entrar a Agenda y Recepción (ahora `components.html` con `taller_data.json`, sin iframe). Verificar: carga, login de asesor (@curifor.com), autocompletar por patente, tomar una foto (Storage), recepción por patente, y que se guarde en `reservas_web`. Este es el punto que no se pudo validar sin la app arriba (localStorage/vista/header dentro de `components.html`).

### 5. Publicar
```bash
git push origin migracion-supabase     # o merge/rebase a main según acuerden
```
Reiniciar la app en Streamlit Cloud para que tome el código nuevo y el secret.

### 6. Después de verificar en producción
- Archivar/retirar el iframe a platoniaaa (ya no se usa; el taller viene del bundle).
- Regenerar bundles cuando cambie el frontend: `python plataforma/herramientas/publicar_taller_bundle.py --escribir` (taller) y el de cotizador tras alinear su fuente.

## Notas
- Regla: `app.py` es territorio de Cristian; revisar juntos los cambios (capa Supabase en las 3 funciones de persistencia + cargador del taller).
- La app auto-pushea a `main` cada minuto (heartbeats): esperar rebase limpio y pushear rápido.
- Credenciales locales fuera del repo (`.gitignore`): `github_token.txt`, `supabase_pwd.txt`, `sql_credenciales.txt`.
