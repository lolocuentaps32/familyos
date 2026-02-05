import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'

interface Props {
    isOpen: boolean
    onClose: () => void
    familyId: string | null
    onCreated?: () => void
}

const categories = [
    '', 'Frutas', 'Verduras', 'Carnes', 'Lácteos', 'Panadería',
    'Limpieza', 'Higiene', 'Bebidas', 'Snacks', 'Congelados', 'Otros'
]

export default function CreateShoppingModal({ isOpen, onClose, familyId, onCreated }: Props) {
    const [title, setTitle] = useState('')
    const [qty, setQty] = useState(1)
    const [category, setCategory] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!familyId || !title.trim()) return

        setBusy(true)
        setErr(null)
        try {
            const { error } = await supabase.from('shopping_items').insert({
                family_id: familyId,
                title: title.trim(),
                quantity: qty,
                category: category || null,
                status: 'open'
            })
            if (error) throw error

            // Reset
            setTitle('')
            setQty(1)
            setCategory('')
            onCreated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error añadiendo')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="🛒 Artículo de Compra">
            <form onSubmit={handleSubmit}>
                {err && <p className="err">{err}</p>}

                <label>¿Qué necesitas?</label>
                <input
                    type="text"
                    placeholder="Ej: Leche, Pan..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />

                <label style={{ marginTop: 12 }}>Cantidad</label>
                <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                />

                <label style={{ marginTop: 12 }}>Categoría</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categories.map((c) => (
                        <option key={c} value={c}>{c || '— Sin categoría —'}</option>
                    ))}
                </select>

                <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 20, width: '100%' }}>
                    {busy ? 'Añadiendo...' : 'Añadir a la lista'}
                </button>
            </form>
        </Modal>
    )
}
