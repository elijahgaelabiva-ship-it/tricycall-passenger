import type { Metadata, Viewport } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'TricyCall',
  description: 'Book a tricycle in San Felipe, Zambales',
  manifest: '/manifest.json',
  icons: {
  icon: [
    { url: '/icons/icon-192-2.png', sizes: '192x192', type: 'image/png' },
    { url: '/icons/icon-512-2.png', sizes: '512x512', type: 'image/png' },
  ],
  apple: '/icons/icon-192-2.png',
},
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
