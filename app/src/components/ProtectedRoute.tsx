import { Navigate } from 'react-router-dom'
import { useSession } from '../lib/useSession'

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useSession()

  if (loading) return <div className="page"><p>Cargando…</p></div>
  if (!session) return <Navigate to="/login" replace />
  return children
}
