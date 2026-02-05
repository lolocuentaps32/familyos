/* ============================================================================
   FamilyOS — Fix: Missing RLS Delete Policies
   Objetivo: Permitir que dueños, admins y adultos eliminen registros en las tablas core.
   ============================================================================ */

begin;

-- 1) SHOPPING_ITEMS
drop policy if exists "shopping_delete" on public.shopping_items;
create policy "shopping_delete"
on public.shopping_items
for delete
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

-- 2) TASKS
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete"
on public.tasks
for delete
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

-- 3) EVENTS
drop policy if exists "events_delete" on public.events;
create policy "events_delete"
on public.events
for delete
to authenticated
using (public.has_family_role(family_id, array['owner','admin','adult']::public.member_role[]));

commit;
