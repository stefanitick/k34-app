'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { login } from '@/lib/auth'
import { createClient } from '@/lib/supabase/client'
import { Button, Field } from '@/components/ui'
import toast from 'react-hot-toast'

type Tab = 'signin' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('signin')
  const [loading, setLoading] = useState(false)

  // Sign in state
  const [siName, setSiName] = useState('')
  const [siPhone, setSiPhone] = useState('')

  // Register state
  const [rgName, setRgName] = useState('')
  const [rgPhone, setRgPhone] = useState('')
  const [rgOrigin, setRgOrigin] = useState('')

  async function handleSignIn() {
    if (!siName.trim() || !siPhone.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    setLoading(true)
    const { session, error } = await login(siName, siPhone)
    setLoading(false)
    if (error || !session) {
      toast.error(error ?? 'Login failed')
      return
    }
    toast.success(`Welcome back, ${session.name.split(' ')[0]}!`)
    router.push('/')
    router.refresh()
  }

  async function handleRegister() {
    if (!rgName.trim() || !rgPhone.trim()) {
      toast.error('Please fill in name and phone')
      return
    }
    if (rgPhone.length < 10) {
      toast.error('Please enter a valid phone number')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const passwordKey = rgPhone.trim().slice(-4)

    const { error } = await supabase.from('players').insert({
      name: rgName.trim(),
      phone: rgPhone.trim(),
      password_key: passwordKey,
      origin: rgOrigin.trim() || null,
      role: 'player',
      status: 'pending',
      level: 50,
    })
    setLoading(false)

    if (error) {
      if (error.code === '23505') {
        toast.error('This phone number is already registered')
      } else {
        toast.error('Registration failed. Please try again.')
      }
      return
    }

    toast.success('Account created! Waiting for admin approval.')
    setTab('signin')
    setSiName(rgName)
    setSiPhone(rgPhone)
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10">
      {/* Logo */}
      <div className="text-center mb-7">
        <Image
          src="/logo-k34.png"
          alt="K34"
          width={72}
          height={72}
          className="object-contain mx-auto mb-2.5"
        />
        <div className="font-display text-[2.4rem] tracking-wider">
          K<span className="text-red">34</span>
        </div>
        <div className="text-[12px] text-gray2 mt-1">#WorkHardSmashHarder</div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-dark2 border border-white/7 rounded-[10px] p-[3px] mb-[18px]">
        {(['signin', 'register'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[12px] font-medium rounded-[7px] transition-all ${
              tab === t ? 'bg-red text-white' : 'text-gray2'
            }`}
          >
            {t === 'signin' ? 'Sign In' : 'Register'}
          </button>
        ))}
      </div>

      {/* Sign In */}
      {tab === 'signin' && (
        <div>
          <Field label="Full Name">
            <input
              type="text"
              placeholder="Your full name"
              value={siName}
              onChange={e => setSiName(e.target.value)}
            />
          </Field>
          <Field label="Phone Number" hint="Last 4 digits of your phone number = your password">
            <input
              type="tel"
              placeholder="08xxxxxxxxxx"
              value={siPhone}
              onChange={e => setSiPhone(e.target.value)}
            />
          </Field>
          <Button onClick={handleSignIn} loading={loading} className="mb-3">
            Sign In
          </Button>
          <button
            onClick={() => router.push('/')}
            className="w-full text-center text-[12px] text-red underline mb-2.5"
          >
            Browse without signing in →
          </button>
          <p className="text-center text-[11px] text-gray leading-relaxed">
            Sign in to register for sessions & membership.
          </p>
        </div>
      )}

      {/* Register */}
      {tab === 'register' && (
        <div>
          <Field label="Full Name">
            <input
              type="text"
              placeholder="Your full name"
              value={rgName}
              onChange={e => setRgName(e.target.value)}
            />
          </Field>
          <Field label="Phone Number" hint="Last 4 digits will be your password">
            <input
              type="tel"
              placeholder="08xxxxxxxxxx"
              value={rgPhone}
              onChange={e => setRgPhone(e.target.value)}
            />
          </Field>
          <Field label="Origin / Department">
            <input
              type="text"
              placeholder="e.g. SCM-MS, GDP, EXT"
              value={rgOrigin}
              onChange={e => setRgOrigin(e.target.value)}
            />
          </Field>
          <Button onClick={handleRegister} loading={loading} className="mb-3">
            Create Account
          </Button>
          <button
            onClick={() => router.push('/')}
            className="w-full text-center text-[12px] text-red underline mb-2.5"
          >
            Browse without account →
          </button>
          <p className="text-center text-[11px] text-gray leading-relaxed">
            Admin will approve your access to membership &amp; rally.
          </p>
        </div>
      )}
    </div>
  )
}
