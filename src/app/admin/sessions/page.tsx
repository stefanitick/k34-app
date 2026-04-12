'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, getDay } from 'date-fns'
import { ChevronLeft, Plus, Check, X, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { createClient, getProofUrl } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Player } from '@/types'
import toast from 'react-hot-toast'

interface SessionWithCount {
  id: string; session_date: string; start_time: string; end_time: string
  location: string; is_rally: boolean; max_attendance: number
  registration_closes_at: string; attendance_count: number
}
interface Attendee {
  id: string; player_id: string; type: 'member'|'incidentil'; status: string
  payment_proof_url: string | null; added_by_admin: boolean
  player: { name: string; origin: string }
}

const DEFAULT_CONFIG_KEY = 'k34_default_session'

export default function AdminSessionsPage() {
  const router = useRouter()
  const auth = getSession()
  const [sessions, setSessions] = useState<SessionWithCount[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({})
  const [proofModal, setProofModal] = useState<string | null>(null)

  // Default config
  const [defaultTime, setDefaultTime] = useState('18:00')
  const [defaultLocation, setDefaultLocation] = useState('Zuper Mawar Court 5 & 6')
  const [editDefault, setEditDefault] = useState(false)

  // Add attendance
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addPlayerId, setAddPlayerId] = useState('')
  const [addType, setAddType] = useState<'member'|'incidentil'>('member')

  // Create/Edit session
  const [createModal, setCreateModal] = useState(false)
  const [editSession, setEditSession] = useState<SessionWithCount | null>(null)
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('18:00')
  const [formLocation, setFormLocation] = useState('Zuper Mawar Court 5 & 6')
  const [formIsRally, setFormIsRally] = useState(false)
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

  async function loadAttendees(sessionId: string) {
    if (attendees[sessionId]) return
    const supabase = createClient()
    const { data } = await supabase.from('attendances')
      .select('*, player:players(name, origin)')
      .eq('session_id', sessionId).neq('status', 'cancelled').order('registered_at', { ascending: true })
    setAttendees(prev => ({ ...prev, [sessionId]: (data ?? []) as unknown as Attendee[] }))
  }

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    loadAttendees(id)
    setAddingTo(null)
  }

  async function addAttendance(sessionId: string) {
    if (!addPlayerId) { toast.error('Select a player'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('attendances').insert({
      session_id: sessionId, player_id: addPlayerId, type: addType, status: 'confirmed', added_by_admin: true,
    })
    if (error?.code === '23505') toast.error('Already registered')
    else if (error) toast.error('Failed')
    else {
      toast.success('Added!')
      setAddPlayerId('')
      setAttendees(prev => { const n = {...prev}; delete n[sessionId]; return n })
      loadAttendees(sessionId)
      loadData()
    }
    setSaving(false)
  }

  async function removeAttendance(sessionId: string, attendanceId: string) {
    const supabase = createClient()
    await supabase.from('attendances').update({ status: 'cancelled' }).eq('id', attendanceId)
    toast.success('Removed')
    setAttendees(prev => { const n = {...prev}; delete n[sessionId]; return n })
    loadAttendees(sessionId)
    loadData()
  }

  async function confirmPayment(sessionId: string, attendanceId: string) {
    const supabase = createClient()
    await supabase.from('attendances').update({ payment_proof_url: 'confirmed_by_admin' }).eq('id', attendanceId)
    toast.success('Payment confirmed!')
    setAttendees(prev => { const n = {...prev}; delete n[sessionId]; return n })
    loadAttendees(sessionId)
  }

  async function cancelSession(id: string) {
    if (!confirm('Cancel this session?')) return
    const supabase = createClient()
    await supabase.from('sessions').update({ max_attendance: 0 }).eq('id', id)
    toast.success('Session cancelled')
    loadData()
  }

  async function saveSession() {
    if (!formDate) { toast.error('Select a date'); return }
    setSaving(true)
    const supabase = createClient()
    const payload = {
      session_date: formDate, start_time: formTime, end_time: '21:00',
      location: formLocation, is_rally: formIsRally, max_attendance: 24,
      registration_closes_at: `${formDate}T${formTime}:00+07:00`,
    }
    if (editSession) {
      const { error } = await supabase.from('sessions').update(payload).eq('id', editSession.id)
      if (error) toast.error('Failed to update')
      else { toast.success('Updated!'); setEditSession(null) }
    } else {
      const { error } = await supabase.from('sessions').insert(payload)
      if (error) toast.error('Failed to create')
      else { toast.success('Created!'); setCreateModal(false) }
    }
    setFormDate(''); setFormTime('18:00'); setFormLocation('Zuper Mawar Court 5 & 6'); setFormIsRally(false)
    loadData()
    setSaving(false)
  }

  async function autoGenerate() {
    const supabase = createClient()
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const year = nextMonth.getFullYear(); const month = nextMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const thursdays: Date[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      if (getDay(date) === 4) thursdays.push(date)
    }
    const inserts = thursdays.map((d, i) => {
      const dateStr = format(d, 'yyyy-MM-dd')
      return { session_date: dateStr, start_time: defaultTime, end_time: '21:00', location: defaultLocation, is_rally: i === 0, max_attendance: 24, registration_closes_at: `${dateStr}T${defaultTime}:00+07:00` }
    })
    const { data: existing } = await supabase.from('sessions').select('session_date').in('session_date', inserts.map(i => i.session_date))
    const existingDates = (existing ?? []).map(e => e.session_date)
    const toInsert = inserts.filter(i => !existingDates.includes(i.session_date))
    if (!toInsert.length) { toast.error('Sessions already exist for next month'); return }
    const { error } = await supabase.from('sessions').insert(toInsert)
    if (error) toast.error('Failed to generate')
    else { toast.success(`Generated ${toInsert.length} sessions for ${format(nextMonth, 'MMMM yyyy')}!`); loadData() }
  }

  async function viewProof(path: string) {
    const url = await getProofUrl(path)
    if (!url) { toast.error('Could not load'); return }
    setProofModal(url)
  }

  function openEdit(s: SessionWithCount) {
    setEditSession(s); setFormDate(s.session_date); setFormTime(s.start_time.slice(0,5)); setFormLocation(s.location); setFormIsRally(s.is_rally)
  }

  const getAttendees = (sessionId: string) => attendees[sessionId] ?? []
  const getAvailablePlayers = (sessionId: string) => {
    const registered = getAttendees(sessionId).map(a => a.player_id)
    return players.filter(p => !registered.includes(p.id))
  }

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <button onClick={() => router.push('/admin')} className="text-gray2"><ChevronLeft size={20} /></button>
        <span className="font-display text-[1.25rem] tracking-wider flex-1">Sessions</span>
        <div className="flex gap-2">
          <button onClick={autoGenerate} className="text-[10px] text-gray2 bg-dark3 border border-white/7 px-2.5 py-1.5 rounded-lg">Auto-gen</button>
          <button onClick={() => setCreateModal(true)} className="flex items-center gap-1 text-[12px] text-red"><Plus size={14} /> New</button>
        </div>
      </div>

      {/* Default Schedule */}
      <div className="px-5 mb-1"><div className="text-[10px] tracking-widest uppercase text-gray mb-2">Default Schedule</div></div>
      <div className="mx-5 mb-3 bg-dark2 border border-white/7 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/7">
          <div className="text-[12px] text-gray2">Day</div>
          <div className="text-[13px] font-medium text-red">Every Thursday</div>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/7">
          <div className="text-[12px] text-gray2">Time</div>
          <div className="text-[13px] font-medium">{defaultTime} – 21:00</div>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="text-[12px] text-gray2">Location</div>
          <div className="text-[12px] text-gray2 truncate max-w-[180px] text-right">{defaultLocation}</div>
        </div>
      </div>
      <div className="px-5 mb-3">
        <button onClick={() => setEditDefault(true)} className="w-full bg-dark2 border border-white/7 text-light font-display tracking-wider py-2.5 rounded-xl text-[.85rem]">
          Edit Default Schedule
        </button>
      </div>

      {/* Sessions list */}
      <div className="px-5 mb-1"><div className="text-[10px] tracking-widest uppercase text-gray mb-2">Upcoming Sessions</div></div>
      {loading ? <Spinner /> : (
        <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
          {sessions.map((s, i) => {
            const isExpanded = expandedId === s.id
            const isCancelled = s.max_attendance === 0
            const sessionAttendees = getAttendees(s.id)
            const memberAtt = sessionAttendees.filter(a => a.type === 'member')
            const incAtt = sessionAttendees.filter(a => a.type === 'incidentil')
            const pendingPayment = incAtt.filter(a => a.payment_proof_url && a.payment_proof_url !== 'confirmed_by_admin')
            return (
              <div key={s.id} className={`${i < sessions.length - 1 || isExpanded ? 'border-b border-white/7' : ''} ${isCancelled ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => !isCancelled && toggleExpand(s.id)}>
                  <div className="w-[36px] h-[40px] bg-dark3 rounded-[8px] flex flex-col items-center justify-center flex-shrink-0">
                    <div className="font-display text-[1rem] leading-none text-red">{format(new Date(s.session_date), 'd')}</div>
                    <div className="text-[8px] tracking-wider uppercase text-gray2">{format(new Date(s.session_date), 'MMM')}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="text-[13px] font-medium">{isCancelled ? '🚫 Cancelled' : `K34${s.is_rally ? ' — Rally' : ''}`}</div>
                      {s.is_rally && !isCancelled && <span className="text-[9px] bg-red/12 text-red border border-red/25 px-1.5 py-0.5 rounded-full">Rally</span>}
                      {pendingPayment.length > 0 && <span className="text-[9px] bg-warn/12 text-warn border border-warn/25 px-1.5 py-0.5 rounded-full">{pendingPayment.length} unpaid</span>}
                    </div>
                    <div className="text-[11px] text-gray2">{s.attendance_count}/{s.max_attendance} · {s.start_time.slice(0,5)}</div>
                  </div>
                  {!isCancelled && (isExpanded ? <ChevronUp size={14} className="text-gray2 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray2 flex-shrink-0" />)}
                </div>

                {isExpanded && (
                  <div className="bg-dark3 mx-3 mb-3 rounded-xl overflow-hidden">
                    {/* Session actions */}
                    <div className="flex gap-1.5 px-3 py-2.5 border-b border-white/7">
                      <button onClick={() => { setAddingTo(addingTo === s.id ? null : s.id) }}
                        className="flex-1 text-[11px] text-success bg-success/12 border border-success/25 py-1.5 rounded-lg text-center">
                        {addingTo === s.id ? 'Cancel' : '+ Add Player'}
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="flex-1 text-[11px] text-gray2 bg-dark2 border border-white/7 py-1.5 rounded-lg text-center">
                        Edit
                      </button>
                      <button onClick={() => cancelSession(s.id)}
                        className="flex-1 text-[11px] text-red bg-red/12 border border-red/25 py-1.5 rounded-lg text-center">
                        Cancel
                      </button>
                    </div>

                    {/* Add player form */}
                    {addingTo === s.id && (
                      <div className="px-3 py-2.5 border-b border-white/7">
                        <select value={addPlayerId} onChange={e => setAddPlayerId(e.target.value)} className="mb-2 text-[12px]">
                          <option value="">Select player...</option>
                          {getAvailablePlayers(s.id).map(p => <option key={p.id} value={p.id}>{p.name} ({p.origin ?? '—'})</option>)}
                        </select>
                        <div className="flex gap-2 mb-2">
                          {(['member','incidentil'] as const).map(t => (
                            <button key={t} onClick={() => setAddType(t)}
                              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border ${addType === t ? 'bg-red text-white border-red' : 'text-gray2 border-white/7'}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                        <button onClick={() => addAttendance(s.id)} disabled={saving}
                          className="w-full bg-red text-white font-display tracking-wider py-2 rounded-lg text-sm disabled:opacity-50">
                          Add
                        </button>
                      </div>
                    )}

                    {/* Members */}
                    {memberAtt.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] text-gray2 uppercase tracking-wider">Member ({memberAtt.length})</div>
                        {memberAtt.map(a => (
                          <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-t border-white/7">
                            <div className="w-6 h-6 rounded-full bg-dark2 flex items-center justify-center text-[9px] font-display flex-shrink-0">
                              {a.player.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                            </div>
                            <div className="flex-1 text-[12px] font-medium truncate">{a.player.name}</div>
                            <span className="text-[10px] text-success">member</span>
                            <button onClick={() => removeAttendance(s.id, a.id)} className="text-gray2 ml-1"><X size={12} /></button>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Incidentil */}
                    {incAtt.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] text-gray2 uppercase tracking-wider border-t border-white/7">Incidentil ({incAtt.length})</div>
                        {incAtt.map(a => {
                          const isPaid = a.payment_proof_url === 'confirmed_by_admin' || !a.payment_proof_url
                          const hasProof = a.payment_proof_url && a.payment_proof_url !== 'confirmed_by_admin'
                          return (
                            <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-t border-white/7">
                              <div className="w-6 h-6 rounded-full bg-dark2 flex items-center justify-center text-[9px] font-display flex-shrink-0">
                                {a.player.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium truncate">{a.player.name}</div>
                                <div className={`text-[10px] ${hasProof ? 'text-warn' : isPaid ? 'text-success' : 'text-gray2'}`}>
                                  {hasProof ? 'awaiting confirmation' : isPaid ? 'paid' : 'no proof'}
                                </div>
                              </div>
                              {hasProof && (
                                <>
                                  <button onClick={() => viewProof(a.payment_proof_url!)} className="text-[10px] text-gray2 bg-dark2 border border-white/7 px-2 py-1 rounded-lg flex items-center gap-1">
                                    <Eye size={10} />
                                  </button>
                                  <button onClick={() => confirmPayment(s.id, a.id)} className="text-[10px] text-success bg-success/12 border border-success/25 px-2 py-1 rounded-lg">
                                    <Check size={10} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => removeAttendance(s.id, a.id)} className="text-gray2"><X size={12} /></button>
                            </div>
                          )
                        })}
                      </>
                    )}

                    {sessionAttendees.length === 0 && (
                      <div className="px-3 py-4 text-center text-[11px] text-gray2">No attendees yet</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {sessions.length === 0 && (
            <div className="py-8 text-center text-[12px] text-gray2">No upcoming sessions. Use Auto-gen or + New.</div>
          )}
        </div>
      )}

      {/* Edit default schedule modal */}
      {editDefault && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setEditDefault(false)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">Edit Default Schedule</h2>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Default Start Time</label><input type="time" value={defaultTime} onChange={e => setDefaultTime(e.target.value)} /></div>
            <div className="mb-4"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Default Location</label><input type="text" value={defaultLocation} onChange={e => setDefaultLocation(e.target.value)} /></div>
            <p className="text-[11px] text-gray mb-4">Changes apply to newly auto-generated sessions. Existing sessions are not affected.</p>
            <button onClick={() => setEditDefault(false)} className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl">Save Default</button>
          </div>
        </div>
      )}

      {/* Create / Edit session modal */}
      {(createModal || editSession) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => { setCreateModal(false); setEditSession(null) }}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-4">{editSession ? 'Edit Session' : 'Create Session'}</h2>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Date</label><input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Start Time</label><input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} /></div>
            <div className="mb-3"><label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Location</label><input type="text" value={formLocation} onChange={e => setFormLocation(e.target.value)} /></div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => setFormIsRally(!formIsRally)} className={`w-10 h-6 rounded-full transition-all relative ${formIsRally ? 'bg-red' : 'bg-dark3 border border-white/7'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formIsRally ? 'left-5' : 'left-1'}`} />
              </button>
              <span className="text-[13px]">Rally session</span>
            </div>
            <div className="flex gap-2">
              <button onClick={saveSession} disabled={saving} className="flex-1 bg-red text-white font-display tracking-wider py-3.5 rounded-xl disabled:opacity-50">
                {saving ? 'Saving...' : editSession ? 'Save Changes' : 'Create Session'}
              </button>
              {editSession && (
                <button onClick={() => { cancelSession(editSession.id); setEditSession(null) }}
                  className="flex-1 bg-dark3 text-gray2 border border-white/7 font-display tracking-wider py-3.5 rounded-xl">
                  Cancel Session
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proof modal */}
      {proofModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center max-w-[390px] left-1/2 -translate-x-1/2 px-5" onClick={() => setProofModal(null)}>
          <div className="w-full" onClick={e => e.stopPropagation()}>
            <img src={proofModal} alt="Payment proof" className="w-full rounded-xl object-contain max-h-[70vh]" />
            <button onClick={() => setProofModal(null)} className="w-full mt-4 bg-dark2 border border-white/7 text-light font-display tracking-wider py-3.5 rounded-xl">Close</button>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}