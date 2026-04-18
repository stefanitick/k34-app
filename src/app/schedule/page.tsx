'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { AttendanceModal } from '@/components/schedule/AttendanceModal'
import { Badge, Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session } from '@/types'
import toast from 'react-hot-toast'

type Tab = 'upcoming' | 'registered' | 'past'

export default function SchedulePage() {
  const router = useRouter()
  const auth = getSession()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [sessions, setSessions] = useState<(Session & { attendance_count: number; user_registered: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Session | null>(null)
  const [membershipActive, setMembershipActive] = useState(false)

  useEffect(() => { loadSessions() }, [tab])

  async function loadSessions() {
    setLoading(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    let query = supabase.from('sessions').select('*').order('session_date', { ascending: tab !== 'past' })
    if (tab === 'upcoming') query = query.gte('session_date', today)
    else if (tab === 'past') query = query.lt('session_date', today)

    const { data: sessData } = await query
    if (!sessData) { setLoading(false); return }

    const sessWithCounts = await Promise.all(sessData.map(async s => {
      const { count } = await supabase.from('attendances')
        .select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('status', 'confirmed')
      let userRegistered = false
      if (auth) {
        const { data: att } = await supabase.from('attendances').select('id')
          .eq('session_id', s.id).eq('player_id', auth.player_id).eq('status', 'confirmed').maybeSingle()
        userRegistered = !!att
      }
      return { ...s, attendance_count: count ?? 0, user_registered: userRegistered }
    }))

    const filtered = tab === 'registered' ? sessWithCounts.filter(s => s.user_registered) : sessWithCounts
    setSessions(filtered)

    if (auth) {
      const { data: mems } = await supabase.from('memberships')
        .select('*, period:membership_periods(*)').eq('player_id', auth.player_id).eq('status', 'approved')
      const now = new Date()
      setMembershipActive((mems ?? []).some(m => {
        const p = m.period as { month_start: string; month_end: string }
        return new Date(p.month_start) <= now && now <= new Date(p.month_end)
      }))
    }
    setLoading(false)
  }

  function isOpen(s: Session) { return new Date(s.registration_closes_at) > new Date() }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'registered', label: 'Registered' },
    { key: 'past', label: 'Past' },
  ]

  return (
    <div className="min-h-screen animate-page">
      <AppBar title="Schedule" />
      <div className="flex px-5 gap-1.5 mb-3.5 overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all ${tab === key ? 'bg-red text-white border-red' : 'text-gray2 border-white/7 bg-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : sessions.length === 0 ? (
        <Empty message="Tidak ada sesi" />
      ) : (
        sessions.map(s => {
          const open = isOpen(s) && s.max_attendance > 0
          const full = s.attendance_count >= s.max_attendance
          const cancelled = s.max_attendance === 0

          // Rally card — different style
          if (s.is_rally && !cancelled) {
            return (
              <div key={s.id} className="mx-5 mb-3 bg-dark2 border border-red/35 rounded-[14px] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-red/8 border-b border-red/20">
                  <Badge variant="red" className="text-[9px]">Rally</Badge>
                  <span className="text-[10px] text-red">Members only · Monthly Rally</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-[40px] h-[44px] bg-dark3 rounded-[9px] flex flex-col items-center justify-center flex-shrink-0">
                    <div className="font-display text-[1.1rem] leading-none text-red">{format(new Date(s.session_date), 'd')}</div>
                    <div className="text-[8px] tracking-wider uppercase text-gray2">{format(new Date(s.session_date), 'MMM')}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium mb-0.5">{format(new Date(s.session_date), 'EEEE, d MMMM yyyy')}</div>
                    <div className="text-[11px] text-gray2">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · {s.attendance_count}/{s.max_attendance}</div>
                  </div>
                  {s.user_registered ? (
                    <div className="text-[11px] text-success bg-success/12 border border-success/25 px-3 py-1.5 rounded-lg flex-shrink-0">Registered</div>
                  ) : open && !full ? (
                    <button onClick={() => auth ? setSelected(s) : router.push('/login')}
                      className="bg-red text-white text-[12px] font-display tracking-wider px-3 py-1.5 rounded-lg flex-shrink-0">Join</button>
                  ) : (
                    <div className="text-[11px] text-gray bg-dark3 border border-white/7 px-3 py-1.5 rounded-lg flex-shrink-0">{full ? 'Full' : 'Closed'}</div>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div key={s.id} className={`flex items-center gap-3 px-5 py-3 border-b border-white/7 ${cancelled ? 'opacity-40' : ''}`}>
              <div className="w-[40px] h-[44px] bg-dark3 rounded-[9px] flex flex-col items-center justify-center flex-shrink-0">
                <div className="font-display text-[1.1rem] leading-none text-red">{format(new Date(s.session_date), 'd')}</div>
                <div className="text-[8px] tracking-wider uppercase text-gray2">{format(new Date(s.session_date), 'MMM')}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate mb-0.5">
                  {cancelled ? '🚫 Dibatalkan' : 'K34 Funminton'}
                </div>
                <div className="text-[11px] text-gray2">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · {s.attendance_count}/{s.max_attendance}</div>
              </div>
              {!cancelled && (s.user_registered ? (
                <div className="text-[11px] text-success bg-success/12 border border-success/25 px-3 py-1.5 rounded-lg flex-shrink-0">Registered</div>
              ) : open && !full ? (
                <button onClick={() => auth ? setSelected(s) : router.push('/login')}
                  className="bg-red text-white text-[12px] font-display tracking-wider px-3 py-1.5 rounded-lg flex-shrink-0">Join</button>
              ) : (
                <div className="text-[11px] text-gray bg-dark3 border border-white/7 px-3 py-1.5 rounded-lg flex-shrink-0">{full ? 'Full' : 'Closed'}</div>
              ))}
            </div>
          )
        })
      )}

      <div className="h-20" />
      <BottomNav />

      {selected && (
        <AttendanceModal session={selected} onClose={() => setSelected(null)}
          onSuccess={loadSessions} userMembershipActive={membershipActive} />
      )}
    </div>
  )
}
