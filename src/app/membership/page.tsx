'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, differenceInSeconds } from 'date-fns'
import { Upload, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Badge, Spinner } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Membership, MembershipPeriod } from '@/types'
import toast from 'react-hot-toast'
import { useRef } from 'react'

interface MemberItem { id: string; name: string; origin: string | null }

export default function MembershipPage() {
  const router = useRouter()
  const auth = getSession()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [periods, setPeriods] = useState<MembershipPeriod[]>([])
  const [activePeriodMembers, setActivePeriodMembers] = useState<MemberItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 })
  const [showMembers, setShowMembers] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!auth) { router.push('/login'); return }
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: periodsData } = await supabase.from('membership_periods')
      .select('*').eq('is_active', true).order('month_start', { ascending: true })
    setPeriods(periodsData ?? [])

    const { data: memData } = await supabase.from('memberships')
      .select('*, period:membership_periods(*)').eq('player_id', auth!.player_id)
      .order('registered_at', { ascending: false })
    setMemberships(memData as Membership[] ?? [])

    // Members of active period
    const now = new Date()
    const activePeriod = (periodsData ?? []).find(p => new Date(p.month_start) <= now && now <= new Date(p.month_end))
    if (activePeriod) {
      const { data: activeMembers } = await supabase.from('memberships')
        .select('player:players(id, name, origin)').eq('period_id', activePeriod.id).eq('status', 'approved')
      setActivePeriodMembers((activeMembers ?? []).map(m => m.player as unknown as MemberItem))
    }
    setLoading(false)
  }

  useEffect(() => {
    const nextClosing = periods.map(p => new Date(p.close_date + 'T23:59:59'))
      .filter(d => d > new Date()).sort((a, b) => a.getTime() - b.getTime())[0]
    if (!nextClosing) return
    const tick = () => {
      const secs = differenceInSeconds(nextClosing, new Date())
      if (secs <= 0) return
      setCountdown({ d: Math.floor(secs / 86400), h: Math.floor((secs % 86400) / 3600), m: Math.floor((secs % 3600) / 60), s: secs % 60 })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [periods])

  const now = new Date()
  const activeMembership = memberships.find(m => {
    if (m.status !== 'approved') return false
    const p = m.period as MembershipPeriod
    return new Date(p.month_start) <= now && now <= new Date(p.month_end)
  })

  const registeredPeriodIds = memberships.map(m => m.period_id)
  const nextPeriod = periods.find(p => {
    if (registeredPeriodIds.includes(p.id)) return false
    return new Date(p.close_date + 'T23:59:59') > now
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
        const { error: upErr } = await supabase.storage.from('payment-proofs').upload(path, file, { upsert: true })
        if (upErr) throw upErr
        proof_url = path
      }
      const { count } = await supabase.from('memberships').select('*', { count: 'exact', head: true })
        .eq('period_id', nextPeriod.id).in('status', ['pending', 'approved'])
      if ((count ?? 0) >= nextPeriod.max_slots) { toast.error('Slot membership penuh (20/20)'); return }
      const { error } = await supabase.from('memberships').insert({
        player_id: auth.player_id, period_id: nextPeriod.id, status: 'pending', payment_proof_url: proof_url,
      })
      if (error) throw error
      toast.success('Berhasil daftar! Menunggu persetujuan admin.')
      setFile(null)
      loadData()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mendaftar')
    } finally { setUploading(false) }
  }

  if (!auth) return null

  return (
    <div className="min-h-screen animate-page">
      <AppBar title="Membership" />

      {loading ? <Spinner /> : (
        <>
          {/* Active membership */}
          {activeMembership ? (
            <div className="mx-5 mb-3 bg-dark2 border border-red/35 rounded-2xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-gray2 mb-1">Periode Aktif</div>
                  <div className="font-display text-[1.2rem]">
                    {format(new Date((activeMembership.period as MembershipPeriod).month_start), 'MMM')} –{' '}
                    {format(new Date((activeMembership.period as MembershipPeriod).month_end), 'MMM yyyy')}
                  </div>
                </div>
                <Badge variant="success">Aktif</Badge>
              </div>
              {(() => {
                const p = activeMembership.period as MembershipPeriod
                const start = new Date(p.month_start).getTime()
                const end = new Date(p.month_end).getTime()
                const pct = Math.min(100, Math.round(((now.getTime() - start) / (end - start)) * 100))
                return (
                  <>
                    <div className="h-1.5 bg-dark4 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-red rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray">
                      <span>{format(new Date(p.month_start), 'MMM d')}</span>
                      <span>{pct}% berjalan</span>
                      <span>{format(new Date(p.month_end), 'MMM d')}</span>
                    </div>
                  </>
                )
              })()}

              {/* Members button */}
              <button onClick={() => setShowMembers(true)}
                className="w-full mt-3 bg-dark3 border border-white/7 rounded-xl py-2.5 text-[12px] text-gray2 flex items-center justify-center gap-1.5">
                <span>Lihat Member Periode Ini</span>
                <span className="text-[10px] bg-red/12 text-red border border-red/25 px-1.5 py-0.5 rounded-full">{activePeriodMembers.length}/{(activeMembership.period as MembershipPeriod & { max_slots?: number }).max_slots ?? 20}</span>
              </button>
            </div>
          ) : (
            <div className="mx-5 mb-3 bg-dark2 border border-white/7 rounded-2xl p-4 text-center">
              <div className="text-[12px] text-gray2">Belum ada membership aktif</div>
              <div className="text-[11px] text-gray mt-1">Daftar di bawah untuk periode berikutnya</div>
            </div>
          )}

          {/* Next period registration */}
          {nextPeriod ? (
            <>
              <div className="px-5 mb-1.5">
                <div className="text-[11px] text-gray2">
                  Periode berikutnya: {format(new Date(nextPeriod.month_start), 'MMM')} – {format(new Date(nextPeriod.month_end), 'MMM yyyy')} · Tutup {format(new Date(nextPeriod.close_date), 'MMM d')}
                </div>
              </div>
              <div className="px-5 mb-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {[{ val: countdown.d, lbl: 'Hari' }, { val: countdown.h, lbl: 'Jam' }, { val: countdown.m, lbl: 'Menit' }, { val: countdown.s, lbl: 'Detik' }].map(({ val, lbl }) => (
                    <div key={lbl} className="bg-dark3 rounded-[9px] py-2.5 px-1.5 text-center">
                      <div className="font-display text-[1.5rem] leading-none text-red">{String(val).padStart(2, '0')}</div>
                      <div className="text-[8px] tracking-widest uppercase text-gray mt-0.5">{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>

              {memberships.find(m => m.period_id === nextPeriod.id && m.status === 'pending') ? (
                <div className="mx-5 mb-3 bg-warn/12 border border-warn/25 rounded-xl p-3.5 text-center">
                  <Badge variant="warn">Menunggu Persetujuan</Badge>
                  <div className="text-[12px] text-gray2 mt-1.5">Pembayaran sudah dikirim. Admin akan konfirmasi dalam 1×24 jam.</div>
                </div>
              ) : (
                <>
                  <div className="px-5 mb-2">
                    <button onClick={handleRegister} disabled={uploading}
                      className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-lg disabled:opacity-50">
                      {uploading ? 'Mendaftar...' : `Daftar ${format(new Date(nextPeriod.month_start), 'MMM')}–${format(new Date(nextPeriod.month_end), 'MMM yyyy')} · Rp 300.000`}
                    </button>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  <div className="px-5 mb-4">
                    <div className="text-[11px] text-gray2 mb-1.5">Transfer ke BCA 1234567890 a/n K34 Badminton</div>
                    <button onClick={() => fileRef.current?.click()}
                      className="w-full bg-dark2 border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-red/40 transition-colors">
                      {file ? (
                        <div className="flex items-center justify-center gap-2 text-success">
                          <Check size={15} /><span className="text-[12px]">{file.name}</span>
                        </div>
                      ) : (
                        <>
                          <Upload size={16} className="mx-auto mb-1.5 text-gray2" />
                          <div className="text-[12px] text-gray2">Upload Bukti Transfer</div>
                          <div className="text-[10px] text-gray mt-0.5">JPG · PNG · PDF · Max 5MB</div>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="mx-5 mb-4 text-center text-[12px] text-gray2">Tidak ada periode pendaftaran yang terbuka saat ini.</div>
          )}

          {/* History accordion */}
          {memberships.length > 0 && (
            <div className="mx-5 mb-5">
              <button onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between py-2.5 px-1">
                <span className="text-[12px] text-gray2">Riwayat Membership</span>
                {showHistory ? <ChevronUp size={14} className="text-gray2" /> : <ChevronDown size={14} className="text-gray2" />}
              </button>
              {showHistory && (
                <div className="bg-dark2 border border-white/7 rounded-[14px] overflow-hidden mt-1">
                  {memberships.map(m => {
                    const p = m.period as MembershipPeriod
                    return (
                      <div key={m.id} className="flex justify-between items-center px-4 py-3 border-b border-white/7 last:border-0">
                        <div>
                          <div className="text-[13px] font-medium">{format(new Date(p.month_start), 'MMM')} – {format(new Date(p.month_end), 'MMM yyyy')}</div>
                          <div className="text-[10px] text-gray2 mt-0.5">{m.approved_at ? `Disetujui ${format(new Date(m.approved_at), 'MMM d, yyyy')}` : `Didaftar ${format(new Date(m.registered_at), 'MMM d, yyyy')}`}</div>
                        </div>
                        <Badge variant={m.status === 'approved' ? (new Date(p.month_end) < now ? 'gray' : 'success') : m.status === 'pending' ? 'warn' : 'gray'}>
                          {m.status === 'approved' ? (new Date(p.month_end) < now ? 'Selesai' : 'Aktif') : m.status === 'pending' ? 'Pending' : 'Ditolak'}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Members popup */}
      {showMembers && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setShowMembers(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-3" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-[1.1rem] tracking-wider">Member Periode Ini</h2>
              <button onClick={() => setShowMembers(false)} className="w-8 h-8 bg-dark3 rounded-full flex items-center justify-center">
                <X size={14} className="text-gray2" />
              </button>
            </div>
            {activePeriodMembers.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-gray2">Belum ada member</div>
            ) : (
              <div className="bg-dark3 rounded-xl overflow-hidden">
                {activePeriodMembers.map((m, i) => (
                  <div key={m.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i < activePeriodMembers.length - 1 ? 'border-b border-white/7' : ''}`}>
                    <div className="w-7 h-7 rounded-full bg-dark2 flex items-center justify-center font-display text-[.75rem] flex-shrink-0">
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-medium">{m.name}</div>
                    </div>
                    <div className="text-[10px] text-gray2">{m.origin ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="h-20" />
      <BottomNav />
    </div>
  )
}
