-- Notifications Jobs + Digests + Calendar Conflict Detector
-- Ejecuta después de 01_schema_core.sql

begin;

-- ---------------------------------------------------------------------------
-- A) NOTIFICATION JOBS
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('push','email');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('queued','sending','sent','failed','cancelled');
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

create trigger notification_jobs_set_updated_at
before update on public.notification_jobs
for each row execute function public.set_updated_at();

create index if not exists idx_notification_jobs_due
  on public.notification_jobs(status, scheduled_at);

create index if not exists idx_notification_jobs_family
  on public.notification_jobs(family_id, scheduled_at);

create unique index if not exists ux_notification_jobs_dedupe
  on public.notification_jobs(family_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notification_jobs enable row level security;

drop policy if exists "notification_jobs_select_member_or_admin" on public.notification_jobs;
create policy "notification_jobs_select_member_or_admin"
on public.notification_jobs
for select
to authenticated
using (
  public.is_family_member(family_id)
  and (
    public.has_family_role(family_id, array['owner','admin']::public.member_role[])
    or member_id = public.my_member_id(family_id)
    or (member_id is null and audience in ('family','adults') and public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]))
  )
);

drop policy if exists "notification_jobs_insert_adults" on public.notification_jobs;
create policy "notification_jobs_insert_adults"
on public.notification_jobs
for insert
to authenticated
with check (
  public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[])
  and (
    (member_id = public.my_member_id(family_id) and audience = 'member')
    or (member_id is null and audience in ('family','adults','admins'))
  )
);

drop policy if exists "notification_jobs_update_admin" on public.notification_jobs;
create policy "notification_jobs_update_admin"
on public.notification_jobs
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

drop policy if exists "notification_jobs_delete_admin" on public.notification_jobs;
create policy "notification_jobs_delete_admin"
on public.notification_jobs
for delete
to authenticated
using (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- B) DIGEST
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'digest_type') then
    create type public.digest_type as enum ('daily','weekly');
  end if;
  if not exists (select 1 from pg_type where typname = 'digest_status') then
    create type public.digest_status as enum ('ready','delivered','failed');
  end if;
end $$;

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

create trigger digests_set_updated_at
before update on public.digests
for each row execute function public.set_updated_at();

create index if not exists idx_digests_member_time
  on public.digests(member_id, created_at desc);

alter table public.digests enable row level security;

drop policy if exists "digests_select_self_or_admin" on public.digests;
create policy "digests_select_self_or_admin"
on public.digests
for select
to authenticated
using (
  public.is_family_member(family_id)
  and (
    member_id = public.my_member_id(family_id)
    or public.has_family_role(family_id, array['owner','admin']::public.member_role[])
  )
);

drop policy if exists "digests_insert_admin_only" on public.digests;
create policy "digests_insert_admin_only"
on public.digests
for insert
to authenticated
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

drop policy if exists "digests_update_admin_only" on public.digests;
create policy "digests_update_admin_only"
on public.digests
for update
to authenticated
using (public.has_family_role(family_id, array['owner','admin']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

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
    'id', e.id,
    'title', e.title,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'location', e.location,
    'status', e.status
  ) order by e.starts_at), '[]'::jsonb)
  into _events
  from public.events e
  where e.family_id = _family_id
    and e.starts_at < _end
    and e.ends_at > _start
    and (
      e.visibility = 'family'
      or exists (
        select 1 from public.event_participants ep
        where ep.event_id = e.id and ep.member_id = _member_id
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'due_at', t.due_at,
    'priority', t.priority,
    'points', t.points,
    'requires_approval', t.requires_approval
  ) order by t.due_at nulls last), '[]'::jsonb)
  into _tasks
  from public.tasks t
  where t.family_id = _family_id
    and (
      t.assignee_member_id = _member_id
      or t.created_by_member_id = _member_id
      or t.visibility = 'family'
    )
    and (
      (t.due_at is not null and t.due_at >= _start and t.due_at < _end)
      or (t.status in ('today','planned') and (t.due_at is null or t.due_at < _end))
    )
    and t.status <> 'done'
    and t.status <> 'archived';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', si.id,
    'title', si.title,
    'category', si.category,
    'quantity', si.quantity,
    'status', si.status
  ) order by si.created_at desc), '[]'::jsonb)
  into _shopping
  from public.shopping_items si
  where si.family_id = _family_id
    and si.status = 'open';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rb.id,
    'name', rb.name,
    'amount_cents', rb.amount_cents,
    'currency', rb.currency,
    'next_due_at', rb.next_due_at
  ) order by rb.next_due_at), '[]'::jsonb)
  into _bills
  from public.recurring_bills rb
  where rb.family_id = _family_id
    and rb.is_active = true
    and rb.next_due_at >= _start
    and rb.next_due_at < (_start + interval '7 days');

  return jsonb_build_object(
    'day', _day,
    'events', _events,
    'tasks', _tasks,
    'shopping_open', _shopping,
    'upcoming_bills', _bills
  );
end;
$$;

revoke all on function public.build_daily_digest(uuid, uuid, date) from public;
grant execute on function public.build_daily_digest(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- C) EVENT CONFLICT DETECTOR
-- ---------------------------------------------------------------------------

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
  updated_at timestamptz not null default now(),
  constraint chk_event_conflicts_distinct check (event_a_id <> event_b_id)
);

create trigger event_conflicts_set_updated_at
before update on public.event_conflicts
for each row execute function public.set_updated_at();

create unique index if not exists ux_event_conflicts_pair_member
  on public.event_conflicts(family_id, member_id,
    least(event_a_id, event_b_id),
    greatest(event_a_id, event_b_id),
    overlap_start, overlap_end
  );

create index if not exists idx_event_conflicts_family_time
  on public.event_conflicts(family_id, overlap_start);

alter table public.event_conflicts enable row level security;

drop policy if exists "event_conflicts_select_family" on public.event_conflicts;
create policy "event_conflicts_select_family"
on public.event_conflicts
for select
to authenticated
using (
  public.is_family_member(family_id)
  and (
    public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[])
    or member_id = public.my_member_id(family_id)
  )
);

drop policy if exists "event_conflicts_manage_admin_only" on public.event_conflicts;
create policy "event_conflicts_manage_admin_only"
on public.event_conflicts
for all
to authenticated
using (public.has_family_role(family_id, array['owner','admin']::public.member_role[]))
with check (public.has_family_role(family_id, array['owner','admin']::public.member_role[]));

create or replace function public.detect_event_conflicts(
  _family_id uuid,
  _member_id uuid,
  _window_start timestamptz,
  _window_end timestamptz
) returns table (
  event_a_id uuid,
  event_b_id uuid,
  overlap_start timestamptz,
  overlap_end timestamptz,
  severity int
)
language sql
stable
as $$
  with member_events as (
    select e.*
    from public.events e
    join public.event_participants ep on ep.event_id = e.id
    where e.family_id = _family_id
      and ep.member_id = _member_id
      and e.status <> 'cancelled'
      and e.starts_at < _window_end
      and e.ends_at > _window_start
  ),
  pairs as (
    select
      a.id as a_id,
      b.id as b_id,
      greatest(a.starts_at, b.starts_at) as o_start,
      least(a.ends_at, b.ends_at) as o_end,
      case
        when a.status = 'confirmed' and b.status = 'confirmed' then 3
        when a.all_day = true or b.all_day = true then 1
        else 2
      end as sev
    from member_events a
    join member_events b
      on a.id < b.id
     and a.starts_at < b.ends_at
     and b.starts_at < a.ends_at
  )
  select a_id, b_id, o_start, o_end, sev
  from pairs
  where o_start < o_end;
$$;

revoke all on function public.detect_event_conflicts(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.detect_event_conflicts(uuid, uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.refresh_event_conflicts_for_member(
  _family_id uuid,
  _member_id uuid,
  _window_start timestamptz,
  _window_end timestamptz
) returns int
language plpgsql
security definer
as $$
declare
  _count int := 0;
begin
  delete from public.event_conflicts ec
  where ec.family_id = _family_id
    and ec.member_id = _member_id
    and ec.overlap_start < _window_end
    and ec.overlap_end > _window_start;

  insert into public.event_conflicts(
    family_id, member_id, event_a_id, event_b_id, overlap_start, overlap_end, severity
  )
  select
    _family_id, _member_id, d.event_a_id, d.event_b_id, d.overlap_start, d.overlap_end, d.severity
  from public.detect_event_conflicts(_family_id, _member_id, _window_start, _window_end) d
  on conflict do nothing;

  get diagnostics _count = row_count;
  return _count;
end;
$$;

revoke all on function public.refresh_event_conflicts_for_member(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.refresh_event_conflicts_for_member(uuid, uuid, timestamptz, timestamptz) to authenticated;

commit;
