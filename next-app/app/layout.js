export const metadata = {
  title: 'Provador Virtual - Next.js',
  description: 'Experimente óculos online com realidade aumentada',
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{
        margin: 0,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: '#0f0f1a',
        color: '#e8e8f0',
        overflow: 'hidden',
        height: '100vh',
      }}>
        {children}
      </body>
    </html>
  )
}
