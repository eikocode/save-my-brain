import Layout from '../components/Layout.jsx'

export default function Placeholder({ title, icon, description }) {
  return (
    <Layout>
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>{icon}</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text)' }}>
            {title}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '24px' }}>
            {description}
          </p>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px 20px',
            fontSize: '14px',
            color: 'var(--color-accent)',
          }}>
            💬 Use the Telegram bot to access this feature
          </div>
        </div>
      </div>
    </Layout>
  )
}
