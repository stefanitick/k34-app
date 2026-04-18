'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { AttendanceModal } from '@/components/schedule/AttendanceModal'
import { Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session, Rally } from '@/types'

export default function HomePage() {
  const router = useRouter()
  const auth = getSession()
  const [nextSession, setNextSession] = useState<(Session & { attendance_count: number; user_registered: boolean }) | null>(null)
  const [nextRally, setNextRally] = useState<(Rally & { session: Session }) | null>(null)
  const [latestWinner, setLatestWinner] = useState<{ name: string; month: string } | null>(null)
  const [adminPhones, setAdminPhones] = useState<{ name: string; phone: string }[]>([])
  const [attendModal, setAttendModal] = useState(false)
  const [membershipActive, setMembershipActive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    // Next non-rally session
    const { data: sessions } = await supabase.from('sessions').select('*')
      .gte('session_date', today).eq('is_rally', false)
      .order('session_date', { ascending: true }).limit(1)

    if (sessions?.[0]) {
      const s = sessions[0]
      const { count } = await supabase.from('attendances').select('*', { count: 'exact', head: true })
        .eq('session_id', s.id).eq('status', 'confirmed')

      let userRegistered = false
      if (auth) {
        const { data: att } = await supabase.from('attendances').select('id')
          .eq('session_id', s.id).eq('player_id', auth.player_id).eq('status', 'confirmed').maybeSingle()
        userRegistered = !!att
      }
      setNextSession({ ...s, attendance_count: count ?? 0, user_registered: userRegistered })
    }

    // Next rally session
    const { data: rallySessions } = await supabase.from('sessions').select('*')
      .gte('session_date', today).eq('is_rally', true)
      .order('session_date', { ascending: true }).limit(1)

    if (rallySessions?.[0]) {
      const rs = rallySessions[0]
      const { data: rallyData } = await supabase.from('rallies').select('*')
        .eq('session_id', rs.id).maybeSingle()
      setNextRally(rallyData ? { ...rallyData, session: rs } as Rally & { session: Session } : null)
    }

    // Latest winner
    const { data: completed } = await supabase.from('rallies').select('*, session:sessions(session_date)')
      .eq('status', 'completed').not('winner_stats', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (completed?.winner_stats) {
      const ws = completed.winner_stats as { player1_name: string; player2_name: string }
      const date = new Date((completed.session as unknown as { session_date: string }).session_date)
      setLatestWinner({
        name: `${ws.player1_name.split(' ')[0]} & ${ws.player2_name.split(' ')[0]}`,
        month: format(date, 'MMMM yyyy'),
      })
    }

    // Admin phones for contact
    const { data: admins } = await supabase.from('players').select('name, phone')
      .eq('role', 'admin').eq('status', 'approved')
    setAdminPhones((admins ?? []) as { name: string; phone: string }[])

    // Membership check
    if (auth) {
      const { data: mems } = await supabase.from('memberships')
        .select('*, period:membership_periods(*)')
        .eq('player_id', auth.player_id).eq('status', 'approved')
      const now = new Date()
      setMembershipActive((mems ?? []).some(m => {
        const p = m.period as { month_start: string; month_end: string }
        return new Date(p.month_start) <= now && now <= new Date(p.month_end)
      }))
    }

    setLoading(false)
  }

  function openWhatsApp(phone: string) {
    const clean = phone.replace(/\D/g, '').replace(/^0/, '62')
    window.open(`https://wa.me/${clean}`, '_blank')
  }

  return (
    <div className="min-h-screen animate-page">
      <AppBar />

      {loading ? <Spinner /> : (
        <>
          {/* Hero */}
          <div className="mx-5 mb-3 bg-dark2 border border-white/7 rounded-2xl p-4 relative overflow-hidden">
            <div className="absolute right-[-8px] bottom-[-18px] font-display text-[6rem] text-red/5 leading-none pointer-events-none select-none">K34</div>
            {auth ? (
              <>
                <div className="text-[10px] text-gray2 tracking-wider uppercase mb-0.5">Welcome back,</div>
                <div className="font-display text-[1.8rem] tracking-wide mb-1">{auth.name.split(' ')[0]}</div>
                <div className="text-[11px] text-gray2">Kedungdoro Badminton Lovers · #WorkHardSmashHarder</div>
              </>
            ) : (
              <>
                <div className="text-[10px] text-gray2 tracking-wider uppercase mb-0.5">Kedungdoro Badminton Lovers</div>
                <div className="font-display text-[1.8rem] tracking-wide mb-1">K34 Badminton</div>
                <div className="text-[11px] text-gray2 mb-3">#WorkHardSmashHarder · Every Thursday · 18:00–21:00</div>
                <button onClick={() => router.push('/login')}
                  className="w-full bg-red text-white font-display tracking-wider py-2.5 rounded-xl text-base">
                  Sign In to Join
                </button>
              </>
            )}
          </div>

          {/* Rally CTA */}
          {nextRally && (
            <div className="mx-5 mb-3 bg-dark2 border border-red/30 rounded-2xl p-4">
              <div className="text-[9px] tracking-[.2em] uppercase text-red mb-1">Monthly Rally</div>
              <div className="font-display text-[1.2rem] mb-0.5">
                {format(new Date((nextRally.session as unknown as Session).session_date), 'EEEE, d MMMM yyyy')}
              </div>
              <div className="text-[11px] text-gray2 mb-2">18:00 · Zuper Mawar · Members only · Pairs by level</div>
              {latestWinner && (
                <div className="text-[10px] text-gray2 bg-dark3 rounded-lg px-3 py-2">
                  Juara terakhir: <span className="text-light font-medium">{latestWinner.name}</span> · {latestWinner.month}
                </div>
              )}
            </div>
          )}

          {/* Next session */}
          {nextSession ? (
            <>
              <div className="flex justify-between items-center px-5 mb-2">
                <h2 className="font-display text-[1.05rem] tracking-wider">Next Session</h2>
                <button onClick={() => router.push('/schedule')} className="text-[11px] text-red">See all</button>
              </div>
              <div className="mx-5 mb-4 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/7">
                  <div className="font-display text-[1.2rem] mb-0.5">
                    {format(new Date(nextSession.session_date), 'EEEE, d MMMM yyyy')}
                  </div>
                  <div className="text-[11px] text-gray2">
                    {nextSession.start_time.slice(0,5)}–{nextSession.end_time.slice(0,5)} · {nextSession.location}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[11px] text-gray2 mb-2.5">
                    <span className="text-light font-medium">{nextSession.attendance_count}</span> / {nextSession.max_attendance} terdaftar
                  </div>
                  {nextSession.user_registered ? (
                    <div className="flex items-center gap-2 bg-success/8 border border-success/20 rounded-xl px-3.5 py-2.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <div>
                        <div className="text-[12px] font-medium text-success">Kamu sudah terdaftar</div>
                        <div className="text-[10px] text-gray2">See you on the court!</div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => auth ? setAttendModal(true) : router.push('/login')}
                      className="w-full bg-red text-white font-display tracking-wider py-2.5 rounded-xl text-base"
                    >
                      Register Attendance
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <Empty message="No upcoming sessions" />
          )}

          {/* Contact admin */}
          {adminPhones.length > 0 && (
            <div className="px-5 mb-6">
              <div className="text-[10px] text-gray2 mb-2 text-center">Ada pertanyaan? Hubungi admin</div>
              <div className="flex gap-2 justify-center flex-wrap">
                {adminPhones.map(a => (
                  <button key={a.phone} onClick={() => openWhatsApp(a.phone)}
                    className="flex items-center gap-1.5 bg-dark2 border border-white/7 px-3 py-2 rounded-xl text-[11px]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                    <span className="text-success">{a.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="h-20" />
      <BottomNav />

      {attendModal && nextSession && (
        <AttendanceModal
          session={nextSession}
          onClose={() => setAttendModal(false)}
          onSuccess={loadData}
          userMembershipActive={membershipActive}
        />
      )}
    </div>
  )
}
