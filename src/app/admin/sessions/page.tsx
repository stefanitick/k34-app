'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronLeft, Plus, Users, Edit2 } from 'lucide-react'
import { Badge, Spinner } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Session, Attendance } from '@/types'
import toast from 'react-hot-toast'

export default function AdminSessionsPage() {
  const router = useRouter()
  const auth = getSession()
  const [sessions, setSessions] = useState<(Session & { attendance_count: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<(Session & { attendance_count: number }) | null>(null)
  const [attendees, setAttendees] = useState<Attendance[]>([])
  const [addModal, setAddModal] = useState(false)
  const [createModal, setCreateModal] = useState(false)

  // Add attendance form
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState<'member' | 'incidentil'>('member')

  // Create session form
  const [newDate, setNewDate] = useState('')
  const [newIsRally, setNewIsRally] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadSessions()
  }, [])

  async function loadSessions() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .gte('session_date', today)
      .order('session_date', { ascending: true })

    const withCounts = await Promise.all((data ?? []).map(async s => {
      const { count } = await supabase
        .from('attendances')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', s.id)
        .eq('status', 'confirmed')
      return { ...s, attendance_count: count ?? 0 }
    }))
    setSessions(withCounts as (Session & { attendance_count: number })[])
    setLoading(false)
  }

  async function openSession(s: Session & { attendance_count: number }) {
    setSelected(s)
    const supabase = createClient()
    const { data } = await supabase
      .from('attendances')
      .select('*, player:players(name, origin)')
      .eq('session_id', s.id)
      .eq('status', 'confirmed')
      .order('registered_at', { ascending: true })
    setAttendees((data ?? []) as unknown as Attendance[])
  }

  async function addAttendance() {
    if (!selected || !addName.trim()) { toast.error('Enter player name'); return }
    setSaving(true)
    const supabase = createClient()

    // Find player by name
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .ilike('name', addName.trim())
      .maybeSingle()

    if (!player) {
      toast.error('Player not found. Add them in Players first.')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('attendances').insert({
      session_id: selected.id,
      player_id: player.id,
      type: addType,
      status: 'confirmed',
      added_by_admin: true,
    })

    if (error?.code === '23505') {
      toast.error('Player already registered for this session')
    } else if (error) {
      toast.error('Failed to add attendance')
    } else {
      toast.success('Added!')
      setAddName('')
      openSession(selected)
      loadSessions()
    }
    setSaving(false)
  }

  async function removeAttendance(attendanceId: string) {
    const supabase = createClient()
    await supabase.from('attendances').update({ status: 'cancelled' }).eq('id', attendanceId)
    toast.success('Removed')
    if (selected) openSession(selected)
    loadSessions()
  }

  async function createSession() {
    if (!newDate) { toast.error('Select a date'); return }
    setSaving(true)
    const supabase = createClient()
    const sessionDate = newDate
    const closesAt = `${sessionDate}T16:00:00+07:00`

    const { error } = await supabase.from('sessions').insert({
      session_date: sessionDate,
      start_time: '18:00',
      end_time: '21:00',
      location: 'Zuper Mawar Court 5 & 6',
      is_rally: newIsRally,
      max_attendance: 24,
      registration_closes_at: closesAt,
    })

    if (error) toast.error('Failed to create session')
    else {
      toast.success('Session created!')
      setCreateModal(false)
      setNewDate('')
      setNewIsRally(false)
      loadSessions()
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <button onClick={() => router.push('/admin')} className="text-gray2"><ChevronLeft size={20} /></button>
        <span className="font-display text-[1.25rem] tracking-wider flex-1">Sessions</span>
        <button onClick={() => setCreateModal(true)} className="flex items-center gap-1 text-[12px] text-red">
          <Plus size={14} /> New
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="mx-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden mb-5">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => openSession(s)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/7 last:border-0 text-left"
            >
              <div className="w-[36px] h-[40px] bg-dark3 rounded-[8px] flex flex-col items-center justify-center flex-shrink-0">
                <div className="font-display text-[1rem] leading-none text-red">{format(new Date(s.session_date), 'd')}</div>
                <div className="text-[8px] tracking-wider uppercase text-gray2">{format(new Date(s.session_date), 'MMM')}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="text-[13px] font-medium">K34 Funminton{s.is_rally ? ' — Rally' : ''}</div>
                  {s.is_rally && <Badge variant="red" className="text-[9px]">Rally</Badge>}
                </div>
                <div className="text-[11px] text-gray2">{s.attendance_count}/{s.max_attendance} registered</div>
              </div>
              <Users size={14} className="text-gray2" />
            </button>
          ))}
        </div>
      )}

      {/* Session detail bottom sheet */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setSelected(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 max-h-[85vh] overflow-y-auto animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-display text-[1.2rem] tracking-wider">
                  {format(new Date(selected.session_date), 'EEEE, MMM d')}
                </h2>
                <p className="text-[11px] text-gray2">{selected.attendance_count}/{selected.max_attendance} attending</p>
              </div>
              <button
                onClick={() => setAddModal(true)}
                className="flex items-center gap-1 text-[11px] text-red bg-red/12 border border-red/25 px-2.5 py-1.5 rounded-lg"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            {/* Attendees list */}
            {attendees.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-gray2">No attendees yet</div>
            ) : (
              <div className="bg-dark3 rounded-xl overflow-hidden">
                {attendees.map((a, i) => {
                  const player = a.player as unknown as { name: string; origin: string }
                  return (
                    <div key={a.id} className={`flex items-center gap-2.5 px-3.5 py-2.5 ${i < attendees.length - 1 ? 'border-b border-white/7' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-dark2 flex items-center justify-center font-display text-[.75rem] flex-shrink-0">
                        {player?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{player?.name ?? '—'}</div>
                        <div className="text-[10px] text-gray2">{player?.origin ?? '—'} · {a.type}</div>
                      </div>
                      <button
                        onClick={() => removeAttendance(a.id)}
                        className="text-[10px] text-gray2 text-red"
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add attendance sub-form */}
            {addModal && (
              <div className="mt-4 bg-dark3 rounded-xl p-3.5">
                <div className="text-[11px] tracking-widest uppercase text-gray2 mb-2">Add Attendance</div>
                <input type="text" placeholder="Player full name" value={addName} onChange={e => setAddName(e.target.value)} className="mb-2" />
                <div className="flex gap-2 mb-2.5">
                  {(['member', 'incidentil'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setAddType(t)}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-medium border transition-all ${addType === t ? 'bg-red text-white border-red' : 'text-gray2 border-white/7'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  onClick={addAttendance}
                  disabled={saving}
                  className="w-full bg-red text-white font-display tracking-wider py-2.5 rounded-lg text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create session modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setCreateModal(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">Create Session</h2>
            <div className="mb-3">
              <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Date</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={() => setNewIsRally(!newIsRally)}
                className={`w-10 h-6 rounded-full transition-all ${newIsRally ? 'bg-red' : 'bg-dark3 border border-white/7'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white mx-auto transition-all ${newIsRally ? 'translate-x-2' : '-translate-x-2'}`} />
              </button>
              <span className="text-[13px]">Mark as Rally session</span>
            </div>
            <div className="mb-4 text-[11px] text-gray2">
              Time: 18:00–21:00 WIB · Location: Zuper Mawar Court 5 & 6 · Max: 24 players
            </div>
            <button
              onClick={createSession}
              disabled={saving}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}
