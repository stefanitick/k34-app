import type { Grade } from '@/types'

export function getGrade(level: number): Grade {
  if (level >= 85) return 'A'
  if (level >= 70) return 'B'
  if (level >= 55) return 'C'
  if (level >= 40) return 'D'
  if (level >= 25) return 'E'
  return 'F'
}

export function gradeColor(grade: Grade): string {
  const map: Record<Grade, string> = {
    A: 'text-red-400 bg-red-400/10 border-red-400/20',
    B: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    C: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    D: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    E: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
    F: 'text-zinc-600 bg-zinc-600/10 border-zinc-600/20',
  }
  return map[grade]
}

export function applyLevelChange(
  current: number,
  result: 'win' | 'loss'
): number {
  const change = result === 'win' ? 5 : -5
  return Math.min(100, Math.max(0, current + change))
}

export function formatPhone(phone: string): string {
  // Show first 4 and last 2 digits only: 0812****90
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}
