/* ============================================================================
   FamilyOS — Migración de Seguridad: Activar RLS en tablas desprotegidas
   ============================================================================ */

begin;

-- ---------------------------------------------------------------------------
-- 1) AUDIT_LOG: Solo lectura para admins de la familia
-- ---------------------------------------------------------------------------
alter table public.audit_log enable row level security;

drop policy if exists "audit_select_admin" on public.audit_log;
create policy "audit_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role])
  );

-- No permitir inserts/updates/deletes desde la API (solo desde funciones internas)
drop policy if exists "audit_no_direct_insert" on public.audit_log;
create policy "audit_no_direct_insert"
  on public.audit_log
  for insert
  to authenticated
  with check (false);

-- ---------------------------------------------------------------------------
-- 2) INVITES: Solo el destinatario o admins de la familia pueden ver
-- ---------------------------------------------------------------------------
alter table public.invites enable row level security;

drop policy if exists "invites_select" on public.invites;
create policy "invites_select"
  on public.invites
  for select
  to authenticated
  using (
    invited_email = (select email from auth.users where id = auth.uid())
    or has_family_role(family_id, array['owner'::member_role, 'admin'::member_role])
  );

drop policy if exists "invites_insert" on public.invites;
create policy "invites_insert"
  on public.invites
  for insert
  to authenticated
  with check (
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role])
  );

drop policy if exists "invites_delete" on public.invites;
create policy "invites_delete"
  on public.invites
  for delete
  to authenticated
  using (
    invited_email = (select email from auth.users where id = auth.uid())
    or has_family_role(family_id, array['owner'::member_role, 'admin'::member_role])
  );

-- ---------------------------------------------------------------------------
-- 3) ROUTINES: Solo miembros de la familia
-- ---------------------------------------------------------------------------
alter table public.routines enable row level security;

drop policy if exists "routines_select" on public.routines;
create policy "routines_select"
  on public.routines
  for select
  to authenticated
  using (is_family_member(family_id));

drop policy if exists "routines_insert" on public.routines;
create policy "routines_insert"
  on public.routines
  for insert
  to authenticated
  with check (
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role])
  );

drop policy if exists "routines_update" on public.routines;
create policy "routines_update"
  on public.routines
  for update
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]))
  with check (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]));

drop policy if exists "routines_delete" on public.routines;
create policy "routines_delete"
  on public.routines
  for delete
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role]));

-- ---------------------------------------------------------------------------
-- 4) ROUTINE_STEPS: Solo miembros de la familia (a través de routines)
-- ---------------------------------------------------------------------------
alter table public.routine_steps enable row level security;

drop policy if exists "routine_steps_select" on public.routine_steps;
create policy "routine_steps_select"
  on public.routine_steps
  for select
  to authenticated
  using (is_family_member(family_id));

drop policy if exists "routine_steps_insert" on public.routine_steps;
create policy "routine_steps_insert"
  on public.routine_steps
  for insert
  to authenticated
  with check (
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role])
  );

drop policy if exists "routine_steps_update" on public.routine_steps;
create policy "routine_steps_update"
  on public.routine_steps
  for update
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]))
  with check (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]));

drop policy if exists "routine_steps_delete" on public.routine_steps;
create policy "routine_steps_delete"
  on public.routine_steps
  for delete
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role]));

-- ---------------------------------------------------------------------------
-- 5) SHOPPING_LISTS: Solo miembros de la familia
-- ---------------------------------------------------------------------------
alter table public.shopping_lists enable row level security;

drop policy if exists "shopping_lists_select" on public.shopping_lists;
create policy "shopping_lists_select"
  on public.shopping_lists
  for select
  to authenticated
  using (is_family_member(family_id));

drop policy if exists "shopping_lists_insert" on public.shopping_lists;
create policy "shopping_lists_insert"
  on public.shopping_lists
  for insert
  to authenticated
  with check (
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role])
  );

drop policy if exists "shopping_lists_update" on public.shopping_lists;
create policy "shopping_lists_update"
  on public.shopping_lists
  for update
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]))
  with check (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]));

drop policy if exists "shopping_lists_delete" on public.shopping_lists;
create policy "shopping_lists_delete"
  on public.shopping_lists
  for delete
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role]));

-- ---------------------------------------------------------------------------
-- 6) VAULT_ITEMS: Solo adultos/admins de la familia (datos sensibles)
-- ---------------------------------------------------------------------------
alter table public.vault_items enable row level security;

drop policy if exists "vault_select" on public.vault_items;
create policy "vault_select"
  on public.vault_items
  for select
  to authenticated
  using (
    -- Solo adultos pueden ver items de la bóveda
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role])
  );

drop policy if exists "vault_insert" on public.vault_items;
create policy "vault_insert"
  on public.vault_items
  for insert
  to authenticated
  with check (
    has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role])
  );

drop policy if exists "vault_update" on public.vault_items;
create policy "vault_update"
  on public.vault_items
  for update
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]))
  with check (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role, 'adult'::member_role]));

drop policy if exists "vault_delete" on public.vault_items;
create policy "vault_delete"
  on public.vault_items
  for delete
  to authenticated
  using (has_family_role(family_id, array['owner'::member_role, 'admin'::member_role]));

commit;
