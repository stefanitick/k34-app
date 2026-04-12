// components/ui/index.tsx
// All reusable base components

import React from 'react'
import type { Grade } from '@/types'
import { gradeColor } from '@/lib/grade'

// ── BUTTON ──────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary', size = 'md', loading, children, className = '', ...props
}: ButtonProps) {
  const base = 'w-full font-display tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-red text-white',
    ghost:   'bg-dark3 text-light border border-white/10',
    danger:  'bg-red/20 text-red border border-red/30',
  }
  const sizes = {
    sm: 'py-2 px-4 text-sm',
    md: 'py-3 px-6 text-base',
    lg: 'py-4 px-8 text-lg',
  }
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}

// ── CARD ────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode
  className?: string
  accent?: boolean
  onClick?: () => void
}

export function Card({ children, className = '', accent, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-dark2 rounded-2xl overflow-hidden
        ${accent ? 'border border-red/35' : 'border border-white/7'}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

// ── BADGE / PILL ─────────────────────────────────────────────
type BadgeVariant = 'success' | 'red' | 'warn' | 'gray' | 'grade'

interface BadgeProps {
  variant?: BadgeVariant
  grade?: Grade
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'gray', grade, children, className = '' }: BadgeProps) {
  const variants: Record<string, string> = {
    success: 'bg-success/12 text-success border border-success/25',
    red:     'bg-red/12 text-red border border-red/25',
    warn:    'bg-warn/12 text-warn border border-warn/25',
    gray:    'bg-dark3 text-gray2 border border-white/7',
    grade:   grade ? gradeColor(grade) : '',
  }
  return (
    <span className={`inline-block text-[10px] font-medium px-2.5 py-[3px] rounded-full border ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

// ── SECTION HEADER ───────────────────────────────────────────
interface SectionHeaderProps {
  title: string
  action?: string
  onAction?: () => void
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  return (
    <div className="flex justify-between items-center px-5 mb-2.5">
      <h2 className="font-display text-[1.05rem] tracking-wider">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-[11px] text-red cursor-pointer">
          {action}
        </button>
      )}
    </div>
  )
}

// ── FIELD ────────────────────────────────────────────────────
interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="mb-3.5">
      <label className="block text-[11px] tracking-widest uppercase text-gray2 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray mt-1.5">{hint}</p>}
    </div>
  )
}

// ── DIVIDER ──────────────────────────────────────────────────
export function Divider() {
  return <div className="h-px bg-white/7" />
}

// ── STAT MINI ────────────────────────────────────────────────
interface StatMiniProps {
  value: string | number
  label: string
  accent?: boolean
}

export function StatMini({ value, label, accent }: StatMiniProps) {
  return (
    <div className="flex-1 bg-dark3 rounded-[10px] p-2.5 px-3">
      <div className={`font-display text-[1.3rem] leading-none ${accent ? 'text-red' : 'text-light'}`}>
        {value}
      </div>
      <div className="text-[9px] text-gray2 tracking-wider uppercase mt-0.5">{label}</div>
    </div>
  )
}

// ── EMPTY STATE ──────────────────────────────────────────────
interface EmptyProps {
  message: string
  sub?: string
}

export function Empty({ message, sub }: EmptyProps) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-gray2 text-sm">{message}</div>
      {sub && <div className="text-gray text-xs mt-1">{sub}</div>}
    </div>
  )
}

// ── SPINNER ──────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-white/10 border-t-red rounded-full animate-spin" />
    </div>
  )
}
