# FamilyOS (React PWA + Supabase)

Este .zip contiene:
- `app/` → Frontend React (Vite) instalable como PWA
- `supabase/` → Edge Functions (Deno) + SQL

## 1) Configurar Supabase
1. Crea un proyecto en Supabase.
2. En **SQL Editor** ejecuta:
   - `supabase/sql/01_schema_core.sql`
   - `supabase/sql/02_notifications_digests_conflicts.sql`
3. En **Auth**:
   - Activa Email (OTP/Magic link) y/o password.
   - Añade la URL de tu app en Redirect URLs.
4. (Opcional) Configura **Edge Functions** y **Cron**:
   - `notify_dispatch` cada 1 min
   - `reminders_tick` cada 5 min
   - `conflicts_tick` cada 60 min
   - `digest_daily` diario 07:00
   - `digest_weekly` domingo 18:00

## 2) Edge Functions + Web Push
Necesitas VAPID:
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

Variables en Supabase → Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

## 3) Frontend
En `app/`:
1. Copia `.env.example` a `.env` y rellena:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
2. Instala deps y arranca:
   - `npm i`
   - `npm run dev`

## Notas
- La app lista eventos/tareas/compra y permite crear items básicos.
- “Más → Crear familia” llama a `family_create` (Edge Function incluida).
- “Más → Activar Push” llama a `push_register` (Edge Function incluida) y guarda el push token en `devices`.
