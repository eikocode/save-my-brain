import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { isLoggedIn } from './auth.js'
import Login from './pages/Login.jsx'
import Landing from './pages/Landing.jsx'
import Library from './pages/Library.jsx'
import Settings from './pages/Settings.jsx'
import Privacy from './pages/Privacy.jsx'
import Onboarding from './pages/Onboarding.jsx'

// Protected route wrapper
function ProtectedRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />
}

// Invite page — reads code param, saves to localStorage, directs to login
function InvitePage() {
  const { code } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.setItem('smb_invite_code', code)
  }, [code])

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ padding: '40px', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>You've been invited!</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
          Sign up or log in to join the group.
        </p>
        <button className="btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login?signup=true&invite=' + code)}>
          Sign Up / Log In
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Protected routes */}
        <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Redirects from old routes */}
        <Route path="/dashboard" element={<Navigate to="/library" replace />} />
        <Route path="/documents" element={<Navigate to="/library" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
