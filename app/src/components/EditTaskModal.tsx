import { useState, useEffect } from 'react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from '../lib/useFamilyMembers'

interface TaskData {
    id: string
    title: string
    status: string
    due_at: string | null
    priority: number
    assignee_member_id: string | null
}

interface Props {
    isOpen: boolean
    onClose: () => void
    task: TaskData | null
    familyId: string | null
    onUpdated?: () => void
}

export default function EditTaskModal({ isOpen, onClose, task, familyId, onUpdated }: Props) {
    const [title, setTitle] = useState('')
    const [due, setDue] = useState('')
    const [priority, setPriority] = useState(2)
    const [assignee, setAssignee] = useState('')
    const [status, setStatus] = useState('today')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const { members } = useFamilyMembers(familyId)

    useEffect(() => {
        if (task) {
            setTitle(task.title)
            setDue(task.due_at ? task.due_at.split('T')[0] : '')
            setPriority(task.priority)
            setAssignee(task.assignee_member_id || '')
            setStatus(task.status)
        }
    }, [task])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!task || !title.trim()) return

        setBusy(true)
        setErr(null)
        try {
            const payload: any = {
                title: title.trim(),
                priority,
                status,
                assignee_member_id: assignee || null,
                due_at: due ? new Date(due).toISOString() : null
            }

            const { error } = await supabase.from('tasks').update(payload).eq('id', task.id)
            if (error) throw error

            onUpdated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error actualizando tarea')
        } finally {
            setBusy(false)
        }
    }

    async function confirmDelete() {
        if (!task) return
        setBusy(true)
        setShowDeleteConfirm(false)
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', task.id)
            if (error) throw error
            onUpdated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error eliminando')
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="✏️ Editar Tarea">
                <form onSubmit={handleSubmit}>
                    {err && <p className="err">{err}</p>}

                    <label>Título</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />

                    <label style={{ marginTop: 12 }}>Estado</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="today">📋 Pendiente</option>
                        <option value="done">✅ Completada</option>
                        <option value="archived">📦 Archivada</option>
                    </select>

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

                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                        <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
                            {busy ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={busy}
                        >
                            🗑️
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title="Eliminar tarea"
                message={`¿Seguro que quieres eliminar "${title}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </>
    )
}
