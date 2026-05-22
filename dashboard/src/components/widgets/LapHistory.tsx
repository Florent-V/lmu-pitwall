import { useMemo } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { colors, fonts } from '../../styles/theme'
import type { LapEntry } from '../../stores/telemetryStore'

const purple = '#a855f7'

function fmtLap(s: number): string {
  if (s < 0) return '--:--.---'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

function fmtSec(s: number): string {
  if (s < 0) return '-.---'
  if (s >= 60) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toFixed(3).padStart(6, '0')}`
  }
  return s.toFixed(3)
}

function fmtDelta(delta: number): string {
  if (Math.abs(delta) < 0.0005) return '±0.000'
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(3)}`
}

function getDeltaColor(delta: number | null, isBest: boolean): string {
  if (isBest) return purple
  if (delta === null) return colors.textMuted
  const abs = Math.abs(delta)
  if (abs <= 0.5) return colors.text              // neutre
  if (delta < 0) {
    return abs > 1.5 ? '#16a34a' : '#4ade80'      // vert foncé / vert clair (plus rapide)
  } else {
    return delta > 1.5 ? '#ef4444' : '#eab308'    // rouge / jaune (plus lent)
  }
}

// ── Pace computation ──────────────────────────────────────────
interface PaceStats {
  consistency: number   // 0–100 score based on std dev
  regularity: number    // % of laps within 2s of best
  trend: number         // linear regression slope (s/lap, negative = improving)
  stdDev: number
  count: number
}

function computePaceStats(laps: LapEntry[]): PaceStats | null {
  const valid = laps.filter(l => l.lapTime > 0 && l.lapNumber > 0)
  if (valid.length < 2) return null

  const times = valid.map(l => l.lapTime)
  const n = times.length
  const mean = times.reduce((a, b) => a + b, 0) / n
  const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)

  // Consistency: 100% at 0 std dev, ~60% at 1s std dev
  const consistency = Math.round(Math.max(0, Math.min(100, 100 - stdDev * 40)))

  // Regularity: % of laps within 2s of personal best
  const best = Math.min(...times)
  const regularity = Math.round((times.filter(t => t <= best + 2.0).length / n) * 100)

  // Trend: linear regression slope
  let trend = 0
  if (n >= 3) {
    const xMean = (n - 1) / 2
    const num = times.reduce((a, t, i) => a + (i - xMean) * (t - mean), 0)
    const den = times.reduce((a, _, i) => a + (i - xMean) ** 2, 0)
    trend = den !== 0 ? num / den : 0
  }

  return { consistency, regularity, trend, stdDev, count: n }
}

// ── Pace panel ────────────────────────────────────────────────
function PaceBlock({ label, stats }: { label: string; stats: PaceStats }) {
  const cstColor = stats.consistency >= 90 ? '#22c55e' : stats.consistency >= 70 ? '#eab308' : '#ef4444'
  const regColor = stats.regularity >= 90 ? '#22c55e' : stats.regularity >= 70 ? '#eab308' : '#ef4444'

  const STABLE = 0.05
  let trendArrow = '→'
  let trendColor: string = colors.textMuted
  let trendSign = '±'
  if (stats.trend < -STABLE) { trendArrow = '↗'; trendColor = '#22c55e'; trendSign = '−' }
  else if (stats.trend > STABLE) { trendArrow = '↘'; trendColor = '#ef4444'; trendSign = '+' }
  const trendVal = Math.abs(stats.trend) < 0.001 ? '0.000' : Math.abs(stats.trend).toFixed(3)

  const sep = <span style={{ color: colors.border, margin: '0 3px' }}>·</span>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
      <span style={{ fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, letterSpacing: 1, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {sep}
      <span style={{ fontFamily: fonts.body, fontSize: 11, color: colors.textMuted }}>Cst</span>
      <span style={{ fontFamily: fonts.mono, fontSize: 13, color: cstColor, fontWeight: 700 }}>{stats.consistency}%</span>
      {sep}
      <span style={{ fontFamily: fonts.body, fontSize: 11, color: colors.textMuted }}>Reg</span>
      <span style={{ fontFamily: fonts.mono, fontSize: 13, color: regColor, fontWeight: 700 }}>{stats.regularity}%</span>
      {sep}
      <span style={{ fontFamily: fonts.mono, fontSize: 13, color: trendColor }}>
        {trendArrow} {trendSign}{trendVal}s
      </span>
    </div>
  )
}

function PacePanel({ all, last5 }: { all: PaceStats | null; last5: PaceStats | null }) {
  if (!all) return (
    <div style={{
      padding: '4px 4px',
      borderBottom: `1px solid ${colors.border}`,
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.textMuted,
      letterSpacing: 1,
    }}>
      Not enough laps for pace analysis
    </div>
  )

  return (
    <div style={{
      padding: '5px 4px',
      borderBottom: `1px solid ${colors.border}`,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      overflow: 'hidden',
    }}>
      <span style={{ fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
        Pace
      </span>
      <PaceBlock label={`Global (${all.count})`} stats={all} />
      {last5 && (
        <>
          <span style={{ color: colors.border, alignSelf: 'stretch', borderLeft: `1px solid ${colors.border}` }} />
          <PaceBlock label="Last 5" stats={last5} />
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function LapHistory() {
  const lapHistory = useTelemetryStore((s) => s.lapHistory)

  // Find personal best lap time index (reactive to lapHistory changes)
  const { bestIdx, bestTime } = useMemo(() => {
    let bestIdx = -1
    let bestTime = Infinity
    for (let i = 0; i < lapHistory.length; i++) {
      const t = lapHistory[i].lapTime
      if (t > 0 && t < bestTime) { bestTime = t; bestIdx = i }
    }
    return { bestIdx, bestTime: bestIdx >= 0 ? bestTime : -1 }
  }, [lapHistory])

  // Pace stats
  const { allStats, last5Stats } = useMemo(() => {
    const valid = lapHistory.filter(l => l.lapTime > 0 && l.lapNumber > 0)
    return {
      allStats: computePaceStats(lapHistory),
      last5Stats: computePaceStats(valid.slice(-5)),
    }
  }, [lapHistory])

  // Show newest first
  const rows = [...lapHistory].reverse()

  const colStyle: React.CSSProperties = {
    fontFamily: fonts.mono,
    fontSize: 15,
    textAlign: 'right' as const,
  }

  const GRID = '28px 1fr 1fr 1fr 1fr 1fr'

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Pace analysis panel */}
      <PacePanel all={allStats} last5={last5Stats} />

      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: '0 4px',
        padding: '4px 4px',
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
      }}>
        {['Lap', 'Time', 'S1', 'S2', 'S3', 'Δ Best'].map((h) => (
          <span key={h} style={{
            fontFamily: fonts.body,
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 1,
            textTransform: 'uppercase',
            textAlign: h === 'Lap' ? 'left' : 'right',
          }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontFamily: fonts.body,
            fontSize: 15,
            color: colors.textMuted,
            letterSpacing: 1,
          }}>
            No laps yet
          </div>
        ) : (
          rows.map((entry) => {
            const origIdx = lapHistory.indexOf(entry)
            const isBest = origIdx === bestIdx
            const isOutlap = entry.lapNumber === 0
            const timeColor = isBest ? purple : colors.text

            // Delta vs best
            const delta = (entry.lapTime > 0 && bestTime > 0 && !isBest)
              ? entry.lapTime - bestTime
              : null
            const deltaColor = getDeltaColor(delta, isBest)

            return (
              <div
                key={entry.lapNumber}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  gap: '0 4px',
                  padding: '3px 4px',
                  borderBottom: `1px solid ${colors.border}22`,
                  background: isBest ? `${purple}10` : 'transparent',
                  alignItems: 'center',
                }}
              >
                {/* Lap number */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontFamily: fonts.mono, fontSize: 15, color: colors.textMuted }}>
                    {entry.lapNumber}
                  </span>
                  {isOutlap && (
                    <span style={{
                      fontFamily: fonts.body,
                      fontSize: 9,
                      color: colors.primary,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      background: `${colors.primary}20`,
                      borderRadius: 2,
                      padding: '0 2px',
                    }}>
                      OUT
                    </span>
                  )}
                </div>

                {/* Lap time */}
                <span style={{ ...colStyle, color: timeColor, fontWeight: isBest ? 700 : 400 }}>
                  {fmtLap(entry.lapTime)}
                </span>

                {/* S1 */}
                <span style={{ ...colStyle, color: entry.s1 > 0 ? colors.text : colors.textMuted }}>
                  {fmtSec(entry.s1)}
                </span>

                {/* S2 */}
                <span style={{ ...colStyle, color: entry.s2 > 0 ? colors.text : colors.textMuted }}>
                  {fmtSec(entry.s2)}
                </span>

                {/* S3 */}
                <span style={{ ...colStyle, color: entry.s3 > 0 ? colors.text : colors.textMuted }}>
                  {fmtSec(entry.s3)}
                </span>

                {/* Δ Best */}
                <span style={{ ...colStyle, fontSize: 13, color: deltaColor }}>
                  {isBest ? '±0.000' : delta !== null ? fmtDelta(delta) : '—'}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
