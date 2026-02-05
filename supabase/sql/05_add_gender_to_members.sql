-- Add gender field to members table
-- This allows storing member gender for appropriate emoji display

begin;

-- Create gender enum type
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_gender') then
    create type public.member_gender as enum ('man','woman','boy','girl');
  end if;
end $$;

-- Add gender column to members table
alter table public.members
add column if not exists gender public.member_gender;

-- Update list_family_members RPC to include gender
create or replace function public.list_family_members(p_family_id uuid)
returns table (
  member_id uuid,
  display_name text,
  role text,
  status text,
  auth_email text,
  gender text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo miembros de la familia pueden ver la lista
  if not public.is_family_member(p_family_id) then
    raise exception 'No eres miembro de esta familia';
  end if;

  return query
  select
    m.id as member_id,
    m.display_name,
    fm.role::text,
    fm.status::text,
    u.email as auth_email,
    m.gender::text
  from public.family_members fm
  join public.members m on m.id = fm.member_id
  join auth.users u on u.id = fm.auth_user_id
  where fm.family_id = p_family_id
  order by
    case fm.role
      when 'owner' then 1
      when 'admin' then 2
      when 'adult' then 3
      when 'child' then 4
    end,
    m.display_name;
end;
$$;

-- Update invite_member_by_email to accept gender parameter
create or replace function public.invite_member_by_email(
  p_family_id uuid,
  p_email text,
  p_role text default 'adult',
  p_display_name text default null,
  p_gender text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_target_user_id uuid;
  v_member_id uuid;
  v_display text;
  v_role public.member_role;
  v_gender public.member_gender;
  v_existing_member uuid;
begin
  -- Verificar sesión
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'No hay sesión activa';
  end if;

  -- Verificar que el caller es admin/owner de esta familia
  if not public.has_family_role(p_family_id, array['owner','admin']::public.member_role[]) then
    raise exception 'Solo admins pueden invitar miembros';
  end if;

  -- Convertir rol
  v_role := p_role::public.member_role;

  -- Convertir género si se proporcionó
  if p_gender is not null and trim(p_gender) != '' then
    v_gender := p_gender::public.member_gender;
  end if;

  -- Buscar usuario por email
  select id into v_target_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_target_user_id is null then
    -- Usuario no existe aún
    return jsonb_build_object(
      'success', false,
      'error', 'El usuario no tiene cuenta. Debe registrarse primero con este email.'
    );
  end if;

  -- Verificar si ya es miembro
  select fm.member_id into v_existing_member
  from public.family_members fm
  where fm.family_id = p_family_id
    and fm.auth_user_id = v_target_user_id;

  if v_existing_member is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'Este usuario ya es miembro de la familia'
    );
  end if;

  -- Nombre a mostrar
  v_display := coalesce(
    nullif(trim(p_display_name), ''),
    split_part(p_email, '@', 1)
  );

  -- Crear member con género
  insert into public.members (family_id, display_name, gender)
  values (p_family_id, v_display, v_gender)
  returning id into v_member_id;

  -- Crear family_member como invitado
  insert into public.family_members (family_id, member_id, auth_user_id, role, status)
  values (p_family_id, v_member_id, v_target_user_id, v_role, 'invited');

  return jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'message', 'Invitación enviada'
  );
end;
$$;

grant execute on function public.invite_member_by_email(uuid, text, text, text, text) to authenticated;

-- Update create_family_with_owner to optionally accept gender
create or replace function public.create_family_with_owner(
  p_name text,
  p_display_name text default null,
  p_gender text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_member_id uuid;
  v_display text;
  v_gender public.member_gender;
begin
  -- Obtener usuario autenticado
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No hay sesión activa';
  end if;

  -- Nombre a mostrar: usar parámetro o extraer del email
  v_display := coalesce(
    nullif(trim(p_display_name), ''),
    split_part(
      (select email from auth.users where id = v_user_id),
      '@',
      1
    )
  );

  -- Convertir género si se proporcionó
  if p_gender is not null and trim(p_gender) != '' then
    v_gender := p_gender::public.member_gender;
  end if;

  -- Crear familia
  insert into public.families (name)
  values (trim(p_name))
  returning id into v_family_id;

  -- Crear member con género
  insert into public.members (family_id, display_name, gender)
  values (v_family_id, v_display, v_gender)
  returning id into v_member_id;

  -- Crear family_member como owner
  insert into public.family_members (family_id, member_id, auth_user_id, role, status)
  values (v_family_id, v_member_id, v_user_id, 'owner', 'active');

  return v_family_id;
end;
$$;

grant execute on function public.create_family_with_owner(text, text, text) to authenticated;

commit;
