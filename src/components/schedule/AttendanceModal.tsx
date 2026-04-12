'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Upload, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session } from '@/types'
import toast from 'react-hot-toast'

interface Props {
  session: Session
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
  const fileRef = useRef<HTMLInputElement>(null)

  const isFull = (session as Session & { attendance_count?: number }).attendance_count! >= session.max_attendance
  const isRally = session.is_rally

  async function handleMemberConfirm() {
    if (!auth) return
    setUploading(true)
    const supabase = createClient()
    const { error } = await supabase.from('attendances').insert({
      session_id: session.id,
      player_id: auth.player_id,
      type: 'member',
      status: 'confirmed',
    })
    setUploading(false)
    if (error?.code === '23505') {
      toast.error('You are already registered for this session')
    } else if (error) {
      toast.error('Failed to register')
    } else {
      toast.success('Registered! See you on the court 🏸')
      onSuccess()
      onClose()
    }
  }

  async function handleIncidentilConfirm() {
    if (!auth) return
    setUploading(true)
    const supabase = createClient()

    let proof_url: string | null = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `incidentil/${auth.player_id}/${session.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { upsert: true })
      if (upErr) {
        toast.error('Failed to upload proof. Try again.')
        setUploading(false)
        return
      }
      proof_url = path
    }

    const { error } = await supabase.from('attendances').insert({
      session_id: session.id,
      player_id: auth.player_id,
      type: 'incidentil',
      status: 'confirmed',
      payment_proof_url: proof_url,
    })

    setUploading(false)
    if (error?.code === '23505') {
      toast.error('You are already registered for this session')
    } else if (error) {
      toast.error('Failed to register')
    } else {
      toast.success('Registered! Admin will confirm your payment.')
      onSuccess()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2"
      onClick={onClose}
    >
      <div
        className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />

        {/* Session info */}
        <div className="mb-5">
          <div className="font-display text-[1.3rem] tracking-wider mb-0.5">
            {format(new Date(session.session_date), 'EEEE, MMMM d')}
          </div>
          <div className="text-[12px] text-gray2">
            {session.start_time.slice(0, 5)}–{session.end_time.slice(0, 5)} · {session.location}
          </div>
        </div>

        {/* MEMBER FLOW */}
        {userMembershipActive ? (
          <div>
            <div className="bg-dark3 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-7 h-7 bg-success/12 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check size={14} className="text-success" />
                </div>
                <div className="text-[14px] font-medium">Active Member</div>
              </div>
              <div className="text-[12px] text-gray2 ml-9">
                Your membership covers this session — no payment needed.
              </div>
            </div>

            <button
              onClick={handleMemberConfirm}
              disabled={uploading || isFull}
              className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg disabled:opacity-50"
            >
              {uploading ? 'Registering...' : isFull ? 'Session Full' : 'Confirm Attendance'}
            </button>
          </div>

        ) : (
          /* NON-MEMBER FLOW */
          <div>
            {choice === null ? (
              <>
                <p className="text-[12px] text-gray2 mb-3">
                  You don't have an active membership for this period. Choose how you'd like to join:
                </p>

                {/* Option: Incidentil */}
                <button
                  onClick={() => !isRally && setChoice('incidentil')}
                  className={`w-full text-left bg-dark3 border rounded-xl p-4 mb-2.5 transition-all ${
                    isRally ? 'opacity-40 cursor-not-allowed border-white/7' : 'border-white/7 hover:border-red/40'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[14px] font-medium">Join as Incidentil</div>
                    <div className="text-[13px] font-display text-red">Rp 50.000</div>
                  </div>
                  <div className="text-[11px] text-gray2">
                    Pay per session · First come first served · Max 24 players
                  </div>
                  {isRally && (
                    <div className="text-[11px] text-warn mt-1.5">
                      Rally sessions are for members only
                    </div>
                  )}
                </button>

                {/* Option: Become Member */}
                <button
                  onClick={() => { onClose(); router.push('/membership') }}
                  className="w-full text-left bg-dark3 border border-white/7 hover:border-red/40 rounded-xl p-4 transition-all"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[14px] font-medium">Become a Member</div>
                    <div className="text-[13px] font-display text-red">Rp 300.000</div>
                  </div>
                  <div className="text-[11px] text-gray2">
                    2-month access · Join rally · Register all sessions · Max 20 members
                  </div>
                </button>
              </>
            ) : (
              /* INCIDENTIL PAYMENT */
              <div>
                <button
                  onClick={() => setChoice(null)}
                  className="flex items-center gap-1.5 text-[12px] text-gray2 mb-4"
                >
                  ← Back
                </button>

                <div className="bg-dark3 rounded-xl p-3.5 mb-4">
                  <div className="text-[11px] tracking-widest uppercase text-gray2 mb-2">Payment Details</div>
                  <div className="text-[13px] font-medium mb-0.5">Transfer Rp 50.000</div>
                  <div className="text-[12px] text-gray2">BCA · 1234567890 · a/n K34 Badminton</div>
                </div>

                <div className="text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Upload Proof</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full bg-dark3 border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-red/40 transition-colors mb-4"
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-success">
                      <Check size={15} /><span className="text-[13px]">{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={16} className="mx-auto mb-1.5 text-gray2" />
                      <div className="text-[12px] text-gray2">Tap to upload transfer receipt</div>
                      <div className="text-[10px] text-gray mt-0.5">JPG · PNG · PDF · Max 5MB</div>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray text-center mb-4">
                  You can register first and upload proof later. Admin will confirm before the session.
                </p>

                <button
                  onClick={handleIncidentilConfirm}
                  disabled={uploading || isFull}
                  className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg disabled:opacity-50"
                >
                  {uploading ? 'Registering...' : isFull ? 'Session Full' : 'Confirm Registration'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}