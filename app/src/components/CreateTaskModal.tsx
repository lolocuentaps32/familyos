import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from '../lib/useFamilyMembers'

interface Props {
    isOpen: boolean
    onClose: () => void
    familyId: string | null
    onCreated?: () => void
}

export default function CreateTaskModal({ isOpen, onClose, familyId, onCreated }: Props) {
    const [title, setTitle] = useState('')
    const [due, setDue] = useState('')
    const [priority, setPriority] = useState(2)
    const [assignee, setAssignee] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const { members } = useFamilyMembers(familyId)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!familyId || !title.trim()) return

        setBusy(true)
        setErr(null)
        try {
            const payload: any = {
                family_id: familyId,
                title: title.trim(),
                status: 'today',
                visibility: 'family',
                priority
            }
            if (due) payload.due_at = new Date(due).toISOString()
            if (assignee) payload.assignee_member_id = assignee

            const { error } = await supabase.from('tasks').insert(payload)
            if (error) throw error

            // Reset
            setTitle('')
            setDue('')
            setPriority(2)
            setAssignee('')
            onCreated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error creando tarea')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="✅ Nueva Tarea">
            <form onSubmit={handleSubmit}>
                {err && <p className="err">{err}</p>}

                <label>Título</label>
                <input
                    type="text"
                    placeholder="¿Qué hay que hacer?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />

                <label style={{ marginTop: 12 }}>Fecha límite</label>
                <input
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                />

                <label style={{ marginTop: 12 }}>Prioridad</label>
                <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                    <option value={1}>🔴 Alta</option>
                    <option value={2}>🟡 Media</option>
                    <option value={3}>🟢 Baja</option>
                </select>

                <label style={{ marginTop: 12 }}>Asignar a</label>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    <option value="">Sin asignar</option>
                    {members.map((m) => (
                        <option key={m.member_id} value={m.member_id}>{m.display_name}</option>
                    ))}
                </select>

                <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 20, width: '100%' }}>
                    {busy ? 'Creando...' : 'Crear Tarea'}
                </button>
            </form>
        </Modal>
    )
}
