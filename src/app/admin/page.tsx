'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Users, Calendar, Star, List, Check, X, Eye } from 'lucide-react'
import { BottomNav } from '@/components/layout/BottomNav'
import { Spinner } from '@/components/ui'
import { createClient, getProofUrl } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import toast from 'react-hot-toast'

interface PendingItem {
  id: string
  type: 'membership' | 'incidentil'
  player_name: string
  player_origin: string
  detail: string
  proof_url: string | null
  session_id?: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const auth = getSession()
  const [pending, setPending] = useState<PendingItem[]>([])
  const [stats, setStats] = useState({ members: 0, pending: 0, nextSession: 0 })
  const [loading, setLoading] = useState(true)
  const [proofModal, setProofModal] = useState<string | null>(null)
  const [proofLoading, setProofLoading] = useState(false)

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

    // Pending incidentil (no payment confirmed)
    const { data: pendingInc } = await supabase
      .from('attendances')
      .select('*, player:players(name, origin), session:sessions(session_date)')
      .eq('type', 'incidentil')
      .eq('status', 'confirmed')
      .not('payment_proof_url', 'is', null)
      .order('registered_at', { ascending: true })
      .limit(10)

    const items: PendingItem[] = [
      ...(pendingMem ?? []).map(m => ({
        id: m.id,
        type: 'membership' as const,
        player_name: (m.player as { name: string }).name,
        player_origin: (m.player as { origin: string }).origin ?? '—',
        detail: `Membership ${format(new Date((m.period as { month_start: string }).month_start), 'MMM')}–${format(new Date((m.period as { month_end: string }).month_end), 'MMM yyyy')}`,
        proof_url: m.payment_proof_url,
      })),
      ...(pendingInc ?? []).map(a => ({
        id: a.id,
        type: 'incidentil' as const,
        player_name: (a.player as { name: string }).name,
        player_origin: (a.player as { origin: string }).origin ?? '—',
        detail: `Incidentil ${format(new Date((a.session as { session_date: string }).session_date), 'MMM d')}`,
        proof_url: a.payment_proof_url,
        session_id: a.session_id,
      })),
    ]
    setPending(items)

    const { count: memberCount } = await supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('status', 'approved')
    const { count: pendingCount } = await supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    const { data: nextSess } = await supabase.from('sessions').select('*').gte('session_date', today).order('session_date', { ascending: true }).limit(1).maybeSingle()
    let nextCount = 0
    if (nextSess) {
      const { count } = await supabase.from('attendances').select('*', { count: 'exact', head: true }).eq('session_id', nextSess.id).eq('status', 'confirmed')
      nextCount = count ?? 0
    }
    setStats({ members: memberCount ?? 0, pending: pendingCount ?? 0, nextSession: nextCount })
    setLoading(false)
  }

  async function viewProof(path: string) {
    setProofLoading(true)
    const url = await getProofUrl(path)
    setProofLoading(false)
    if (!url) { toast.error('Could not load proof'); return }
    setProofModal(url)
  }

  async function approveMembership(id: string) {
    const supabase = createClient()
    await supabase.from('memberships').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: auth!.player_id }).eq('id', id)
    toast.success('Approved!')
    loadData()
  }

  async function rejectMembership(id: string) {
    const supabase = createClient()
    await supabase.from('memberships').update({ status: 'rejected' }).eq('id', id)
    toast.success('Rejected')
    loadData()
  }

  async function confirmIncidentil(id: string) {
    const supabase = createClient()
    await supabase.from('attendances').update({ payment_proof_url: 'confirmed_by_admin' }).eq('id', id)
    toast.success('Payment confirmed!')
    loadData()
  }

  const MENU = [
    { label: 'Players & Membership', sub: 'Manage members, accounts, periods', href: '/admin/players', icon: Users },
    { label: 'Sessions', sub: 'Schedule, attendance, payments', href: '/admin/sessions', icon: Calendar },
    { label: 'Rally', sub: 'Pairs, scores, winner', href: '/admin/rally', icon: Star },
  ]

  return (
    <div className="min-h-screen animate-page">
      <div className="px-5 pt-4 pb-2.5 flex items-center justify-between">
        <span className="font-display text-[1.25rem] tracking-wider">Admin</span>
        <span className="text-[9px] tracking-widest uppercase bg-red text-white px-2 py-0.5 rounded">Admin</span>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-px mx-5 mb-3.5 bg-white/7 rounded-xl overflow-hidden border border-white/7">
            {[
              { val: stats.members, lbl: 'Members', color: 'text-light' },
              { val: stats.pending, lbl: 'Pending', color: stats.pending > 0 ? 'text-warn' : 'text-light' },
              { val: stats.nextSession, lbl: 'Next sesi', color: 'text-light' },
            ].map(({ val, lbl, color }) => (
              <div key={lbl} className="bg-dark2 py-3 px-2 text-center">
                <div className={`font-display text-[1.5rem] leading-none ${color}`}>{val}</div>
                <div className="text-[9px] text-gray2 tracking-wider uppercase mt-1">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Quick nav */}
          <div className="grid grid-cols-2 gap-2 px-5 mb-3.5">
            {MENU.map(({ label, sub, href, icon: Icon }) => (
              <button key={href} onClick={() => router.push(href)}
                className="bg-dark2 border border-white/7 rounded-xl p-3.5 text-left">
                <div className="w-7 h-7 bg-red/12 rounded-lg flex items-center justify-center mb-2">
                  <Icon size={14} className="text-red" strokeWidth={1.5} />
                </div>
                <div className="text-[13px] font-medium leading-tight">{label}</div>
                <div className="text-[10px] text-gray2 mt-0.5">{sub}</div>
              </button>
            ))}
          </div>

          {/* Pending approvals */}
          {pending.length > 0 && (
            <>
              <div className="flex justify-between items-center px-5 mb-2">
                <h2 className="font-display text-[1.05rem] tracking-wider">Pending Approvals</h2>
                <span className="text-[10px] bg-warn/15 text-warn border border-warn/25 px-2 py-0.5 rounded-full">{pending.length}</span>
              </div>
              <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                {pending.map((item, i) => (
                  <div key={item.id} className={`px-4 py-3 ${i < pending.length - 1 ? 'border-b border-white/7' : ''}`}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-full bg-dark3 flex items-center justify-center font-display text-[.8rem] flex-shrink-0">
                        {item.player_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{item.player_name}</div>
                        <div className="text-[10px] text-gray2">{item.detail} · {item.player_origin}</div>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border ${item.type === 'membership' ? 'bg-red/12 text-red border-red/25' : 'bg-warn/12 text-warn border-warn/25'}`}>
                        {item.type}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {item.proof_url && (
                        <button onClick={() => viewProof(item.proof_url!)} disabled={proofLoading}
                          className="flex items-center gap-1 text-[10px] text-gray2 bg-dark3 border border-white/7 px-2.5 py-1.5 rounded-lg">
                          <Eye size={11} /> View Proof
                        </button>
                      )}
                      {item.type === 'membership' ? (
                        <div className="flex gap-1.5 ml-auto">
                          <button onClick={() => approveMembership(item.id)}
                            className="text-[11px] text-success bg-success/12 border border-success/25 px-3 py-1.5 rounded-lg flex items-center gap-1">
                            <Check size={11} /> Approve
                          </button>
                          <button onClick={() => rejectMembership(item.id)}
                            className="text-[11px] text-gray2 bg-dark3 border border-white/7 px-3 py-1.5 rounded-lg flex items-center gap-1">
                            <X size={11} /> Reject
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => confirmIncidentil(item.id)}
                          className="ml-auto text-[11px] text-success bg-success/12 border border-success/25 px-3 py-1.5 rounded-lg flex items-center gap-1">
                          <Check size={11} /> Paid
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {pending.length === 0 && (
            <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] p-4 text-center">
              <div className="text-[12px] text-gray2">No pending approvals</div>
            </div>
          )}
        </>
      )}

      {/* Proof modal */}
      {proofModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center max-w-[390px] left-1/2 -translate-x-1/2 px-5"
          onClick={() => setProofModal(null)}>
          <div className="w-full" onClick={e => e.stopPropagation()}>
            <img src={proofModal} alt="Payment proof" className="w-full rounded-xl object-contain max-h-[70vh]" />
            <button onClick={() => setProofModal(null)}
              className="w-full mt-4 bg-dark2 border border-white/7 text-light font-display tracking-wider py-3.5 rounded-xl">
              Close
            </button>
          </div>
        </div>
      )}

      <div className="h-20" />
      <BottomNav />
    </div>
  )
}