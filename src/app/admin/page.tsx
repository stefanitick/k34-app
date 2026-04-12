'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Users, Clock, Calendar, Star, ChevronRight, Check, X } from 'lucide-react'
import { BottomNav } from '@/components/layout/BottomNav'
import { Badge, Spinner } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Membership, MembershipPeriod, Session, Player } from '@/types'
import toast from 'react-hot-toast'

interface PendingItem {
  id: string
  type: 'membership' | 'incidentil'
  player_name: string
  player_origin: string
  detail: string
  proof_url: string | null
  created_at: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const auth = getSession()
  const [pending, setPending] = useState<PendingItem[]>([])
  const [stats, setStats] = useState({ members: 0, pending: 0, nextSession: 0 })
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    // Pending memberships
    const { data: pendingMem } = await supabase
      .from('memberships')
      .select('*, player:players(name, origin), period:membership_periods(month_start, month_end)')
      .eq('status', 'pending')
      .order('registered_at', { ascending: true })

    // Pending incidentil attendances (those with payment proof)
    const { data: pendingInc } = await supabase
      .from('attendances')
      .select('*, player:players(name, origin), session:sessions(session_date)')
      .eq('type', 'incidentil')
      .eq('status', 'confirmed')
      .not('payment_proof_url', 'is', null)
      .order('registered_at', { ascending: true })
      .limit(10)

    const pendingItems: PendingItem[] = [
      ...(pendingMem ?? []).map(m => ({
        id: m.id,
        type: 'membership' as const,
        player_name: (m.player as { name: string }).name,
        player_origin: (m.player as { origin: string }).origin ?? '—',
        detail: `Membership ${format(new Date((m.period as { month_start: string }).month_start), 'MMM')}–${format(new Date((m.period as { month_end: string }).month_end), 'MMM yyyy')}`,
        proof_url: m.payment_proof_url,
        created_at: m.registered_at,
      })),
    ]
    setPending(pendingItems)

    // Stats
    const { count: memberCount } = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    const { count: pendingCount } = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    // Next session attendance
    const { data: nextSess } = await supabase
      .from('sessions')
      .select('*')
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    let nextCount = 0
    if (nextSess) {
      const { count } = await supabase
        .from('attendances')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', nextSess.id)
        .eq('status', 'confirmed')
      nextCount = count ?? 0
    }

    setStats({
      members: memberCount ?? 0,
      pending: pendingCount ?? 0,
      nextSession: nextCount,
    })

    // Upcoming sessions
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .limit(5)
    setUpcomingSessions((sessions ?? []) as Session[])

    setLoading(false)
  }

  async function approveMembership(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('memberships')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: auth!.player_id,
      })
      .eq('id', id)
    if (error) toast.error('Failed to approve')
    else { toast.success('Approved!'); loadData() }
  }

  async function rejectMembership(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('memberships').update({ status: 'rejected' }).eq('id', id)
    if (error) toast.error('Failed to reject')
    else { toast.success('Rejected'); loadData() }
  }

  const MENU = [
    { label: 'Players', sub: 'Manage members & accounts', href: '/admin/players', icon: Users },
    { label: 'Sessions', sub: 'Create & manage sessions', href: '/admin/sessions', icon: Calendar },
    { label: 'Rally', sub: 'Generate pairs, confirm scores', href: '/admin/rally', icon: Star },
  ]

  return (
    <div className="min-h-screen animate-page">
      {/* Admin header */}
      <div className="px-5 pt-4 pb-2.5 flex items-center justify-between">
        <span className="font-display text-[1.25rem] tracking-wider">Admin</span>
        <span className="text-[9px] tracking-widest uppercase bg-red text-white px-2 py-0.5 rounded">Admin</span>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 px-5 mb-3.5">
            {[
              { val: stats.members, lbl: 'Members', icon: Users },
              { val: stats.pending, lbl: 'Pending', accent: true },
              { val: stats.nextSession, lbl: 'Next sesi' },
            ].map(({ val, lbl, accent }) => (
              <div key={lbl} className="bg-dark2 border border-white/7 rounded-xl py-3 px-2 text-center">
                <div className={`font-display text-[1.5rem] leading-none ${accent && val > 0 ? 'text-warn' : 'text-light'}`}>{val}</div>
                <div className="text-[9px] text-gray2 tracking-wider uppercase mt-1">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Pending approvals */}
          {pending.length > 0 && (
            <>
              <div className="flex justify-between items-center px-5 mb-2.5">
                <h2 className="font-display text-[1.05rem] tracking-wider">Pending Approvals</h2>
                <Badge variant="warn">{pending.length}</Badge>
              </div>
              <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                {pending.map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5 px-4 py-3 border-b border-white/7 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-dark3 flex items-center justify-center font-display text-[.8rem] flex-shrink-0">
                      {item.player_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{item.player_name}</div>
                      <div className="text-[10px] text-gray2">{item.detail} · {item.player_origin}</div>
                      {item.proof_url && (
                        <div className="text-[10px] text-red mt-0.5">Payment proof uploaded</div>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => approveMembership(item.id)}
                        className="bg-success/12 text-success border border-success/25 text-[11px] px-2.5 py-1 rounded-lg"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => rejectMembership(item.id)}
                        className="bg-dark3 text-gray2 border border-white/7 text-[11px] px-2.5 py-1 rounded-lg"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Quick nav */}
          <div className="px-5 mb-2.5">
            <h2 className="font-display text-[1.05rem] tracking-wider mb-2.5">Management</h2>
            <div className="bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
              {MENU.map(({ label, sub, href, icon: Icon }) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/7 last:border-0 text-left"
                >
                  <div className="w-8 h-8 bg-red/12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-red" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">{label}</div>
                    <div className="text-[11px] text-gray2">{sub}</div>
                  </div>
                  <ChevronRight size={14} className="text-gray2" />
                </button>
              ))}
            </div>
          </div>

          {/* Upcoming sessions */}
          <div className="px-5 mt-3.5 mb-2.5">
            <h2 className="font-display text-[1.05rem] tracking-wider mb-2.5">Upcoming Sessions</h2>
            <div className="bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
              {upcomingSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/admin/sessions?id=${s.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/7 last:border-0 text-left"
                >
                  <div className="w-[36px] h-[40px] bg-dark3 rounded-[8px] flex flex-col items-center justify-center flex-shrink-0">
                    <div className="font-display text-[1rem] leading-none text-red">{format(new Date(s.session_date), 'd')}</div>
                    <div className="text-[8px] tracking-wider uppercase text-gray2">{format(new Date(s.session_date), 'MMM')}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">
                      K34 Funminton{s.is_rally ? ' — Rally' : ''}
                    </div>
                    <div className="text-[11px] text-gray2">
                      {(s as Session & { attendance_count?: number }).attendance_count ?? 0}/{s.max_attendance} registered
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray2" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="h-20" />
      <BottomNav />
    </div>
  )
}
