'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  Home, Calendar, Star, CreditCard, User
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/',           icon: Home,       label: 'Home'     },
  { href: '/schedule',   icon: Calendar,   label: 'Schedule' },
  { href: '/rally',      icon: Star,       label: 'Rally',   center: true },
  { href: '/membership', icon: CreditCard, label: 'Member'   },
  { href: '/profile',    icon: User,       label: 'Profile'  },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  // Hide on admin and login pages
  if (pathname.startsWith('/admin') || pathname === '/login' || pathname === '/register') {
    return null
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-dark/97 backdrop-blur-xl border-t border-white/7 flex z-50 pb-3 pt-2">
      {NAV_ITEMS.map(({ href, icon: Icon, label, center }) => {
        const active = pathname === href
        if (center) {
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="flex-1 flex flex-col items-center gap-0.5 -mt-[18px]"
            >
              <div className={`w-[50px] h-[50px] rounded-full flex items-center justify-center border-[3px] border-dark transition-all ${active ? 'bg-red2' : 'bg-red'}`}>
                <Icon size={22} color="white" strokeWidth={1.5} />
              </div>
              <span className="text-[9px] tracking-widest uppercase text-gray mt-0.5">{label}</span>
            </button>
          )
        }
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 transition-colors ${active ? 'text-red' : 'text-gray'}`}
          >
            <Icon size={20} strokeWidth={1.5} />
            <span className="text-[9px] tracking-widest uppercase">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
