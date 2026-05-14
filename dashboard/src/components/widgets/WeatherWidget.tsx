import { Sun, CloudSun, Cloud, CloudRain, CloudLightning } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { colors, fonts } from '../../styles/theme'
import type { WeatherForecastNode } from '../../types/telemetry'

// ---------------------------------------------------------------------------
// Unified weather icon resolver — shared by main widget and forecast
// ---------------------------------------------------------------------------

interface WeatherIconDef {
  Icon: LucideIcon
  color: string
}

function resolveWeatherIcon(rainValue: number, skyType?: number): WeatherIconDef {
  // skyType 0–10: 0=clear, 10=heavy storm
  // rainValue: current intensity (0–1) or forecast chance (0–1)
  const sky = skyType ?? (rainValue > 0.5 ? 9 : rainValue > 0.2 ? 6 : rainValue > 0.05 ? 3 : 0)

  if (rainValue > 0.6 || sky >= 9)  return { Icon: CloudLightning, color: '#f97316' }  // storm
  if (rainValue > 0.25 || sky >= 7) return { Icon: CloudRain,      color: '#60a5fa' }  // rain
  if (rainValue > 0.05 || sky >= 5) return { Icon: Cloud,          color: '#9ca3af' }  // overcast
  if (sky >= 2)                     return { Icon: CloudSun,        color: '#94a3b8' }  // partly cloudy
  return                                   { Icon: Sun,             color: '#facc15' }  // clear
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempColor(temp: number, isTrack: boolean): string {
  const cold = isTrack ? 20 : 12
  const hot  = isTrack ? 50 : 35
  if (temp <= cold) return '#60a5fa'
  if (temp >= hot)  return colors.accent
  return colors.success
}

function RainBar({ value }: { value: number }) {
  const color = value > 0.5 ? '#60a5fa' : value > 0.1 ? '#93c5fd' : colors.textMuted
  return (
    <div style={{ width: '100%', height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${value * 100}%`, height: '100%',
        background: color, borderRadius: 2,
        transition: 'width 0.5s, background 0.5s',
      }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Forecast panel — 5 nodes
// ---------------------------------------------------------------------------

const FORECAST_LABELS = ['NOW', '25%', '50%', '75%', 'END']

function ForecastPanel({ nodes, toDisplayTemp, tempLabel }: {
  nodes: WeatherForecastNode[]
  toDisplayTemp: (c: number) => number
  tempLabel: string
}) {
  if (nodes.length === 0) return null

  return (
    <div>
      <div style={{
        fontFamily: fonts.body, fontSize: 11, color: colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5,
      }}>
        Forecast
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {nodes.map((node, i) => {
          const { Icon, color } = resolveWeatherIcon(node.rain_chance, node.sky_type)
          const rainColor = node.rain_chance > 0.5 ? '#60a5fa'
            : node.rain_chance > 0.2 ? '#93c5fd'
            : colors.textMuted
          return (
            <div key={i} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              background: '#111', borderRadius: 4,
              padding: '5px 2px',
              border: `1px solid ${colors.border}`,
            }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 }}>
                {FORECAST_LABELS[i] ?? `${i * 25}%`}
              </span>
              <Icon size={16} color={color} strokeWidth={1.8} />
              <span style={{ fontFamily: fonts.mono, fontSize: 10, color: rainColor, fontWeight: 700 }}>
                {(node.rain_chance * 100).toFixed(0)}%
              </span>
              <span style={{ fontFamily: fonts.mono, fontSize: 10, color: tempColor(node.temperature, false) }}>
                {toDisplayTemp(node.temperature).toFixed(0)}{tempLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

export default function WeatherWidget() {
  const weather        = useTelemetryStore((s) => s.session.weather)
  const toDisplayTemp  = useSettingsStore((s) => s.toDisplayTemp)
  const tempUnitLabel  = useSettingsStore((s) => s.tempUnitLabel)

  const airTempC     = weather?.air_temp     ?? 20
  const trackTempC   = weather?.track_temp   ?? 25
  const rainIntensity = weather?.rain_intensity ?? 0
  const forecast      = weather?.forecast     ?? []

  const airTemp   = toDisplayTemp(airTempC)
  const trackTemp = toDisplayTemp(trackTempC)
  const tempLabel = tempUnitLabel()

  const rainColor = rainIntensity > 0.3 ? '#60a5fa' : colors.textMuted
  const { Icon: CurrentIcon, color: iconColor } = resolveWeatherIcon(rainIntensity)

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      padding: '10px 12px', gap: 6,
      boxSizing: 'border-box',
    }}>
      {/* Icon + rain row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CurrentIcon size={38} color={iconColor} strokeWidth={1.5} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
              Rain
            </span>
            <span style={{ fontFamily: fonts.heading, fontSize: 22, color: rainColor, lineHeight: 1 }}>
              {(rainIntensity * 100).toFixed(0)}%
            </span>
          </div>
          <RainBar value={rainIntensity} />
        </div>
      </div>

      {/* Temperatures */}
      <div style={{
        marginTop: 'auto',
        borderTop: `1px solid ${colors.border}`,
        paddingTop: 6,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Air
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: tempColor(airTempC, false), display: 'inline-block' }} />
            <span style={{ fontFamily: fonts.mono, fontSize: 15, color: tempColor(airTempC, false), fontWeight: 600 }}>
              {airTemp.toFixed(1)}{tempLabel}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Track
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: tempColor(trackTempC, true), display: 'inline-block' }} />
            <span style={{ fontFamily: fonts.mono, fontSize: 15, color: tempColor(trackTempC, true), fontWeight: 600 }}>
              {trackTemp.toFixed(1)}{tempLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Forecast */}
      {forecast.length > 0 && (
        <>
          <div style={{ height: 1, background: colors.border }} />
          <ForecastPanel nodes={forecast} toDisplayTemp={toDisplayTemp} tempLabel={tempLabel} />
        </>
      )}
    </div>
  )
}
