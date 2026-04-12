'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const session = getSession()
    if (!session || session.role !== 'admin') {
      router.push('/')
    }
  }, [])

  return <>{children}</>
}
