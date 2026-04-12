import { createClient } from '@/lib/supabase/client'
import { getGrade } from '@/lib/grade'
import type { AuthSession, Player } from '@/types'

const SESSION_KEY = 'k34_session'

export async function findPlayerByPhone(
  phone: string
): Promise<{ player: Player | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('phone', phone.trim())
    .single()

  if (error || !data) {
    return { player: null, error: 'Phone number not registered.' }
  }

  return { player: data as Player, error: null }
}

export function createSession(player: Player): AuthSession {
  const session: AuthSession = {
    player_id: player.id,
    name: player.name,
    phone: player.phone,
    role: player.role,
    status: player.status,
    grade: getGrade(player.level),
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
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