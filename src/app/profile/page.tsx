'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { LogOut, Trophy, Shield } from 'lucide-react'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Badge, Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession, logout } from '@/lib/auth'
import { getGrade } from '@/lib/grade'
import type { LevelHistory, MembershipPeriod } from '@/types'

interface ProfileData {
  name: string; origin: string | null; phone: string; level: number; role: string
}

export default function ProfilePage() {
  const router = useRouter()
  const auth = getSession()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [matchWins, setMatchWins] = useState(0)
  const [rallyWins, setRallyWins] = useState<{ month_label: string; total: number }[]>([])
  const [history, setHistory] = useState<LevelHistory[]>([])
  const [membershipActive, setMembershipActive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) { router.push('/login'); return }
    loadData()
  }, [])

  async function loadData() {
    if (!auth) return
    const supabase = createClient()

    // Full player profile
    const { data: playerData } = await supabase.from('players').select('name, origin, phone, level, role')
      .eq('id', auth.player_id).single()
    setProfile(playerData as ProfileData)

    const { count: sessCount } = await supabase.from('attendances')
      .select('*', { count: 'exact', head: true }).eq('player_id', auth.player_id).eq('status', 'confirmed')
    setSessionCount(sessCount ?? 0)

    const { data: lvlData } = await supabase.from('level_history')
      .select('*').eq('player_id', auth.player_id).order('created_at', { ascending: false }).limit(30)
    const hist = (lvlData ?? []) as LevelHistory[]
    setHistory(hist.filter(h => h.result === 'win'))
    setMatchWins(hist.filter(h => h.result === 'win').length)

    // Rally wins
    const { data: rallies } = await supabase.from('rallies').select('*, session:sessions(session_date)')
      .eq('status', 'completed').not('winner_stats', 'is', null)
    const myWins = (rallies ?? []).filter(r => (r.winner_pair_ids ?? '').includes(auth.player_id))
    setRallyWins(myWins.map(r => ({
      month_label: format(new Date((r.session as { session_date: string }).session_date), 'MMM yy').toUpperCase(),
      total: (r.winner_stats as { total: number }).total,
    })))

    // Membership
    const { data: mems } = await supabase.from('memberships')
      .select('*, period:membership_periods(*)').eq('player_id', auth.player_id).eq('status', 'approved')
    const now = new Date()
    setMembershipActive((mems ?? []).some(m => {
      const p = m.period as MembershipPeriod
      return new Date(p.month_start) <= now && now <= new Date(p.month_end)
    }))

    setLoading(false)
  }

  function handleLogout() { logout(); router.push('/'); router.refresh() }

  function maskPhone(phone: string) {
    if (phone.length < 8) return phone
    return phone.slice(0, 4) + '****' + phone.slice(-3)
  }

  if (!auth) return null
  const initials = auth.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const grade = profile ? getGrade(profile.level) : auth.grade

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <span className="font-display text-[1.25rem] tracking-wider">Profile</span>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-[12px] text-gray2">
          <LogOut size={14} strokeWidth={1.5} />Sign out
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Avatar & name */}
          <div className="px-5 pb-4 text-center">
            <div className="w-[76px] h-[76px] rounded-full bg-dark3 border-2 border-red/40 flex items-center justify-center font-display text-[1.8rem] mx-auto mb-2.5">
              {initials}
            </div>
            <div className="font-display text-[1.7rem] tracking-wide mb-0.5">{profile?.name ?? auth.name}</div>
            <div className="text-[11px] text-gray2 mb-2.5">{profile?.origin ?? '—'}</div>
            <div className="flex justify-center gap-1.5 flex-wrap">
              {membershipActive && <Badge variant="success">Member Aktif</Badge>}
              <Badge variant="gray">Grade {grade}</Badge>
              {profile?.role === 'admin' && <span className="text-[10px] bg-red/12 text-red border border-red/25 px-2 py-0.5 rounded-full">Admin</span>}
              {rallyWins.length > 0 && <Badge variant="red">{rallyWins.length}× Rally Winner</Badge>}
            </div>
          </div>

          {/* Admin button */}
          {profile?.role === 'admin' && (
            <div className="px-5 mb-3">
              <button onClick={() => router.push('/admin')}
                className="w-full flex items-center justify-center gap-2 bg-red/12 border border-red/30 text-red font-display tracking-wider py-3 rounded-xl text-[.95rem]">
                <Shield size={15} />
                Open Admin Panel
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 px-5 mb-3.5">
            {[
              { val: grade, lbl: 'Grade', accent: true },
              { val: sessionCount, lbl: 'Sessions' },
              { val: matchWins, lbl: 'Match Wins', accent: true },
            ].map(({ val, lbl, accent }) => (
              <div key={lbl} className="bg-dark2 border border-white/7 rounded-xl py-3 px-1.5 text-center">
                <div className={`font-display text-[1.3rem] leading-none ${accent ? 'text-red' : 'text-light'}`}>{val}</div>
                <div className="text-[9px] text-gray2 tracking-wider uppercase mt-1">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Profile info */}
          <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
            <div className="flex justify-between items-center px-4 py-2.5 border-b border-white/7">
              <span className="text-[11px] text-gray2">Asal</span>
              <span className="text-[12px] font-medium">{profile?.origin ?? '—'}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-[11px] text-gray2">No. HP</span>
              <span className="text-[12px] font-medium">{profile ? maskPhone(profile.phone) : '—'}</span>
            </div>
          </div>

          {/* Rally wins */}
          {rallyWins.length > 0 && (
            <div className="mx-5 mb-3.5 bg-dark2 border border-red/35 rounded-[14px] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 bg-red/12 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trophy size={12} className="text-red" strokeWidth={1.5} />
                </div>
                <div className="text-[12px] font-medium text-red">
                  Rally Winner — {rallyWins.length} titel
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {rallyWins.map((w, i) => (
                  <div key={i} className="flex-shrink-0 bg-dark3 rounded-[8px] px-2.5 py-2 text-center min-w-[64px]">
                    <div className="text-[9px] text-gray2 tracking-wider uppercase mb-1">{w.month_label}</div>
                    <div className="text-[11px] font-medium">{w.total} pts</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match history (wins only) */}
          <div className="flex justify-between items-center px-5 mb-2.5">
            <h2 className="font-display text-[1.05rem] tracking-wider">Riwayat Match</h2>
          </div>
          <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
            {history.length === 0 ? (
              <Empty message="Belum ada riwayat match" sub="Ikut rally untuk melihat hasil match kamu" />
            ) : history.map(h => (
              <div key={h.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/7 last:border-0">
                <div className="w-7 h-7 rounded-[7px] bg-red/15 text-red flex items-center justify-center font-display text-[.85rem] flex-shrink-0">W</div>
                <div className="flex-1">
                  <div className="text-[12px] font-medium">Rally Match</div>
                </div>
                <div className="font-display text-[1rem] text-red">+{h.level_change}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="h-20" />
      <BottomNav />
    </div>
  )
}
