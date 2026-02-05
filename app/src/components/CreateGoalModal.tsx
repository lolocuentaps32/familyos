import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

interface Props {
    isOpen: boolean
    onClose: () => void
    familyId: string | null
    onCreated?: () => void
}

const ICONS = ['⭐', '🎯', '📚', '🧹', '🏃', '🎨', '🎵', '💪', '🧘', '🍎', '💤', '🦷']

export default function CreateGoalModal({ isOpen, onClose, familyId, onCreated }: Props) {
    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [points, setPoints] = useState(1)
    const [icon, setIcon] = useState('⭐')
    const [isRecurring, setIsRecurring] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!familyId || !title.trim()) return

        setLoading(true)

        // Get my member ID
        const { data: myData } = await supabase
            .from('family_members')
            .select('member_id')
            .eq('family_id', familyId)
            .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
            .single()

        const { error } = await supabase.from('reward_goals').insert({
            family_id: familyId,
            title: title.trim(),
            description: description.trim() || null,
            points,
            icon,
            is_recurring: isRecurring,
            is_active: true,
            created_by_member_id: myData?.member_id
        })

        setLoading(false)

        if (!error) {
            setTitle('')
            setDescription('')
            setPoints(1)
            setIcon('⭐')
            setIsRecurring(false)
            onClose()
            onCreated?.()
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="🎯 Nueva Meta">
            <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                    <label>Título</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ej: Hacer la cama"
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Descripción (opcional)</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Detalles adicionales..."
                        rows={2}
                    />
                </div>

                <div className="form-group">
                    <label>Icono</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {ICONS.map(i => (
                            <button
                                type="button"
                                key={i}
                                onClick={() => setIcon(i)}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    fontSize: '1.25rem',
                                    border: icon === i ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    borderRadius: '8px',
                                    background: icon === i ? 'var(--pastel-purple)' : 'var(--surface)',
                                    cursor: 'pointer'
                                }}
                            >
                                {i}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label>Puntos al completar</label>
                    <input
                        type="number"
                        value={points}
                        onChange={(e) => setPoints(Math.max(1, Number(e.target.value)))}
                        min={1}
                        max={100}
                    />
                </div>

                <div className="form-group">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={isRecurring}
                            onChange={(e) => setIsRecurring(e.target.checked)}
                        />
                        <span>Meta recurrente (diaria/semanal)</span>
                    </label>
                </div>

                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="submit" className="btn-primary" disabled={loading || !title.trim()}>
                        {loading ? 'Creando...' : 'Crear Meta'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
