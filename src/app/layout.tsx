import type { Metadata, Viewport } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css'
export const metadata: Metadata = {
  title: 'TricyCall',
  description: 'Book a tricycle in San Felipe, Zambales',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'TricyCall',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#17212b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
