-- ============================================================================
-- FamilyOS — Rewards System Schema (ClassDojo-style)
-- Sistema de puntos, metas, recompensas canjeables y feed familiar
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'redemption_status') THEN
    CREATE TYPE public.redemption_status AS ENUM ('pending', 'approved', 'delivered', 'rejected');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- reward_points: registro de puntos positivos/negativos
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  points int NOT NULL, -- positivo o negativo
  reason text NOT NULL,
  created_by_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  goal_id uuid, -- opcional, se llenará después de crear reward_goals
  evidence_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_points_family_member 
  ON public.reward_points(family_id, member_id);

CREATE INDEX IF NOT EXISTS idx_reward_points_created 
  ON public.reward_points(family_id, created_at DESC);

-- Trigger para updated_at no necesario (tabla insert-only)

-- ---------------------------------------------------------------------------
-- reward_goals: objetivos/metas para ganar puntos
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  points int NOT NULL DEFAULT 1,
  icon text DEFAULT '⭐',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text, -- RRULE format
  target_member_ids uuid[], -- null = todos los miembros
  is_active boolean NOT NULL DEFAULT true,
  created_by_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_goals_family 
  ON public.reward_goals(family_id, is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reward_goals_set_updated_at') THEN
    CREATE TRIGGER reward_goals_set_updated_at
    BEFORE UPDATE ON public.reward_goals
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Ahora añadimos la FK a reward_points
ALTER TABLE public.reward_points 
  DROP CONSTRAINT IF EXISTS reward_points_goal_id_fkey;
ALTER TABLE public.reward_points 
  ADD CONSTRAINT reward_points_goal_id_fkey 
  FOREIGN KEY (goal_id) REFERENCES public.reward_goals(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- reward_items: recompensas canjeables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  points_cost int NOT NULL,
  icon text DEFAULT '🎁',
  image_url text,
  stock int, -- null = ilimitado
  is_active boolean NOT NULL DEFAULT true,
  created_by_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_items_family 
  ON public.reward_items(family_id, is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reward_items_set_updated_at') THEN
    CREATE TRIGGER reward_items_set_updated_at
    BEFORE UPDATE ON public.reward_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- reward_redemptions: canjes de recompensas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reward_item_id uuid NOT NULL REFERENCES public.reward_items(id) ON DELETE CASCADE,
  points_spent int NOT NULL,
  status public.redemption_status NOT NULL DEFAULT 'pending',
  approved_by_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  approved_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_family_status 
  ON public.reward_redemptions(family_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reward_redemptions_set_updated_at') THEN
    CREATE TRIGGER reward_redemptions_set_updated_at
    BEFORE UPDATE ON public.reward_redemptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- family_feed: posts tipo portfolio/story
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.family_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  author_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  content text,
  media_urls text[],
  related_goal_id uuid REFERENCES public.reward_goals(id) ON DELETE SET NULL,
  related_points_id uuid REFERENCES public.reward_points(id) ON DELETE SET NULL,
  related_redemption_id uuid REFERENCES public.reward_redemptions(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_feed_family 
  ON public.family_feed(family_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- feed_reactions: reacciones emoji a posts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.family_feed(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '❤️',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feed_id, member_id)
);

-- ---------------------------------------------------------------------------
-- FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------------

-- Obtener balance de puntos de un miembro
CREATE OR REPLACE FUNCTION public.get_member_points_balance(_family_id uuid, _member_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(points), 0)::int
  FROM public.reward_points
  WHERE family_id = _family_id AND member_id = _member_id;
$$;

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

ALTER TABLE public.reward_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

-- reward_points
DROP POLICY IF EXISTS "reward_points_select" ON public.reward_points;
CREATE POLICY "reward_points_select" ON public.reward_points
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "reward_points_insert" ON public.reward_points;
CREATE POLICY "reward_points_insert" ON public.reward_points
  FOR INSERT TO authenticated
  WITH CHECK (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

DROP POLICY IF EXISTS "reward_points_delete" ON public.reward_points;
CREATE POLICY "reward_points_delete" ON public.reward_points
  FOR DELETE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin']::public.member_role[]));

-- reward_goals
DROP POLICY IF EXISTS "reward_goals_select" ON public.reward_goals;
CREATE POLICY "reward_goals_select" ON public.reward_goals
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "reward_goals_insert" ON public.reward_goals;
CREATE POLICY "reward_goals_insert" ON public.reward_goals
  FOR INSERT TO authenticated
  WITH CHECK (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

DROP POLICY IF EXISTS "reward_goals_update" ON public.reward_goals;
CREATE POLICY "reward_goals_update" ON public.reward_goals
  FOR UPDATE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]))
  WITH CHECK (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

DROP POLICY IF EXISTS "reward_goals_delete" ON public.reward_goals;
CREATE POLICY "reward_goals_delete" ON public.reward_goals
  FOR DELETE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin']::public.member_role[]));

-- reward_items
DROP POLICY IF EXISTS "reward_items_select" ON public.reward_items;
CREATE POLICY "reward_items_select" ON public.reward_items
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "reward_items_insert" ON public.reward_items;
CREATE POLICY "reward_items_insert" ON public.reward_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

DROP POLICY IF EXISTS "reward_items_update" ON public.reward_items;
CREATE POLICY "reward_items_update" ON public.reward_items
  FOR UPDATE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]))
  WITH CHECK (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

DROP POLICY IF EXISTS "reward_items_delete" ON public.reward_items;
CREATE POLICY "reward_items_delete" ON public.reward_items
  FOR DELETE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin']::public.member_role[]));

-- reward_redemptions
DROP POLICY IF EXISTS "reward_redemptions_select" ON public.reward_redemptions;
CREATE POLICY "reward_redemptions_select" ON public.reward_redemptions
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "reward_redemptions_insert" ON public.reward_redemptions;
CREATE POLICY "reward_redemptions_insert" ON public.reward_redemptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_family_member(family_id));

DROP POLICY IF EXISTS "reward_redemptions_update" ON public.reward_redemptions;
CREATE POLICY "reward_redemptions_update" ON public.reward_redemptions
  FOR UPDATE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]))
  WITH CHECK (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

-- family_feed
DROP POLICY IF EXISTS "family_feed_select" ON public.family_feed;
CREATE POLICY "family_feed_select" ON public.family_feed
  FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

DROP POLICY IF EXISTS "family_feed_insert" ON public.family_feed;
CREATE POLICY "family_feed_insert" ON public.family_feed
  FOR INSERT TO authenticated
  WITH CHECK (public.is_family_member(family_id));

DROP POLICY IF EXISTS "family_feed_delete" ON public.family_feed;
CREATE POLICY "family_feed_delete" ON public.family_feed
  FOR DELETE TO authenticated
  USING (public.has_family_role(family_id, ARRAY['owner','admin','adult']::public.member_role[]));

-- feed_reactions
DROP POLICY IF EXISTS "feed_reactions_select" ON public.feed_reactions;
CREATE POLICY "feed_reactions_select" ON public.feed_reactions
  FOR SELECT TO authenticated
  USING (EXISTS(
    SELECT 1 FROM public.family_feed f 
    WHERE f.id = feed_id AND public.is_family_member(f.family_id)
  ));

DROP POLICY IF EXISTS "feed_reactions_insert" ON public.feed_reactions;
CREATE POLICY "feed_reactions_insert" ON public.feed_reactions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS(
    SELECT 1 FROM public.family_feed f 
    WHERE f.id = feed_id AND public.is_family_member(f.family_id)
  ));

DROP POLICY IF EXISTS "feed_reactions_delete" ON public.feed_reactions;
CREATE POLICY "feed_reactions_delete" ON public.feed_reactions
  FOR DELETE TO authenticated
  USING (member_id = public.my_member_id((SELECT family_id FROM public.family_feed WHERE id = feed_id)));

COMMIT;
