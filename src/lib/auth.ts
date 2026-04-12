import { createClient } from '@/lib/supabase/client'
import { getGrade } from '@/lib/grade'
import type { AuthSession, Player } from '@/types'

const SESSION_KEY = 'k34_session'

export async function login(
  name: string,
  phone: string
): Promise<{ session: AuthSession | null; error: string | null }> {
  const supabase = createClient()

  // password = last 4 digits of phone
  const passwordKey = phone.trim().slice(-4)
  const normalizedName = name.trim().toLowerCase()

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .ilike('name', normalizedName)
    .eq('phone', phone.trim())
    .eq('password_key', passwordKey)
    .single()

  if (error || !data) {
    return { session: null, error: 'Name or phone number not found.' }
  }

  const player = data as Player

  const session: AuthSession = {
    player_id: player.id,
    name: player.name,
    phone: player.phone,
    role: player.role,
    status: player.status,
    grade: getGrade(player.level),
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { session, error: null }
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function isAdmin(): boolean {
  return getSession()?.role === 'admin'
}

export function isApproved(): boolean {
  const s = getSession()
  return s?.status === 'approved'
}
