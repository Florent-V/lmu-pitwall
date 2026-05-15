import { useRef, useMemo, useEffect } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { colors, fonts } from '../../styles/theme'

const WINDOW = 3

type Trend = 'gaining' | 'losing' | 'stable'

function fmtLap(s: number): string {
  if (s <= 0) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

function fmtGap(gap: number): string {
  const sign = gap >= 0 ? '+' : ''
  return `${sign}${gap.toFixed(3)}s`
}

function trendIcon(t: Trend): string {
  return t === 'gaining' ? '↑' : t === 'losing' ? '↓' : ''
}

function trendColor(t: Trend): string {
  return t === 'gaining' ? '#22c55e' : t === 'losing' ? '#ef4444' : colors.textMuted
}

export default function RelativeTiming() {
  const vehicles = useTelemetryStore((s) => s.scoring.vehicles)
  const playerId = useTelemetryStore((s) => s.scoring.player_vehicle_id)

  const prevGapsRef = useRef<Map<number, number>>(new Map())

  const player = useMemo(
    () => vehicles.find((v) => v.id === playerId),
    [vehicles, playerId],
  )

  const sameClassSorted = useMemo(() => {
    if (!player) return []
    return [...vehicles]
      .filter((v) => v.vehicle_class === player.vehicle_class)
      .sort((a, b) => a.position - b.position)
  }, [vehicles, player])

  const classPos = useMemo(() => {
    const map = new Map<number, number>()
    sameClassSorted.forEach((v, i) => map.set(v.id, i + 1))
    return map
  }, [sameClassSorted])

  const rows = useMemo(() => {
    const playerIndex = sameClassSorted.findIndex((v) => v.id === playerId)
    if (playerIndex === -1) return []
    const from = Math.max(0, playerIndex - WINDOW)
    const to = Math.min(sameClassSorted.length - 1, playerIndex + WINDOW)
    return sameClassSorted.slice(from, to + 1)
  }, [sameClassSorted, playerId])

  const enriched = useMemo(() => {
    if (!player) return []
    return rows.map((v) => {
      const isPlayer = v.id === playerId
      if (isPlayer) return { v, gap: 0, isPlayer, trend: 'stable' as Trend }
      // positive gap = v is ahead (player is X seconds behind them)
      // negative gap = v is behind (they are X seconds behind player)
      const gap = player.time_behind_leader - v.time_behind_leader
      const prev = prevGapsRef.current.get(v.id)
      let trend: Trend = 'stable'
      if (prev !== undefined) {
        const delta = gap - prev
        if (Math.abs(delta) > 0.001) trend = delta < 0 ? 'gaining' : 'losing'
      }
      return { v, gap, isPlayer, trend }
    })
  }, [rows, player, playerId])

  useEffect(() => {
    for (const { v, gap, isPlayer } of enriched) {
      if (!isPlayer) prevGapsRef.current.set(v.id, gap)
    }
  }, [enriched])

  if (!player || enriched.length === 0) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: colors.textMuted, fontFamily: fonts.body, fontSize: 15,
      }}>
        Waiting for session…
      </div>
    )
  }

  const W_POS  = 32
  const W_NUM  = 36
  const W_LAST = 76
  const W_GAP  = 80
  const W_TREND = 16

  const colHdr = (label: string, width: number, right = false) => (
    <span style={{
      fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted,
      width, textAlign: right ? 'right' : 'left', flexShrink: 0,
    }}>
      {label}
    </span>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 6, borderBottom: `1px solid ${colors.border}`, marginBottom: 4,
      }}>
        <span style={{ fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>
          Relative
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted }}>
          {player.vehicle_class}
        </span>
      </div>

      {/* Column header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 6px 3px', marginBottom: 2,
        borderBottom: `1px solid ${colors.border}33`,
      }}>
        {colHdr('POS', W_POS)}
        {colHdr('#', W_NUM, true)}
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted, flex: 1 }}>DRIVER</span>
        {colHdr('LAST LAP', W_LAST, true)}
        {colHdr('GAP', W_GAP, true)}
        <span style={{ width: W_TREND, flexShrink: 0 }} />
      </div>

      {/* Rows centered vertically */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        {enriched.map(({ v, gap, isPlayer, trend }) => (
          <div key={v.id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 6px', borderRadius: 4,
            background: isPlayer ? `${colors.primary}18` : 'transparent',
            borderLeft: isPlayer ? `2px solid ${colors.primary}` : '2px solid transparent',
          }}>
            {/* Class position */}
            <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted, width: W_POS, flexShrink: 0 }}>
              P{classPos.get(v.id) ?? v.position}
            </span>

            {/* Car number */}
            <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.primary, width: W_NUM, textAlign: 'right', flexShrink: 0 }}>
              #{v.car_number}
            </span>

            {/* Driver name */}
            <span style={{
              fontFamily: fonts.body, fontSize: 15,
              color: isPlayer ? colors.primary : colors.text,
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}>
              {isPlayer ? `★ ${v.driver_name || `Car #${v.id}`}` : (v.driver_name || `Car #${v.id}`)}
            </span>

            {/* PIT badge */}
            {v.in_pits && (
              <span style={{
                fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
                color: '#f97316', background: '#f9731622', border: '1px solid #f9731666',
                borderRadius: 3, padding: '1px 4px', flexShrink: 0, lineHeight: 1.4,
              }}>PIT</span>
            )}

            {/* Last lap time */}
            <span style={{
              fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted,
              width: W_LAST, textAlign: 'right', flexShrink: 0,
            }}>
              {fmtLap(v.last_lap_time)}
            </span>

            {/* Relative gap */}
            <span style={{
              fontFamily: fonts.mono, fontSize: 13,
              color: isPlayer ? colors.textMuted : trendColor(trend),
              width: W_GAP, textAlign: 'right', flexShrink: 0,
            }}>
              {isPlayer ? '—' : fmtGap(gap)}
            </span>

            {/* Trend arrow */}
            <span style={{
              fontFamily: fonts.mono, fontSize: 14, fontWeight: 700,
              color: trendColor(trend),
              width: W_TREND, textAlign: 'center', flexShrink: 0,
            }}>
              {isPlayer ? '' : trendIcon(trend)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
