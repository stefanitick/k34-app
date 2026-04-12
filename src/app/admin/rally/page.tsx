'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronLeft, Zap, Trophy, Check, AlertTriangle } from 'lucide-react'
import { Badge, Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import { generatePairs, findRallyWinner } from '@/lib/rally'
import type { Rally, RallyMatch, Session, Player } from '@/types'
import toast from 'react-hot-toast'

export default function AdminRallyPage() {
  const router = useRouter()
  const auth = getSession()
  const [rally, setRally] = useState<Rally | null>(null)
  const [matches, setMatches] = useState<RallyMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [announcing, setAnnouncing] = useState(false)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') { router.push('/'); return }
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    // Find upcoming or active rally session
    const { data: rallySession } = await supabase
      .from('sessions')
      .select('*')
      .eq('is_rally', true)
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!rallySession) { setLoading(false); return }

    // Get or create rally record
    let { data: rallyData } = await supabase
      .from('rallies')
      .select('*')
      .eq('session_id', rallySession.id)
      .maybeSingle()

    if (!rallyData) {
      const { data: created } = await supabase
        .from('rallies')
        .insert({ session_id: rallySession.id, status: 'pending' })
        .select()
        .single()
      rallyData = created
    }

    if (rallyData) {
      setRally({ ...rallyData, session: rallySession })

      // Matches
      const { data: matchData } = await supabase
        .from('rally_matches')
        .select(`
          *,
          pair_a:rally_pairs!pair_a_id(*, player1:players!player1_id(name), player2:players!player2_id(name)),
          pair_b:rally_pairs!pair_b_id(*, player1:players!player1_id(name), player2:players!player2_id(name))
        `)
        .eq('rally_id', rallyData.id)
        .order('match_order')
      setMatches((matchData ?? []) as unknown as RallyMatch[])
    }

    setLoading(false)
  }

  async function handleGeneratePairs() {
    if (!rally) return
    setGenerating(true)
    const supabase = createClient()

    // Get attending members
    const { data: attendances } = await supabase
      .from('attendances')
      .select('player_id, player:players(id, name, level)')
      .eq('session_id', (rally.session as unknown as Session).id)
      .eq('type', 'member')
      .eq('status', 'confirmed')

    if (!attendances?.length || attendances.length < 2) {
      toast.error('Need at least 2 members to generate pairs')
      setGenerating(false)
      return
    }

    const players = attendances.map(a => (a.player as unknown as Player))
    const { pairs, matches: matchSchedule } = generatePairs(players)

    // Insert pairs
    const { data: insertedPairs, error: pairErr } = await supabase
      .from('rally_pairs')
      .insert(pairs.map(p => ({ ...p, rally_id: rally.id })))
      .select()

    if (pairErr || !insertedPairs) {
      toast.error('Failed to generate pairs')
      setGenerating(false)
      return
    }

    // Insert matches using real pair IDs
    const matchInserts = matchSchedule.map(m => ({
      rally_id: rally.id,
      group_name: m.group_name,
      pair_a_id: insertedPairs[m.pair_a_slot].id,
      pair_b_id: insertedPairs[m.pair_b_slot].id,
      match_order: m.match_order,
      status: 'pending',
    }))

    const { error: matchErr } = await supabase.from('rally_matches').insert(matchInserts)
    if (matchErr) {
      toast.error('Failed to create match schedule')
      setGenerating(false)
      return
    }

    // Update rally status
    await supabase
      .from('rallies')
      .update({ status: 'pairs_generated' })
      .eq('id', rally.id)

    toast.success(`Generated ${pairs.length} pairs and ${matchInserts.length} matches!`)
    loadData()
    setGenerating(false)
  }

  async function confirmMatch(matchId: string) {
    const supabase = createClient()
    const match = matches.find(m => m.id === matchId)
    if (!match) return

    const { error } = await supabase
      .from('rally_matches')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', matchId)

    if (error) { toast.error('Failed to confirm'); return }

    // Apply level changes
    const pairs = [
      { pair_id: match.pair_a_id, result: match.winner_pair_id === match.pair_a_id ? 'win' : 'loss' as 'win' | 'loss' },
      { pair_id: match.pair_b_id, result: match.winner_pair_id === match.pair_b_id ? 'win' : 'loss' as 'win' | 'loss' },
    ]

    for (const { pair_id, result } of pairs) {
      const { data: pair } = await supabase
        .from('rally_pairs')
        .select('player1_id, player2_id')
        .eq('id', pair_id)
        .single()
      if (!pair) continue

      for (const playerId of [pair.player1_id, pair.player2_id]) {
        const { data: player } = await supabase
          .from('players')
          .select('level')
          .eq('id', playerId)
          .single()
        if (!player) continue

        const change = result === 'win' ? 5 : -5
        const newLevel = Math.min(100, Math.max(0, player.level + change))

        await supabase.from('players').update({ level: newLevel }).eq('id', playerId)
        await supabase.from('level_history').insert({
          player_id: playerId,
          match_id: matchId,
          result,
          level_before: player.level,
          level_change: change,
          level_after: newLevel,
        })
      }
    }

    // Check if all matches confirmed → update rally status
    const { data: allMatches } = await supabase
      .from('rally_matches')
      .select('status')
      .eq('rally_id', rally!.id)

    if (allMatches?.every(m => m.status === 'confirmed')) {
      await supabase.from('rallies').update({ status: 'in_progress' }).eq('id', rally!.id)
    }

    toast.success('Match confirmed & levels updated!')
    loadData()
  }

  async function flagDisputed(matchId: string) {
    const supabase = createClient()
    await supabase.from('rally_matches').update({ status: 'disputed' }).eq('id', matchId)
    toast.success('Marked as disputed')
    loadData()
  }

  async function announceWinner() {
    if (!rally) return
    setAnnouncing(true)
    const supabase = createClient()

    // Get standings
    const { data: standData } = await supabase
      .from('rally_standings')
      .select('*')
      .eq('rally_id', rally.id)

    if (!standData?.length) {
      toast.error('No standings data yet')
      setAnnouncing(false)
      return
    }

    const winner = findRallyWinner(standData as Parameters<typeof findRallyWinner>[0])
    if (!winner) { toast.error('Could not determine winner'); setAnnouncing(false); return }

    const winnerStats = {
      matches: winner.matches_played,
      wins: winner.wins,
      win_pts: winner.win_points,
      game_pts: winner.game_points,
      total: winner.total_points,
      player1_name: winner.player1_name,
      player2_name: winner.player2_name,
    }

    // Get pair player IDs
    const { data: pair } = await supabase
      .from('rally_pairs')
      .select('player1_id, player2_id')
      .eq('id', winner.pair_id)
      .single()

    await supabase.from('rallies').update({
      status: 'completed',
      winner_pair_ids: pair ? `${pair.player1_id},${pair.player2_id}` : null,
      winner_stats: winnerStats,
      announced_at: new Date().toISOString(),
    }).eq('id', rally.id)

    toast.success(`Winner announced: ${winner.player1_name} & ${winner.player2_name}!`)
    loadData()
    setAnnouncing(false)
  }

  function pairLabel(match: RallyMatch, side: 'a' | 'b') {
    const pair = side === 'a'
      ? match.pair_a as unknown as { player1: { name: string }; player2: { name: string } }
      : match.pair_b as unknown as { player1: { name: string }; player2: { name: string } }
    if (!pair) return '—'
    return `${pair.player1.name.split(' ')[0]} & ${pair.player2.name.split(' ')[0]}`
  }

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
          {/* Rally banner */}
          <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-2xl p-4">
            <div className="text-[10px] tracking-widest uppercase text-gray2 mb-1">
              {format(new Date((rally.session as unknown as Session).session_date), 'EEEE, MMMM d · yyyy')}
            </div>
            <div className="flex justify-between items-center">
              <div className="font-display text-[1.2rem]">Rally Session</div>
              <Badge variant={
                rally.status === 'completed' ? 'success'
                : rally.status === 'in_progress' ? 'red'
                : rally.status === 'pairs_generated' ? 'warn'
                : 'gray'
              }>
                {rally.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>

          {/* Generate pairs */}
          {rally.status === 'pending' && (
            <div className="mx-5 mb-3.5">
              <button
                onClick={handleGeneratePairs}
                disabled={generating}
                className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Zap size={16} />
                {generating ? 'Generating...' : 'Generate Pairs & Schedule'}
              </button>
              <p className="text-[11px] text-gray text-center mt-2">
                This will pair attending members by level balance and create the round-robin schedule.
              </p>
            </div>
          )}

          {/* Match list with confirm/dispute */}
          {matches.length > 0 && (
            <>
              <div className="px-5 mb-2.5">
                <h2 className="font-display text-[1.05rem] tracking-wider">
                  Match Results ({matches.filter(m => m.status === 'confirmed').length}/{matches.length} confirmed)
                </h2>
              </div>
              <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                {matches.map(m => (
                  <div key={m.id} className="px-4 py-3 border-b border-white/7 last:border-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] tracking-widest uppercase text-gray bg-dark3 px-1.5 py-0.5 rounded">
                        Group {m.group_name}
                      </span>
                      <Badge variant={
                        m.status === 'confirmed' ? 'success'
                        : m.status === 'submitted' ? 'warn'
                        : m.status === 'disputed' ? 'red'
                        : 'gray'
                      } className="text-[9px]">
                        {m.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] mb-2">
                      <span className={`flex-1 ${m.winner_pair_id === m.pair_a_id ? 'text-red font-medium' : 'text-gray2'}`}>
                        {pairLabel(m, 'a')}
                      </span>
                      {m.score_a !== null ? (
                        <span className="font-display text-[.95rem] text-light">
                          {m.score_a} – {m.score_b}
                        </span>
                      ) : (
                        <span className="text-gray text-[10px]">vs</span>
                      )}
                      <span className={`flex-1 text-right ${m.winner_pair_id === m.pair_b_id ? 'text-red font-medium' : 'text-gray2'}`}>
                        {pairLabel(m, 'b')}
                      </span>
                    </div>
                    {m.status === 'submitted' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => confirmMatch(m.id)}
                          className="flex-1 bg-success/12 text-success border border-success/25 text-[11px] py-1.5 rounded-lg flex items-center justify-center gap-1"
                        >
                          <Check size={12} /> Confirm
                        </button>
                        <button
                          onClick={() => flagDisputed(m.id)}
                          className="flex-1 bg-red/12 text-red border border-red/25 text-[11px] py-1.5 rounded-lg flex items-center justify-center gap-1"
                        >
                          <AlertTriangle size={12} /> Dispute
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Announce winner */}
          {rally.status !== 'completed' && rally.status !== 'pending' && (
            <div className="mx-5 mb-5">
              <button
                onClick={announceWinner}
                disabled={announcing}
                className="w-full bg-dark2 border border-red/35 text-red font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trophy size={16} />
                {announcing ? 'Announcing...' : 'Announce Winner'}
              </button>
              <p className="text-[11px] text-gray text-center mt-1.5">
                Winner = pair with highest total points across all groups.
              </p>
            </div>
          )}

          {/* Already announced */}
          {rally.status === 'completed' && rally.winner_stats && (
            <div className="mx-5 mb-5 bg-dark2 border border-red/35 rounded-2xl p-4 text-center">
              <Trophy size={20} className="text-red mx-auto mb-2" />
              <div className="font-display text-[1.2rem] mb-1">Winner Announced</div>
              <div className="text-[12px] text-gray2">
                {(rally.winner_stats as { player1_name: string; player2_name: string }).player1_name} &amp;{' '}
                {(rally.winner_stats as { player1_name: string; player2_name: string }).player2_name}
              </div>
            </div>
          )}
        </>
      )}

      <div className="h-20" />
    </div>
  )
}
