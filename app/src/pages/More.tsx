import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import { useNavigate } from 'react-router-dom'
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

type ShoppingItem = {
  id: string
  title: string
  quantity: number
  status: string
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const sections = [
  { id: 'shopping', icon: '🛒', label: 'Compra', color: 'var(--pastel-green)' },
  { id: 'routines', icon: '📋', label: 'Rutinas', color: 'var(--pastel-purple)' },
  { id: 'bills', icon: '💰', label: 'Facturas', color: 'var(--pastel-orange)' },
]

export default function MorePage() {
  const { activeFamilyId } = useActiveFamily()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [routines, setRoutines] = useState<RoutineRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])

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

  async function loadShopping() {
    if (!activeFamilyId) return
    const { data } = await supabase
      .from('shopping_items')
      .select('id,title,quantity,status')
      .eq('family_id', activeFamilyId)
      .neq('status', 'purchased')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setShoppingItems(data as any)
  }

  useEffect(() => {
    loadRoutines()
    loadBills()
    loadShopping()
  }, [activeFamilyId])

  async function toggleRoutine(r: RoutineRow) {
    const { error } = await supabase
      .from('routines')
      .update({ is_active: !r.is_active })
      .eq('id', r.id)
    if (!error) loadRoutines()
  }

  async function toggleShoppingDone(item: ShoppingItem) {
    const next = item.status === 'purchased' ? 'open' : 'purchased'
    const { error } = await supabase
      .from('shopping_items')
      .update({ status: next })
      .eq('id', item.id)
    if (!error) loadShopping()
  }

  function getSectionCount(id: string) {
    switch (id) {
      case 'shopping': return shoppingItems.length
      case 'routines': return routines.length
      case 'bills': return bills.length
      default: return 0
    }
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
                {getSectionCount(s.id)}
              </span>
            </button>
          ))}
        </div>

        {/* Contenido expandido */}
        <div className={`section-content ${activeSection ? 'open' : ''}`}>
          {/* Shopping */}
          {activeSection === 'shopping' && (
            <div className="card">
              <h3>🛒 Lista de Compra</h3>
              {shoppingItems.length === 0 ? (
                <p className="muted">No hay items pendientes. Usa "+ Añadir" para crear uno.</p>
              ) : (
                <div className="list">
                  {shoppingItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="item" onClick={() => toggleShoppingDone(item)}>
                      <div>
                        <div className="item-title">
                          {item.title}
                          {item.quantity > 1 && <span className="muted" style={{ marginLeft: 8 }}>×{item.quantity}</span>}
                        </div>
                      </div>
                      <button className="checkbox-btn" title="Marcar como comprado" />
                    </div>
                  ))}
                </div>
              )}
              {shoppingItems.length > 10 && (
                <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                  +{shoppingItems.length - 10} items más...
                </p>
              )}
            </div>
          )}

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
