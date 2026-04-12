import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, DM_Sans } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'K34 Badminton Club',
  description: '#WorkHardSmashHarder — Surabaya',
  icons: { apple: '/logo-k34.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0A0A0A',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${dmSans.variable}`}>
      <body className="bg-dark text-light font-body max-w-[390px] mx-auto min-h-screen overflow-x-hidden">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#181818',
              color: '#F0EDE8',
              border: '1px solid rgba(255,255,255,0.07)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}