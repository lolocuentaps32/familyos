import { useState, useEffect } from 'react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { supabase } from '../lib/supabase'
import { isoLocalToUtc } from '../lib/dateUtils'

interface EventData {
    id: string
    title: string
    starts_at: string
    ends_at: string
    location: string | null
    status: string
    all_day: boolean
}

interface Props {
    isOpen: boolean
    onClose: () => void
    event: EventData | null
    onUpdated?: () => void
}

function toLocalInputValue(isoString: string, allDay: boolean): string {
    const d = new Date(isoString)
    if (allDay) {
        return d.toISOString().split('T')[0]
    }
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EditEventModal({ isOpen, onClose, event, onUpdated }: Props) {
    const [title, setTitle] = useState('')
    const [start, setStart] = useState('')
    const [end, setEnd] = useState('')
    const [location, setLocation] = useState('')
    const [allDay, setAllDay] = useState(false)
    const [status, setStatus] = useState('confirmed')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    useEffect(() => {
        if (event) {
            setTitle(event.title)
            setAllDay(event.all_day)
            setStart(toLocalInputValue(event.starts_at, event.all_day))
            setEnd(toLocalInputValue(event.ends_at, event.all_day))
            setLocation(event.location || '')
            setStatus(event.status)
        }
    }, [event])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!event || !title.trim() || !start) return
        if (!allDay && !end) return

        setBusy(true)
        setErr(null)
        try {
            const startsAt = allDay
                ? new Date(start + 'T00:00:00').toISOString()
                : isoLocalToUtc(start)
            const endsAt = allDay
                ? new Date(start + 'T23:59:59').toISOString()
                : isoLocalToUtc(end)

            const { error } = await supabase.from('events').update({
                title: title.trim(),
                starts_at: startsAt,
                ends_at: endsAt,
                location: location.trim() || null,
                all_day: allDay,
                status
            }).eq('id', event.id)
            if (error) throw error

            onUpdated?.()
            onClose()
        } catch (e: any) {
            setErr(e?.message ?? 'Error actualizando evento')
        } finally {
            setBusy(false)
        }
    }

    async function confirmDelete() {
        if (!event) return
        setBusy(true)
        setShowDeleteConfirm(false)
        try {
            const { error } = await supabase.from('events').delete().eq('id', event.id)
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
            <Modal isOpen={isOpen} onClose={onClose} title="📅 Editar Evento">
                <form onSubmit={handleSubmit}>
                    {err && <p className="err">{err}</p>}

                    <label>Título</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />

                    <label style={{ marginTop: 12 }}>📍 Ubicación</label>
                    <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Opcional"
                    />

                    <div className="checkbox-row" style={{ marginTop: 12 }}>
                        <input
                            type="checkbox"
                            checked={allDay}
                            onChange={(e) => setAllDay(e.target.checked)}
                        />
                        <span>Todo el día</span>
                    </div>

                    <label style={{ marginTop: 12 }}>{allDay ? 'Fecha' : 'Empieza'}</label>
                    <input
                        type={allDay ? 'date' : 'datetime-local'}
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        required
                    />

                    {!allDay && (
                        <>
                            <label style={{ marginTop: 12 }}>Termina</label>
                            <input
                                type="datetime-local"
                                value={end}
                                onChange={(e) => setEnd(e.target.value)}
                                required
                            />
                        </>
                    )}

                    <label style={{ marginTop: 12 }}>Estado</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="confirmed">✅ Confirmado</option>
                        <option value="tentative">⏳ Pendiente</option>
                        <option value="cancelled">❌ Cancelado</option>
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
                title="Eliminar evento"
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
