import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import { useSession } from '../lib/useSession'

type MemberRow = {
  member_id: string
  display_name: string
  role: string
  status: string
  auth_email: string
}

type InvitationRow = {
  family_id: string
  family_name: string
}

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

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100)
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function MorePage() {
  const { session } = useSession()
  const { families, activeFamilyId, activeFamily, setActiveFamily, loading, error } = useActiveFamily()

  // Estados
  const [members, setMembers] = useState<MemberRow[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<InvitationRow[]>([])
  const [routines, setRoutines] = useState<RoutineRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Crear familia
  const [creating, setCreating] = useState(false)
  const [newFamilyName, setNewFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')

  // Invitar miembro
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'adult' | 'child'>('adult')
  const [inviteDisplayName, setInviteDisplayName] = useState('')

  // Añadir factura
  const [addingBill, setAddingBill] = useState(false)
  const [billName, setBillName] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDue, setBillDue] = useState('')

  // Push notifications
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  // Cargar miembros de la familia activa
  async function loadMembers() {
    if (!activeFamilyId) return

    try {
      const { data, error } = await supabase.rpc('list_family_members', {
        p_family_id: activeFamilyId
      })

      if (error) {
        console.warn('loadMembers:', error.message)
        setMembers([])
      } else {
        setMembers(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.warn('loadMembers exception:', e)
      setMembers([])
    }
  }

  // Cargar invitaciones pendientes
  async function loadPendingInvitations() {
    if (!session) return

    const { data, error } = await supabase
      .from('family_members')
      .select('family_id, families(name)')
      .eq('auth_user_id', session.user.id)
      .eq('status', 'invited')

    if (!error && data) {
      setPendingInvitations(data.map((r: any) => ({
        family_id: r.family_id,
        family_name: r.families?.name ?? 'Familia'
      })))
    }
  }

  // Cargar rutinas
  async function loadRoutines() {
    if (!activeFamilyId) return
    const { data } = await supabase
      .from('routines')
      .select('id,name,context,is_active')
      .eq('family_id', activeFamilyId)
      .order('name')
      .limit(20)
    if (data) setRoutines(data as any)
  }

  // Cargar facturas recurrentes
  async function loadBills() {
    if (!activeFamilyId) return
    const { data } = await supabase
      .from('recurring_bills')
      .select('id,name,amount_cents,next_due_at,currency')
      .eq('family_id', activeFamilyId)
      .eq('is_active', true)
      .order('next_due_at')
      .limit(20)
    if (data) setBills(data as any)
  }

  // Verificar estado de notificaciones push
  async function checkPushStatus() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setPushEnabled(!!sub)
      } catch {
        setPushEnabled(false)
      }
    }
  }

  useEffect(() => {
    loadMembers()
    loadPendingInvitations()
    loadRoutines()
    loadBills()
    checkPushStatus()
  }, [activeFamilyId, session])

  // Crear nueva familia
  async function onCreateFamily() {
    if (!newFamilyName.trim()) return

    setCreating(true)
    setErr(null)
    setMsg(null)

    try {
      const { data, error } = await supabase.rpc('create_family_with_owner', {
        p_name: newFamilyName.trim(),
        p_display_name: displayName.trim() || null
      })

      if (error) throw error

      setMsg('¡Familia creada! 🎉')
      setNewFamilyName('')
      setDisplayName('')

      setTimeout(() => window.location.reload(), 1500)
    } catch (e: any) {
      setErr(e?.message ?? 'Error creando familia')
    } finally {
      setCreating(false)
    }
  }

  // Invitar miembro
  async function onInviteMember() {
    if (!activeFamilyId || !inviteEmail.trim()) return

    setInviting(true)
    setErr(null)
    setMsg(null)

    try {
      const { data, error } = await supabase.rpc('invite_member_by_email', {
        p_family_id: activeFamilyId,
        p_email: inviteEmail.trim(),
        p_role: inviteRole,
        p_display_name: inviteDisplayName.trim() || null
      })

      if (error) throw error

      const result = data as { success: boolean; error?: string; message?: string }

      if (!result.success) {
        setErr(result.error ?? 'Error al invitar')
      } else {
        setMsg('¡Invitación enviada! 📨')
        setInviteEmail('')
        setInviteDisplayName('')
        loadMembers()
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Error invitando miembro')
    } finally {
      setInviting(false)
    }
  }

  // Aceptar invitación
  async function onAcceptInvitation(familyId: string) {
    setErr(null)
    setMsg(null)

    try {
      const { error } = await supabase.rpc('accept_family_invitation', {
        p_family_id: familyId
      })

      if (error) throw error

      setMsg('¡Te has unido a la familia! 🎉')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e: any) {
      setErr(e?.message ?? 'Error aceptando invitación')
    }
  }

  // Añadir factura recurrente
  async function onAddBill() {
    if (!activeFamilyId || !billName.trim() || !billAmount || !billDue) return

    setAddingBill(true)
    setErr(null)
    try {
      const { error } = await supabase.from('recurring_bills').insert({
        family_id: activeFamilyId,
        name: billName.trim(),
        amount_cents: Math.round(parseFloat(billAmount) * 100),
        next_due_at: new Date(billDue).toISOString(),
        currency: 'EUR'
      })
      if (error) throw error
      setBillName('')
      setBillAmount('')
      setBillDue('')
      setMsg('¡Factura añadida! 💰')
      loadBills()
    } catch (e: any) {
      setErr(e?.message ?? 'Error añadiendo factura')
    } finally {
      setAddingBill(false)
    }
  }

  // Activar notificaciones push
  async function onEnablePush() {
    if (!VAPID_PUBLIC_KEY) {
      setErr('Notificaciones push no configuradas')
      return
    }

    setPushLoading(true)
    setErr(null)

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setErr('Permiso de notificaciones denegado')
        setPushLoading(false)
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })

      // Registrar en el backend
      const { error } = await supabase.functions.invoke('push_register', {
        body: { subscription: sub.toJSON() }
      })

      if (error) throw error

      setPushEnabled(true)
      setMsg('¡Notificaciones activadas! 🔔')
    } catch (e: any) {
      setErr(e?.message ?? 'Error activando notificaciones')
    } finally {
      setPushLoading(false)
    }
  }

  // Obtener rol del usuario actual
  const currentUserRole = families.find(f => f.family_id === activeFamilyId)?.role
  const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin'

  if (loading) return (
    <div className="page">
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <p className="muted">Cargando...</p>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="card">
        <h2>⚙️ Configuración</h2>
        <p className="muted" style={{ marginTop: 0 }}>Gestiona tu familia y ajustes</p>

        {error && <p className="err">{error}</p>}
        {err && <p className="err">{err}</p>}
        {msg && <p className="success-msg">{msg}</p>}
      </div>

      {/* Notificaciones Push */}
      <div className="card">
        <div className="section-header">
          <span className="section-icon">🔔</span>
          <h3 className="section-title">Notificaciones</h3>
        </div>
        {pushEnabled ? (
          <div className="empty-state" style={{ padding: '16px 0' }}>
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-text">Notificaciones activadas</div>
          </div>
        ) : (
          <button
            className="btn"
            onClick={onEnablePush}
            disabled={pushLoading}
            style={{ width: '100%' }}
          >
            {pushLoading ? 'Activando...' : '🔔 Activar notificaciones push'}
          </button>
        )}
      </div>

      {/* Invitaciones pendientes */}
      {pendingInvitations.length > 0 && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">📬</span>
            <h3 className="section-title">Invitaciones pendientes</h3>
          </div>
          <div className="list">
            {pendingInvitations.map((inv) => (
              <div key={inv.family_id} className="item">
                <div>
                  <div className="item-title">{inv.family_name}</div>
                  <div className="item-subtitle">Te han invitado a unirte</div>
                </div>
                <button
                  className="btn btn-success"
                  style={{ padding: '8px 16px' }}
                  onClick={() => onAcceptInvitation(inv.family_id)}
                >
                  Aceptar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selector de familia activa */}
      <div className="card">
        <div className="section-header">
          <span className="section-icon">👨‍👩‍👧‍👦</span>
          <h3 className="section-title">Familia activa</h3>
        </div>

        {families.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏠</div>
            <div className="empty-state-text">Crea tu primera familia abajo</div>
          </div>
        ) : (
          <select
            className="input"
            value={activeFamilyId ?? ''}
            onChange={(e) => setActiveFamily(e.target.value)}
          >
            {families.map((f) => (
              <option key={f.family_id} value={f.family_id}>
                {f.name} · {f.role === 'owner' ? '👑 Propietario' : f.role === 'admin' ? '⭐ Admin' : '👤 Miembro'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Miembros de la familia */}
      {activeFamilyId && members.length > 0 && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">👥</span>
            <h3 className="section-title">Miembros ({members.length})</h3>
          </div>
          <div className="list">
            {members.map((m) => (
              <div key={m.member_id} className="item">
                <div>
                  <div className="item-title">
                    {m.role === 'owner' && '👑 '}
                    {m.role === 'admin' && '⭐ '}
                    {m.role === 'child' && '👶 '}
                    {m.display_name}
                  </div>
                  <div className="item-subtitle">{m.auth_email}</div>
                </div>
                <span className={m.status === 'active' ? 'badge badge-success' : 'badge badge-warning'}>
                  {m.status === 'active' ? 'Activo' : 'Invitado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rutinas */}
      {activeFamilyId && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">📋</span>
            <h3 className="section-title">Rutinas ({routines.length})</h3>
          </div>
          <div className="list">
            {routines.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🌅</div>
                <div className="empty-state-text">Sin rutinas configuradas</div>
              </div>
            )}
            {routines.map((r) => (
              <div key={r.id} className="item">
                <div>
                  <div className="item-title">{r.name}</div>
                  {r.context && <div className="item-subtitle">{r.context}</div>}
                </div>
                <span className={r.is_active ? 'badge badge-success' : 'badge badge-default'}>
                  {r.is_active ? 'Activa' : 'Pausada'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facturas Recurrentes */}
      {activeFamilyId && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">💰</span>
            <h3 className="section-title">Facturas Recurrentes</h3>
          </div>
          <div className="list">
            {bills.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">💸</div>
                <div className="empty-state-text">Sin facturas configuradas</div>
              </div>
            )}
            {bills.map((b) => (
              <div key={b.id} className="item">
                <div>
                  <div className="item-title">{b.name}</div>
                  <div className="item-subtitle">📆 {new Date(b.next_due_at).toLocaleDateString()}</div>
                </div>
                <span className="badge badge-warning">{formatCurrency(b.amount_cents, b.currency)}</span>
              </div>
            ))}
          </div>

          {isAdmin && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <label>Añadir factura</label>
              <input
                className="input"
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="Ej: Luz, agua, internet..."
              />
              <div className="grid" style={{ marginTop: 12 }}>
                <div>
                  <label>Importe (€)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label>Próximo pago</label>
                  <input
                    className="input"
                    type="date"
                    value={billDue}
                    onChange={(e) => setBillDue(e.target.value)}
                  />
                </div>
              </div>
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={onAddBill}
                disabled={addingBill || !billName.trim() || !billAmount || !billDue}
              >
                {addingBill ? 'Añadiendo...' : '➕ Añadir factura'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invitar miembro */}
      {activeFamilyId && isAdmin && (
        <div className="card">
          <div className="section-header">
            <span className="section-icon">📨</span>
            <h3 className="section-title">Invitar miembro</h3>
          </div>

          <label>Email</label>
          <input
            className="input"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
          />

          <div className="grid" style={{ marginTop: 16 }}>
            <div>
              <label>Nombre (opcional)</label>
              <input
                className="input"
                value={inviteDisplayName}
                onChange={(e) => setInviteDisplayName(e.target.value)}
                placeholder="Ej: Mamá, Papá, Juan..."
              />
            </div>
            <div>
              <label>Rol</label>
              <select
                className="input"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'adult' | 'child')}
              >
                <option value="adult">👤 Adulto</option>
                <option value="child">👶 Niño/a</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              className="btn"
              onClick={onInviteMember}
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting ? 'Enviando...' : '📨 Enviar invitación'}
            </button>
          </div>
        </div>
      )}

      {/* Crear nueva familia */}
      <div className="card">
        <div className="section-header">
          <span className="section-icon">➕</span>
          <h3 className="section-title">Crear nueva familia</h3>
        </div>

        <label>Nombre de la familia</label>
        <input
          className="input"
          value={newFamilyName}
          onChange={(e) => setNewFamilyName(e.target.value)}
          placeholder="Ej: Los García"
        />

        <div style={{ marginTop: 16 }}>
          <label>Tu nombre en la familia (opcional)</label>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ej: Papá, Mamá, Lolo..."
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            className="btn"
            onClick={onCreateFamily}
            disabled={!session || creating || !newFamilyName.trim()}
          >
            {creating ? 'Creando...' : '🏠 Crear familia'}
          </button>
        </div>
      </div>

      {/* Info del usuario */}
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
          👤 {session?.user.email ?? 'Usuario'}
        </p>
      </div>
    </div>
  )
}
