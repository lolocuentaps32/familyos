import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import { useFamilyMembers, FamilyMember } from '../lib/useFamilyMembers'

type TaskRow = {
  id: string
  title: string
  status: string
  due_at: string | null
  priority: number
  assignee_member_id: string | null
}

const PRIORITY_OPTIONS = [
  { value: 1, label: '🔴 Alta', color: '#ff6b6b' },
  { value: 2, label: '🟡 Media', color: '#ffd93d' },
  { value: 3, label: '🟢 Baja', color: '#6bcb77' }
]

function getMemberName(members: FamilyMember[], id: string | null) {
  if (!id) return null
  const m = members.find(x => x.member_id === id)
  return m?.display_name ?? null
}

export default function TasksPage() {
  const { activeFamilyId } = useActiveFamily()
  const { members } = useFamilyMembers()
  const [items, setItems] = useState<TaskRow[]>([])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState(2)
  const [assignee, setAssignee] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!activeFamilyId) return
    setErr(null)
    const { data, error } = await supabase
      .from('tasks')
      .select('id,title,status,due_at,priority,assignee_member_id')
      .eq('family_id', activeFamilyId)
      .neq('status', 'archived')
      .order('status', { ascending: true })
      .order('priority', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200)
    if (error) setErr(error.message)
    else setItems((data as any) ?? [])
  }

  useEffect(() => { load() }, [activeFamilyId])

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!activeFamilyId || !title.trim()) return

    setBusy(true)
    setErr(null)
    try {
      const payload: any = {
        family_id: activeFamilyId,
        title: title.trim(),
        status: 'today',
        visibility: 'family',
        priority
      }
      if (due) payload.due_at = new Date(due).toISOString()
      if (assignee) payload.assignee_member_id = assignee
      const { error } = await supabase.from('tasks').insert(payload)
      if (error) throw error
      setTitle('')
      setDue('')
      setPriority(2)
      setAssignee('')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Error creando tarea')
    } finally {
      setBusy(false)
    }
  }

  async function toggleDone(t: TaskRow) {
    const nextStatus = t.status === 'done' ? 'today' : 'done'
    const { error } = await supabase.from('tasks').update({ status: nextStatus }).eq('id', t.id)
    if (error) setErr(error.message)
    else load()
  }

  const pendingTasks = items.filter(t => t.status !== 'done')
  const doneTasks = items.filter(t => t.status === 'done')

  return (
    <div className="page">
      <div className="card">
        <h2>✅ Tareas</h2>

        <form onSubmit={addTask} style={{ marginTop: 20 }}>
          <label>Nueva tarea</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Preparar mochilas, comprar leche..."
          />

          <div className="grid" style={{ marginTop: 16 }}>
            <div>
              <label>Prioridad</label>
              <select
                className="input"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Asignar a</label>
              <select
                className="input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">👪 Familia</option>
                {members.map(m => (
                  <option key={m.member_id} value={m.member_id}>
                    {m.role === 'child' ? '👶 ' : '👤 '}{m.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Fecha límite (opcional)</label>
            <input
              className="input"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn" disabled={busy || !title.trim()}>
              {busy ? 'Guardando...' : '➕ Añadir tarea'}
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
          <span className="section-icon">📋</span>
          <h3 className="section-title">Pendientes ({pendingTasks.length})</h3>
        </div>
        <div className="list">
          {pendingTasks.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🎉</div>
              <div className="empty-state-text">¡Todo completado!</div>
            </div>
          )}
          {pendingTasks.map((t) => {
            const assigneeName = getMemberName(members, t.assignee_member_id)
            const priorityInfo = PRIORITY_OPTIONS.find(p => p.value === t.priority)
            return (
              <div key={t.id} className="item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <button
                    className="checkbox-btn"
                    onClick={() => toggleDone(t)}
                    title="Marcar como hecha"
                  />
                  <div style={{ flex: 1 }}>
                    <div className="item-title">
                      {priorityInfo && <span style={{ marginRight: 6 }}>{priorityInfo.label.split(' ')[0]}</span>}
                      {t.title}
                    </div>
                    <div className="item-subtitle">
                      {t.due_at ? `📆 ${new Date(t.due_at).toLocaleDateString()}` : '📅 Sin fecha'}
                      {assigneeName && <span style={{ marginLeft: 8 }}>👤 {assigneeName}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {doneTasks.length > 0 && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">✨</span>
            <h3 className="section-title">Completadas ({doneTasks.length})</h3>
          </div>
          <div className="list">
            {doneTasks.slice(0, 10).map((t) => (
              <div key={t.id} className="item done">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <button
                    className="checkbox-btn checked"
                    onClick={() => toggleDone(t)}
                    title="Reabrir tarea"
                  />
                  <div>
                    <div className="item-title">{t.title}</div>
                    <div className="item-subtitle">
                      {t.due_at ? `📆 ${new Date(t.due_at).toLocaleDateString()}` : '📅 Sin fecha'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
