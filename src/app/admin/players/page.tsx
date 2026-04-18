'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronLeft, Plus, Edit2, Eye, Check, X, Search } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { createClient, getProofUrl } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import { getGrade } from '@/lib/grade'
import type { Player } from '@/types'
import toast from 'react-hot-toast'

type TabType = 'players' | 'pending'

interface PlayerRow extends Player {
  active_period?: string
  membership_status?: string
  membership_id?: string
  proof_url?: string | null
  is_member?: boolean
}

interface Period {
  id: string; month_start: string; month_end: string
  close_date: string; max_slots: number; is_active: boolean
}

export default function AdminPlayersPage() {
  const router = useRouter()
  const auth = getSession()
  const [tab, setTab] = useState<TabType>('players')
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PlayerRow | null>(null)
  const [addNew, setAddNew] = useState(false)
  const [proofModal, setProofModal] = useState<string | null>(null)
  const [activePeriod, setActivePeriod] = useState<Period | null>(null)
  const [addPeriod, setAddPeriod] = useState(false)
  const [addMemberModal, setAddMemberModal] = useState<PlayerRow | null>(null)
  const [addMemberPayment, setAddMemberPayment] = useState<'cash' | 'transfer'>('cash')
  const [addMemberFile, setAddMemberFile] = useState<File | null>(null)

  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editLevel, setEditLevel] = useState(50)
  const [editStatus, setEditStatus] = useState<'pending'|'approved'|'rejected'>('approved')
  const [editOrigin, setEditOrigin] = useState('')
  const [editRole, setEditRole] = useState<'player'|'admin'>('player')

  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newOrigin, setNewOrigin] = useState('')
  const [newLevel, setNewLevel] = useState(50)

  const [periodMonth, setPeriodMonth] = useState('')
  const [periodDuration, setPeriodDuration] = useState('2')
  const [periodClose, setPeriodClose] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const now = new Date()

    const { data: periods } = await supabase.from('membership_periods').select('*').order('month_start', { ascending: false })
    const active = (periods ?? []).find(p => new Date(p.month_start) <= now && now <= new Date(p.month_end)) as Period | undefined
    setActivePeriod(active ?? null)

    const { data: playersData } = await supabase.from('players').select('*').neq('status', 'inactive').order('name', { ascending: true })
    const { data: memberships } = await supabase.from('memberships').select('*, period:membership_periods(month_start, month_end)')

    const enriched: PlayerRow[] = (playersData ?? []).map(p => {
      const mems = (memberships ?? []).filter(m => m.player_id === p.id)
      const activeMem = mems.find(m => {
        if (m.status !== 'approved') return false
        const per = m.period as { month_start: string; month_end: string }
        return new Date(per.month_start) <= now && now <= new Date(per.month_end)
      })
      const pendingMem = mems.find(m => m.status === 'pending')
      return {
        ...p,
        active_period: activeMem ? `${format(new Date((activeMem.period as { month_start: string }).month_start), 'MMM')}–${format(new Date((activeMem.period as { month_end: string }).month_end), 'MMM yyyy')}` : undefined,
        membership_status: activeMem ? 'approved' : pendingMem ? 'pending' : undefined,
        membership_id: pendingMem?.id,
        proof_url: pendingMem?.payment_proof_url,
        is_member: !!activeMem,
      } as PlayerRow
    })
    setAllPlayers(enriched)
    setLoading(false)
  }

  const approvedPlayers = allPlayers.filter(p => p.status === 'approved')
  const pendingPlayers = allPlayers.filter(p => p.status === 'pending' || p.membership_status === 'pending')
  const members = approvedPlayers.filter(p => p.is_member)
  const nonMembers = approvedPlayers.filter(p => !p.is_member)

  const filteredApproved = approvedPlayers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.origin ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const filteredMembers = filteredApproved.filter(p => p.is_member)
  const filteredNonMembers = filteredApproved.filter(p => !p.is_member)

  async function saveEdit() {
    if (!editing) return
    if (!editPhone.trim() || editPhone.length < 10) { toast.error('Masukkan nomor HP yang valid'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('players').update({
      name: editName, phone: editPhone.trim(), password_key: editPhone.trim().slice(-4),
      level: editLevel, status: editStatus, origin: editOrigin, role: editRole,
    }).eq('id', editing.id)
    if (error) toast.error(error.code === '23505' ? 'Nomor HP sudah dipakai' : 'Gagal menyimpan')
    else { toast.success('Tersimpan!'); setEditing(null); loadData() }
    setSaving(false)
  }

  async function deletePlayer(id: string) {
    if (!confirm('Nonaktifkan player ini? Data history tetap tersimpan.')) return
    const supabase = createClient()
    await supabase.from('players').update({ status: 'inactive' }).eq('id', id)
    toast.success('Player dinonaktifkan')
    setEditing(null)
    loadData()
  }

  async function saveNew() {
    if (!newName || !newPhone || newPhone.length < 10) { toast.error('Isi nama dan nomor HP yang valid'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('players').insert({
      name: newName.trim(), phone: newPhone.trim(), password_key: newPhone.trim().slice(-4),
      origin: newOrigin.trim() || null, role: 'player', status: 'approved', level: newLevel,
    })
    if (error) toast.error(error.code === '23505' ? 'Nomor HP sudah terdaftar' : 'Gagal')
    else { toast.success('Player ditambahkan!'); setAddNew(false); setNewName(''); setNewPhone(''); setNewOrigin(''); setNewLevel(50); loadData() }
    setSaving(false)
  }

  async function addToMembership(player: PlayerRow) {
    if (!activePeriod) { toast.error('Tidak ada periode aktif'); return }
    setSaving(true)
    const supabase = createClient()
    let proof_url: string | null = null

    if (addMemberPayment === 'transfer' && addMemberFile) {
      const ext = addMemberFile.name.split('.').pop()
      const path = `membership/${player.id}/${activePeriod.id}_admin.${ext}`
      const { error: upErr } = await supabase.storage.from('payment-proofs').upload(path, addMemberFile, { upsert: true })
      if (upErr) { toast.error('Gagal upload bukti'); setSaving(false); return }
      proof_url = path
    }

    const { error } = await supabase.from('memberships').insert({
      player_id: player.id, period_id: activePeriod.id, status: 'approved',
      approved_at: new Date().toISOString(), approved_by: auth!.player_id, payment_proof_url: proof_url,
    })
    if (error?.code === '23505') toast.error('Sudah terdaftar di periode ini')
    else if (error) toast.error('Gagal menambahkan')
    else { toast.success(`${player.name} ditambahkan sebagai member!`); setAddMemberModal(null); setAddMemberFile(null); setAddMemberPayment('cash'); loadData() }
    setSaving(false)
  }

  async function approveMembership(id: string) {
    const supabase = createClient()
    await supabase.from('memberships').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: auth!.player_id }).eq('id', id)
    toast.success('Disetujui!')
    loadData()
  }

  async function approveAccount(id: string) {
    const supabase = createClient()
    await supabase.from('players').update({ status: 'approved' }).eq('id', id)
    toast.success('Akun disetujui!')
    loadData()
  }

  async function rejectMembership(id: string) {
    const supabase = createClient()
    await supabase.from('memberships').update({ status: 'rejected' }).eq('id', id)
    toast.success('Ditolak')
    loadData()
  }

  async function savePeriod() {
    if (!periodMonth || !periodClose) { toast.error('Isi semua kolom'); return }
    setSaving(true)
    const supabase = createClient()
    const startDate = new Date(periodMonth + '-01')
    const months = parseInt(periodDuration)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + months)
    endDate.setDate(0) // last day of last month
    const { error } = await supabase.from('membership_periods').insert({
      month_start: format(startDate, 'yyyy-MM-dd'),
      month_end: format(endDate, 'yyyy-MM-dd'),
      open_date: format(startDate, 'yyyy-MM-dd'),
      close_date: periodClose,
      max_slots: 20, is_active: true,
    })
    if (error) toast.error('Gagal membuat periode')
    else { toast.success('Periode dibuat!'); setAddPeriod(false); setPeriodMonth(''); setPeriodDuration('2'); setPeriodClose(''); loadData() }
    setSaving(false)
  }

  async function viewProof(path: string) {
    const url = await getProofUrl(path)
    if (!url) { toast.error('Tidak bisa membuka bukti'); return }
    setProofModal(url)
  }

  function openEdit(p: PlayerRow) {
    setEditing(p); setEditName(p.name); setEditPhone(p.phone); setEditLevel(p.level)
    setEditStatus(p.status as 'pending'|'approved'|'rejected'); setEditOrigin(p.origin ?? '')
    setEditRole(p.role as 'player'|'admin')
  }

  function PlayerRow({ p, showMemberBtn = false }: { p: PlayerRow; showMemberBtn?: boolean }) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/7 last:border-0">
        <div className="w-8 h-8 rounded-full bg-dark3 flex items-center justify-center font-display text-[.8rem] flex-shrink-0">
          {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-[13px] font-medium truncate">{p.name}</div>
            {p.role === 'admin' && <span className="text-[9px] bg-red text-white px-1.5 py-0.5 rounded flex-shrink-0">Admin</span>}
            {p.is_member && <span className="text-[9px] bg-success/12 text-success border border-success/20 px-1.5 py-0.5 rounded flex-shrink-0">M</span>}
          </div>
          <div className="text-[10px] text-gray2">{p.origin ?? '—'} · Grade {getGrade(p.level)}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {showMemberBtn && activePeriod && !p.is_member && (
            <button onClick={() => setAddMemberModal(p)} className="text-[10px] text-red bg-red/12 border border-red/25 px-2 py-1 rounded-lg">+ Member</button>
          )}
          <button onClick={() => openEdit(p)} className="text-gray2 p-1"><Edit2 size={13} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <button onClick={() => router.push('/admin')} className="text-gray2"><ChevronLeft size={20} /></button>
        <span className="font-display text-[1.25rem] tracking-wider flex-1">Players & Membership</span>
        <button onClick={() => setAddNew(true)} className="text-[12px] text-red font-medium">Add Player</button>
      </div>

      {/* Membership Period */}
      <div className="px-5 mb-1"><div className="text-[10px] tracking-widest uppercase text-gray mb-2">Membership Period</div></div>
      {activePeriod ? (
        <div className="mx-5 mb-2 bg-dark2 border border-red/30 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/7">
            <div>
              <div className="text-[13px] font-medium">{format(new Date(activePeriod.month_start), 'MMM')} – {format(new Date(activePeriod.month_end), 'MMM yyyy')}</div>
              <div className="text-[10px] text-gray2">Tutup {format(new Date(activePeriod.close_date), 'MMM d')} · {members.length}/{activePeriod.max_slots} slot</div>
            </div>
            <span className="text-[10px] bg-success/12 text-success border border-success/25 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <div className="px-4 py-2.5">
            <div className="h-1.5 bg-dark3 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-red rounded-full" style={{ width: `${Math.min(100, Math.round(((new Date().getTime() - new Date(activePeriod.month_start).getTime()) / (new Date(activePeriod.month_end).getTime() - new Date(activePeriod.month_start).getTime())) * 100))}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray">
              <span>{format(new Date(activePeriod.month_start), 'MMM d')}</span>
              <span>{format(new Date(activePeriod.month_end), 'MMM d')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-5 mb-2 bg-dark2 border border-white/7 rounded-xl px-4 py-3 text-center text-[12px] text-gray2">Tidak ada periode aktif</div>
      )}
      <div className="px-5 mb-3">
        <button onClick={() => setAddPeriod(true)} className="w-full bg-dark2 border border-red/30 text-red font-display tracking-wider py-2.5 rounded-xl text-[.9rem]">
          + Open New Period
        </button>
      </div>

      {/* Search */}
      <div className="px-5 mb-2">
        <div className="relative">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray2" />
          <input type="text" placeholder="Cari nama atau asal..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 py-2.5" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/7 mx-5 mb-3">
        {([['players', `Players (${approvedPlayers.length})`], ['pending', `Pending (${pendingPlayers.length})`]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-[11px] font-medium border-b-2 transition-all ${tab === key ? 'text-red border-red' : 'text-gray2 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : tab === 'players' ? (
        <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
          {filteredMembers.length > 0 && (
            <>
              <div className="px-4 py-2 bg-dark3 border-b border-white/7">
                <span className="text-[10px] tracking-widest uppercase text-gray">Member ({filteredMembers.length})</span>
              </div>
              {filteredMembers.map(p => <PlayerRow key={p.id} p={p} />)}
            </>
          )}
          {filteredNonMembers.length > 0 && (
            <>
              <div className="px-4 py-2 bg-dark3 border-b border-white/7 border-t border-white/7">
                <span className="text-[10px] tracking-widest uppercase text-gray">Non-member ({filteredNonMembers.length})</span>
              </div>
              {filteredNonMembers.map(p => <PlayerRow key={p.id} p={p} showMemberBtn />)}
            </>
          )}
          {filteredApproved.length === 0 && (
            <div className="py-8 text-center text-[12px] text-gray2">Tidak ada player ditemukan</div>
          )}
        </div>
      ) : (
        <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
          {pendingPlayers.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray2">Tidak ada yang pending</div>
          ) : pendingPlayers.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${i < pendingPlayers.length - 1 ? 'border-b border-white/7' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-dark3 flex items-center justify-center font-display text-[.8rem] flex-shrink-0">
                {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-gray2">
                  {p.origin ?? '—'} · {p.status === 'pending' ? 'Akun baru' : `Membership ${p.active_period ?? ''}`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {p.proof_url && <button onClick={() => viewProof(p.proof_url!)} className="text-gray2"><Eye size={13} /></button>}
                {p.membership_id ? (
                  <>
                    <button onClick={() => approveMembership(p.membership_id!)} className="text-success bg-success/12 border border-success/25 px-2 py-1 rounded-lg"><Check size={11} /></button>
                    <button onClick={() => rejectMembership(p.membership_id!)} className="text-gray2 bg-dark3 border border-white/7 px-2 py-1 rounded-lg"><X size={11} /></button>
                  </>
                ) : (
                  <button onClick={() => approveAccount(p.id)} className="text-[10px] text-success bg-success/12 border border-success/25 px-2.5 py-1 rounded-lg">Approve</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add to membership modal */}
      {addMemberModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setAddMemberModal(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-display text-[1.1rem] tracking-wider">Tambah Member</h2>
              <button onClick={() => setAddMemberModal(null)} className="w-8 h-8 bg-dark3 rounded-full flex items-center justify-center"><X size={14} className="text-gray2" /></button>
            </div>
            <p className="text-[12px] text-gray2 mb-4">
              Tambah <span className="text-light font-medium">{addMemberModal.name}</span> ke periode {activePeriod ? `${format(new Date(activePeriod.month_start), 'MMM')}–${format(new Date(activePeriod.month_end), 'MMM yyyy')}` : ''}
            </p>
            <div className="mb-3">
              <div className="text-[11px] text-gray2 mb-2">Metode pembayaran:</div>
              <div className="flex gap-2">
                {(['cash', 'transfer'] as const).map(t => (
                  <button key={t} onClick={() => setAddMemberPayment(t)}
                    className={`flex-1 py-2.5 rounded-xl font-display tracking-wider text-sm border capitalize ${addMemberPayment === t ? 'bg-red text-white border-red' : 'bg-dark3 text-gray2 border-white/7'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {addMemberPayment === 'transfer' && (
              <div className="mb-3">
                <div className="text-[11px] text-gray2 mb-1.5">Upload bukti transfer</div>
                <input type="file" accept="image/*,.pdf" onChange={e => setAddMemberFile(e.target.files?.[0] ?? null)} className="text-[12px]" />
              </div>
            )}
            <button onClick={() => addToMembership(addMemberModal)} disabled={saving}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl disabled:opacity-50">
              {saving ? 'Menyimpan...' : addMemberPayment === 'cash' ? 'Konfirmasi — Cash Diterima' : 'Konfirmasi — Transfer'}
            </button>
          </div>
        </div>
      )}

      {/* Edit player */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setEditing(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-[1.1rem] tracking-wider">Edit Player</h2>
              <button onClick={() => setEditing(null)} className="w-8 h-8 bg-dark3 rounded-full flex items-center justify-center"><X size={14} className="text-gray2" /></button>
            </div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nama</label><input type="text" value={editName} onChange={e => setEditName(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nomor HP</label><input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Asal</label><input type="text" value={editOrigin} onChange={e => setEditOrigin(e.target.value)} /></div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Level — Grade {getGrade(editLevel)}</label>
              <input type="range" min={0} max={100} value={editLevel} onChange={e => setEditLevel(Number(e.target.value))} className="w-full" />
              <div className="text-[12px] text-gray2 mt-1">Level: {editLevel}</div>
            </div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as typeof editStatus)}>
                <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Role</label>
              <div className="flex gap-2">
                {(['player','admin'] as const).map(r => (
                  <button key={r} onClick={() => setEditRole(r)}
                    className={`flex-1 py-2.5 rounded-xl font-display tracking-wider text-sm border ${editRole === r ? 'bg-red text-white border-red' : 'bg-dark3 text-gray2 border-white/7'}`}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveEdit} disabled={saving} className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl disabled:opacity-50 mb-2">
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
            <button onClick={() => deletePlayer(editing.id)}
              className="w-full bg-dark3 border border-white/7 text-red font-display tracking-wider py-3 rounded-xl text-sm">
              Nonaktifkan Player
            </button>
          </div>
        </div>
      )}

      {/* Add player */}
      {addNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setAddNew(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-[1.1rem] tracking-wider">Add Player</h2>
              <button onClick={() => setAddNew(false)} className="w-8 h-8 bg-dark3 rounded-full flex items-center justify-center"><X size={14} className="text-gray2" /></button>
            </div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nama Lengkap</label><input type="text" placeholder="Nama player" value={newName} onChange={e => setNewName(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Nomor HP</label><input type="tel" placeholder="08xxxxxxxxxx" value={newPhone} onChange={e => setNewPhone(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Asal</label><input type="text" placeholder="SCM-MS, GDP, External..." value={newOrigin} onChange={e => setNewOrigin(e.target.value)} /></div>
            <div className="mb-4">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Level awal — Grade {getGrade(newLevel)}</label>
              <input type="range" min={0} max={100} value={newLevel} onChange={e => setNewLevel(Number(e.target.value))} className="w-full" />
              <div className="text-[12px] text-gray2 mt-1">Level: {newLevel}</div>
            </div>
            <button onClick={saveNew} disabled={saving} className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl disabled:opacity-50">
              {saving ? 'Menambahkan...' : 'Add Player'}
            </button>
          </div>
        </div>
      )}

      {/* Add period */}
      {addPeriod && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setAddPeriod(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-[1.1rem] tracking-wider">Open New Period</h2>
              <button onClick={() => setAddPeriod(false)} className="w-8 h-8 bg-dark3 rounded-full flex items-center justify-center"><X size={14} className="text-gray2" /></button>
            </div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Bulan Mulai</label>
              <input type="month" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Durasi (bulan)</label>
              <select value={periodDuration} onChange={e => setPeriodDuration(e.target.value)}>
                <option value="1">1 bulan</option>
                <option value="2">2 bulan</option>
                <option value="3">3 bulan</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Tutup Registrasi</label>
              <input type="date" value={periodClose} onChange={e => setPeriodClose(e.target.value)} />
              <p className="text-[11px] text-gray mt-1">Biasanya tanggal 15 bulan sebelumnya</p>
            </div>
            <button onClick={savePeriod} disabled={saving} className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl disabled:opacity-50">
              {saving ? 'Membuat...' : 'Buat Periode'}
            </button>
          </div>
        </div>
      )}

      {/* Proof modal */}
      {proofModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center max-w-[390px] left-1/2 -translate-x-1/2 px-5" onClick={() => setProofModal(null)}>
          <div className="w-full" onClick={e => e.stopPropagation()}>
            <img src={proofModal} alt="Bukti bayar" className="w-full rounded-xl object-contain max-h-[70vh]" />
            <button onClick={() => setProofModal(null)} className="w-full mt-4 bg-dark2 border border-white/7 text-light font-display tracking-wider py-3.5 rounded-xl">Tutup</button>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}
