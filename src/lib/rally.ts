import type { Player, GroupName } from '@/types'

interface PairAssignment {
  player1_id: string
  player2_id: string
  group_name: GroupName
  is_double_player: boolean
}

interface MatchSchedule {
  pair_a_index: number
  pair_b_index: number
  group_name: GroupName
  match_order: number
}

/**
 * Generate balanced pairs from a list of players.
 * - Splits into 2 groups with mixed levels (not high vs low)
 * - If odd number of players, one player is flagged to play twice
 * - Within each group, generates full round-robin schedule
 */
export function generatePairs(players: Player[]): {
  pairs: PairAssignment[]
  matches: Omit<MatchSchedule, 'pair_a_index' | 'pair_b_index'> &
    { pair_a_slot: number; pair_b_slot: number }[]
} {
  // Sort by level descending
  const sorted = [...players].sort((a, b) => b.level - a.level)

  let working = [...sorted]
  let doublePlayerId: string | null = null

  // Handle odd number: pick the middle player to play twice
  if (working.length % 2 !== 0) {
    const midIdx = Math.floor(working.length / 2)
    doublePlayerId = working[midIdx].id
    // Add a duplicate entry
    working = [...working, working[midIdx]]
  }

  // Pair up players: pair highest with lowest (snake draft)
  // This ensures each pair has one stronger + one weaker player
  const pairedPlayers: [Player, Player][] = []
  const half = working.length / 2
  for (let i = 0; i < half; i++) {
    pairedPlayers.push([working[i], working[working.length - 1 - i]])
  }

  // Split pairs into 2 groups, alternating assignment for balance
  const groupA: [Player, Player][] = []
  const groupB: [Player, Player][] = []
  pairedPlayers.forEach((pair, idx) => {
    if (idx % 2 === 0) groupA.push(pair)
    else groupB.push(pair)
  })

  // Build pair assignments
  const pairs: PairAssignment[] = []

  groupA.forEach(([p1, p2]) => {
    pairs.push({
      player1_id: p1.id,
      player2_id: p2.id,
      group_name: 'A',
      is_double_player:
        p1.id === doublePlayerId || p2.id === doublePlayerId,
    })
  })

  groupB.forEach(([p1, p2]) => {
    pairs.push({
      player1_id: p1.id,
      player2_id: p2.id,
      group_name: 'B',
      is_double_player:
        p1.id === doublePlayerId || p2.id === doublePlayerId,
    })
  })

  // Generate round-robin matches within each group
  const matches: { pair_a_slot: number; pair_b_slot: number; group_name: GroupName; match_order: number }[] = []
  let order = 0

  const genRoundRobin = (
    pairIndices: number[],
    group: GroupName
  ) => {
    for (let i = 0; i < pairIndices.length; i++) {
      for (let j = i + 1; j < pairIndices.length; j++) {
        matches.push({
          pair_a_slot: pairIndices[i],
          pair_b_slot: pairIndices[j],
          group_name: group,
          match_order: order++,
        })
      }
    }
  }

  const groupAIndices = pairs
    .map((p, i) => (p.group_name === 'A' ? i : -1))
    .filter((i) => i !== -1)
  const groupBIndices = pairs
    .map((p, i) => (p.group_name === 'B' ? i : -1))
    .filter((i) => i !== -1)

  genRoundRobin(groupAIndices, 'A')
  genRoundRobin(groupBIndices, 'B')

  return { pairs, matches }
}

/**
 * Calculate rally points for a pair:
 * Total = (wins × 10) + cumulative game points scored
 */
export function calcRallyScore(
  wins: number,
  gamePoints: number
): number {
  return wins * 10 + gamePoints
}

/**
 * Determine the overall rally winner from standings across all groups.
 * Winner = highest total_points. Tiebreak = most wins.
 */
export function findRallyWinner(
  standings: {
    pair_id: string
    wins: number
    game_points: number
    total_points: number
    player1_name: string
    player2_name: string
    matches_played: number
    win_points: number
  }[]
): typeof standings[0] | null {
  if (standings.length === 0) return null

  return standings.reduce((best, current) => {
    if (current.total_points > best.total_points) return current
    if (current.total_points === best.total_points && current.wins > best.wins)
      return current
    return best
  })
}
