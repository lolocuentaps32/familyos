import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'

type ItemRow = { id: string; title: string; quantity: number; category: string | null; status: string }

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

function getCategoryLabel(cat: string | null) {
  if (!cat) return null
  const found = CATEGORIES.find(c => c.value === cat)
  return found?.label ?? cat
}

export default function ShoppingPage() {
  const { activeFamilyId } = useActiveFamily()
  const [items, setItems] = useState<ItemRow[]>([])
  const [title, setTitle] = useState('')
  const [qty, setQty] = useState(1)
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    if (!activeFamilyId) return
    setErr(null)
    const { data, error } = await supabase
      .from('shopping_items')
      .select('id,title,quantity,category,status')
      .eq('family_id', activeFamilyId)
      .order('status', { ascending: true })
      .order('category', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) setErr(error.message)
    else setItems((data as any) ?? [])
  }

  useEffect(() => { load() }, [activeFamilyId])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!activeFamilyId || !title.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const { error } = await supabase.from('shopping_items').insert({
        family_id: activeFamilyId,
        title: title.trim(),
        quantity: qty,
        category: category || null,
        status: 'open'
      })
      if (error) throw error
      setTitle('')
      setQty(1)
      setCategory('')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Error añadiendo')
    } finally {
      setBusy(false)
    }
  }

  async function toggleDone(it: ItemRow) {
    const next = it.status === 'purchased' ? 'open' : 'purchased'
    const { error } = await supabase.from('shopping_items').update({ status: next }).eq('id', it.id)
    if (error) setErr(error.message)
    else load()
  }

  const openItems = items.filter(i => i.status !== 'purchased')
  const doneItems = items.filter(i => i.status === 'purchased')

  // Agrupar por categoría
  const grouped = openItems.reduce((acc, it) => {
    const cat = it.category || ''
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(it)
    return acc
  }, {} as Record<string, ItemRow[]>)

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })

  return (
    <div className="page">
      <div className="card">
        <h2>🛒 Lista de compra</h2>

        <form onSubmit={addItem} style={{ marginTop: 20 }}>
          <label>¿Qué necesitas?</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leche, pan, frutas..."
          />

          <div className="grid" style={{ marginTop: 16 }}>
            <div>
              <label>Cantidad</label>
              <input
                className="input"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </div>
            <div>
              <label>Categoría</label>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn" disabled={busy || !title.trim()}>
              {busy ? 'Añadiendo...' : '➕ Añadir'}
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
          <span className="section-icon">📝</span>
          <h3 className="section-title">Por comprar ({openItems.length})</h3>
        </div>
        <div className="list">
          {openItems.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🛍️</div>
              <div className="empty-state-text">¡Lista vacía! Añade algo arriba</div>
            </div>
          )}
          {sortedCategories.map(cat => (
            <div key={cat || 'none'}>
              {cat && (
                <div style={{ padding: '8px 0', fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  {getCategoryLabel(cat)}
                </div>
              )}
              {grouped[cat].map((it) => (
                <div key={it.id} className="item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <button
                      className="checkbox-btn"
                      onClick={() => toggleDone(it)}
                      title="Marcar como comprado"
                    />
                    <div>
                      <div className="item-title">
                        {it.title}
                        {it.quantity > 1 && <span className="muted" style={{ marginLeft: 8 }}>×{it.quantity}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {doneItems.length > 0 && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">✅</span>
            <h3 className="section-title">Comprado ({doneItems.length})</h3>
          </div>
          <div className="list">
            {doneItems.slice(0, 10).map((it) => (
              <div key={it.id} className="item done">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <button
                    className="checkbox-btn checked"
                    onClick={() => toggleDone(it)}
                    title="Volver a lista"
                  />
                  <div>
                    <div className="item-title">
                      {it.title}
                      {it.quantity > 1 && <span className="muted" style={{ marginLeft: 8 }}>×{it.quantity}</span>}
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
