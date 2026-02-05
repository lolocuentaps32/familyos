import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useActiveFamily } from '../lib/useActiveFamily'
import AddMenu, { CreateType } from './AddMenu'
import SettingsModal from './SettingsModal'
import CreateEventModal from './CreateEventModal'
import CreateTaskModal from './CreateTaskModal'
import CreateShoppingModal from './CreateShoppingModal'
import CreateBillModal from './CreateBillModal'
import CreateRoutineModal from './CreateRoutineModal'
import CreatePointsModal from './CreatePointsModal'
import CreateGoalModal from './CreateGoalModal'
import CreateRewardModal from './CreateRewardModal'
import './Layout.css'

const tabs = [
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/rewards', label: 'Recompensas', icon: '🏆' },
  { to: '/chat', label: 'Chat', icon: '💬' },
  { to: '/tasks', label: 'Tareas', icon: '✅' },
  { to: '/more', label: 'Más', icon: '📋' }
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { activeFamily, activeFamilyId } = useActiveFamily()

  // Modales
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createEventOpen, setCreateEventOpen] = useState(false)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [createShoppingOpen, setCreateShoppingOpen] = useState(false)
  const [createBillOpen, setCreateBillOpen] = useState(false)
  const [createRoutineOpen, setCreateRoutineOpen] = useState(false)
  const [createPointsOpen, setCreatePointsOpen] = useState(false)
  const [createGoalOpen, setCreateGoalOpen] = useState(false)
  const [createRewardOpen, setCreateRewardOpen] = useState(false)

  function handleAddSelect(type: CreateType) {
    switch (type) {
      case 'event': setCreateEventOpen(true); break
      case 'task': setCreateTaskOpen(true); break
      case 'shopping': setCreateShoppingOpen(true); break
      case 'bill': setCreateBillOpen(true); break
      case 'routine': setCreateRoutineOpen(true); break
      case 'points': setCreatePointsOpen(true); break
      case 'goal': setCreateGoalOpen(true); break
      case 'reward': setCreateRewardOpen(true); break
    }
  }

  function handleCreated() {
    // Recargar la página actual para refrescar datos
    window.location.reload()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        {/* Home Link */}
        <Link to="/" className="topbar-home" aria-label="Ir a Hoy">
          🏠
        </Link>

        {/* Nombre de familia */}
        <div className="brand">
          <span className="brand-text">
            {activeFamily?.name ? `Familia ${activeFamily.name}` : 'FamilyOS'}
          </span>
        </div>

        {/* Acciones */}
        <div className="topbar-actions">
          <AddMenu onSelect={handleAddSelect} />
          <button className="topbar-settings" onClick={() => setSettingsOpen(true)} aria-label="Configuración">
            ⚙️
          </button>
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

      {/* Modales */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CreateEventModal isOpen={createEventOpen} onClose={() => setCreateEventOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreateTaskModal isOpen={createTaskOpen} onClose={() => setCreateTaskOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreateShoppingModal isOpen={createShoppingOpen} onClose={() => setCreateShoppingOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreateBillModal isOpen={createBillOpen} onClose={() => setCreateBillOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreateRoutineModal isOpen={createRoutineOpen} onClose={() => setCreateRoutineOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreatePointsModal isOpen={createPointsOpen} onClose={() => setCreatePointsOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreateGoalModal isOpen={createGoalOpen} onClose={() => setCreateGoalOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
      <CreateRewardModal isOpen={createRewardOpen} onClose={() => setCreateRewardOpen(false)} familyId={activeFamilyId} onCreated={handleCreated} />
    </div>
  )
}
