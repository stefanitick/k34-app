'use client'

import { useEffect, useState } from 'react'
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
  const [adminPhones, setAdminPhones] = useState<{ name: string; phone: string }[]>([])
  const [regName, setRegName] = useState('')
  const [regOrigin, setRegOrigin] = useState('')

  useEffect(() => {
    async function loadAdmins() {
      const supabase = createClient()
      const { data } = await supabase.from('players').select('name, phone').eq('role', 'admin').eq('status', 'approved')
      setAdminPhones((data ?? []) as { name: string; phone: string }[])
    }
    loadAdmins()
  }, [])

  async function handleFindPhone() {
    if (!phone.trim()) { toast.error('Masukkan nomor HP'); return }
    setLoading(true)
    const { player: found, error } = await findPlayerByPhone(phone)
    setLoading(false)
    if (error || !found) { toast.error('Nomor HP tidak terdaftar.'); return }
    if (found.status === 'pending') { toast.error('Akunmu masih menunggu persetujuan admin.'); return }
    if (found.status === 'rejected') { toast.error('Akunmu tidak disetujui. Hubungi admin.'); return }
    setPlayer(found)
    setStep('confirm')
  }

  function handleConfirm() {
    if (!player) return
    createSession(player)
    toast.success(`Selamat datang, ${player.name.split(' ')[0]}!`)
    router.push('/')
    router.refresh()
  }

  async function handleRegister() {
    if (!regName.trim()) { toast.error('Masukkan nama lengkap'); return }
    if (!phone.trim() || phone.length < 10) { toast.error('Masukkan nomor HP yang valid'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('players').insert({
      name: regName.trim(), phone: phone.trim(), password_key: phone.trim().slice(-4),
      origin: regOrigin.trim() || null, role: 'player', status: 'pending', level: 50,
    })
    setLoading(false)
    if (error) {
      if (error.code === '23505') toast.error('Nomor HP sudah terdaftar')
      else toast.error('Gagal mendaftar. Coba lagi.')
      return
    }
    toast.success('Berhasil daftar! Tunggu persetujuan admin.')
    setStep('phone')
    setRegName(''); setRegOrigin(''); setPhone('')
  }

  function openWhatsApp(phone: string) {
    const clean = phone.replace(/\D/g, '').replace(/^0/, '62')
    window.open(`https://wa.me/${clean}`, '_blank')
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10">
      <div className="text-center mb-8">
        <Image src="/logo-k34.png" alt="K34" width={68} height={68} className="object-contain mx-auto mb-2.5" />
        <div className="font-display text-[2.2rem] tracking-wider">K<span className="text-red">34</span></div>
        <div className="text-[11px] text-gray2 mt-0.5">Kedungdoro Badminton Lovers</div>
      </div>

      {step === 'phone' && (
        <div>
          <div className="mb-4">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nomor HP</label>
            <input type="tel" placeholder="08xxxxxxxxxx" value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFindPhone()} autoFocus />
          </div>
          <button onClick={handleFindPhone} disabled={loading}
            className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg disabled:opacity-50 mb-3">
            {loading ? 'Mengecek...' : 'Lanjut'}
          </button>
          <button onClick={() => router.push('/')} className="w-full text-center text-[12px] text-gray2 underline mb-5">
            Lihat jadwal tanpa login →
          </button>
          <div className="h-px bg-white/7 mb-4" />
          <p className="text-center text-[12px] text-gray2 mb-3">Belum punya akun?</p>
          <button onClick={() => setStep('register')}
            className="w-full bg-dark2 border border-white/7 text-light font-display tracking-wider py-3.5 rounded-xl text-base mb-5">
            Daftar Akun Baru
          </button>

          {adminPhones.length > 0 && (
            <div>
              <p className="text-center text-[11px] text-gray2 mb-2">Ada pertanyaan? Hubungi admin:</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {adminPhones.map(a => (
                  <button key={a.phone} onClick={() => openWhatsApp(a.phone)}
                    className="flex items-center gap-1.5 bg-dark2 border border-white/7 px-3 py-2 rounded-xl text-[11px]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                    <span className="text-success">{a.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && player && (
        <div>
          <div className="bg-dark2 border border-white/7 rounded-2xl p-6 mb-5 text-center">
            <div className="w-16 h-16 rounded-full bg-dark3 border-2 border-red/40 flex items-center justify-center font-display text-[1.6rem] mx-auto mb-3">
              {player.name.split(' ').map((n:string) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="text-[12px] text-gray2 mb-1">Apakah ini kamu?</div>
            <div className="font-display text-[1.8rem] tracking-wider">{player.name}</div>
            {player.origin && <div className="text-[12px] text-gray2 mt-1">{player.origin}</div>}
          </div>
          <button onClick={handleConfirm} className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg mb-3">
            Ya, itu saya
          </button>
          <button onClick={() => { setStep('phone'); setPlayer(null) }}
            className="w-full bg-dark2 border border-white/7 text-light font-display tracking-wider py-4 rounded-xl text-lg">
            Bukan saya
          </button>
        </div>
      )}

      {step === 'register' && (
        <div>
          <button onClick={() => setStep('phone')} className="text-[12px] text-gray2 mb-5 flex items-center gap-1">
            ← Kembali ke login
          </button>
          <div className="mb-3">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nomor HP</label>
            <input type="tel" placeholder="08xxxxxxxxxx" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nama Lengkap</label>
            <input type="text" placeholder="Nama kamu" value={regName} onChange={e => setRegName(e.target.value)} />
          </div>
          <div className="mb-5">
            <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Asal / Departemen</label>
            <input type="text" placeholder="Contoh: SCM-MS, GDP, External" value={regOrigin} onChange={e => setRegOrigin(e.target.value)} />
          </div>
          <button onClick={handleRegister} disabled={loading}
            className="w-full bg-red text-white font-display tracking-wider py-4 rounded-xl text-lg disabled:opacity-50 mb-3">
            {loading ? 'Mendaftar...' : 'Buat Akun'}
          </button>
          <p className="text-center text-[11px] text-gray leading-relaxed">
            Setelah daftar, tunggu persetujuan admin sebelum bisa akses membership & rally.
          </p>
        </div>
      )}
    </div>
  )
}
