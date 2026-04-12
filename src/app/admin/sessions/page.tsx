'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, getDay } from 'date-fns'
import { ChevronLeft, Plus, Check, X } from 'lucide-react'
import { Badge, Spinner } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session, Attendance, Player } from '@/types'
import toast from 'react-hot-toast'

type SessionWithCount = Session & { attendance_count: number }

export default function AdminSessionsPage() {
  const router = useRouter()
  const auth = getSession()
  const [sessions, setSessions] = useState<SessionWithCount[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SessionWithCount | null>(null)
  const [attendees, setAttendees] = useState<Attendance[]>([])
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState<SessionWithCount | null>(null)
  const [addType, setAddType] = useState<'member'|'incidentil'>('member')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newIsRally, setNewIsRally] = useState(false)
  const [newStartTime, setNewStartTime] = useState('18:00')
  const [newLocation, setNewLocation] = useState('Zuper Mawar Court 5 & 6')
  const [editDate, setEditDate] = useState('')
  const [editStartTime, setEditStartTime] = useState('18:00')
  const [editLocation, setEditLocation] = useState('')
  const [editIsRally, setEditIsRally] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('sessions').select('*').gte('session_date', today).order('session_date', { ascending: true })
    const withCounts = await Promise.all((data ?? []).map(async s => {
      const { count } = await supabase.from('attendances').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('status', 'confirmed')
      return { ...s, attendance_count: count ?? 0 }
    }))
    setSessions(withCounts as SessionWithCount[])
    const { data: playerData } = await supabase.from('players').select('*').eq('status', 'approved').order('name', { ascending: true })
    setPlayers((playerData ?? []) as Player[])
    setLoading(false)
  }

  async function openSession(s: SessionWithCount) {
    setSelected(s); setShowAddForm(false); setSelectedPlayerId('')
    const supabase = createClient()
    const { data } = await supabase.from('attendances')
      .select('*, player:players(name, origin, phone)')
      .eq('session_id', s.id).neq('status', 'cancelled').order('registered_at', { ascending: true })
    setAttendees((data ?? []) as unknown as Attendance[])
  }

  async function addAttendance() {
    if (!selected || !selectedPlayerId) { toast.error('Select a player'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('attendances').insert({
      session_id: selected.id, player_id: selectedPlayerId, type: addType, status: 'confirmed', added_by_admin: true,
    })
    if (error?.code === '23505') toast.error('Player already registered')
    else if (error) toast.error('Failed to add')
    else { toast.success('Added!'); setSelectedPlayerId(''); setShowAddForm(false); openSession(selected); loadData() }
    setSaving(false)
  }

  async function confirmPayment(attendanceId: string) {
    const supabase = createClient()
    await supabase.from('attendances').update({ status: 'confirmed' }).eq('id', attendanceId)
    toast.success('Payment confirmed!')
    if (selected) openSession(selected)
  }

  async function removeAttendance(attendanceId: string) {
    const supabase = createClient()
    await supabase.from('attendances').update({ status: 'cancelled' }).eq('id', attendanceId)
    toast.success('Removed')
    if (selected) openSession(selected)
    loadData()
  }

  async function cancelSession(sessionId: string) {
    const supabase = createClient()
    await supabase.from('sessions').update({ max_attendance: 0 }).eq('id', sessionId)
    toast.success('Session cancelled')
    setSelected(null)
    loadData()
  }

  async function createSession() {
    if (!newDate) { toast.error('Select a date'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('sessions').insert({
      session_date: newDate, start_time: newStartTime, end_time: '21:00',
      location: newLocation, is_rally: newIsRally, max_attendance: 24,
      registration_closes_at: `${newDate}T${newStartTime}:00+07:00`,
    })
    if (error) toast.error('Failed to create')
    else { toast.success('Session created!'); setCreateModal(false); setNewDate(''); setNewIsRally(false); setNewStartTime('18:00'); setNewLocation('Zuper Mawar Court 5 & 6'); loadData() }
    setSaving(false)
  }

  async function saveEditSession() {
    if (!editModal) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('sessions').update({
      session_date: editDate, start_time: editStartTime, location: editLocation, is_rally: editIsRally,
      registration_closes_at: `${editDate}T${editStartTime}:00+07:00`,
    }).eq('id', editModal.id)
    if (error) toast.error('Failed to update')
    else { toast.success('Session updated!'); setEditModal(null); loadData() }
    setSaving(false)
  }

  async function autoGenerateNextMonth() {
    const supabase = createClient()
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const year = nextMonth.getFullYear()
    const month = nextMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const thursdays: Date[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      if (getDay(date) === 4) thursdays.push(date)
    }
    if (!thursdays.length) { toast.error('No Thursdays found'); return }
    const inserts = thursdays.map((d, i) => {
      const dateStr = format(d, 'yyyy-MM-dd')
      return { session_date: dateStr, start_time: '18:00', end_time: '21:00', location: 'Zuper Mawar Court 5 & 6', is_rally: i === 0, max_attendance: 24, registration_closes_at: `${dateStr}T16:00:00+07:00` }
    })
    const { data: existing } = await supabase.from('sessions').select('session_date').in('session_date', inserts.map(i => i.session_date))
    const existingDates = (existing ?? []).map(e => e.session_date)
    const toInsert = inserts.filter(i => !existingDates.includes(i.session_date))
    if (!toInsert.length) { toast.error('Sessions for next month already exist'); return }
    const { error } = await supabase.from('sessions').insert(toInsert)
    if (error) toast.error('Failed to generate')
    else { toast.success(`Generated ${toInsert.length} sessions for ${format(nextMonth, 'MMMM yyyy')}!`); loadData() }
  }

  function openEditModal(s: SessionWithCount) {
    setEditModal(s); setEditDate(s.session_date); setEditStartTime(s.start_time.slice(0, 5)); setEditLocation(s.location); setEditIsRally(s.is_rally)
  }

  const attendeeIds = attendees.map(a => (a as unknown as { player_id: string }).player_id)
  const availablePlayers = players.filter(p => !attendeeIds.includes(p.id))

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <button onClick={() => router.push('/admin')} className="text-gray2"><ChevronLeft size={20} /></button>
        <span className="font-display text-[1.25rem] tracking-wider flex-1">Sessions</span>
        <div className="flex gap-2">
          <button onClick={autoGenerateNextMonth} className="text-[11px] text-gray2 bg-dark3 border border-white/7 px-2.5 py-1.5 rounded-lg">Auto-gen</button>
          <button onClick={() => setCreateModal(true)} className="flex items-center gap-1 text-[12px] text-red"><Plus size={14} /> New</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="mx-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden mb-5">
          {sessions.map(s => (
            <div key={s.id} className={`flex items-center gap-3 px-4 py-3 border-b border-white/7 last:border-0 ${s.max_attendance === 0 ? 'opacity-40' : ''}`}>
              <button className="flex items-center gap-3 flex-1 text-left" onClick={() => openSession(s)}>
                <div className="w-[36px] h-[40px] bg-dark3 rounded-[8px] flex flex-col items-center justify-center flex-shrink-0">
                  <div className="font-display text-[1rem] leading-none text-red">{format(new Date(s.session_date), 'd')}</div>
                  <div className="text-[8px] tracking-wider uppercase text-gray2">{format(new Date(s.session_date), 'MMM')}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="text-[13px] font-medium">{s.max_attendance === 0 ? '🚫 Cancelled' : `K34${s.is_rally ? ' — Rally' : ''}`}</div>
                    {s.is_rally && s.max_attendance > 0 && <Badge variant="red" className="text-[9px]">Rally</Badge>}
                  </div>
                  <div className="text-[11px] text-gray2">{s.attendance_count}/{s.max_attendance === 0 ? 0 : s.max_attendance} · {s.start_time.slice(0,5)}</div>
                </div>
              </button>
              <button onClick={() => openEditModal(s)} className="text-gray2 p-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setSelected(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 max-h-[85vh] overflow-y-auto animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-display text-[1.2rem] tracking-wider">{format(new Date(selected.session_date), 'EEEE, MMM d')}</h2>
                <p className="text-[11px] text-gray2">{selected.attendance_count}/{selected.max_attendance} attending · {selected.location}</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1 text-[11px] text-red bg-red/12 border border-red/25 px-2.5 py-1.5 rounded-lg">
                  <Plus size={12} /> Add
                </button>
                <button onClick={() => { if (confirm('Cancel this session?')) cancelSession(selected.id) }} className="text-[11px] text-gray2 bg-dark3 border border-white/7 px-2.5 py-1.5 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>

            {showAddForm && (
              <div className="bg-dark3 rounded-xl p-3.5 mb-3">
                <div className="text-[11px] tracking-widest uppercase text-gray2 mb-2">Add Attendance</div>
                <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} className="mb-2">
                  <option value="">Select player...</option>
                  {availablePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.origin ?? '—'})</option>)}
                </select>
                <div className="flex gap-2 mb-2.5">
                  {(['member','incidentil'] as const).map(t => (
                    <button key={t} onClick={() => setAddType(t)}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-medium border transition-all ${addType === t ? 'bg-red text-white border-red' : 'text-gray2 border-white/7'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={addAttendance} disabled={saving} className="w-full bg-red text-white font-display tracking-wider py-2.5 rounded-lg text-sm disabled:opacity-50">Add</button>
              </div>
            )}

            {attendees.length === 0 ? <div className="py-6 text-center text-[12px] text-gray2">No attendees yet</div> : (
              <div className="bg-dark3 rounded-xl overflow-hidden">
                {attendees.map((a, i) => {
                  const player = a.player as unknown as { name: string; origin: string }
                  const needsPayment = a.type === 'incidentil' && a.payment_proof_url === null
                  return (
                    <div key={a.id} className={`flex items-center gap-2.5 px-3.5 py-2.5 ${i < attendees.length-1 ? 'border-b border-white/7' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-dark2 flex items-center justify-center font-display text-[.75rem] flex-shrink-0">
                        {player?.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{player?.name ?? '—'}</div>
                        <div className="text-[10px] text-gray2">
                          {player?.origin ?? '—'} · <span className={a.type === 'incidentil' ? 'text-warn' : 'text-success'}>{a.type}</span>
                          {needsPayment && <span className="text-red"> · awaiting payment</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {needsPayment && (
                          <button onClick={() => confirmPayment(a.id)} className="text-[10px] text-success bg-success/12 border border-success/25 px-2 py-1 rounded-lg flex items-center gap-1">
                            <Check size={10} /> Paid
                          </button>
                        )}
                        <button onClick={() => removeAttendance(a.id)} className="text-[10px] text-red bg-red/12 border border-red/25 px-2 py-1 rounded-lg">
                          <X size={10} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {createModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setCreateModal(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">Create Session</h2>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Date</label><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Start Time</label><input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Location</label><input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} /></div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => setNewIsRally(!newIsRally)} className={`w-10 h-6 rounded-full transition-all relative ${newIsRally ? 'bg-red' : 'bg-dark3 border border-white/7'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${newIsRally ? 'left-5' : 'left-1'}`} />
              </button>
              <span className="text-[13px]">Mark as Rally session</span>
            </div>
            <button onClick={createSession} disabled={saving} className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setEditModal(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">Edit Session</h2>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Date</label><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Start Time</label><input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Location</label><input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)} /></div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => setEditIsRally(!editIsRally)} className={`w-10 h-6 rounded-full transition-all relative ${editIsRally ? 'bg-red' : 'bg-dark3 border border-white/7'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${editIsRally ? 'left-5' : 'left-1'}`} />
              </button>
              <span className="text-[13px]">Rally session</span>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEditSession} disabled={saving} className="flex-1 bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { if (confirm('Cancel this session?')) { cancelSession(editModal.id); setEditModal(null) } }} className="flex-1 bg-dark3 text-gray2 border border-white/7 font-display tracking-wider py-3.5 rounded-xl text-base">
                Cancel Session
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="h-8" />
    </div>
  )
}