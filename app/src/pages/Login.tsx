import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

export default function LoginPage() {
  const { session, loading } = useSession()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'otp' | 'password'>('otp')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && session) nav('/')
  }, [loading, session, nav])

  const canSubmit = useMemo(() => email.trim().includes('@') && (mode === 'otp' || password.length >= 6), [email, password, mode])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      if (mode === 'otp') {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin }
        })
        if (error) throw error
        setMsg('¡Listo! Te hemos enviado un enlace mágico a tu email ✨')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        })
        if (error) throw error
        setMsg('¡Bienvenido de nuevo! 🎉')
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Ups, algo salió mal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page" style={{ paddingTop: '40px', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <div className="card welcome-card" style={{ width: '100%' }}>
        <div className="welcome-icon">🏠</div>
        <h1 className="welcome-title">FamilyOS</h1>
        <p className="welcome-subtitle">
          Tu espacio familiar organizado
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
          <button
            type="button"
            className={`btn ${mode === 'otp' ? '' : 'btn-ghost'}`}
            onClick={() => setMode('otp')}
          >
            ✨ Enlace mágico
          </button>
          <button
            type="button"
            className={`btn ${mode === 'password' ? '' : 'btn-ghost'}`}
            onClick={() => setMode('password')}
          >
            🔑 Contraseña
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ textAlign: 'left' }}>
          <label>Email</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
          />

          {mode === 'password' && (
            <div style={{ marginTop: 16 }}>
              <label>Contraseña</label>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                autoComplete="current-password"
              />
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button className="btn" style={{ width: '100%' }} disabled={!canSubmit || busy}>
              {busy ? 'Un momento...' : mode === 'otp' ? 'Enviar enlace mágico' : 'Entrar'}
            </button>
          </div>

          {msg && <p className="success-msg" style={{ marginTop: 16, textAlign: 'center' }}>{msg}</p>}
          {err && <p className="err" style={{ marginTop: 16, textAlign: 'center' }}>{err}</p>}
        </form>
      </div>
    </div>
  )
}
