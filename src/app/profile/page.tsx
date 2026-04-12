'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { LogOut, Trophy } from 'lucide-react'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Badge, Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession, logout } from '@/lib/auth'
import { getGrade } from '@/lib/grade'
import type { LevelHistory, Rally, Membership, MembershipPeriod } from '@/types'

interface ProfileStats {
  grade: string
  sessions: number
  matchWins: number
  winRate: number
  rallyWins: number
}

interface RallyWin {
  month_label: string
  matches: number
  wins: number
  total: number
}

export default function ProfilePage() {
  const router = useRouter()
  const auth = getSession()
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [history, setHistory] = useState<LevelHistory[]>([])
  const [rallyWins, setRallyWins] = useState<RallyWin[]>([])
  const [membershipActive, setMembershipActive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) { router.push('/login'); return }
    loadData()
  }, [])

  async function loadData() {
    if (!auth) return
    const supabase = createClient()

    // Session attendance count
    const { count: sessCount } = await supabase
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', auth.player_id)
      .eq('status', 'confirmed')

    // Level history (match results)
    const { data: lvlData } = await supabase
      .from('level_history')
      .select('*, match:rally_matches(*, rally:rallies(*, session:sessions(session_date)))')
      .eq('player_id', auth.player_id)
      .order('created_at', { ascending: false })
      .limit(20)

    const hist = (lvlData ?? []) as LevelHistory[]
    const wins = hist.filter(h => h.result === 'win').length
    const total = hist.length
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

    setHistory(hist)
    setStats({
      grade: auth.grade,
      sessions: sessCount ?? 0,
      matchWins: wins,
      winRate,
      rallyWins: 0, // filled below
    })

    // Rally wins — rallies where this player's pair won
    const { data: rallies } = await supabase
      .from('rallies')
      .select('*, session:sessions(session_date)')
      .eq('status', 'completed')
      .not('winner_stats', 'is', null)

    const myWins = (rallies ?? []).filter(r => {
      const ids = (r.winner_pair_ids ?? '').split(',')
      return ids.includes(auth.player_id)
    })

    setRallyWins(myWins.map(r => {
      const date = new Date((r.session as { session_date: string }).session_date)
      const s = r.winner_stats as { matches: number; wins: number; total: number }
      return {
        month_label: format(date, 'MMM \'\'yy').toUpperCase(),
        matches: s.matches,
        wins: s.wins,
        total: s.total,
      }
    }))

    // Update stats with rally wins count
    setStats(prev => prev ? { ...prev, rallyWins: myWins.length } : null)

    // Active membership check
    const { data: mems } = await supabase
      .from('memberships')
      .select('*, period:membership_periods(*)')
      .eq('player_id', auth.player_id)
      .eq('status', 'approved')
    const now = new Date()
    setMembershipActive((mems ?? []).some(m => {
      const p = m.period as MembershipPeriod
      return new Date(p.month_start) <= now && now <= new Date(p.month_end)
    }))

    setLoading(false)
  }

  function handleLogout() {
    logout()
    router.push('/')
    router.refresh()
  }

  if (!auth) return null

  const initials = auth.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <span className="font-display text-[1.25rem] tracking-wider">Profile</span>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-[12px] text-gray2">
          <LogOut size={14} strokeWidth={1.5} />
          Sign out
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Profile header */}
          <div className="px-5 pb-4 text-center">
            <div className="w-[76px] h-[76px] rounded-full bg-dark3 border-2 border-red/40 flex items-center justify-center font-display text-[1.8rem] mx-auto mb-2.5">
              {initials}
            </div>
            <div className="font-display text-[1.7rem] tracking-wide mb-0.5">{auth.name}</div>
            <div className="text-[11px] text-gray2 mb-2.5">
              {/* origin not in auth session — would need a separate fetch */}
              Member since {format(new Date(), 'yyyy')}
            </div>
            <div className="flex justify-center gap-1.5 flex-wrap">
              {membershipActive && <Badge variant="success">Active Member</Badge>}
              <Badge variant="gray">Grade {auth.grade}</Badge>
              {rallyWins.length > 0 && (
                <Badge variant="red">{rallyWins.length}× Rally Winner</Badge>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 px-5 mb-3.5">
            {[
              { val: stats?.grade ?? '—', lbl: 'Grade', accent: true },
              { val: stats?.sessions ?? 0, lbl: 'Sessions' },
              { val: stats?.matchWins ?? 0, lbl: 'Match W', accent: true },
              { val: `${stats?.winRate ?? 0}%`, lbl: 'Win Rate', accent: true },
            ].map(({ val, lbl, accent }) => (
              <div key={lbl} className="bg-dark2 border border-white/7 rounded-xl py-3 px-1.5 text-center">
                <div className={`font-display text-[1.3rem] leading-none ${accent ? 'text-red' : 'text-light'}`}>{val}</div>
                <div className="text-[9px] text-gray2 tracking-wider uppercase mt-1">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Rally winner history */}
          {rallyWins.length > 0 && (
            <div className="mx-5 mb-3.5 bg-dark2 border border-red/35 rounded-[14px] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 bg-red/12 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trophy size={12} className="text-red" strokeWidth={1.5} />
                </div>
                <div className="text-[12px] font-medium text-red">
                  Rally Winner — {rallyWins.length} title{rallyWins.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {rallyWins.map((w, i) => (
                  <div key={i} className="flex-shrink-0 bg-dark3 rounded-[8px] px-2.5 py-2 text-center min-w-[72px]">
                    <div className="text-[9px] text-gray2 tracking-wider uppercase mb-1">{w.month_label}</div>
                    <div className="text-[11px] font-medium">{w.wins}W · {w.total}pts</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match history — wins only */}
          <div className="flex justify-between items-center px-5 mb-2.5">
            <h2 className="font-display text-[1.05rem] tracking-wider">Match History</h2>
          </div>
          <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
            {history.length === 0 ? (
              <Empty message="No match history yet" sub="Play in a rally to see your results here" />
            ) : history.map((h) => {
              const match = h.match as unknown as {
                rally: { session: { session_date: string } }
                pair_a: { player1: { name: string }; player2: { name: string } }
                pair_b: { player1: { name: string }; player2: { name: string } }
                score_a: number
                score_b: number
              } | null
              const date = match?.rally?.session?.session_date
                ? format(new Date(match.rally.session.session_date), 'MMM d, yyyy')
                : '—'
              return (
                <div key={h.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/7 last:border-0">
                  <div className={`w-7 h-7 rounded-[7px] flex items-center justify-center font-display text-[.85rem] flex-shrink-0 ${h.result === 'win' ? 'bg-red/15 text-red' : 'hidden'}`}>
                    {h.result === 'win' ? 'W' : ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">Rally Match</div>
                    <div className="text-[10px] text-gray2">{date}</div>
                  </div>
                  <div className={`font-display text-[1rem] ${h.level_change > 0 ? 'text-red' : 'text-gray2'}`}>
                    {h.level_change > 0 ? '+' : ''}{h.level_change}
                  </div>
                </div>
              )
            }).filter((_, i) => {
              // Only show wins (per spec: no match loss in profile)
              return history[i].result === 'win'
            })}
          </div>
        </>
      )}

      <div className="h-20" />
      <BottomNav />
    </div>
  )
}
