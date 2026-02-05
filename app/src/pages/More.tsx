import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import './More.css'

type RoutineRow = {
  id: string
  name: string
  context: string | null
  is_active: boolean
}

type BillRow = {
  id: string
  name: string
  amount_cents: number
  next_due_at: string
  currency: string
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const sections = [
  { id: 'routines', icon: '📋', label: 'Rutinas', color: 'var(--pastel-purple)' },
  { id: 'bills', icon: '💰', label: 'Facturas', color: 'var(--pastel-orange)' },
]

export default function MorePage() {
  const { activeFamilyId } = useActiveFamily()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [routines, setRoutines] = useState<RoutineRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])

  async function loadRoutines() {
    if (!activeFamilyId) return
    const { data } = await supabase
      .from('routines')
      .select('id,name,context,is_active')
      .eq('family_id', activeFamilyId)
      .order('name')
      .limit(50)
    if (data) setRoutines(data as any)
  }

  async function loadBills() {
    if (!activeFamilyId) return
    const { data } = await supabase
      .from('recurring_bills')
      .select('id,name,amount_cents,next_due_at,currency')
      .eq('family_id', activeFamilyId)
      .eq('is_active', true)
      .order('next_due_at')
      .limit(50)
    if (data) setBills(data as any)
  }

  useEffect(() => {
    loadRoutines()
    loadBills()
  }, [activeFamilyId])

  async function toggleRoutine(r: RoutineRow) {
    const { error } = await supabase
      .from('routines')
      .update({ is_active: !r.is_active })
      .eq('id', r.id)
    if (!error) loadRoutines()
  }

  return (
    <div className="page">
      <div className="more-hub">
        <h2>📂 Más Secciones</h2>

        {/* Fan Animation Grid */}
        <div className="fan-grid">
          {sections.map((s, i) => (
            <button
              key={s.id}
              className={`fan-item ${activeSection === s.id ? 'active' : ''}`}
              style={{
                '--fan-color': s.color,
                '--fan-index': i
              } as React.CSSProperties}
              onClick={() => setActiveSection(activeSection === s.id ? null : s.id)}
            >
              <span className="fan-icon">{s.icon}</span>
              <span className="fan-label">{s.label}</span>
              <span className="fan-count">
                {s.id === 'routines' ? routines.length : bills.length}
              </span>
            </button>
          ))}
        </div>

        {/* Contenido expandido */}
        <div className={`section-content ${activeSection ? 'open' : ''}`}>
          {/* Rutinas */}
          {activeSection === 'routines' && (
            <div className="card">
              <h3>📋 Rutinas</h3>
              {routines.length === 0 ? (
                <p className="muted">No hay rutinas. Usa "+ Añadir" para crear una.</p>
              ) : (
                <div className="list">
                  {routines.map((r) => (
                    <div key={r.id} className="item" onClick={() => toggleRoutine(r)}>
                      <div>
                        <div className="item-title">{r.name}</div>
                        {r.context && <div className="item-subtitle">{r.context}</div>}
                      </div>
                      <span className={r.is_active ? 'badge badge-success' : 'badge badge-muted'}>
                        {r.is_active ? 'Activa' : 'Pausada'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Facturas */}
          {activeSection === 'bills' && (
            <div className="card">
              <h3>💰 Facturas Recurrentes</h3>
              {bills.length === 0 ? (
                <p className="muted">No hay facturas. Usa "+ Añadir" para crear una.</p>
              ) : (
                <div className="list">
                  {bills.map((b) => (
                    <div key={b.id} className="item">
                      <div>
                        <div className="item-title">{b.name}</div>
                        <div className="item-subtitle">Vence: {formatDate(b.next_due_at)}</div>
                      </div>
                      <span className="badge badge-warning">
                        {formatCurrency(b.amount_cents, b.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
