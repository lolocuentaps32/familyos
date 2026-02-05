/* ============================================================================
   FamilyOS — Esquema Postgres + RLS (Supabase)
   Objetivo: base de datos “arquitectura primero” para 2 años de producto.
   - Auth: Supabase auth.users (auth.uid())
   - Datos: public.*
   - Seguridad: RLS estricta en TODO
   - Storage: políticas para bóveda/documentos y adjuntos
   ============================================================================ */

begin;

-- ---------------------------------------------------------------------------
-- 0) EXTENSIONES NECESARIAS
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- emails case-insensitive

-- ---------------------------------------------------------------------------
-- 1) TIPOS / ENUMS
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('owner','admin','adult','child','toddler');
  end if;

  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum ('active','invited','disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'visibility_level') then
    create type public.visibility_level as enum ('private','participants','family','adults_only','admins_only');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('inbox','planned','today','done','archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type public.event_status as enum ('tentative','confirmed','cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'shopping_item_status') then
    create type public.shopping_item_status as enum ('open','done','skipped');
  end if;

  if not exists (select 1 from pg_type where typname = 'vault_visibility') then
    create type public.vault_visibility as enum ('admins_only','adults','family','specific');
  end if;

  if not exists (select 1 from pg_type where typname = 'acl_permission') then
    create type public.acl_permission as enum ('read','write','admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'automation_status') then
    create type public.automation_status as enum ('enabled','disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type public.audit_action as enum (
      'create','update','delete',
      'share','unshare',
      'login','logout',
      'export','purge',
      'toggle_location','toggle_ai'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) FUNCIONES AUXILIARES DE SEGURIDAD (RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_family_member(_family_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.family_members fm
    where fm.family_id = _family_id
      and fm.auth_user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.my_family_role(_family_id uuid)
returns public.member_role
language sql
stable
as $$
  select fm.role
  from public.family_members fm
  where fm.family_id = _family_id
    and fm.auth_user_id = auth.uid()
    and fm.status = 'active'
  limit 1;
$$;

create or replace function public.has_family_role(_family_id uuid, _roles public.member_role[])
returns boolean
language sql
stable
as $$
  select public.my_family_role(_family_id) = any(_roles);
$$;

create or replace function public.my_member_id(_family_id uuid)
returns uuid
language sql
stable
as $$
  select fm.member_id
  from public.family_members fm
  where fm.family_id = _family_id
    and fm.auth_user_id = auth.uid()
    and fm.status = 'active'
  limit 1;
$$;

create or replace function public.is_adult_role(_role public.member_role)
returns boolean
language sql
immutable
as $$
  select _role in ('owner','admin','adult');
$$;

-- ---------------------------------------------------------------------------
-- 3) TRIGGERS GENÉRICOS (updated_at) + AUDITORÍA
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  actor_auth_user_id uuid,
  actor_member_id uuid,
  action public.audit_action not null,
  object_table text,
  object_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.audit_write(
  _family_id uuid,
  _action public.audit_action,
  _object_table text,
  _object_id uuid,
  _meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
as $$
declare
  _actor_member_id uuid;
begin
  _actor_member_id := public.my_member_id(_family_id);

  insert into public.audit_log(
    family_id, actor_auth_user_id, actor_member_id, action, object_table, object_id, meta
  ) values (
    _family_id, auth.uid(), _actor_member_id, _action, _object_table, _object_id, coalesce(_meta,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.audit_write(uuid, public.audit_action, text, uuid, jsonb) from public;
grant execute on function public.audit_write(uuid, public.audit_action, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) TABLAS CORE: FAMILIA, MIEMBROS, INVITACIONES, DISPOSITIVOS
-- ---------------------------------------------------------------------------

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  locale text not null default 'es-ES',
  timezone text not null default 'Europe/Madrid',
  created_by uuid not null, -- auth user id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'families_set_updated_at') then
    create trigger families_set_updated_at
    before update on public.families
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id uuid,
  role public.member_role not null,
  status public.member_status not null default 'active',
  display_name text not null,
  email citext,
  dob date,
  avatar_url text,
  is_managed boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id)
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'members_set_updated_at') then
    create trigger members_set_updated_at
    before update on public.members
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  auth_user_id uuid not null,
  role public.member_role not null,
  status public.member_status not null default 'active',
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id),
  unique (family_id, member_id)
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'family_members_set_updated_at') then
    create trigger family_members_set_updated_at
    before update on public.family_members
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invited_role public.member_role not null default 'adult',
  invited_email citext,
  invite_code text not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (family_id, invite_code)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  auth_user_id uuid,
  device_name text,
  platform text,
  push_token text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'devices_set_updated_at') then
    create trigger devices_set_updated_at
    before update on public.devices
    for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5) EVENTOS / CALENDARIO
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by_member_id uuid references public.members(id) on delete set null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  status public.event_status not null default 'tentative',
  visibility public.visibility_level not null default 'family',
  rrule text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'events_set_updated_at') then
    create trigger events_set_updated_at
    before update on public.events
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  can_edit boolean not null default false,
  rsvp text not null default 'unknown',
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

-- ---------------------------------------------------------------------------
-- 6) TAREAS
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by_member_id uuid references public.members(id) on delete set null,
  assignee_member_id uuid references public.members(id) on delete set null,
  title text not null,
  notes text,
  status public.task_status not null default 'inbox',
  priority int not null default 2,
  due_at timestamptz,
  repeat_rule text,
  visibility public.visibility_level not null default 'family',
  points int not null default 0,
  requires_approval boolean not null default false,
  approved_by_member_id uuid references public.members(id) on delete set null,
  approved_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'tasks_set_updated_at') then
    create trigger tasks_set_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) RUTINAS
-- ---------------------------------------------------------------------------

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_member_id uuid references public.members(id) on delete set null,
  name text not null,
  context text,
  is_active boolean not null default true,
  visibility public.visibility_level not null default 'family',
  schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'routines_set_updated_at') then
    create trigger routines_set_updated_at
    before update on public.routines
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  icon_key text,
  duration_seconds int,
  sort_order int not null default 0,
  requires_adult_confirm boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'routine_steps_set_updated_at') then
    create trigger routine_steps_set_updated_at
    before update on public.routine_steps
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) COMPRAS
-- ---------------------------------------------------------------------------

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default 'Compra',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'shopping_lists_set_updated_at') then
    create trigger shopping_lists_set_updated_at
    before update on public.shopping_lists
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  title text not null,
  category text,
  quantity text,
  status public.shopping_item_status not null default 'open',
  added_by_member_id uuid references public.members(id) on delete set null,
  done_by_member_id uuid references public.members(id) on delete set null,
  done_at timestamptz,
  sort_order int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'shopping_items_set_updated_at') then
    create trigger shopping_items_set_updated_at
    before update on public.shopping_items
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9) NOTIFICATION JOBS & DIGESTS (PARTE 2)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('push','email');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('queued','sending','sent','failed','cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'digest_type') then
    create type public.digest_type as enum ('daily','weekly');
  end if;

  if not exists (select 1 from pg_type where typname = 'digest_status') then
    create type public.digest_status as enum ('ready','delivered','failed');
  end if;
end $$;

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  channel public.notification_channel not null default 'push',
  audience text not null default 'member',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  status public.notification_status not null default 'queued',
  dedupe_key text,
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  digest_type public.digest_type not null,
  period_start date not null,
  period_end date not null,
  content jsonb not null,
  status public.digest_status not null default 'ready',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, member_id, digest_type, period_start, period_end)
);

-- ---------------------------------------------------------------------------
-- 10) FINANZAS & BÓVEDA & SALUD (RESUMEN)
-- ---------------------------------------------------------------------------

create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  amount_cents int not null,
  currency text not null default 'EUR',
  cadence text not null,
  next_due_at timestamptz not null,
  category text,
  is_active boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by_member_id uuid references public.members(id) on delete set null,
  title text not null,
  tags text[],
  visibility public.vault_visibility not null default 'adults',
  expires_on date,
  storage_bucket text not null default 'family-vault',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_conflicts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  event_a_id uuid not null references public.events(id) on delete cascade,
  event_b_id uuid not null references public.events(id) on delete cascade,
  overlap_start timestamptz not null,
  overlap_end timestamptz not null,
  severity int not null default 2,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 11) FUNCIONES BUILDER
-- ---------------------------------------------------------------------------

create or replace function public.build_daily_digest(_family_id uuid, _member_id uuid, _day date)
returns jsonb
language plpgsql
stable
as $$
declare
  _start timestamptz;
  _end timestamptz;
  _events jsonb;
  _tasks jsonb;
  _shopping jsonb;
  _bills jsonb;
begin
  _start := (_day::timestamptz);
  _end := ((_day + 1)::timestamptz);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status
  )), '[]'::jsonb) into _events
  from public.events e where e.family_id = _family_id and e.starts_at < _end and e.ends_at > _start;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'status', t.status, 'due_at', t.due_at
  )), '[]'::jsonb) into _tasks
  from public.tasks t where t.family_id = _family_id and t.status <> 'done' and (t.due_at is null or t.due_at < _end);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', si.id, 'title', si.title, 'status', si.status
  )), '[]'::jsonb) into _shopping
  from public.shopping_items si where si.family_id = _family_id and si.status = 'open';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rb.id, 'name', rb.name, 'next_due_at', rb.next_due_at
  )), '[]'::jsonb) into _bills
  from public.recurring_bills rb where rb.family_id = _family_id and rb.is_active = true and rb.next_due_at < (_start + interval '7 days');

  return jsonb_build_object('day', _day, 'events', _events, 'tasks', _tasks, 'shopping_open', _shopping, 'upcoming_bills', _bills);
end;
$$;

create or replace function public.detect_event_conflicts(_family_id uuid, _member_id uuid, _window_start timestamptz, _window_end timestamptz)
returns table (event_a_id uuid, event_b_id uuid, overlap_start timestamptz, overlap_end timestamptz, severity int)
language sql stable as $$
  with member_events as (
    select e.* from public.events e join public.event_participants ep on ep.event_id = e.id
    where e.family_id = _family_id and ep.member_id = _member_id and e.status <> 'cancelled' and e.starts_at < _window_end and e.ends_at > _window_start
  )
  select a.id, b.id, greatest(a.starts_at, b.starts_at), least(a.ends_at, b.ends_at), 2
  from member_events a join member_events b on a.id < b.id and a.starts_at < b.ends_at and b.starts_at < a.ends_at;
$$;

create or replace function public.refresh_event_conflicts_for_member(_family_id uuid, _member_id uuid, _window_start timestamptz, _window_end timestamptz)
returns int
language plpgsql security definer as $$
declare _count int := 0;
begin
  delete from public.event_conflicts where family_id = _family_id and member_id = _member_id;
  insert into public.event_conflicts(family_id, member_id, event_a_id, event_b_id, overlap_start, overlap_end, severity)
  select _family_id, _member_id, d.event_a_id, d.event_b_id, d.overlap_start, d.overlap_end, d.severity
  from public.detect_event_conflicts(_family_id, _member_id, _window_start, _window_end) d;
  get diagnostics _count = row_count;
  return _count;
end;
$$;

commit;
