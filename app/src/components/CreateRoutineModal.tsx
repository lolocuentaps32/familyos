import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'

interface Props {
    isOpen: boolean
    onClose: () => void
    familyId: string | null
    onCreated?: () => void
}

export default function CreateRoutineModal({ isOpen, onClose, familyId, onCreated }: Props) {
    const [name, setName] = useState('')
    const [context, setContext] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!familyId || !name.trim()) return

        setBusy(true)
        setErr(null)
        try {
            const { error } = await supabase.from('routines').insert({
                family_id: familyId,
                name: name.trim(),
                context: context.trim() || null,
                is_active: true
            })
            if (error) throw error

            // Reset
            setName('')
            setContext('')
            onCreated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error creando rutina')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="📋 Nueva Rutina">
            <form onSubmit={handleSubmit}>
                {err && <p className="err">{err}</p>}

                <label>Nombre de la rutina</label>
                <input
                    type="text"
                    placeholder="Ej: Rutina de mañana, Preparar mochila..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />

                <label style={{ marginTop: 12 }}>Contexto (opcional)</label>
                <textarea
                    placeholder="Descripción o pasos de la rutina..."
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    rows={3}
                    style={{ resize: 'vertical' }}
                />

                <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 20, width: '100%' }}>
                    {busy ? 'Creando...' : 'Crear Rutina'}
                </button>
            </form>
        </Modal>
    )
}
