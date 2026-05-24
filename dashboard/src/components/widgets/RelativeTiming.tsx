import { useMemo, useRef } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { colors, fonts } from '../../styles/theme'

const WINDOW = 3

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

function fmtDelta(delta: number): string {
    const sign = delta >= 0 ? '+' : ''
    return `${sign}${delta.toFixed(3)}`
}

/**
 * delta semantics: positive = the car is moving AWAY from player.
 *   Ahead + moving away  → bad  → red
 *   Behind + moving away → good → green
 */
function deltaColor(delta: number, isAhead: boolean): string {
    if (Math.abs(delta) < 0.001) return colors.textMuted
    if (isAhead) return delta > 0 ? '#ef4444' : '#22c55e'
    return delta > 0 ? '#22c55e' : '#ef4444'
}

// ── Sector snapshot stored in a ref — no extra re-render on sector change ─────
interface SectorRef {
    key: string
    gaps: Map<number, number>
    display: Map<number, { delta: number | null }>
}

export default function RelativeTiming() {
    const vehicles = useTelemetryStore((s) => s.scoring.vehicles)
    const playerId = useTelemetryStore((s) => s.scoring.player_vehicle_id)

    const sectorRef = useRef<SectorRef>({ key: '', gaps: new Map(), display: new Map() })

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
        const to   = Math.min(sameClassSorted.length - 1, playerIndex + WINDOW)
        return sameClassSorted.slice(from, to + 1)
    }, [sameClassSorted, playerId])

    const laptimeEst = useMemo(() => {
        if (!player) return 0
        return player.estimated_lap_time > 0 ? player.estimated_lap_time
             : player.best_lap_time > 0      ? player.best_lap_time
             : player.last_lap_time > 0      ? player.last_lap_time : 0
    }, [player])

    // ── Live gap via time_behind_leader ────────────────────────────────────────
    // gap > 0: v is AHEAD of player (v is closer to the overall leader).
    // gap < 0: v is BEHIND player.
    //
    // Using time_behind_leader diff rather than the time_into_lap modulo avoids
    // two problems: (1) the S/F transient that triggered false "+1 L" displays
    // when cars separated by >15% of lap time crossed the line; (2) multi-class
    // contamination — the leader component cancels out for same-class cars.
    //
    // "+N L" / "-N L" is shown only when |gap| > 85% of lap time, meaning the
    // car is genuinely a full lap (or more) down/up in class.
    const enriched = useMemo(() => {
        if (!player) return []

        return rows.map((v) => {
            const isPlayer = v.id === playerId

            let gap = 0
            let showLapDiff = false
            let lapCount = 0

            if (!isPlayer) {
                // positive = v is ahead (v has smaller time_behind_leader)
                gap = player.time_behind_leader - v.time_behind_leader

                if (laptimeEst > 0 && Math.abs(gap) > laptimeEst * 0.85) {
                    showLapDiff = true
                    // gap > 0 → v laps player → v is N laps ahead → "-N L"
                    // gap < 0 → player laps v → v is N laps behind → "+N L"
                    lapCount = Math.round(gap / laptimeEst)
                }
            }

            return { v, gap, isPlayer, showLapDiff, lapCount }
        })
    }, [rows, player, playerId, laptimeEst])

    // ── Sector snapshot — ΔSECT only ──────────────────────────────────────────
    // Mutate the ref directly: no setSomething, no extra render per sector.
    if (player) {
        const sectorKey = `${player.total_laps}|${player.cur_sector1 > 0 ? '1' : 'x'}|${player.cur_sector2 > 0 ? '1' : 'x'}`
        const ref = sectorRef.current

        if (sectorKey !== ref.key) {
            const isFirst = ref.key === ''
            const newGaps: Map<number, number> = new Map()
            const newDisplay: Map<number, { delta: number | null }> = new Map()

            for (const { v, gap, isPlayer } of enriched) {
                if (isPlayer) continue
                newGaps.set(v.id, gap)

                let delta: number | null = null
                if (!isFirst) {
                    const prevGap = ref.gaps.get(v.id)
                    if (prevGap !== undefined) {
                        const rawDelta = gap - prevGap
                        // Normalise: positive delta = car moving AWAY from player.
                        const isAhead = gap > 0
                        delta = isAhead ? rawDelta : -rawDelta
                    }
                }
                newDisplay.set(v.id, { delta })
            }
            sectorRef.current = { key: sectorKey, gaps: newGaps, display: newDisplay }
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────
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

    const W_POS   = 32
    const W_NUM   = 36
    const W_LAST  = 76
    const W_GAP   = 80
    const W_DELTA = 68

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

            {/* Column headers */}
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
                {colHdr('ΔSECT', W_DELTA, true)}
            </div>

            {/* Rows */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                {enriched.map(({ v, gap, isPlayer, showLapDiff, lapCount }) => {
                    const sd = sectorRef.current.display.get(v.id)
                    const delta = sd?.delta ?? null
                    const isAhead = gap > 0

                    function gapLabel(): string {
                        if (isPlayer) return '—'
                        if (showLapDiff) return lapCount > 0 ? `-${lapCount} L` : `+${Math.abs(lapCount)} L`
                        return fmtGap(gap)
                    }

                    const gapColor = isPlayer   ? colors.textMuted
                        : showLapDiff           ? '#a855f7'
                        :                         colors.text

                    return (
                        <div key={v.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 6px', borderRadius: 4,
                            background: isPlayer ? `${colors.primary}18` : 'transparent',
                            borderLeft: isPlayer ? `2px solid ${colors.primary}` : '2px solid transparent',
                        }}>
                            <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted, width: W_POS, flexShrink: 0 }}>
                                P{classPos.get(v.id) ?? v.position}
                            </span>

                            <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.primary, width: W_NUM, textAlign: 'right', flexShrink: 0 }}>
                                #{v.car_number}
                            </span>

                            <span style={{
                                fontFamily: fonts.body, fontSize: 15,
                                color: isPlayer ? colors.primary : colors.text,
                                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                            }}>
                                {isPlayer ? `★ ${v.driver_name || `Car #${v.id}`}` : (v.driver_name || `Car #${v.id}`)}
                            </span>

                            {v.in_pits && (
                                <span style={{
                                    fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
                                    color: '#f97316', background: '#f9731622', border: '1px solid #f9731666',
                                    borderRadius: 3, padding: '1px 4px', flexShrink: 0, lineHeight: 1.4,
                                }}>PIT</span>
                            )}

                            <span style={{
                                fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted,
                                width: W_LAST, textAlign: 'right', flexShrink: 0,
                            }}>
                                {fmtLap(v.last_lap_time)}
                            </span>

                            {/* GAP — live, continuous via time_behind_leader diff */}
                            <span style={{
                                fontFamily: fonts.mono, fontSize: 13, fontWeight: 600,
                                color: gapColor,
                                width: W_GAP, textAlign: 'right', flexShrink: 0,
                            }}>
                                {gapLabel()}
                            </span>

                            {/* ΔSECT — frozen at sector boundaries */}
                            <span style={{
                                fontFamily: fonts.mono, fontSize: 13, fontWeight: 600,
                                color: (isPlayer || delta === null) ? colors.textMuted : deltaColor(delta, isAhead),
                                width: W_DELTA, textAlign: 'right', flexShrink: 0,
                            }}>
                                {isPlayer || delta === null ? '—' : fmtDelta(delta)}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
