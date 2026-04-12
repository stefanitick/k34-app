'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, Plus, Edit2 } from 'lucide-react'
import { Spinner, Badge } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import { getGrade } from '@/lib/grade'
import type { Player } from '@/types'
import toast from 'react-hot-toast'

export default function AdminPlayersPage() {
  const router = useRouter()
  const auth = getSession()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Player | null>(null)
  const [addNew, setAddNew] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState(50)
  const [editStatus, setEditStatus] = useState<'pending' | 'approved' | 'rejected'>('approved')
  const [editOrigin, setEditOrigin] = useState('')

  // Add form state
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newOrigin, setNewOrigin] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadPlayers()
  }, [])

  async function loadPlayers() {
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name', { ascending: true })
    setPlayers((data ?? []) as Player[])
    setLoading(false)
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('players')
      .update({ name: editName, level: editLevel, status: editStatus, origin: editOrigin })
      .eq('id', editing.id)
    if (error) toast.error('Failed to save')
    else { toast.success('Player updated'); setEditing(null); loadPlayers() }
    setSaving(false)
  }

  async function saveNew() {
    if (!newName || !newPhone) { toast.error('Name and phone required'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('players').insert({
      name: newName.trim(),
      phone: newPhone.trim(),
      password_key: newPhone.trim().slice(-4),
      origin: newOrigin.trim() || null,
      role: 'player',
      status: 'approved',
      level: 50,
    })
    if (error) {
      toast.error(error.code === '23505' ? 'Phone already registered' : 'Failed to add player')
    } else {
      toast.success('Player added!')
      setAddNew(false)
      setNewName(''); setNewPhone(''); setNewOrigin('')
      loadPlayers()
    }
    setSaving(false)
  }

  function openEdit(p: Player) {
    setEditing(p)
    setEditName(p.name)
    setEditLevel(p.level)
    setEditStatus(p.status as 'pending' | 'approved' | 'rejected')
    setEditOrigin(p.origin ?? '')
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.origin ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <button onClick={() => router.push('/admin')} className="text-gray2"><ChevronLeft size={20} /></button>
        <span className="font-display text-[1.25rem] tracking-wider flex-1">Players</span>
        <button
          onClick={() => setAddNew(true)}
          className="flex items-center gap-1 text-[12px] text-red"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Search */}
      <div className="px-5 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray2" />
          <input
            type="text"
            placeholder="Search by name or origin..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 py-2.5"
          />
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="mx-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden mb-5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray2">No players found</div>
          ) : filtered.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/7 last:border-0">
              <div className="w-8 h-8 rounded-full bg-dark3 flex items-center justify-center font-display text-[.8rem] flex-shrink-0">
                {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-gray2">
                  {p.origin ?? '—'} · Grade {getGrade(p.level)} · Level {p.level}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warn' : 'gray'}>
                  {p.status}
                </Badge>
                <button onClick={() => openEdit(p)} className="text-gray2 p-1">
                  <Edit2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setEditing(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">Edit Player</h2>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Name</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Origin</label>
              <input type="text" value={editOrigin} onChange={e => setEditOrigin(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">
                Level (admin only) — Current: {editLevel} → Grade {getGrade(editLevel)}
              </label>
              <input type="range" min={0} max={100} value={editLevel} onChange={e => setEditLevel(Number(e.target.value))} className="w-full" />
              <div className="text-[12px] text-gray2 mt-1">Level: {editLevel}</div>
            </div>
            <div className="mb-4">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as typeof editStatus)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Add player modal */}
      {addNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setAddNew(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">Add Player Manually</h2>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Full Name</label>
              <input type="text" placeholder="Player name" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Phone Number</label>
              <input type="tel" placeholder="08xxxxxxxxxx" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              <p className="text-[11px] text-gray mt-1">Last 4 digits will be their password</p>
            </div>
            <div className="mb-4">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Origin</label>
              <input type="text" placeholder="e.g. SCM-MS, GDP" value={newOrigin} onChange={e => setNewOrigin(e.target.value)} />
            </div>
            <button
              onClick={saveNew}
              disabled={saving}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Player (Auto-Approved)'}
            </button>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}
