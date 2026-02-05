import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useActiveFamily } from './useActiveFamily'

export type FamilyMember = {
    member_id: string
    display_name: string
    role: string
    status: string
    auth_email: string | null
    gender: 'man' | 'woman' | 'boy' | 'girl' | null
}

export function useFamilyMembers() {
    const { activeFamilyId } = useActiveFamily()
    const [members, setMembers] = useState<FamilyMember[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!activeFamilyId) {
            setMembers([])
            setLoading(false)
            return
        }

        setLoading(true)
        supabase
            .rpc('list_family_members', { p_family_id: activeFamilyId })
            .then(({ data, error }) => {
                if (error) {
                    console.warn('useFamilyMembers:', error.message)
                    setMembers([])
                } else {
                    setMembers(Array.isArray(data) ? data : [])
                }
                setLoading(false)
            })
    }, [activeFamilyId])

    return { members, loading }
}
