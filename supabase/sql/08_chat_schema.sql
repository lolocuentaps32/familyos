-- ============================================================================
-- FamilyOS — Chat System Schema (WhatsApp-style)
-- Chat grupal familiar con mensajes en tiempo real y multimedia
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- chat_messages: mensajes del chat familiar
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  sender_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content text,
  media_url text,
  media_type text, -- 'image', 'video', 'audio', 'file'
  media_thumbnail_url text,
  reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  is_system_message boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_family_time 
  ON public.chat_messages(family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_family_recent 
  ON public.chat_messages(family_id, created_at DESC) 
  WHERE is_deleted = false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'chat_messages_set_updated_at') THEN
    CREATE TRIGGER chat_messages_set_updated_at
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- chat_read_status: último mensaje leído por miembro
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(family_id, member_id)
);

-- ---------------------------------------------------------------------------
-- FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------------

-- Obtener número de mensajes no leídos
CREATE OR REPLACE FUNCTION public.get_unread_message_count(_family_id uuid, _member_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::int
  FROM public.chat_messages m
  WHERE m.family_id = _family_id
    AND m.is_deleted = false
    AND m.created_at > COALESCE(
      (SELECT last_read_at FROM public.chat_read_status 
       WHERE family_id = _family_id AND member_id = _member_id),
      '1970-01-01'::timestamptz
    );
$$;

-- Marcar mensajes como leídos
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(_family_id uuid, _message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _member_id uuid;
BEGIN
  _member_id := public.my_member_id(_family_id);
  
  INSERT INTO public.chat_read_status (family_id, member_id, last_read_message_id, last_read_at)
  VALUES (_family_id, _member_id, _message_id, now())
  ON CONFLICT (family_id, member_id) 
  DO UPDATE SET 
    last_read_message_id = _message_id,
    last_read_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_messages_as_read(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_messages_as_read(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_status ENABLE ROW LEVEL SECURITY;

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_family_member(family_id) 
    AND sender_member_id = public.my_member_id(family_id)
  );

DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_member_id = public.my_member_id(family_id)
    OR public.has_family_role(family_id, ARRAY['owner','admin']::public.member_role[])
  )
  WITH CHECK (
    sender_member_id = public.my_member_id(family_id)
    OR public.has_family_role(family_id, ARRAY['owner','admin']::public.member_role[])
  );

DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;
CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin']::public.member_role[]));

-- chat_read_status
DROP POLICY IF EXISTS "chat_read_status_select" ON public.chat_read_status;
CREATE POLICY "chat_read_status_select" ON public.chat_read_status
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "chat_read_status_upsert" ON public.chat_read_status;
CREATE POLICY "chat_read_status_upsert" ON public.chat_read_status
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_family_member(family_id) 
    AND member_id = public.my_member_id(family_id)
  );

DROP POLICY IF EXISTS "chat_read_status_update" ON public.chat_read_status;
CREATE POLICY "chat_read_status_update" ON public.chat_read_status
  FOR UPDATE TO authenticated
  USING (member_id = public.my_member_id(family_id))
  WITH CHECK (member_id = public.my_member_id(family_id));

-- ---------------------------------------------------------------------------
-- REALTIME SUBSCRIPTIONS
-- ---------------------------------------------------------------------------

-- Habilitar realtime para chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

COMMIT;
