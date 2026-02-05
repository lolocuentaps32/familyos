-- FamilyOS core schema (mínimo funcional)
-- Ejecuta esto primero.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('owner','admin','adult','child');
  end if;
  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type public.membership_status as enum ('active','invited','left','removed');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_visibility') then
    create type public.event_visibility as enum ('family','participants','private');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type public.event_status as enum ('confirmed','tentative','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('today','planned','waiting','done','archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'shopping_status') then
    create type public.shopping_status as enum ('open','purchased','cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- HELPERS
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

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger families_set_updated_at
before update on public.families
for each row execute function public.set_updated_at();

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id)
);

create trigger family_members_set_updated_at
before update on public.family_members
for each row execute function public.set_updated_at();

create index if not exists idx_family_members_user
  on public.family_members(auth_user_id);

create or replace function public.is_family_member(_family_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.family_members fm
    where fm.family_id = _family_id
      and fm.auth_user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.has_family_role(_family_id uuid, _roles public.member_role[])
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.family_members fm
    where fm.family_id = _family_id
      and fm.auth_user_id = auth.uid()
      and fm.status = 'active'
      and fm.role = any(_roles)
  );
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

-- ---------------------------------------------------------------------------
-- DEVICES
-- ---------------------------------------------------------------------------

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  device_name text,
  push_token text, -- JSON string de PushSubscription
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_devices_family_user_name
  on public.devices(family_id, auth_user_id, coalesce(device_name, ''));

create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- CALENDAR
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  visibility public.event_visibility not null default 'family',
  status public.event_status not null default 'confirmed',
  created_by_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_event_time check (starts_at < ends_at)
);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create index if not exists idx_events_family_time
  on public.events(family_id, starts_at);

create table if not exists public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role text not null default 'participant',
  response text not null default 'accepted',
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'today',
  visibility public.event_visibility not null default 'family',
  due_at timestamptz,
  priority int not null default 2,
  points int not null default 0,
  requires_approval boolean not null default false,
  created_by_member_id uuid references public.members(id) on delete set null,
  assignee_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create index if not exists idx_tasks_family_status
  on public.tasks(family_id, status);

-- ---------------------------------------------------------------------------
-- SHOPPING
-- ---------------------------------------------------------------------------

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  category text,
  quantity int not null default 1,
  status public.shopping_status not null default 'open',
  created_by_member_id uuid references public.members(id) on delete set null,
  purchased_by_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger shopping_items_set_updated_at
before update on public.shopping_items
for each row execute function public.set_updated_at();

create index if not exists idx_shopping_family_status
  on public.shopping_items(family_id, status);

-- ---------------------------------------------------------------------------
-- FINANCE (recurring bills mínimo para digest)
-- ---------------------------------------------------------------------------

create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  amount_cents int not null,
  currency text not null default 'EUR',
  next_due_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_bills_set_updated_at
before update on public.recurring_bills
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.family_members enable row level security;
alter table public.devices enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.tasks enable row level security;
alter table public.shopping_items enable row level security;
alter table public.recurring_bills enable row level security;

-- Families: select si perteneces, insert/update si eres autenticado (creación vía Edge Function recomendada)
drop policy if exists "families_select" on public.families;
create policy "families_select"
on public.families
for select
to authenticated
using (public.is_family_member(id));

drop policy if exists "families_insert" on public.families;
create policy "families_insert"
on public.families
for insert
to authenticated
with check (true);

drop policy if exists "families_update_admin" on public.families;
create policy "families_update_admin"
on public.families
for update
to authenticated
using (public.has_family_role(id, array['owner','admin']::public.member_role[]))
with check (public.has_family_role(id, array['owner','admin']::public.member_role[]));

-- Members: select si perteneces; insert/update solo adultos/admins
drop policy if exists "members_select" on public.members;
create policy "members_select"
on public.members
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "members_insert" on public.members;
create policy "members_insert"
on public.members
for insert
to authenticated
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

drop policy if exists "members_update" on public.members;
create policy "members_update"
on public.members
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

-- family_members: select own rows; admin insert/update
drop policy if exists "family_members_select" on public.family_members;
create policy "family_members_select"
on public.family_members
for select
to authenticated
using (auth_user_id = auth.uid() or public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

drop policy if exists "family_members_insert_admin" on public.family_members;
create policy "family_members_insert_admin"
on public.family_members
for insert
to authenticated
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

drop policy if exists "family_members_update_admin" on public.family_members;
create policy "family_members_update_admin"
on public.family_members
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

-- devices: user puede leer/insertar/actualizar sus dispositivos

drop policy if exists "devices_select" on public.devices;
create policy "devices_select"
on public.devices
for select
to authenticated
using (auth_user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists "devices_upsert" on public.devices;
create policy "devices_upsert"
on public.devices
for insert
to authenticated
with check (auth_user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists "devices_update" on public.devices;
create policy "devices_update"
on public.devices
for update
to authenticated
using (auth_user_id = auth.uid() and public.is_family_member(family_id))
with check (auth_user_id = auth.uid() and public.is_family_member(family_id));

-- events: select if family member; insert/update adults+; delete admins

drop policy if exists "events_select" on public.events;
create policy "events_select"
on public.events
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "events_insert" on public.events;
create policy "events_insert"
on public.events
for insert
to authenticated
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

drop policy if exists "events_update" on public.events;
create policy "events_update"
on public.events
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

-- event_participants: select family; manage adults+
drop policy if exists "event_participants_select" on public.event_participants;
create policy "event_participants_select"
on public.event_participants
for select
to authenticated
using (exists(select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)));

drop policy if exists "event_participants_manage" on public.event_participants;
create policy "event_participants_manage"
on public.event_participants
for all
to authenticated
using (exists(select 1 from public.events e where e.id = event_id and public.has_family_role(e.family_id, array['owner','admin','adult']::public.member_role[])))
with check (exists(select 1 from public.events e where e.id = event_id and public.has_family_role(e.family_id, array['owner','admin','adult']::public.member_role[])));

-- tasks: select family; insert/update adults+; delete admins
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
on public.tasks
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
on public.tasks
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

-- shopping_items: select family; insert/update adults+; delete admins

drop policy if exists "shopping_select" on public.shopping_items;
create policy "shopping_select"
on public.shopping_items
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "shopping_insert" on public.shopping_items;
create policy "shopping_insert"
on public.shopping_items
for insert
to authenticated
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

drop policy if exists "shopping_update" on public.shopping_items;
create policy "shopping_update"
on public.shopping_items
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

-- recurring_bills: select family; manage admins
drop policy if exists "bills_select" on public.recurring_bills;
create policy "bills_select"
on public.recurring_bills
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "bills_manage_admin" on public.recurring_bills;
create policy "bills_manage_admin"
on public.recurring_bills
for all
to authenticated
using (public.has_family_role(family_id, array['owner','admin']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

commit;
