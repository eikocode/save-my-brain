import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { clearAuth, getUser, apiFetch } from '../auth.js'

const navItems = [
  { path: '/home', label: 'Dashboard', icon: '🏠' },
  { path: '/library', label: 'Library', icon: '📚' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const user = getUser()
  const [familyMembers, setFamilyMembers] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    apiFetch('/api/users/family-members')
      .then(r => r?.json())
      .then(data => { if (Array.isArray(data)) setFamilyMembers(data); })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="dash-layout">
      {/* Mobile hamburger */}
      <button className="dash-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="dash-sidebar-logo">
          <span>🧠 Save My Brain</span>
          <span className="dash-sidebar-sub">The Digital Curator</span>
        </div>

        <nav className="dash-sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `dash-nav-item${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Add document button */}
        <button className="dash-add-doc-btn" onClick={() => { setSidebarOpen(false); document.querySelector('.dash-upload')?.click(); }}>
          <span>+</span>
          <span>Add Document</span>
        </button>

        {/* Team members */}
        {familyMembers.length > 0 && (
          <div className="dash-sidebar-section">
            <div className="dash-sidebar-section-label">Team</div>
            {familyMembers.map(fm => (
              <div key={fm.id} className="dash-family-item">
                <span className="dash-family-avatar">
                  {fm.relationship === 'self' ? '👤' : '👥'}
                </span>
                <div>
                  <div className="dash-family-name">{fm.name}</div>
                  <div className="dash-family-rel">{fm.relationship}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* User + logout */}
        <div className="dash-sidebar-footer">
          <div className="dash-sidebar-user">{user?.name}</div>
          <button className="dash-logout-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="dash-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <main className="dash-main">
        {children}
      </main>
    </div>
  )
}
