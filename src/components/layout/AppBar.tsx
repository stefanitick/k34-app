'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Bell, LogIn, User } from 'lucide-react'
import { getSession } from '@/lib/auth'

interface AppBarProps {
  title?: string
  showLogo?: boolean
}

export function AppBar({ title, showLogo = true }: AppBarProps) {
  const router = useRouter()
  const session = getSession()

  return (
    <header className="flex items-center justify-between px-5 pt-4 pb-2.5">
      <div className="flex items-center gap-2">
        {showLogo && (
          <Image
            src="/logo-k34.png"
            alt="K34"
            width={26}
            height={26}
            className="object-contain"
          />
        )}
        <span className="font-display text-[1.25rem] tracking-wider">
          {title || <>K<span className="text-red">34</span></>}
        </span>
      </div>
      <div className="flex gap-2">
        {session ? (
          <>
            <button
              className="w-[34px] h-[34px] bg-dark3 rounded-full border-none flex items-center justify-center text-gray2 relative"
              onClick={() => router.push('/notifications')}
            >
              <Bell size={16} strokeWidth={1.5} />
              <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] bg-red rounded-full border-2 border-dark" />
            </button>
            <button
              className="w-[34px] h-[34px] bg-dark3 rounded-full border-none flex items-center justify-center text-gray2"
              onClick={() => router.push('/profile')}
            >
              <User size={16} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <button
            className="w-[34px] h-[34px] bg-dark3 rounded-full border-none flex items-center justify-center text-gray2"
            onClick={() => router.push('/login')}
          >
            <LogIn size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  )
}
