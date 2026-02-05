import { useState, useEffect } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import { useSession } from '../lib/useSession'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

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

interface Props {
    isOpen: boolean
    onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: Props) {
    const { session } = useSession()
    const { families, activeFamilyId, setActiveFamily, loading } = useActiveFamily()

    const [members, setMembers] = useState<MemberRow[]>([])
    const [pendingInvitations, setPendingInvitations] = useState<InvitationRow[]>([])
    const [newFamilyName, setNewFamilyName] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'admin' | 'adult' | 'child'>('adult')
    const [inviteDisplayName, setInviteDisplayName] = useState('')
    const [inviteGender, setInviteGender] = useState<'man' | 'woman' | 'boy' | 'girl' | ''>('')
    const [creating, setCreating] = useState(false)
    const [inviting, setInviting] = useState(false)
    const [pushEnabled, setPushEnabled] = useState(false)
    const [pushLoading, setPushLoading] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)

    async function loadMembers() {
        if (!activeFamilyId) return
        try {
            const { data, error } = await supabase.rpc('list_family_members', { p_family_id: activeFamilyId })
            if (!error) setMembers(Array.isArray(data) ? data : [])
        } catch { setMembers([]) }
    }

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

    async function checkPushStatus() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const reg = await navigator.serviceWorker.ready
                const sub = await reg.pushManager.getSubscription()
                setPushEnabled(!!sub)
            } catch { setPushEnabled(false) }
        }
    }

    useEffect(() => {
        if (isOpen) {
            loadMembers()
            loadPendingInvitations()
            checkPushStatus()
        }
    }, [isOpen, activeFamilyId])

    async function onCreateFamily() {
        if (!newFamilyName.trim()) return
        setCreating(true)
        setErr(null)
        setMsg(null)
        try {
            const { error } = await supabase.rpc('create_family_with_owner', {
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

    async function onInviteMember() {
        if (!activeFamilyId || !inviteEmail.trim()) return
        setInviting(true)
        setErr(null)
        setMsg(null)
        try {
            const { error } = await supabase.rpc('invite_family_member', {
                p_family_id: activeFamilyId,
                p_email: inviteEmail.trim().toLowerCase(),
                p_role: inviteRole,
                p_display_name: inviteDisplayName.trim() || null,
                p_gender: inviteGender || null
            })
            if (error) throw error
            setMsg(`¡Invitación enviada a ${inviteEmail}! 📨`)
            setInviteEmail('')
            setInviteDisplayName('')
            setInviteGender('')
            loadMembers()
        } catch (e: any) {
            setErr(e?.message ?? 'Error enviando invitación')
        } finally {
            setInviting(false)
        }
    }

    async function acceptInvitation(familyId: string) {
        const { error } = await supabase.rpc('accept_family_invitation', { p_family_id: familyId })
        if (error) setErr(error.message)
        else {
            setMsg('¡Invitación aceptada! 🎉')
            loadPendingInvitations()
            setTimeout(() => window.location.reload(), 1500)
        }
    }

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
            const { error } = await supabase.functions.invoke('push_register', {
                body: { subscription: sub.toJSON(), family_id: activeFamilyId }
            })
            if (error) throw error
            setPushEnabled(true)
            setMsg('¡Notificaciones activadas! 🔔')
        } catch (e: any) {
            // More descriptive error for push registration failures
            const errorMsg = e?.message || String(e)
            if (errorMsg.includes('push service')) {
                setErr('Error del servicio push. Asegúrate de estar en un navegador compatible (Chrome, Firefox, Edge).')
            } else {
                setErr(errorMsg)
            }
        } finally {
            setPushLoading(false)
        }
    }

    // Role-based permissions
    // Roles: owner > admin > adult > child
    const currentUserRole = families.find(f => f.family_id === activeFamilyId)?.role
    const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin'

    function getRoleLabel(role: string) {
        switch (role) {
            case 'owner': return '👑 Propietario'
            case 'admin': return '🛡️ Administrador'
            case 'adult': return '👤 Adulto'
            case 'child': return '👶 Niño'
            default: return role
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Configuración">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {err && <p className="err">{err}</p>}
                {msg && <p className="success-msg">{msg}</p>}

                {/* Notificaciones - visible for all */}
                <div className="card-inner">
                    <h4>🔔 Notificaciones</h4>
                    <button
                        className={`btn ${pushEnabled ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={onEnablePush}
                        disabled={pushLoading || pushEnabled}
                        style={{ width: '100%' }}
                    >
                        {pushLoading ? 'Activando...' : pushEnabled ? '✓ Activadas' : 'Activar notificaciones'}
                    </button>
                </div>

                {/* Familia activa - only for Admin */}
                {isAdmin && (
                    <div className="card-inner">
                        <h4>👨‍👩‍👧‍👦 Familia Activa</h4>
                        {loading ? (
                            <p className="muted">Cargando...</p>
                        ) : families.length === 0 ? (
                            <p className="muted">No perteneces a ninguna familia aún.</p>
                        ) : (
                            <select
                                value={activeFamilyId ?? ''}
                                onChange={(e) => setActiveFamily(e.target.value)}
                                style={{ width: '100%' }}
                            >
                                {families.map((f) => (
                                    <option key={f.family_id} value={f.family_id}>
                                        {f.family_name} ({f.role})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                )}

                {/* Invitaciones pendientes - visible for all */}
                {pendingInvitations.length > 0 && (
                    <div className="card-inner">
                        <h4>📨 Invitaciones Pendientes</h4>
                        {pendingInvitations.map((inv) => (
                            <div key={inv.family_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span>{inv.family_name}</span>
                                <button className="btn btn-primary btn-sm" onClick={() => acceptInvitation(inv.family_id)}>
                                    Aceptar
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Miembros - visible for all */}
                {activeFamilyId && (
                    <div className="card-inner">
                        <h4>👥 Miembros</h4>
                        {members.length === 0 ? (
                            <p className="muted">No hay miembros</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {members.map((m) => (
                                    <div key={m.member_id} style={{ fontSize: 14 }}>
                                        <strong>{m.display_name}</strong>
                                        <span className="muted" style={{ marginLeft: 8 }}>{getRoleLabel(m.role)}</span>
                                        {m.status === 'invited' && <span style={{ marginLeft: 8, color: 'var(--warning)' }}>📨 Invitado</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Invitar miembro - only for Admin */}
                {isAdmin && activeFamilyId && (
                    <div className="card-inner">
                        <h4>➕ Invitar Miembro</h4>
                        <input
                            type="email"
                            placeholder="Email del nuevo miembro"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Nombre (opcional)"
                            value={inviteDisplayName}
                            onChange={(e) => setInviteDisplayName(e.target.value)}
                            style={{ marginTop: 8 }}
                        />
                        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)} style={{ marginTop: 8 }}>
                            <option value="admin">🛡️ Administrador</option>
                            <option value="adult">👤 Adulto</option>
                            <option value="child">👶 Niño</option>
                        </select>
                        <select value={inviteGender} onChange={(e) => setInviteGender(e.target.value as any)} style={{ marginTop: 8 }}>
                            <option value="">Género (opcional)</option>
                            <option value="man">👨 Hombre</option>
                            <option value="woman">👩 Mujer</option>
                            <option value="boy">👦 Niño</option>
                            <option value="girl">👧 Niña</option>
                        </select>
                        <button
                            className="btn btn-primary"
                            onClick={onInviteMember}
                            disabled={inviting || !inviteEmail.trim()}
                            style={{ marginTop: 12, width: '100%' }}
                        >
                            {inviting ? 'Enviando...' : 'Enviar Invitación'}
                        </button>
                    </div>
                )}

                {/* Crear nueva familia - only for Admin */}
                {isAdmin && (
                    <div className="card-inner">
                        <h4>🏠 Crear Nueva Familia</h4>
                        <input
                            type="text"
                            placeholder="Nombre de la familia"
                            value={newFamilyName}
                            onChange={(e) => setNewFamilyName(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Tu nombre en esta familia"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            style={{ marginTop: 8 }}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={onCreateFamily}
                            disabled={creating || !newFamilyName.trim()}
                            style={{ marginTop: 12, width: '100%' }}
                        >
                            {creating ? 'Creando...' : 'Crear Familia'}
                        </button>
                    </div>
                )}

                {/* Cerrar sesión - visible for all */}
                <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)', width: '100%' }}
                    onClick={() => supabase.auth.signOut()}
                >
                    Cerrar sesión
                </button>
            </div>
        </Modal>
    )
}
