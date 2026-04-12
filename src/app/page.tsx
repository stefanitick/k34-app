'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { RallyWinnerCard } from '@/components/home/RallyWinnerCard'
import { AttendanceModal } from '@/components/schedule/AttendanceModal'
import { Badge, SectionHeader, StatMini, Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session, Rally } from '@/types'
import { format } from 'date-fns'

export default function HomePage() {
  const router = useRouter()
  const auth = getSession()
  const [nextSession, setNextSession] = useState<Session | null>(null)
  const [latestRally, setLatestRally] = useState<(Rally & { month_label: string }) | null>(null)
  const [pastWinners, setPastWinners] = useState<{ month_label: string; player1_name: string; player2_name: string; matches: number; wins: number; total: number }[]>([])
  const [attendModal, setAttendModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [membershipActive, setMembershipActive] = useState(false)
  const [attendCount, setAttendCount] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: sessions } = await supabase
      .from('sessions').select('*')
      .gte('session_date', today)
      .order('session_date', { ascending: true }).limit(1)

    if (sessions?.[0]) {
      const sess = sessions[0]
      const { count } = await supabase.from('attendances')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sess.id).eq('status', 'confirmed')
      setNextSession({ ...sess, attendance_count: count ?? 0 })
      setAttendCount(count ?? 0)
    }

    const { data: rallies } = await supabase.from('rallies')
      .select('*, session:sessions(session_date)')
      .eq('status', 'completed').not('winner_stats', 'is', null)
      .order('created_at', { ascending: false }).limit(1)

    if (rallies?.[0]) {
      const r = rallies[0]
      const date = new Date((r.session as { session_date: string }).session_date)
      setLatestRally({ ...r, winner_stats: r.winner_stats, month_label: format(date, 'MMMM yyyy') })
    }

    const { data: past } = await supabase.from('rallies')
      .select('winner_stats, session:sessions(session_date)')
      .eq('status', 'completed').not('winner_stats', 'is', null)
      .order('created_at', { ascending: false }).limit(3)

    if (past) {
      setPastWinners(past.map((r) => {
        const date = new Date((r.session as unknown as { session_date: string }).session_date)
        const s = r.winner_stats as { player1_name: string; player2_name: string; matches: number; wins: number; total: number }
        return { month_label: format(date, 'MMM yyyy').toUpperCase(), ...s }
      }))
    }

    if (auth) {
      const { data: mems } = await supabase.from('memberships')
        .select('*, period:membership_periods(*)')
        .eq('player_id', auth.player_id).eq('status', 'approved')
      const now = new Date()
      setMembershipActive((mems ?? []).some((m) => {
        const p = m.period as { month_start: string; month_end: string }
        return new Date(p.month_start) <= now && now <= new Date(p.month_end)
      }))
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen animate-page">
      <AppBar />

      <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-2xl p-[18px] relative overflow-hidden">
        <div className="absolute right-[-8px] bottom-[-22px] font-display text-[7rem] text-red/5 leading-none pointer-events-none select-none">K34</div>
        {auth ? (
          <>
            <div className="text-[11px] text-gray2 tracking-wider uppercase mb-0.5">Welcome back,</div>
            <div className="font-display text-[1.7rem] tracking-wide mb-3.5">{auth.name.split(' ')[0]}</div>
            <div className="flex gap-2.5">
              <StatMini value={auth.grade} label="Grade" accent />
              <StatMini value="—" label="Sessions" />
              <StatMini value="—" label="Rally Wins" accent />
            </div>
          </>
        ) : (
          <>
            <div className="text-[11px] text-gray2 tracking-wider uppercase mb-0.5">Welcome to</div>
            <div className="font-display text-[1.7rem] tracking-wide mb-2">K34 Badminton</div>
            <div className="text-[12px] text-gray2 mb-3.5">Surabaya · Every Thursday · 18:00–21:00</div>
            <button onClick={() => router.push('/login')}
              className="w-full bg-red text-white font-display tracking-wider py-2.5 rounded-xl text-base">
              Sign In to Join
            </button>
          </>
        )}
      </div>

      {latestRally && <RallyWinnerCard rally={latestRally} />}

      <SectionHeader title="Next Session" action="See all" onAction={() => router.push('/schedule')} />
      {loading ? <Spinner /> : nextSession ? (
        <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
          <div className="px-3.5 py-2 flex items-center gap-1.5 border-b border-white/7">
            {nextSession.is_rally && <Badge variant="red" className="text-[9px]">Rally</Badge>}
            <span className="text-[11px] text-gray2">{nextSession.is_rally ? 'First Thursday of the month' : 'Regular session'}</span>
          </div>
          <div className="p-3.5">
            <div className="font-display text-[1.3rem] mb-0.5">
              {format(new Date(nextSession.session_date), 'EEEE, MMMM d · yyyy')}
            </div>
            <div className="text-[11px] text-gray2 mb-2.5">18:00–21:00 WIB · Zuper Mawar Court 5 & 6</div>
            <div className="text-[11px] text-gray2 mb-2.5">
              <span className="text-light font-medium">{attendCount}</span> / {nextSession.max_attendance} attending
            </div>
            <button
              onClick={() => auth ? setAttendModal(true) : router.push('/login')}
              className="w-full bg-red text-white font-display tracking-wider py-2.5 rounded-[9px] text-[.9rem]">
              Register Attendance
            </button>
          </div>
        </div>
      ) : <Empty message="No upcoming sessions" />}

      {pastWinners.length > 0 && (
        <>
          <SectionHeader title="Past Rally Winners" action="View rally" onAction={() => router.push('/rally')} />
          <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
            {pastWinners.map((w, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/7 last:border-0">
                <div className="font-display text-[1rem] w-[42px] text-gray flex-shrink-0">{w.month_label.slice(0, 3)}</div>
                <div className="flex-1">
                  <div className="text-[12px] font-medium">{w.player1_name.split(' ')[0]} & {w.player2_name.split(' ')[0]}</div>
                  <div className="text-[10px] text-gray2">{w.matches} matches · {w.wins} wins · {w.total} pts</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="h-20" />
      <BottomNav />

      {attendModal && nextSession && (
        <AttendanceModal session={nextSession} onClose={() => setAttendModal(false)}
          onSuccess={loadData} userMembershipActive={membershipActive} />
      )}
    </div>
  )
}