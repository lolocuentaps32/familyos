import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'

type EventRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string | null
  status: string
  all_day: boolean
}

function isoLocalToUtc(isoLocal: string) {
  const d = new Date(isoLocal)
  return d.toISOString()
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'confirmed': return 'badge badge-success'
    case 'tentative': return 'badge badge-warning'
    case 'cancelled': return 'badge badge-danger'
    default: return 'badge badge-default'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'confirmed': return 'Confirmado'
    case 'tentative': return 'Pendiente'
    case 'cancelled': return 'Cancelado'
    default: return status
  }
}

export default function CalendarPage() {
  const { activeFamilyId } = useActiveFamily()
  const [items, setItems] = useState<EventRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [location, setLocation] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [status, setStatus] = useState<'confirmed' | 'tentative'>('confirmed')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!activeFamilyId) return
    setErr(null)
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('events')
      .select('id,title,starts_at,ends_at,location,status,all_day')
      .eq('family_id', activeFamilyId)
      .gte('ends_at', from)
      .order('starts_at', { ascending: true })
      .limit(100)
    if (error) setErr(error.message)
    else setItems((data as any) ?? [])
  }

  useEffect(() => { load() }, [activeFamilyId])

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!activeFamilyId) return
    if (!title.trim() || !start) return
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

      const { error } = await supabase.from('events').insert({
        family_id: activeFamilyId,
        title: title.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        location: location.trim() || null,
        all_day: allDay,
        status,
        visibility: 'family'
      })
      if (error) throw error
      setTitle('')
      setStart('')
      setEnd('')
      setLocation('')
      setAllDay(false)
      setStatus('confirmed')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Error creando evento')
    } finally {
      setBusy(false)
    }
  }

  async function updateEventStatus(id: string, newStatus: string) {
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', id)
    if (error) setErr(error.message)
    else load()
  }

  return (
    <div className="page">
      <div className="card">
        <h2>📅 Calendario</h2>
        <p className="muted" style={{ marginTop: 0 }}>Organiza los eventos de tu familia</p>

        <form onSubmit={createEvent} style={{ marginTop: 20 }}>
          <label>¿Qué evento quieres añadir?</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Colegio, médico, cumpleaños..."
          />

          <div style={{ marginTop: 16 }}>
            <label>📍 Ubicación (opcional)</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej: Hospital, casa de los abuelos..."
            />
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <label htmlFor="allDay" style={{ cursor: 'pointer', margin: 0 }}>
              🌅 Todo el día
            </label>
          </div>

          <div className="grid" style={{ marginTop: 16 }}>
            <div>
              <label>{allDay ? 'Fecha' : 'Empieza'}</label>
              <input
                className="input"
                type={allDay ? 'date' : 'datetime-local'}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            {!allDay && (
              <div>
                <label>Termina</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Estado</label>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'confirmed' | 'tentative')}
            >
              <option value="confirmed">✅ Confirmado</option>
              <option value="tentative">⏳ Pendiente</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn" disabled={busy || !title.trim() || !start || (!allDay && !end)}>
              {busy ? 'Guardando...' : '➕ Añadir evento'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={load}>
              🔄 Actualizar
            </button>
          </div>
        </form>

        {err && <p className="err" style={{ marginTop: 16 }}>{err}</p>}
      </div>

      <div className="card">
        <div className="section-header">
          <span className="section-icon">🗓️</span>
          <h3 className="section-title">Próximos eventos</h3>
        </div>
        <div className="list">
          {items.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">No hay eventos próximos</div>
            </div>
          )}
          {items.map((ev) => (
            <div key={ev.id} className="item">
              <div style={{ flex: 1 }}>
                <div className="item-title">
                  {ev.all_day && '🌅 '}
                  {ev.title}
                </div>
                <div className="item-subtitle">
                  📅 {new Date(ev.starts_at).toLocaleDateString()}
                  {!ev.all_day && (
                    <> · {new Date(ev.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(ev.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                  )}
                  {ev.location && ` · 📍 ${ev.location}`}
                </div>
              </div>
              <select
                className="input"
                value={ev.status}
                onChange={(e) => updateEventStatus(ev.id, e.target.value)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
              >
                <option value="confirmed">✅ Confirmado</option>
                <option value="tentative">⏳ Pendiente</option>
                <option value="cancelled">❌ Cancelado</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
