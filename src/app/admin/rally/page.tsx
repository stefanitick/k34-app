'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronLeft, Zap, Trophy, Edit2 } from 'lucide-react'
import { Spinner, Badge, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import { generatePairs, findRallyWinner } from '@/lib/rally'
import type { Rally, Session, Player } from '@/types'
import toast from 'react-hot-toast'

interface RallyMatch {
  id: string; rally_id: string; group_name: string
  pair_a_id: string; pair_b_id: string
  score_a: number | null; score_b: number | null
  winner_pair_id: string | null; status: string; match_order: number
  pair_a: { player1: { name: string; id: string }; player2: { name: string; id: string } }
  pair_b: { player1: { name: string; id: string }; player2: { name: string; id: string } }
}

interface EditMatchState {
  matchId: string
  scoreA: string
  scoreB: string
  winnerPairId: string
}

export default function AdminRallyPage() {
  const router = useRouter()
  const auth = getSession()
  const [rally, setRally] = useState<(Rally & { session: Session }) | null>(null)
  const [matches, setMatches] = useState<RallyMatch[]>([])
  const [attendees, setAttendees] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [editMatch, setEditMatch] = useState<EditMatchState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    // Find next rally session
    const { data: rallySession } = await supabase.from('sessions').select('*')
      .eq('is_rally', true).gte('session_date', today)
      .order('session_date', { ascending: true }).limit(1).maybeSingle()

    if (!rallySession) { setLoading(false); return }

    // Get or create rally record
    let { data: rallyData } = await supabase.from('rallies').select('*').eq('session_id', rallySession.id).maybeSingle()
    if (!rallyData) {
      const { data: created } = await supabase.from('rallies').insert({ session_id: rallySession.id, status: 'pending' }).select().single()
      rallyData = created
    }

    if (rallyData) {
      setRally({ ...rallyData, session: rallySession } as Rally & { session: Session })

      // Load matches
      const { data: matchData } = await supabase.from('rally_matches')
        .select(`*, pair_a:rally_pairs!pair_a_id(*, player1:players!player1_id(id,name), player2:players!player2_id(id,name)), pair_b:rally_pairs!pair_b_id(*, player1:players!player1_id(id,name), player2:players!player2_id(id,name))`)
        .eq('rally_id', rallyData.id).order('match_order')
      setMatches((matchData ?? []) as unknown as RallyMatch[])

      // Load attending members
      const { data: att } = await supabase.from('attendances')
        .select('player:players(id, name, level)')
        .eq('session_id', rallySession.id).eq('type', 'member').eq('status', 'confirmed')
      setAttendees((att ?? []).map(a => (a.player as unknown as Player)))
    }

    setLoading(false)
  }

  async function handleGeneratePairs() {
    if (!rally) return
    if (attendees.length < 2) { toast.error('Need at least 2 members attending rally'); return }
    setGenerating(true)
    const supabase = createClient()

    // Clear existing pairs and matches first
    if (matches.length > 0) {
      await supabase.from('rally_matches').delete().eq('rally_id', rally.id)
      await supabase.from('rally_pairs').delete().eq('rally_id', rally.id)
    }

    const { pairs, matches: matchSchedule } = generatePairs(attendees)
    const { data: insertedPairs, error: pairErr } = await supabase
      .from('rally_pairs').insert(pairs.map(p => ({ ...p, rally_id: rally.id }))).select()

    if (pairErr || !insertedPairs) { toast.error('Failed to generate pairs'); setGenerating(false); return }

    const matchInserts = matchSchedule.map((m: { pair_a_slot: number; pair_b_slot: number; group_name: string; match_order: number }) => ({
      rally_id: rally.id, group_name: m.group_name,
      pair_a_id: insertedPairs[m.pair_a_slot].id,
      pair_b_id: insertedPairs[m.pair_b_slot].id,
      match_order: m.match_order, status: 'pending',
    }))

    const { error: matchErr } = await supabase.from('rally_matches').insert(matchInserts)
    if (matchErr) { toast.error('Failed to create schedule'); setGenerating(false); return }

    await supabase.from('rallies').update({ status: 'pairs_generated' }).eq('id', rally.id)
    toast.success(`Generated ${pairs.length} pairs and ${matchInserts.length} matches!`)
    loadData()
    setGenerating(false)
  }

  async function saveEditMatch() {
    if (!editMatch) return
    const a = parseInt(editMatch.scoreA)
    const b = parseInt(editMatch.scoreB)
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) { toast.error('Enter valid scores'); return }
    if (a === b) { toast.error('No draws — one side must win'); return }
    setSaving(true)
    const supabase = createClient()
    const winnerPairId = editMatch.winnerPairId || (a > b
      ? matches.find(m => m.id === editMatch.matchId)?.pair_a_id
      : matches.find(m => m.id === editMatch.matchId)?.pair_b_id)

    const { error } = await supabase.from('rally_matches').update({
      score_a: a, score_b: b, winner_pair_id: winnerPairId, status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    }).eq('id', editMatch.matchId)

    if (error) toast.error('Failed to save')
    else {
      toast.success('Match result saved!')
      setEditMatch(null)
      // Check if all confirmed → update rally status
      const { data: allMatches } = await supabase.from('rally_matches').select('status').eq('rally_id', rally!.id)
      if (allMatches?.every(m => m.status === 'confirmed')) {
        await supabase.from('rallies').update({ status: 'in_progress' }).eq('id', rally!.id)
      }
      loadData()
    }
    setSaving(false)
  }

  async function forceComplete() {
    if (!rally) return
    if (!confirm('Mark rally as complete? Level updates will be applied.')) return
    const supabase = createClient()

    // Apply level changes for all confirmed matches
    const confirmedMatches = matches.filter(m => m.status === 'confirmed')
    for (const match of confirmedMatches) {
      for (const [pairId, result] of [[match.pair_a_id, match.winner_pair_id === match.pair_a_id ? 'win' : 'loss'], [match.pair_b_id, match.winner_pair_id === match.pair_b_id ? 'win' : 'loss']]) {
        const { data: pair } = await supabase.from('rally_pairs').select('player1_id, player2_id').eq('id', pairId).single()
        if (!pair) continue
        for (const playerId of [pair.player1_id, pair.player2_id]) {
          const { data: player } = await supabase.from('players').select('level').eq('id', playerId).single()
          if (!player) continue
          const change = result === 'win' ? 5 : -5
          const newLevel = Math.min(100, Math.max(0, player.level + change))
          await supabase.from('players').update({ level: newLevel }).eq('id', playerId)
          await supabase.from('level_history').insert({ player_id: playerId, match_id: match.id, result, level_before: player.level, level_change: change, level_after: newLevel })
        }
      }
    }

    // Find and announce winner
    const { data: standData } = await supabase.from('rally_standings').select('*').eq('rally_id', rally.id)
    const winner = findRallyWinner((standData ?? []) as Parameters<typeof findRallyWinner>[0])
    if (winner) {
      const { data: pair } = await supabase.from('rally_pairs').select('player1_id, player2_id').eq('id', winner.pair_id).single()
      await supabase.from('rallies').update({
        status: 'completed',
        winner_pair_ids: pair ? `${pair.player1_id},${pair.player2_id}` : null,
        winner_stats: { matches: winner.matches_played, wins: winner.wins, total: winner.total_points, player1_name: winner.player1_name, player2_name: winner.player2_name },
        announced_at: new Date().toISOString(),
      }).eq('id', rally.id)
      toast.success(`Rally complete! Winner: ${winner.player1_name} & ${winner.player2_name}`)
    } else {
      await supabase.from('rallies').update({ status: 'completed' }).eq('id', rally.id)
      toast.success('Rally marked as complete')
    }
    loadData()
  }

  function pairLabel(pair: RallyMatch['pair_a'] | undefined) {
    if (!pair) return '—'
    return `${pair.player1.name.split(' ')[0]} & ${pair.player2.name.split(' ')[0]}`
  }

  function openEditMatch(m: RallyMatch) {
    setEditMatch({
      matchId: m.id,
      scoreA: m.score_a !== null ? String(m.score_a) : '',
      scoreB: m.score_b !== null ? String(m.score_b) : '',
      winnerPairId: m.winner_pair_id ?? '',
    })
  }

  const groups = ['A', 'B'] as const
  const confirmedCount = matches.filter(m => m.status === 'confirmed').length
  const allDone = matches.length > 0 && confirmedCount === matches.length

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>

  return (
    <div className="min-h-screen animate-page">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <button onClick={() => router.push('/admin')} className="text-gray2"><ChevronLeft size={20} /></button>
        <span className="font-display text-[1.25rem] tracking-wider">Rally Management</span>
      </div>

      {!rally ? (
        <Empty message="No upcoming rally session" sub="Create a rally session in Sessions management" />
      ) : (
        <>
          {/* Rally info */}
          <div className="mx-5 mb-3 bg-dark2 border border-white/7 rounded-2xl p-4">
            <div className="text-[10px] tracking-widest uppercase text-gray2 mb-1">
              {format(new Date((rally.session as unknown as Session).session_date), 'EEEE, MMMM d · yyyy')}
            </div>
            <div className="flex justify-between items-center mb-2">
              <div className="font-display text-[1.2rem]">Rally Session</div>
              <Badge variant={rally.status === 'completed' ? 'success' : rally.status === 'in_progress' ? 'red' : rally.status === 'pairs_generated' ? 'warn' : 'gray'}>
                {rally.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="text-[11px] text-gray2">
              {attendees.length} member{attendees.length !== 1 ? 's' : ''} attending ·{' '}
              {attendees.map(a => a.name.split(' ')[0]).join(', ') || 'No members yet'}
            </div>
          </div>

          {/* Generate pairs */}
          {(rally.status === 'pending' || rally.status === 'pairs_generated') && (
            <div className="mx-5 mb-3">
              <button onClick={handleGeneratePairs} disabled={generating || attendees.length < 2}
                className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                <Zap size={16} />
                {generating ? 'Generating...' : matches.length > 0 ? 'Re-generate Pairs' : 'Generate Pairs & Schedule'}
              </button>
              {attendees.length < 2 && <p className="text-[11px] text-gray text-center mt-1.5">Need at least 2 members attending rally session</p>}
              {matches.length > 0 && <p className="text-[11px] text-gray text-center mt-1.5">Re-generating will clear existing matches</p>}
            </div>
          )}

          {/* Match list per group */}
          {groups.map(group => {
            const groupMatches = matches.filter(m => m.group_name === group)
            if (!groupMatches.length) return null
            return (
              <div key={group} className="mx-5 mb-3">
                <h2 className="font-display text-[1rem] tracking-wider mb-2">Group {group}</h2>
                <div className="bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                  {groupMatches.map((m, i) => (
                    <div key={m.id} className={`px-4 py-3 ${i < groupMatches.length - 1 ? 'border-b border-white/7' : ''}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] text-gray bg-dark3 px-1.5 py-0.5 rounded">#{m.match_order + 1}</span>
                        <Badge variant={m.status === 'confirmed' ? 'success' : m.status === 'submitted' ? 'warn' : 'gray'} className="text-[9px]">
                          {m.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex-1 text-[12px] truncate ${m.winner_pair_id === m.pair_a_id ? 'text-red font-medium' : 'text-gray2'}`}>
                          {pairLabel(m.pair_a)}
                        </span>
                        {m.score_a !== null ? (
                          <span className="font-display text-[.95rem] px-2 text-light">{m.score_a} – {m.score_b}</span>
                        ) : (
                          <span className="text-gray text-[11px] px-2">vs</span>
                        )}
                        <span className={`flex-1 text-right text-[12px] truncate ${m.winner_pair_id === m.pair_b_id ? 'text-red font-medium' : 'text-gray2'}`}>
                          {pairLabel(m.pair_b)}
                        </span>
                        <button onClick={() => openEditMatch(m)} className="text-gray2 ml-1 flex-shrink-0">
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Progress */}
          {matches.length > 0 && (
            <div className="mx-5 mb-3 text-[11px] text-gray2 text-center">
              {confirmedCount}/{matches.length} matches confirmed
              {allDone && <span className="text-success ml-1">— All done!</span>}
            </div>
          )}

          {/* Force complete */}
          {rally.status !== 'completed' && rally.status !== 'pending' && (
            <div className="mx-5 mb-5">
              <button onClick={forceComplete}
                className="w-full bg-dark2 border border-red/35 text-red font-display tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2">
                <Trophy size={16} />
                {allDone ? 'Complete Rally & Announce Winner' : 'Force Complete Rally'}
              </button>
              {!allDone && <p className="text-[11px] text-gray text-center mt-1.5">Only confirmed matches will count toward levels</p>}
            </div>
          )}

          {/* Completed */}
          {rally.status === 'completed' && rally.winner_stats && (
            <div className="mx-5 mb-5 bg-dark2 border border-red/35 rounded-2xl p-4 text-center">
              <Trophy size={20} className="text-red mx-auto mb-2" />
              <div className="font-display text-[1.2rem] mb-1">Rally Complete!</div>
              <div className="text-[12px] text-gray2">
                Winner: {(rally.winner_stats as { player1_name: string; player2_name: string }).player1_name} &amp; {(rally.winner_stats as { player1_name: string; player2_name: string }).player2_name}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit match modal */}
      {editMatch && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2" onClick={() => setEditMatch(null)}>
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-1">Edit Match Result</h2>
            {(() => {
              const m = matches.find(x => x.id === editMatch.matchId)
              return m ? <p className="text-[12px] text-gray2 mb-4">{pairLabel(m.pair_a)} vs {pairLabel(m.pair_b)}</p> : null
            })()}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">
                  {(() => { const m = matches.find(x => x.id === editMatch.matchId); return m ? pairLabel(m.pair_a).split(' ')[0] : 'Pair A' })()}
                </label>
                <input type="number" placeholder="0" min={0} max={30} value={editMatch.scoreA}
                  onChange={e => setEditMatch(prev => prev ? { ...prev, scoreA: e.target.value } : null)} />
              </div>
              <div>
                <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">
                  {(() => { const m = matches.find(x => x.id === editMatch.matchId); return m ? pairLabel(m.pair_b).split(' ')[0] : 'Pair B' })()}
                </label>
                <input type="number" placeholder="0" min={0} max={30} value={editMatch.scoreB}
                  onChange={e => setEditMatch(prev => prev ? { ...prev, scoreB: e.target.value } : null)} />
              </div>
            </div>
            {/* Winner override */}
            {(() => {
              const m = matches.find(x => x.id === editMatch.matchId)
              if (!m) return null
              return (
                <div className="mb-4">
                  <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">Winner (auto from score, or override)</label>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMatch(prev => prev ? { ...prev, winnerPairId: m.pair_a_id } : null)}
                      className={`flex-1 py-2 rounded-lg text-[11px] border ${editMatch.winnerPairId === m.pair_a_id ? 'bg-red text-white border-red' : 'text-gray2 border-white/7'}`}>
                      {pairLabel(m.pair_a).split(' ')[0]}
                    </button>
                    <button onClick={() => setEditMatch(prev => prev ? { ...prev, winnerPairId: m.pair_b_id } : null)}
                      className={`flex-1 py-2 rounded-lg text-[11px] border ${editMatch.winnerPairId === m.pair_b_id ? 'bg-red text-white border-red' : 'text-gray2 border-white/7'}`}>
                      {pairLabel(m.pair_b).split(' ')[0]}
                    </button>
                  </div>
                </div>
              )
            })()}
            <button onClick={saveEditMatch} disabled={saving}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Match Result'}
            </button>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}