'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, Calendar, Star, CreditCard, User } from 'lucide-react'

const NAV = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/schedule', icon: Calendar, label: 'Schedule' },
  { href: '/rally', icon: Star, label: 'Rally' },
  { href: '/membership', icon: CreditCard, label: 'Membership' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const router = useRouter()
  const path = usePathname()

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-dark2/95 backdrop-blur border-t border-white/7 flex z-40">
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = path === href
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 pb-4"
          >
            {label === 'Rally' ? (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center -mt-5 border-2 transition-all ${active ? 'bg-red border-red' : 'bg-dark3 border-white/15'}`}>
                <Icon size={18} strokeWidth={1.5} className={active ? 'text-white' : 'text-gray2'} />
              </div>
            ) : (
              <Icon size={20} strokeWidth={1.5} className={active ? 'text-red' : 'text-gray2'} />
            )}
            <span className={`text-[9px] tracking-wider uppercase ${active ? 'text-red' : 'text-gray2'} ${label === 'Rally' ? 'mt-1' : ''}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
