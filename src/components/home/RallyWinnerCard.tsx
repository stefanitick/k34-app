import { Trophy } from 'lucide-react'
import type { Rally } from '@/types'

interface RallyWinnerCardProps {
  rally: Rally & { month_label: string }
}

export function RallyWinnerCard({ rally }: RallyWinnerCardProps) {
  const s = rally.winner_stats
  if (!s) return null

  return (
    <div className="mx-5 mb-3.5 rounded-2xl overflow-hidden border border-red/35 bg-dark2">
      {/* Header */}
      <div className="bg-red/10 px-4 py-2.5 flex items-center gap-2 border-b border-red/15">
        <div className="w-7 h-7 bg-red/12 rounded-full flex items-center justify-center flex-shrink-0">
          <Trophy size={13} className="text-red" strokeWidth={1.5} />
        </div>
        <span className="text-[11px] text-red font-medium">
          {rally.month_label} Rally Winner
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        <div className="text-[10px] tracking-widest uppercase text-gray2 mb-1.5">
          Champion Pair
        </div>
        <div className="font-display text-[1.25rem] tracking-wider mb-2.5">
          {s.player1_name} &amp; {s.player2_name}
        </div>

        {/* Stats */}
        <div className="flex gap-2 mb-2.5">
          {[
            { val: s.matches, label: 'Matches' },
            { val: s.wins,    label: 'Wins'    },
            { val: s.total,   label: 'Total Pts' },
          ].map(({ val, label }) => (
            <div key={label} className="flex-1 bg-dark3 rounded-[9px] py-2 px-2.5 text-center">
              <div className="font-display text-[1.2rem] text-red leading-none">{val}</div>
              <div className="text-[9px] text-gray2 tracking-wider uppercase mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Formula note */}
        <div className="pt-2.5 border-t border-white/7 text-[11px] text-gray2 leading-relaxed">
          Winner of {rally.month_label} Rally · {s.wins} Win{s.wins !== 1 ? 's' : ''} · Total Score {s.total} pts
          <br />
          <span className="text-gray">({s.win_pts} win pts + {s.game_pts} game pts)</span>
        </div>
      </div>
    </div>
  )
}
