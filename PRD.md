# PRD — FamilyOS (React PWA + Supabase)

## 0) Objetivo
Crear una **app familiar instalada como PWA** (móvil/desktop) para coordinar calendarios, tareas, rutinas, compras, mensajes y recordatorios de una familia de 4 (padre, madre, niña 9, niño 3), con **notificaciones push**, **resúmenes (digests)** y **detección automática de conflictos de agenda**.

## 1) Alcance (2 años) — “todo incluido”
### 1.1 Calendario
- Eventos con participantes (familia / selectivo / privado)
- Repeticiones (diario/semanal/mensual), excepciones
- Invitaciones internas, RSVP
- Adjuntos (documentos, fotos)
- Recordatorios por evento (push/email)
- Vistas: día/semana/mes, agenda, timeline por miembro
- **Detector de conflictos** (solapes por miembro) + severidad

### 1.2 Tareas / Proyecto familiar
- Listas (hogar, colegio, salud, papeleos)
- Asignación a miembros, prioridades, vencimientos
- Subtareas, dependencias
- Estados (today/planned/waiting/done)
- Automatización: “si evento X creado → crear tareas Y” (n8n opcional)

### 1.3 Rutinas y hábitos
- Rutinas por franja (mañana/noche), checklists
- Hábitos por miembro (lectura, dientes, sueño)
- Reglas de puntos/recompensas (ver 1.4)

### 1.4 Recompensas / economía infantil
- Asignación semanal, puntos por hábitos, “banco” de puntos
- Catálogo de recompensas configurables
- Control de permisos por edad

### 1.5 Compras y despensa
- Lista de compra compartida (categorías, cantidad)
- Despensa: stock mínimo, caducidades
- Plantillas (supermercado semanal)

### 1.6 Menús y planificación
- Planificador semanal de comidas
- Lista de compra vinculada a recetas
- Alergias / preferencias

### 1.7 Salud
- Vacunas, citas médicas, medicación
- Historial de documentos sanitarios
- Recordatorios y alertas

### 1.8 Escuela
- Calendario escolar (festivos, tutorías)
- Deberes, circulares, material
- Contactos (profesores, extraescolares)

### 1.9 Hogar
- Mantenimiento (ITV, revisiones, filtros, caldera)
- Inventario del hogar (garantías, facturas)
- Emergencias: contactos, protocolos

### 1.10 Comunicación
- “Chat familiar” + hilos por tema
- Notas rápidas
- Centro de notificaciones (historial)

### 1.11 Privacidad y control parental
- Roles (owner/admin/adult/child)
- Visibilidad por objeto
- Restricciones por edad: ciertas vistas ocultas a menores
- Auditoría (quién creó/modificó)

### 1.12 Observabilidad y fiabilidad
- Jobs en tabla + cron (sin depender de un servidor propio)
- Reintentos, backoff, métricas básicas

> Nota: En el .zip incluido hoy quedan **implementados los cimientos** (auth, familias, calendario simple, tareas, compra) y los **módulos críticos de backend**: notification_jobs, digests y conflict detector (SQL) + Edge Functions skeleton para webpush y crons. El resto del alcance está especificado para que lo completes sobre la misma base.

## 2) Usuarios, roles y permisos
- Padre/madre: `adult` (o `admin` si gestiona)
- Niña 9: `child` (puede ver su agenda y tareas asignadas)
- Niño 3: `child` (normalmente no inicia sesión; se gestiona como participante)

**RLS (Row Level Security)**:
- Todo contenido “familiar” se filtra por `family_id` + membresía activa
- Acciones sensibles (invitaciones, borrados masivos, billing) requieren `admin/owner`

## 3) Experiencia (PWA)
- Instalación en iOS/Android/desktop
- Offline-first limitado (cache de UI + últimas listas)
- Push notifications:
  - recordatorios de eventos
  - recordatorios de tareas
  - digests diario/semanal

## 4) Arquitectura técnica
- Frontend: React + Vite + React Router + PWA (service worker)
- Backend: Supabase (Postgres + RLS, Auth, Edge Functions)
- Jobs:
  - `notification_jobs` (cola)
  - `digests` (log de resúmenes)
  - `event_conflicts` (cache de conflictos)
- Edge Functions:
  - `notify_dispatch` (consume cola y envía push)
  - `reminders_tick` (crea jobs desde eventos)
  - `digest_daily` / `digest_weekly` (crea jobs de resumen)
  - `conflicts_tick` (refresca conflictos)
  - `push_register` (registra suscripción de push)
  - `family_create` (bootstrap)

## 5) Modelo de datos (alto nivel)
### Ya incluido en SQL
- `families`, `members`, `family_members`
- `devices` (push_token)
- `events`, `event_participants`
- `tasks`
- `shopping_items`
- `notification_jobs`, `notification_sends`
- `digests`
- `event_conflicts`

### Previsto (no incluido aún)
- `routines`, `routine_steps`, `habit_logs`
- `allowance_accounts`, `allowance_transactions`, `rewards_catalog`
- `pantry_items`, `pantry_movements`
- `meal_plans`, `recipes`, `recipe_ingredients`
- `health_records`, `medications`, `vaccines`
- `school_items`, `contacts`
- `messages`, `threads`, `notes`

## 6) Métricas de producto
- Retención semanal por adulto
- % eventos con recordatorio
- Tareas completadas por semana
- Conflictos detectados/resueltos
- Aperturas desde push (click)

## 7) Riesgos
- iOS PWA + push: requiere configuración cuidadosa y versión iOS compatible.
- RLS mal diseñada → fugas de datos: por eso se centraliza en `family_id` + funciones helper.
- Cron: coste y frecuencia (evitar jobs excesivos).

## 8) Entregables del .zip
- Frontend PWA funcional con:
  - Login (OTP/Password)
  - Selección de familia
  - Calendario (crear/listar)
  - Tareas (crear/marcar hecha)
  - Lista de compra (crear/marcar comprado)
  - Push register (dispositivo)
- SQL completo (core + notifications/digests/conflicts)
- Edge Functions skeleton (webpush + crons)

