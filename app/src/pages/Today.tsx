import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import { useFamilyMembers, FamilyMember } from '../lib/useFamilyMembers'
import { useSession } from '../lib/useSession'
import { getGenderEmoji } from '../lib/memberUtils'
import EditEventModal from '../components/EditEventModal'
import EditTaskModal from '../components/EditTaskModal'

type EventRow = { id: string; title: string; starts_at: string; ends_at: string; location: string | null; status: string; all_day: boolean }
type TaskRow = { id: string; title: string; status: string; due_at: string | null; priority: number; assignee_member_id: string | null }
type BillRow = { id: string; name: string; amount_cents: number; next_due_at: string; currency: string }

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
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
    case 'today': return 'Hoy'
    case 'done': return 'Hecho'
    default: return status
  }
}

function getMemberName(members: FamilyMember[], id: string | null) {
  if (!id) return null
  const m = members.find(x => x.member_id === id)
  if (!m) return null
  const emoji = getGenderEmoji(m.gender)
  return `${emoji} ${m.display_name}`
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100)
}

export default function TodayPage() {
  const { session } = useSession()
  const { activeFamilyId, families, loading: famLoading } = useActiveFamily()
  const { members } = useFamilyMembers()
  const [events, setEvents] = useState<EventRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [shoppingOpen, setShoppingOpen] = useState<number>(0)
  const [conflicts, setConflicts] = useState<number>(0)
  const [err, setErr] = useState<string | null>(null)

  // Edit modals
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null)
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null)

  const range = useMemo(() => {
    const s = startOfDay(new Date())
    const e = new Date(s)
    e.setDate(e.getDate() + 1)
    return { start: s.toISOString(), end: e.toISOString() }
  }, [])

  async function loadData() {
    if (!activeFamilyId) return
    setErr(null)

    const { data: ev, error: eErr } = await supabase
      .from('events')
      .select('id,title,starts_at,ends_at,location,status,all_day')
      .eq('family_id', activeFamilyId)
      .lt('starts_at', range.end)
      .gt('ends_at', range.start)
      .order('starts_at', { ascending: true })
      .limit(50)
    if (eErr) setErr(eErr.message)
    else setEvents((ev as any) ?? [])

    const { data: ts, error: tErr } = await supabase
      .from('tasks')
      .select('id,title,status,due_at,priority,assignee_member_id')
      .eq('family_id', activeFamilyId)
      .neq('status', 'done')
      .neq('status', 'archived')
      .order('priority', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20)
    if (tErr) setErr(tErr.message)
    else setTasks((ts as any) ?? [])

    const { count: shopCount } = await supabase
      .from('shopping_items')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', activeFamilyId)
      .eq('status', 'open')
    setShoppingOpen(shopCount ?? 0)

    const { count: cCount } = await supabase
      .from('event_conflicts')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', activeFamilyId)
      .gte('overlap_start', range.start)
      .lt('overlap_start', range.end)
    setConflicts(cCount ?? 0)

    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: billsData } = await supabase
      .from('recurring_bills')
      .select('id,name,amount_cents,next_due_at,currency')
      .eq('family_id', activeFamilyId)
      .eq('is_active', true)
      .lte('next_due_at', weekFromNow)
      .order('next_due_at', { ascending: true })
      .limit(10)
    setBills((billsData as any) ?? [])
  }

  useEffect(() => { loadData() }, [activeFamilyId, range.end, range.start])

  if (famLoading) return (
    <div className="page">
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <p className="muted">Cargando...</p>
      </div>
    </div>
  )

  if (!activeFamilyId) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👨‍👩‍👧‍👦</div>
          <h2 style={{ marginBottom: '8px' }}>¡Bienvenido a FamilyOS!</h2>
          <p className="muted" style={{ marginBottom: '20px' }}>
            Todavía no tienes una familia configurada.
          </p>
          <p className="muted">
            Ve a <strong>Más</strong> para crear tu primera familia.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header card - KEPT SEPARATE */}
      <div className="card">
        <h2>👋 Hola, {(() => {
          const currentMember = members.find(m => m.auth_email === session?.user.email)
          return currentMember?.display_name ?? session?.user.email?.split('@')[0] ?? 'Usuario'
        })()}</h2>

        <div className="grid stats-compact">
          <div className="stat-card-compact blue">
            <span className="stat-icon">📅</span>
            <span className="stat-value">{events.length}</span>
            <span className="stat-label">Eventos hoy</span>
          </div>
          <div className="stat-card-compact purple">
            <span className="stat-icon">✅</span>
            <span className="stat-value">{tasks.length}</span>
            <span className="stat-label">Tareas pendientes</span>
          </div>
          <div className="stat-card-compact green">
            <span className="stat-icon">🛒</span>
            <span className="stat-value">{shoppingOpen}</span>
            <span className="stat-label">Lista de compra</span>
          </div>
          <div className="stat-card-compact orange">
            <span className="stat-icon">⚠️</span>
            <span className="stat-value">{conflicts}</span>
            <span className="stat-label">Conflictos</span>
          </div>
        </div>

        {err && <p className="err" style={{ marginTop: '16px' }}>{err}</p>}
      </div>

      {/* Events card - KEPT SEPARATE */}
      <div className="card">
        <div className="section-header">
          <span className="section-icon">📅</span>
          <h3 className="section-title">Próximos eventos</h3>
        </div>
        <div className="list">
          {events.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🌤️</div>
              <div className="empty-state-text">No hay eventos para hoy</div>
            </div>
          )}
          {events.map((e) => (
            <div
              key={e.id}
              className="item item-clickable"
              onClick={() => setEditingEvent(e)}
            >
              <div>
                <div className="item-title">{e.all_day && '🌅 '}{e.title}</div>
                <div className="item-subtitle">
                  {e.all_day ? 'Todo el día' : (
                    <>
                      {new Date(e.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                      {new Date(e.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </>
                  )}
                  {e.location ? ` · 📍 ${e.location}` : ''}
                </div>
              </div>
              <span className={getStatusBadgeClass(e.status)}>{getStatusLabel(e.status)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks card - KEPT SEPARATE */}
      <div className="card">
        <div className="section-header">
          <span className="section-icon">✅</span>
          <h3 className="section-title">Tareas</h3>
        </div>
        <div className="list">
          {tasks.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🎉</div>
              <div className="empty-state-text">¡Sin tareas pendientes!</div>
            </div>
          )}
          {tasks.slice(0, 8).map((t) => {
            const assigneeName = getMemberName(members, t.assignee_member_id)
            return (
              <div
                key={t.id}
                className="item item-clickable"
                onClick={() => setEditingTask(t)}
              >
                <div>
                  <div className="item-title">{t.title}</div>
                  <div className="item-subtitle">
                    {t.due_at ? `📆 ${new Date(t.due_at).toLocaleDateString()}` : 'Sin fecha'}
                    {assigneeName && <span style={{ marginLeft: 8 }}>{assigneeName}</span>}
                  </div>
                </div>
                <span className={getStatusBadgeClass(t.status)}>{getStatusLabel(t.status)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bills card - KEPT SEPARATE */}
      {bills.length > 0 && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">💰</span>
            <h3 className="section-title">Facturas próximas</h3>
          </div>
          <div className="list">
            {bills.map((b) => (
              <div key={b.id} className="item item-clickable">
                <div>
                  <div className="item-title">{b.name}</div>
                  <div className="item-subtitle">
                    📆 {new Date(b.next_due_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="badge badge-warning">{formatCurrency(b.amount_cents, b.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {families.length > 1 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>
            👨‍👩‍👧 Tienes {families.length} familias · Cambia desde <strong>Más</strong>
          </p>
        </div>
      )}

      {/* Edit Modals */}
      <EditEventModal
        isOpen={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        event={editingEvent}
        onUpdated={loadData}
      />
      <EditTaskModal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        familyId={activeFamilyId}
        onUpdated={loadData}
      />
    </div>
  )
}
