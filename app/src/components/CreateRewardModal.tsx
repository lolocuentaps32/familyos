import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

interface Props {
    isOpen: boolean
    onClose: () => void
    familyId: string | null
    onCreated?: () => void
}

const ICONS = ['🎁', '🍦', '🎮', '📱', '🎬', '🍕', '🛍️', '🎠', '⚽', '🏖️', '🎂', '💰']

export default function CreateRewardModal({ isOpen, onClose, familyId, onCreated }: Props) {
    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [pointsCost, setPointsCost] = useState(10)
    const [icon, setIcon] = useState('🎁')
    const [stock, setStock] = useState<number | null>(null)

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

        const { error } = await supabase.from('reward_items').insert({
            family_id: familyId,
            title: title.trim(),
            description: description.trim() || null,
            points_cost: pointsCost,
            icon,
            stock,
            is_active: true,
            created_by_member_id: myData?.member_id
        })

        setLoading(false)

        if (!error) {
            setTitle('')
            setDescription('')
            setPointsCost(10)
            setIcon('🎁')
            setStock(null)
            onClose()
            onCreated?.()
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="🎁 Nuevo Premio">
            <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                    <label>Nombre del premio</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ej: 30 minutos de videojuegos"
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Descripción (opcional)</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Detalles del premio..."
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
                                    background: icon === i ? 'var(--pastel-yellow)' : 'var(--surface)',
                                    cursor: 'pointer'
                                }}
                            >
                                {i}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label>Coste en puntos</label>
                    <input
                        type="number"
                        value={pointsCost}
                        onChange={(e) => setPointsCost(Math.max(1, Number(e.target.value)))}
                        min={1}
                        max={1000}
                    />
                </div>

                <div className="form-group">
                    <label>Stock (dejar vacío para ilimitado)</label>
                    <input
                        type="number"
                        value={stock ?? ''}
                        onChange={(e) => setStock(e.target.value ? Number(e.target.value) : null)}
                        min={1}
                        placeholder="Ilimitado"
                    />
                    <small className="form-hint">
                        Número de veces que se puede canjear este premio
                    </small>
                </div>

                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="submit" className="btn-primary" disabled={loading || !title.trim()}>
                        {loading ? 'Creando...' : 'Crear Premio'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
