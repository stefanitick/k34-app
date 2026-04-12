'use client'

import { useState, useRef } from 'react'
import { X, Upload, Check } from 'lucide-react'
import { Button, Field } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import toast from 'react-hot-toast'
import type { Session } from '@/types'
import { format } from 'date-fns'

interface AttendanceModalProps {
  session: Session
  onClose: () => void
  onSuccess: () => void
  userMembershipActive?: boolean
}

export function AttendanceModal({
  session, onClose, onSuccess, userMembershipActive
}: AttendanceModalProps) {
  const [type, setType] = useState<'member' | 'incidentil'>(
    userMembershipActive ? 'member' : 'incidentil'
  )
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const auth = getSession()

  async function handleRegister() {
    if (!auth) { window.location.href = '/login'; return }
    if (type === 'incidentil' && !file) {
      toast.error('Please upload payment proof for incidentil')
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      let proof_url: string | null = null

      // Upload payment proof if incidentil
      if (type === 'incidentil' && file) {
        const ext = file.name.split('.').pop()
        const path = `incidentil/${session.id}/${auth.player_id}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('payment-proofs')
          .upload(path, file, { upsert: true })
        if (upErr) throw upErr
        proof_url = path
      }

      // Check slot availability
      const { count } = await supabase
        .from('attendances')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id)
        .eq('status', 'confirmed')

      if ((count ?? 0) >= session.max_attendance) {
        toast.error('Session is full (24/24)')
        return
      }

      // Register attendance
      const { error } = await supabase.from('attendances').insert({
        session_id: session.id,
        player_id: auth.player_id,
        type,
        status: 'confirmed',
        payment_proof_url: proof_url,
      })

      if (error) {
        if (error.code === '23505') {
          toast.error('You are already registered for this session')
        } else {
          throw error
        }
        return
      }

      toast.success(
        type === 'member'
          ? 'Registered as member!'
          : 'Registered! Slot confirmed once payment verified.'
      )
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const dateStr = format(new Date(session.session_date), 'EEEE, MMMM d · yyyy')

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2"
      onClick={onClose}
    >
      <div
        className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + close */}
        <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-display text-[1.3rem] tracking-wider">Register Attendance</h2>
            <p className="text-[12px] text-gray2 mt-0.5">{dateStr}</p>
            <p className="text-[11px] text-gray">{session.is_rally ? 'Rally Session' : 'Regular Session'}</p>
          </div>
          <button onClick={onClose} className="text-gray2 p-1"><X size={18} /></button>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setType('member')}
            className={`border rounded-xl p-3.5 text-left transition-all ${
              type === 'member'
                ? 'border-red bg-red/12'
                : 'border-white/7'
            } ${!userMembershipActive ? 'opacity-40 cursor-not-allowed' : ''}`}
            disabled={!userMembershipActive}
          >
            <div className="font-display text-base tracking-wider mb-0.5">Member</div>
            <div className="text-[11px] text-gray2">Included</div>
            {!userMembershipActive && (
              <div className="text-[10px] text-gray mt-1">No active membership</div>
            )}
          </button>
          <button
            onClick={() => setType('incidentil')}
            className={`border rounded-xl p-3.5 text-left transition-all ${
              type === 'incidentil' ? 'border-red bg-red/12' : 'border-white/7'
            }`}
          >
            <div className="font-display text-base tracking-wider mb-0.5">Incidentil</div>
            <div className="text-[11px] text-gray2">Rp 50,000</div>
            <div className="text-[10px] text-gray mt-1">FCFS · No rally</div>
          </button>
        </div>

        {/* Incidentil: upload proof */}
        {type === 'incidentil' && (
          <div className="mb-4">
            <Field label="Payment Proof" hint="Transfer to BCA 1234567890 · Rp 50,000 · a/n K34 Badminton">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full bg-dark3 border-2 border-dashed border-white/10 rounded-xl p-5 text-center hover:border-red/40 transition-colors"
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-success">
                  <Check size={16} />
                  <span className="text-[13px]">{file.name}</span>
                </div>
              ) : (
                <>
                  <Upload size={18} className="mx-auto mb-1.5 text-gray2" />
                  <div className="text-[12px] text-gray2">Upload Payment Proof</div>
                  <div className="text-[10px] text-gray mt-0.5">JPG · PNG · PDF · Max 5MB</div>
                </>
              )}
            </button>
            <p className="text-[11px] text-gray mt-2 text-center">
              Incidentil players cannot join rally sessions.
            </p>
          </div>
        )}

        {type === 'member' && (
          <p className="text-[11px] text-gray2 text-center mb-4">
            You are registered as a member. Slot confirmed immediately.
          </p>
        )}

        <Button onClick={handleRegister} loading={loading}>
          Confirm Registration
        </Button>
      </div>
    </div>
  )
}
