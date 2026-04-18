'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Upload, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session } from '@/types'
import toast from 'react-hot-toast'

interface Attendee {
  id: string
  type: 'member' | 'incidentil'
  player: { name: string } | null
  walk_in_name: string | null
}

interface Props {
  session: Session & { attendance_count?: number }
  onClose: () => void
  onSuccess: () => void
  userMembershipActive: boolean
}

export function AttendanceModal({ session, onClose, onSuccess, userMembershipActive }: Props) {
  const router = useRouter()
  const auth = getSession()
  const [choice, setChoice] = useState<'incidentil' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const isRally = session.is_rally
  const isFull = (session.attendance_count ?? 0) >= session.max_attendance

  useEffect(() => {
    async function loadAttendees() {
      const supabase = createClient()
      const { data } = await supabase.from('attendances')
        .select('id, type, player:players(name), walk_in_name')
        .eq('session_id', session.id).eq('status', 'confirmed')
        .order('registered_at', { ascending: true })
      setAttendees((data ?? []) as unknown as Attendee[])
    }
    loadAttendees()
  }, [session.id])

  async function handleMemberConfirm() {
    if (!auth) return
    setUploading(true)
    const supabase = createClient()
    const { error } = await supabase.from('attendances').insert({
      session_id: session.id, player_id: auth.player_id,
      type: 'member', status: 'confirmed',
    })
    setUploading(false)
    if (error?.code === '23505') toast.error('Kamu sudah terdaftar di sesi ini')
    else if (error) toast.error('Gagal mendaftar')
    else { toast.success('Berhasil! See you on the court 🏸'); onSuccess(); onClose() }
  }

  async function handleIncidentilConfirm() {
    if (!auth) return
    setUploading(true)
    const supabase = createClient()
    let proof_url: string | null = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `incidentil/${auth.player_id}/${session.id}.${ext}`
      const { error: upErr } = await supabase.storage.from('payment-proofs').upload(path, file, { upsert: true })
      if (upErr) { toast.error('Gagal upload bukti. Coba lagi.'); setUploading(false); return }
      proof_url = path
    }
    const { error } = await supabase.from('attendances').insert({
      session_id: session.id, player_id: auth.player_id,
      type: 'incidentil', status: 'confirmed', payment_proof_url: proof_url,
    })
    setUploading(false)
    if (error?.code === '23505') toast.error('Kamu sudah terdaftar di sesi ini')
    else if (error) toast.error('Gagal mendaftar')
    else { toast.success('Terdaftar! Admin akan konfirmasi pembayaranmu.'); onSuccess(); onClose() }
  }

  const memberAtt = attendees.filter(a => a.type === 'member')
  const incAtt = attendees.filter(a => a.type === 'incidentil')

  function getName(a: Attendee) {
    return a.player?.name ?? a.walk_in_name ?? '—'
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={onClose}>
      <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-8 animate-sheet max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-3" />

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-display text-[1.2rem] tracking-wider">
              {format(new Date(session.session_date), 'EEEE, d MMMM')}
            </div>
            <div className="text-[11px] text-gray2">
              {session.start_time.slice(0,5)}–{session.end_time.slice(0,5)} · {session.location}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-dark3 rounded-full flex items-center justify-center flex-shrink-0">
            <X size={14} className="text-gray2" />
          </button>
        </div>

        {/* Attendees list */}
        {attendees.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] tracking-widest uppercase text-gray mb-2">
              Terdaftar ({attendees.length}/{session.max_attendance})
            </div>
            <div className="bg-dark3 rounded-xl p-3">
              {memberAtt.length > 0 && (
                <>
                  <div className="text-[9px] text-gray2 uppercase tracking-wider mb-1.5">Member ({memberAtt.length})</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {memberAtt.map(a => (
                      <div key={a.id} className="flex items-center gap-1 bg-dark2 border border-white/7 rounded-full px-2 py-1">
                        <span className="text-[11px]">{getName(a).split(' ')[0]}</span>
                        <span className="text-[9px] bg-success/15 text-success px-1 rounded">M</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {incAtt.length > 0 && (
                <>
                  <div className="text-[9px] text-gray2 uppercase tracking-wider mb-1.5">Incidentil ({incAtt.length})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {incAtt.map(a => (
                      <div key={a.id} className="flex items-center gap-1 bg-dark2 border border-white/7 rounded-full px-2 py-1">
                        <span className="text-[11px]">{getName(a).split(' ')[0]}</span>
                        <span className="text-[9px] bg-warn/15 text-warn px-1 rounded">I</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Registration flow */}
        {userMembershipActive ? (
          <div>
            <div className="flex items-center gap-2.5 bg-success/8 border border-success/20 rounded-xl px-3.5 py-3 mb-4">
              <div className="w-7 h-7 bg-success/15 rounded-full flex items-center justify-center flex-shrink-0">
                <Check size={14} className="text-success" />
              </div>
              <div>
                <div className="text-[13px] font-medium text-success">Kamu member aktif</div>
                <div className="text-[11px] text-gray2">Tidak perlu bayar – sudah termasuk membership</div>
              </div>
            </div>
            <button onClick={handleMemberConfirm} disabled={uploading || isFull}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50">
              {uploading ? 'Mendaftar...' : isFull ? 'Sesi Penuh' : 'Konfirmasi Kehadiran'}
            </button>
          </div>
        ) : (
          <div>
            {choice === null ? (
              <>
                <p className="text-[12px] text-gray2 mb-3">
                  Kamu belum punya membership aktif. Pilih cara bergabung:
                </p>
                <button onClick={() => !isRally && setChoice('incidentil')}
                  className={`w-full text-left bg-dark3 border rounded-xl p-3.5 mb-2.5 transition-all ${isRally ? 'opacity-40 cursor-not-allowed border-white/7' : 'border-white/7 active:border-red/40'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[13px] font-medium">Incidentil</div>
                    <div className="text-[13px] font-display text-red">Rp 50.000</div>
                  </div>
                  <div className="text-[11px] text-gray2">Bayar per sesi · First come first served</div>
                  {isRally && <div className="text-[11px] text-warn mt-1">Sesi rally hanya untuk member</div>}
                </button>
                <button onClick={() => { onClose(); router.push('/membership') }}
                  className="w-full text-left bg-dark3 border border-white/7 rounded-xl p-3.5 transition-all active:border-red/40">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[13px] font-medium">Daftar Membership</div>
                    <div className="text-[13px] font-display text-red">Rp 300.000</div>
                  </div>
                  <div className="text-[11px] text-gray2">2 bulan · Ikut rally · Semua sesi</div>
                </button>
              </>
            ) : (
              <div>
                <button onClick={() => setChoice(null)} className="flex items-center gap-1.5 text-[12px] text-gray2 mb-4">
                  ← Kembali
                </button>
                <div className="bg-dark3 rounded-xl p-3.5 mb-3">
                  <div className="text-[11px] text-gray2 mb-1">Transfer ke:</div>
                  <div className="text-[13px] font-medium">BCA · 1234567890</div>
                  <div className="text-[11px] text-gray2">a/n K34 Badminton · Rp 50.000</div>
                </div>
                <div className="text-[11px] text-gray2 mb-1.5">Upload bukti transfer (opsional)</div>
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full bg-dark3 border-2 border-dashed border-white/10 rounded-xl p-4 text-center mb-3 active:border-red/40">
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-success">
                      <Check size={14} /><span className="text-[12px]">{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={15} className="mx-auto mb-1 text-gray2" />
                      <div className="text-[12px] text-gray2">Tap untuk upload</div>
                      <div className="text-[10px] text-gray mt-0.5">JPG · PNG · PDF · Max 5MB</div>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray text-center mb-3">Bisa daftar dulu, upload bukti nanti. Admin akan konfirmasi sebelum sesi.</p>
                <button onClick={handleIncidentilConfirm} disabled={uploading || isFull}
                  className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50">
                  {uploading ? 'Mendaftar...' : isFull ? 'Sesi Penuh' : 'Konfirmasi Pendaftaran'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
