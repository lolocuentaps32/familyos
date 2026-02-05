import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './useSession'

export type FamilyOption = {
  family_id: string
  role: string
  name: string
}

const LS_KEY = 'familyos.active_family_id'

export function useActiveFamily() {
  const { session } = useSession()
  const [families, setFamilies] = useState<FamilyOption[]>([])
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fromLS = localStorage.getItem(LS_KEY)
    if (fromLS) setActiveFamilyId(fromLS)
  }, [])

  useEffect(() => {
    if (!session) return

    ;(async () => {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('family_members')
        .select('family_id, role, families(name)')
        .eq('auth_user_id', session.user.id)
        .eq('status', 'active')

      if (error) {
        setError(error.message)
        setFamilies([])
        setLoading(false)
        return
      }

      const opts: FamilyOption[] = (data ?? []).map((r: any) => ({
        family_id: r.family_id,
        role: r.role,
        name: r.families?.name ?? 'Familia'
      }))

      setFamilies(opts)

      if (!activeFamilyId && opts.length > 0) {
        setActiveFamilyId(opts[0].family_id)
        localStorage.setItem(LS_KEY, opts[0].family_id)
      } else if (activeFamilyId && !opts.some((o) => o.family_id === activeFamilyId) && opts.length > 0) {
        setActiveFamilyId(opts[0].family_id)
        localStorage.setItem(LS_KEY, opts[0].family_id)
      }

      setLoading(false)
    })()
  }, [session, activeFamilyId])

  const active = useMemo(() => families.find((f) => f.family_id === activeFamilyId) ?? null, [families, activeFamilyId])

  function setActiveFamily(familyId: string) {
    setActiveFamilyId(familyId)
    localStorage.setItem(LS_KEY, familyId)
  }

  return { families, activeFamilyId, activeFamily: active, setActiveFamily, loading, error }
}
