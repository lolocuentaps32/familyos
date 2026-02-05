import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import { isoLocalToUtc } from '../lib/dateUtils'
type EventRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string | null
  status: string
  all_day: boolean
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



  async function updateEventStatus(id: string, newStatus: string) {
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', id)
    if (error) setErr(error.message)
    else load()
  }

  return (
    <div className="page">
      <div className="card">
        <h2>📅 Calendario</h2>

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
                  {ev.location && ` · 📍 ${ev.location} `}
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
