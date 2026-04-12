'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { findPlayerByPhone, createSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/types'
import toast from 'react-hot-toast'

type Step = 'phone' | 'confirm' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(false)

  // Register form
  const [regName, setRegName] = useState('')
  const [regOrigin, setRegOrigin] = useState('')

  async function handleFindPhone() {
    if (!phone.trim()) { toast.error('Please enter your phone number'); return }
    setLoading(true)
    const { player: found, error } = await findPlayerByPhone(phone)
    setLoading(false)
    if (error || !found) {
      toast.error('Phone number not registered.')
      return
    }
    setPlayer(found)
    setStep('confirm')
  }

  function handleConfirm() {
    if (!player) return
    createSession(player)
    toast.success(`Welcome, ${player.name.split(' ')[0]}!`)
    router.push('/')
    router.refresh()
  }

  async function handleRegister() {
    if (!regName.trim()) { toast.error('Please enter your name'); return }
    if (!phone.trim() || phone.length < 10) { toast.error('Please enter a valid phone number'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('players').insert({
      name: regName.trim(),
      phone: phone.trim(),
      password_key: phone.trim().slice(-4),
      origin: regOrigin.trim() || null,
      role: 'player',
      status: 'pending',
      level: 50,
    })
    setLoading(false)
    if (error) {
      if (error.code === '23505') toast.error('Phone number already registered')
      else toast.error('Registration failed. Try again.')
      return
    }
    toast.success('Registered! Waiting for admin approval.')
    setStep('phone')
    setRegName('')
    setRegOrigin('')
    setPhone('')
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10">
      <div className="text-center mb-8">
        <Image src="/logo-k34.png" alt="K34" width={72} height={72} className="object-contain mx-auto mb-2.5" />
        <div className="font-display text-[2.4rem] tracking-wider">K<span className="text-red">34</span></div>
        <div className="text-[12px] text-gray2 mt-1">#WorkHardSmashHarder</div>
      </div>

      {step === 'phone' && (
        <div>
          <div className="mb-5">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Phone Number</label>
            <input type="tel" placeholder="08xxxxxxxxxx" value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFindPhone()} autoFocus />
          </div>
          <button onClick={handleFindPhone} disabled={loading}
            className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg disabled:opacity-50 mb-3">
            {loading ? 'Checking...' : 'Continue'}
          </button>
          <button onClick={() => router.push('/')}
            className="w-full text-center text-[12px] text-gray2 underline mb-4">
            Browse without signing in →
          </button>
          <div className="h-px bg-white/7 mb-4" />
          <p className="text-center text-[11px] text-gray2 mb-3">Not registered yet?</p>
          <button onClick={() => setStep('register')}
            className="w-full bg-dark2 border border-white/7 text-light font-display tracking-wider py-4 rounded-xl text-lg">
            Register
          </button>
        </div>
      )}

      {step === 'confirm' && player && (
        <div>
          <div className="bg-dark2 border border-white/7 rounded-2xl p-6 mb-5 text-center">
            <div className="w-16 h-16 rounded-full bg-dark3 border-2 border-red/40 flex items-center justify-center font-display text-[1.6rem] mx-auto mb-3">
              {player.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="text-[12px] text-gray2 mb-1">Is this you?</div>
            <div className="font-display text-[1.8rem] tracking-wider">{player.name}</div>
            <div className="text-[12px] text-gray2 mt-1">{player.origin ?? ''}</div>
          </div>
          <button onClick={handleConfirm}
            className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg mb-3">
            Yes, that's me
          </button>
          <button onClick={() => { setStep('phone'); setPlayer(null) }}
            className="w-full bg-dark2 border border-white/7 text-light font-display tracking-wider py-4 rounded-xl text-lg">
            Not me
          </button>
        </div>
      )}

      {step === 'register' && (
        <div>
          <div className="mb-2">
            <button onClick={() => setStep('phone')} className="text-[12px] text-gray2 mb-4 flex items-center gap-1">
              ← Back to sign in
            </button>
          </div>
          <div className="mb-4">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Phone Number</label>
            <input type="tel" placeholder="08xxxxxxxxxx" value={phone}
              onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Full Name</label>
            <input type="text" placeholder="Your full name" value={regName}
              onChange={e => setRegName(e.target.value)} />
          </div>
          <div className="mb-5">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Origin / Department</label>
            <input type="text" placeholder="e.g. SCM-MS, GDP, External" value={regOrigin}
              onChange={e => setRegOrigin(e.target.value)} />
          </div>
          <button onClick={handleRegister} disabled={loading}
            className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg disabled:opacity-50 mb-3">
            {loading ? 'Registering...' : 'Create Account'}
          </button>
          <p className="text-center text-[11px] text-gray leading-relaxed">
            After registering, wait for admin approval before accessing membership & rally.
          </p>
        </div>
      )}
    </div>
  )
}