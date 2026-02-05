import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const tabs = [
  { to: '/', label: 'Hoy', icon: '🏠' },
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/tasks', label: 'Tareas', icon: '✅' },
  { to: '/shopping', label: 'Compra', icon: '🛒' },
  { to: '/more', label: 'Más', icon: '⚙️' }
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">FamilyOS</div>
        <button
          className="btn btn-ghost"
          onClick={() => supabase.auth.signOut()}
          title="Salir"
          style={{ padding: '8px 12px', fontSize: '14px' }}
        >
          Salir
        </button>
      </header>

      <main className="content">{children}</main>

      <nav className="bottomnav">
        {tabs.map((t) => {
          const active = loc.pathname === t.to
          return (
            <Link key={t.to} to={t.to} className={`tab ${active ? 'active' : ''}`}>
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
