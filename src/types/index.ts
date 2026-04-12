export type Role = 'player' | 'admin'
export type PlayerStatus = 'pending' | 'approved' | 'rejected'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type MembershipStatus = 'pending' | 'approved' | 'rejected'
export type AttendanceType = 'member' | 'incidentil'
export type RallyStatus = 'pending' | 'pairs_generated' | 'in_progress' | 'completed'
export type MatchStatus = 'pending' | 'submitted' | 'confirmed' | 'disputed'
export type GroupName = 'A' | 'B'

export interface Player {
  id: string
  name: string
  phone: string
  origin: string | null
  avatar_url: string | null
  level: number        // only visible to admin
  role: Role
  status: PlayerStatus
  created_at: string
}

export interface PlayerPublic {
  id: string
  name: string
  origin: string | null
  avatar_url: string | null
  grade: Grade         // computed, never shows number
  role: Role
  status: PlayerStatus
}

export interface MembershipPeriod {
  id: string
  month_start: string
  month_end: string
  open_date: string
  close_date: string
  max_slots: number
  is_active: boolean
}

export interface Membership {
  id: string
  player_id: string
  period_id: string
  status: MembershipStatus
  payment_proof_url: string | null
  registered_at: string
  approved_at: string | null
  approved_by: string | null
  period?: MembershipPeriod
  player?: PlayerPublic
}

export interface Session {
  id: string
  session_date: string
  start_time: string
  end_time: string
  location: string
  is_rally: boolean
  max_attendance: number
  registration_closes_at: string
  attendance_count?: number
  user_registered?: boolean
  user_type?: AttendanceType
}

export interface Attendance {
  id: string
  session_id: string
  player_id: string
  type: AttendanceType
  status: 'confirmed' | 'cancelled'
  payment_proof_url: string | null
  added_by_admin: boolean
  registered_at: string
  player?: PlayerPublic
}

export interface Rally {
  id: string
  session_id: string
  status: RallyStatus
  winner_pair_ids: string | null
  winner_stats: WinnerStats | null
  announced_at: string | null
  session?: Session
  pairs?: RallyPair[]
}

export interface WinnerStats {
  matches: number
  wins: number
  win_pts: number
  game_pts: number
  total: number
  player1_name: string
  player2_name: string
}

export interface RallyPair {
  id: string
  rally_id: string
  player1_id: string
  player2_id: string
  group_name: GroupName
  is_double_player: boolean
  player1?: PlayerPublic
  player2?: PlayerPublic
  // standings (from view)
  matches_played?: number
  wins?: number
  win_points?: number
  game_points?: number
  total_points?: number
}

export interface RallyMatch {
  id: string
  rally_id: string
  group_name: GroupName
  pair_a_id: string
  pair_b_id: string
  score_a: number | null
  score_b: number | null
  winner_pair_id: string | null
  status: MatchStatus
  submitted_by: string | null
  submitted_at: string | null
  match_order: number | null
  pair_a?: RallyPair
  pair_b?: RallyPair
}

export interface LevelHistory {
  id: string
  player_id: string
  match_id: string | null
  result: 'win' | 'loss'
  level_before: number
  level_change: number
  level_after: number
  created_at: string
  match?: RallyMatch
}

// Auth session stored in localStorage
export interface AuthSession {
  player_id: string
  name: string
  phone: string
  role: Role
  status: PlayerStatus
  grade: Grade
}
