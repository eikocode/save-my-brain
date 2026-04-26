import Layout from '../components/Layout.jsx'
import PaywallBanner from '../components/PaywallBanner.jsx'
import { getUser } from '../auth.js'

const placeholderCards = [
  { icon: '📄', title: 'Documents', desc: 'Upload and analyse your documents with AI', count: '0 docs', phase: 'Phase 3' },
  { icon: '📅', title: 'Calendar', desc: 'Connect Google, Apple & Calendly', count: 'Not connected', phase: 'Phase 6' },
  { icon: '✅', title: 'Tasks', desc: 'Priorities, due dates, reminders', count: '0 tasks', phase: 'Phase 6' },
  { icon: '👥', title: 'Group', desc: 'Manage up to 5 family or team members', count: 'Just you', phase: 'Phase 7' },
  { icon: '🔔', title: 'Daily Brief', desc: 'AI morning summary delivered to Telegram', count: 'Not set up', phase: 'Phase 5' },
  { icon: '📊', title: 'Reports', desc: 'PDF reports, Google Sheets, invoices', count: '0 reports', phase: 'Phase 4' },
]

export default function Dashboard() {
  const user = getUser()

  return (
    <Layout>
      <div className="page">
        <PaywallBanner />
        <h1 className="page-title">Good morning, {user?.name?.split(' ')[0]} 🧠</h1>
        <p className="page-subtitle">Your AI admin assistant is ready. Start by uploading a document or connecting your Telegram bot.</p>

        <div className="grid-3" style={{ gap: 'var(--sp-4)' }}>
          {placeholderCards.map(card => (
            <div key={card.title} className="card card-hover">
              <div style={{ fontSize: '28px', marginBottom: 'var(--sp-3)' }}>{card.icon}</div>
              <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--sp-2)' }}>{card.title}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-4)' }}>{card.desc}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)' }}>{card.count}</span>
                <span className="badge badge-p4">{card.phase}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
