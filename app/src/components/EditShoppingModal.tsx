import { useState, useEffect } from 'react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
    { value: '', label: '📦 Sin categoría' },
    { value: 'frutas', label: '🍎 Frutas y verduras' },
    { value: 'lacteos', label: '🥛 Lácteos' },
    { value: 'carnes', label: '🥩 Carnes' },
    { value: 'panaderia', label: '🍞 Panadería' },
    { value: 'bebidas', label: '🥤 Bebidas' },
    { value: 'limpieza', label: '🧹 Limpieza' },
    { value: 'higiene', label: '🧴 Higiene' },
    { value: 'otros', label: '📦 Otros' }
]

interface ShoppingData {
    id: string
    title: string
    quantity: number
    category: string | null
    status: string
}

interface Props {
    isOpen: boolean
    onClose: () => void
    item: ShoppingData | null
    onUpdated?: () => void
}

export default function EditShoppingModal({ isOpen, onClose, item, onUpdated }: Props) {
    const [title, setTitle] = useState('')
    const [qty, setQty] = useState(1)
    const [category, setCategory] = useState('')
    const [status, setStatus] = useState('open')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    useEffect(() => {
        if (item) {
            setTitle(item.title)
            setQty(item.quantity)
            setCategory(item.category || '')
            setStatus(item.status)
        }
    }, [item])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!item || !title.trim()) return

        setBusy(true)
        setErr(null)
        try {
            const { error } = await supabase.from('shopping_items').update({
                title: title.trim(),
                quantity: qty,
                category: category || null,
                status
            }).eq('id', item.id)
            if (error) throw error

            onUpdated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error actualizando')
        } finally {
            setBusy(false)
        }
    }

    async function confirmDelete() {
        if (!item) return
        setBusy(true)
        setShowDeleteConfirm(false)
        try {
            const { error } = await supabase.from('shopping_items').delete().eq('id', item.id)
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
            <Modal isOpen={isOpen} onClose={onClose} title="🛒 Editar Artículo">
                <form onSubmit={handleSubmit}>
                    {err && <p className="err">{err}</p>}

                    <label>Nombre</label>
                    <input
                        type="text"
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
                        {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>

                    <label style={{ marginTop: 12 }}>Estado</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="open">📝 Por comprar</option>
                        <option value="purchased">✅ Comprado</option>
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
                title="Eliminar artículo"
                message={`¿Seguro que quieres eliminar "${title}"?`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </>
    )
}
