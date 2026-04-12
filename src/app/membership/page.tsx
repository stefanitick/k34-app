'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, differenceInSeconds } from 'date-fns'
import { Upload, Check } from 'lucide-react'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Badge, Spinner } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Membership, MembershipPeriod } from '@/types'
import toast from 'react-hot-toast'

export default function MembershipPage() {
  const router = useRouter()
  const auth = getSession()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [periods, setPeriods] = useState<MembershipPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!auth) { router.push('/login'); return }
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()

    // All open periods
    const { data: periodsData } = await supabase
      .from('membership_periods')
      .select('*')
      .eq('is_active', true)
      .order('month_start', { ascending: true })
    setPeriods(periodsData ?? [])

    // User's memberships
    const { data: memData } = await supabase
      .from('memberships')
      .select('*, period:membership_periods(*)')
      .eq('player_id', auth!.player_id)
      .order('registered_at', { ascending: false })
    setMemberships(memData as Membership[] ?? [])

    setLoading(false)
  }

  // Countdown to nearest close_date
  useEffect(() => {
    const nextClosing = periods
      .map(p => new Date(p.close_date + 'T23:59:59'))
      .filter(d => d > new Date())
      .sort((a, b) => a.getTime() - b.getTime())[0]

    if (!nextClosing) return
    const tick = () => {
      const secs = differenceInSeconds(nextClosing, new Date())
      if (secs <= 0) return
      const d = Math.floor(secs / 86400)
      const h = Math.floor((secs % 86400) / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      setCountdown({ d, h, m, s })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [periods])

  // Current active membership
  const now = new Date()
  const activeMembership = memberships.find(m => {
    if (m.status !== 'approved') return false
    const p = m.period as MembershipPeriod
    return new Date(p.month_start) <= now && now <= new Date(p.month_end)
  })

  // Next available period to register
  const registeredPeriodIds = memberships.map(m => m.period_id)
  const nextPeriod = periods.find(p => {
    if (registeredPeriodIds.includes(p.id)) return false
    const closeDate = new Date(p.close_date + 'T23:59:59')
    return closeDate > now
  })

  async function handleRegister() {
    if (!nextPeriod || !auth) return
    setUploading(true)
    const supabase = createClient()

    try {
      let proof_url: string | null = null
      if (file) {
        const ext = file.name.split('.').pop()
        const path = `membership/${auth.player_id}/${nextPeriod.id}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('payment-proofs')
          .upload(path, file, { upsert: true })
        if (upErr) throw upErr
        proof_url = path
      }

      // Check slot count
      const { count } = await supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .eq('period_id', nextPeriod.id)
        .in('status', ['pending', 'approved'])

      if ((count ?? 0) >= nextPeriod.max_slots) {
        toast.error('Membership slots are full (20/20)')
        return
      }

      const { error } = await supabase.from('memberships').insert({
        player_id: auth.player_id,
        period_id: nextPeriod.id,
        status: 'pending',
        payment_proof_url: proof_url,
      })
      if (error) throw error

      toast.success('Membership registered! Waiting for admin approval.')
      setFile(null)
      loadData()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setUploading(false)
    }
  }

  if (!auth) return null

  return (
    <div className="min-h-screen animate-page">
      <AppBar title="Membership" />

      {loading ? <Spinner /> : (
        <>
          {/* Active membership status */}
          {activeMembership ? (
            <div className="mx-5 mb-3 bg-dark2 border border-red/35 rounded-2xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-gray2 mb-1">Active Period</div>
                  <div className="font-display text-[1.2rem]">
                    {format(new Date((activeMembership.period as MembershipPeriod).month_start), 'MMM')} –{' '}
                    {format(new Date((activeMembership.period as MembershipPeriod).month_end), 'MMM yyyy')}
                  </div>
                </div>
                <Badge variant="success">Active</Badge>
              </div>
              {/* Progress bar */}
              {(() => {
                const p = activeMembership.period as MembershipPeriod
                const start = new Date(p.month_start).getTime()
                const end = new Date(p.month_end).getTime()
                const pct = Math.round(((now.getTime() - start) / (end - start)) * 100)
                return (
                  <>
                    <div className="h-1 bg-dark4 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-red rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray">
                      <span>{format(new Date(p.month_start), 'MMM d')}</span>
                      <span>{pct}% through</span>
                      <span>{format(new Date(p.month_end), 'MMM d')}</span>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="mx-5 mb-3 bg-dark2 border border-white/7 rounded-2xl p-4 text-center">
              <div className="text-[12px] text-gray2">No active membership</div>
              <div className="text-[11px] text-gray mt-1">Register below for the next period</div>
            </div>
          )}

          {/* Register next period */}
          {nextPeriod ? (
            <>
              <div className="px-5 mb-1.5">
                <div className="text-[11px] text-gray2">
                  Next period: {format(new Date(nextPeriod.month_start), 'MMM')} – {format(new Date(nextPeriod.month_end), 'MMM yyyy')} · Registration closes {format(new Date(nextPeriod.close_date), 'MMM d')}
                </div>
              </div>

              {/* Countdown */}
              <div className="px-5 mb-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { val: countdown.d, lbl: 'Days' },
                    { val: countdown.h, lbl: 'Hours' },
                    { val: countdown.m, lbl: 'Min' },
                    { val: countdown.s, lbl: 'Sec' },
                  ].map(({ val, lbl }) => (
                    <div key={lbl} className="bg-dark3 rounded-[9px] py-2.5 px-1.5 text-center">
                      <div className="font-display text-[1.5rem] leading-none text-red">
                        {String(val).padStart(2, '0')}
                      </div>
                      <div className="text-[8px] tracking-widest uppercase text-gray mt-0.5">{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Check if pending */}
              {memberships.find(m => m.period_id === nextPeriod.id && m.status === 'pending') ? (
                <div className="mx-5 mb-3 bg-warn/12 border border-warn/25 rounded-xl p-3.5 text-center">
                  <Badge variant="warn">Pending Approval</Badge>
                  <div className="text-[12px] text-gray2 mt-1.5">Payment uploaded. Admin will approve within 1×24 hours.</div>
                </div>
              ) : (
                <>
                  <div className="px-5 mb-2">
                    <button
                      onClick={handleRegister}
                      disabled={uploading}
                      className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-lg disabled:opacity-50"
                    >
                      {uploading ? 'Registering...' : `Register ${format(new Date(nextPeriod.month_start), 'MMM')}–${format(new Date(nextPeriod.month_end), 'MMM yyyy')} · Rp 300,000`}
                    </button>
                  </div>
                  <div className="px-5 mb-1 text-[11px] text-gray2">
                    Max 20 members · Upload transfer receipt
                  </div>

                  {/* Upload zone */}
                  <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  <div className="px-5 mb-4">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full bg-dark2 border-2 border-dashed border-white/10 rounded-xl p-5 text-center hover:border-red/40 transition-colors"
                    >
                      {file ? (
                        <div className="flex items-center justify-center gap-2 text-success">
                          <Check size={16} /><span className="text-[13px]">{file.name}</span>
                        </div>
                      ) : (
                        <>
                          <Upload size={18} className="mx-auto mb-1.5 text-gray2" />
                          <div className="text-[12px] text-gray2">Upload Payment Proof</div>
                          <div className="text-[10px] text-gray mt-0.5">JPG · PNG · PDF · Max 5MB</div>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="mx-5 mb-4 text-center text-[12px] text-gray2">
              No open registration period at the moment.
            </div>
          )}

          {/* Membership history */}
          <div className="flex justify-between items-center px-5 mb-2.5">
            <h2 className="font-display text-[1.05rem] tracking-wider">History</h2>
          </div>
          <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
            {memberships.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-gray2">No membership history</div>
            ) : memberships.map((m) => {
              const p = m.period as MembershipPeriod
              return (
                <div key={m.id} className="flex justify-between items-center px-4 py-3 border-b border-white/7 last:border-0">
                  <div>
                    <div className="text-[13px] font-medium">
                      {format(new Date(p.month_start), 'MMM')} – {format(new Date(p.month_end), 'MMM yyyy')}
                    </div>
                    <div className="text-[10px] text-gray2 mt-0.5">
                      {m.approved_at
                        ? `Approved ${format(new Date(m.approved_at), 'MMM d, yyyy')}`
                        : `Registered ${format(new Date(m.registered_at), 'MMM d, yyyy')}`}
                    </div>
                  </div>
                  <Badge
                    variant={
                      m.status === 'approved' ? 'success'
                      : m.status === 'pending' ? 'warn'
                      : 'gray'
                    }
                  >
                    {m.status === 'approved'
                      ? (new Date(p.month_end) < now ? 'Ended' : 'Active')
                      : m.status === 'pending' ? 'Pending'
                      : 'Rejected'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="h-20" />
      <BottomNav />
    </div>
  )
}
