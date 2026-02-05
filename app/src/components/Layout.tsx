import { Link, useLocation } from 'react-router-dom'
import { useActiveFamily } from '../lib/useActiveFamily'

const tabs = [
  { to: '/', label: 'Hoy', icon: '🏠' },
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/tasks', label: 'Tareas', icon: '✅' },
  { to: '/shopping', label: 'Compra', icon: '🛒' },
  { to: '/more', label: 'Más', icon: '⚙️' }
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const { activeFamily } = useActiveFamily()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🏠</span>
          <span className="brand-text">
            {activeFamily?.name ? `Familia ${activeFamily.name}` : 'FamilyOS'}
          </span>
        </div>
      </header>

      <main className="content">{children}</main>

      <nav className="bottomnav">
        <div className="bottomnav-container">
          {tabs.map((t) => {
            const active = loc.pathname === t.to
            return (
              <Link key={t.to} to={t.to} className={`tab ${active ? 'active' : ''}`}>
                <span className="tab-icon">{t.icon}</span>
                {t.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
