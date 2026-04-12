'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { AppBar } from '@/components/layout/AppBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Badge, Spinner, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/auth'
import type { Rally, RallyMatch, RallyPair, GroupName } from '@/types'
import { getGrade } from '@/lib/grade'
import toast from 'react-hot-toast'

interface Standing {
  pair_id: string
  group_name: GroupName
  player1_name: string
  player2_name: string
  player1_grade: string
  player2_grade: string
  matches_played: number
  wins: number
  win_points: number
  game_points: number
  total_points: number
}

export default function RallyPage() {
  const auth = getSession()
  const [rally, setRally] = useState<Rally | null>(null)
  const [matches, setMatches] = useState<RallyMatch[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [pastRallies, setPastRallies] = useState<(Rally & { month_label: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [scoreModal, setScoreModal] = useState<RallyMatch | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<GroupName>('A')
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()

    // Latest active or pending rally
    const { data: rallyData } = await supabase
      .from('rallies')
      .select('*, session:sessions(*)')
      .in('status', ['pending', 'pairs_generated', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (rallyData) {
      setRally(rallyData)

      // Matches with pairs
      const { data: matchData } = await supabase
        .from('rally_matches')
        .select(`
          *,
          pair_a:rally_pairs!pair_a_id(*, player1:players!player1_id(name,level), player2:players!player2_id(name,level)),
          pair_b:rally_pairs!pair_b_id(*, player1:players!player1_id(name,level), player2:players!player2_id(name,level))
        `)
        .eq('rally_id', rallyData.id)
        .order('match_order', { ascending: true })
      setMatches((matchData ?? []) as unknown as RallyMatch[])

      // Standings from view
      const { data: standData } = await supabase
        .from('rally_standings')
        .select('*')
        .eq('rally_id', rallyData.id)
        .order('total_points', { ascending: false })
      setStandings((standData ?? []) as Standing[])
    }

    // Past completed rallies
    const { data: past } = await supabase
      .from('rallies')
      .select('*, session:sessions(session_date)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(6)
    setPastRallies((past ?? []).map(r => ({
      ...r,
      month_label: format(new Date((r.session as { session_date: string }).session_date), 'MMMM yyyy'),
    })))

    setLoading(false)
  }

  async function submitScore() {
    if (!scoreModal || !auth) return
    const a = parseInt(scoreA)
    const b = parseInt(scoreB)
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) {
      toast.error('Enter valid scores')
      return
    }
    if (a === b) {
      toast.error('No draws in badminton — one side must win')
      return
    }
    setSubmitting(true)
    const supabase = createClient()
    const winnerPairId = a > b ? scoreModal.pair_a_id : scoreModal.pair_b_id

    const { error } = await supabase
      .from('rally_matches')
      .update({
        score_a: a,
        score_b: b,
        winner_pair_id: winnerPairId,
        status: 'submitted',
        submitted_by: auth.player_id,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', scoreModal.id)

    if (error) {
      toast.error('Failed to submit score')
    } else {
      toast.success('Score submitted! Admin will confirm.')
      setScoreModal(null)
      setScoreA('')
      setScoreB('')
      loadData()
    }
    setSubmitting(false)
  }

  function pairName(pair: RallyPair | undefined) {
    if (!pair) return '—'
    const p1 = (pair as unknown as { player1: { name: string }; player2: { name: string } })
    return `${p1.player1.name.split(' ')[0]} & ${p1.player2.name.split(' ')[0]}`
  }

  function pairGrades(pair: RallyPair | undefined) {
    if (!pair) return ''
    const p = pair as unknown as { player1: { level: number }; player2: { level: number } }
    return `Grade ${getGrade(p.player1.level)} · ${getGrade(p.player2.level)}`
  }

  const groups: GroupName[] = ['A', 'B']

  return (
    <div className="min-h-screen animate-page">
      <AppBar title="Rally" />

      {loading ? <Spinner /> : (
        <>
          {/* Active rally banner */}
          {rally ? (
            <div className="mx-5 mb-3.5 bg-dark2 border border-red/30 rounded-2xl p-4 text-center relative overflow-hidden">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[-16px] font-display text-[5rem] text-red/5 whitespace-nowrap pointer-events-none">RALLY</div>
              <div className="text-[9px] tracking-[.2em] uppercase text-red mb-1">Monthly Rally</div>
              <div className="font-display text-[1.45rem] mb-0.5">
                {format(new Date((rally.session as unknown as { session_date: string }).session_date), 'EEEE, MMMM d · yyyy')}
              </div>
              <div className="text-[11px] text-gray2 mb-2.5">
                {standings.length > 0
                  ? `${standings.length} pairs · 2 groups`
                  : 'Pairs not generated yet'}
              </div>
              <Badge
                variant={
                  rally.status === 'in_progress' ? 'red'
                  : rally.status === 'pairs_generated' ? 'warn'
                  : 'gray'
                }
              >
                {rally.status === 'in_progress' ? 'In Progress'
                  : rally.status === 'pairs_generated' ? 'Pairs Ready'
                  : 'Upcoming'}
              </Badge>
            </div>
          ) : (
            <div className="mx-5 mb-3.5 bg-dark2 border border-white/7 rounded-2xl p-4 text-center">
              <div className="text-[12px] text-gray2">No active rally this month</div>
            </div>
          )}

          {/* Match results by group */}
          {rally && matches.length > 0 && groups.map(group => {
            const groupMatches = matches.filter(m => m.group_name === group)
            if (!groupMatches.length) return null
            const isExpanded = expandedGroup === group

            return (
              <div key={group} className="mx-5 mb-3">
                {/* Group header */}
                <button
                  className="w-full flex items-center justify-between mb-2"
                  onClick={() => setExpandedGroup(isExpanded ? (group === 'A' ? 'B' : 'A') : group)}
                >
                  <h2 className="font-display text-[1.05rem] tracking-wider">Group {group}</h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray2">{groupMatches.length} matches</span>
                    {isExpanded ? <ChevronUp size={14} className="text-gray2" /> : <ChevronDown size={14} className="text-gray2" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-dark2 border border-white/7 rounded-[14px] overflow-hidden mb-2">
                    <div className="flex justify-between items-center px-3.5 py-2 bg-dark3 border-b border-white/7">
                      <span className="font-display text-[.95rem] tracking-wider">Match Results</span>
                      <Badge variant={groupMatches.every(m => m.status === 'confirmed') ? 'success' : 'warn'}>
                        {groupMatches.filter(m => m.status === 'confirmed').length}/{groupMatches.length} done
                      </Badge>
                    </div>
                    {groupMatches.map((m) => (
                      <div key={m.id} className="flex items-center px-3.5 py-2.5 border-b border-white/7 last:border-0 gap-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate">{pairName(m.pair_a as unknown as RallyPair)}</div>
                          <div className="text-[10px] text-gray2">{pairGrades(m.pair_a as unknown as RallyPair)}</div>
                        </div>
                        {m.status === 'confirmed' || m.status === 'submitted' ? (
                          <>
                            <div className={`font-display text-[.9rem] px-1.5 py-1 rounded-md ${m.winner_pair_id === m.pair_a_id ? 'bg-red/15 text-red' : 'text-gray2'}`}>
                              {m.score_a}
                            </div>
                            <div className="text-[10px] text-gray px-0.5">–</div>
                            <div className={`font-display text-[.9rem] px-1.5 py-1 rounded-md ${m.winner_pair_id === m.pair_b_id ? 'bg-red/15 text-red' : 'text-gray2'}`}>
                              {m.score_b}
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] text-gray px-1">VS</div>
                        )}
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-[12px] font-medium truncate">{pairName(m.pair_b as unknown as RallyPair)}</div>
                          <div className="text-[10px] text-gray2">{pairGrades(m.pair_b as unknown as RallyPair)}</div>
                        </div>
                        {m.status === 'pending' && auth && (
                          <button
                            onClick={() => setScoreModal(m)}
                            className="ml-1.5 text-[10px] text-red bg-red/12 border-none rounded-md px-2.5 py-1 flex-shrink-0"
                          >
                            Input
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Overall standings */}
          {standings.length > 0 && (
            <>
              <div className="flex justify-between items-center px-5 mb-2.5">
                <h2 className="font-display text-[1.05rem] tracking-wider">Overall Standings</h2>
              </div>
              <div className="mx-5 mb-2 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                {/* Header */}
                <div className="flex px-3.5 py-2 border-b border-white/7">
                  <span className="flex-1 text-[9px] tracking-wider uppercase text-gray">Pair</span>
                  {['M', 'W', 'Pts', 'Total'].map(h => (
                    <span key={h} className="w-[34px] text-center text-[9px] tracking-wider uppercase text-gray">{h}</span>
                  ))}
                </div>
                {standings.map((s, i) => (
                  <div key={s.pair_id} className={`flex items-center px-3.5 py-2.5 border-b border-white/7 last:border-0 ${i === 0 ? 'bg-red/4' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium truncate">
                          {s.player1_name.split(' ')[0]} &amp; {s.player2_name.split(' ')[0]}
                        </span>
                        {i === 0 && <Trophy size={10} className="text-red flex-shrink-0" />}
                      </div>
                      <div className="text-[10px] text-gray2">Group {s.group_name} · Grade {s.player1_grade}·{s.player2_grade}</div>
                    </div>
                    <span className="w-[34px] text-center font-display text-[1rem]">{s.matches_played}</span>
                    <span className={`w-[34px] text-center font-display text-[1rem] ${s.wins > 0 ? 'text-red' : ''}`}>{s.wins}</span>
                    <span className="w-[34px] text-center font-display text-[1rem]">{s.win_points}</span>
                    <span className={`w-[34px] text-center font-display text-[1rem] ${i === 0 ? 'text-red' : ''}`}>{s.total_points}</span>
                  </div>
                ))}
              </div>
              <p className="px-5 text-[10px] text-gray leading-relaxed mb-4">
                M = Matches · W = Wins · Pts = Win pts (×10) · Total = Pts + game score. Highest total = rally winner.
              </p>
            </>
          )}

          {/* Past rallies */}
          {pastRallies.length > 0 && (
            <>
              <div className="flex justify-between items-center px-5 mb-2.5">
                <h2 className="font-display text-[1.05rem] tracking-wider">Past Rallies</h2>
              </div>
              <div className="mx-5 mb-5 bg-dark2 border border-white/7 rounded-[14px] overflow-hidden">
                {pastRallies.map((r) => {
                  const s = r.winner_stats
                  if (!s) return null
                  return (
                    <div key={r.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/7 last:border-0">
                      <div className="w-7 h-7 bg-red/12 rounded-full flex items-center justify-center flex-shrink-0">
                        <Trophy size={12} className="text-red" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium">{r.month_label}</div>
                        <div className="text-[11px] text-gray2 truncate">
                          {s.player1_name.split(' ')[0]} &amp; {s.player2_name.split(' ')[0]} · {s.wins}W · {s.total} pts
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {!rally && pastRallies.length === 0 && (
            <Empty message="No rally data yet" sub="Rally happens every first Thursday of the month" />
          )}
        </>
      )}

      <div className="h-20" />
      <BottomNav />

      {/* Score input modal */}
      {scoreModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end max-w-[390px] left-1/2 -translate-x-1/2"
          onClick={() => setScoreModal(null)}
        >
          <div className="bg-dark2 rounded-t-[20px] px-5 pt-5 pb-10 animate-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-white/10 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-[1.2rem] tracking-wider mb-1">Input Match Score</h2>
            <p className="text-[12px] text-gray2 mb-4">
              {pairName(scoreModal.pair_a as unknown as RallyPair)} vs {pairName(scoreModal.pair_b as unknown as RallyPair)}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">
                  {pairName(scoreModal.pair_a as unknown as RallyPair).split(' ')[0]}
                </label>
                <input type="number" placeholder="0" min={0} max={30}
                  value={scoreA} onChange={e => setScoreA(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">
                  {pairName(scoreModal.pair_b as unknown as RallyPair).split(' ')[0]}
                </label>
                <input type="number" placeholder="0" min={0} max={30}
                  value={scoreB} onChange={e => setScoreB(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-gray mb-4 text-center">Admin will confirm the result. Both sides should agree.</p>
            <button
              onClick={submitScore}
              disabled={submitting}
              className="w-full bg-red text-white font-display tracking-wider py-3.5 rounded-xl text-base disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Score'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
