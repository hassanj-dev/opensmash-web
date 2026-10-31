// Pure SVG, no libraries. Put in components/AttendanceLineChart.tsx
const THIS_WEEK = [38, 56, 44, 72, 60, 88, 66]
const LAST_WEEK = [30, 42, 50, 46, 58, 64, 52]
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const W = 400
const H = 140
const PAD_X = 14
const PAD_T = 10
const PAD_B = 8

function toPoints(data: number[]) {
  const step = (W - PAD_X * 2) / (data.length - 1)
  return data.map((v, i) => ({
    x: PAD_X + i * step,
    y: PAD_T + (1 - v / 100) * (H - PAD_T - PAD_B),
  }))
}

// Smooth curve through the points (Catmull-Rom converted to Bezier)
function smoothPath(pts: { x: number; y: number }[]) {
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

export default function AttendanceLineChart() {
  const now = toPoints(THIS_WEEK)
  const prev = toPoints(LAST_WEEK)
  const nowPath = smoothPath(now)
  const prevPath = smoothPath(prev)
  const areaPath = `${nowPath} L ${now[now.length - 1].x} ${H} L ${now[0].x} ${H} Z`
  const peak = now[5] // Saturday

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full overflow-visible sm:h-32" role="img" aria-label="Weekly attendance line chart">
        <defs>
          <linearGradient id="cs-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1f6bff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1f6bff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={PAD_T + f * (H - PAD_T - PAD_B)}
            y2={PAD_T + f * (H - PAD_T - PAD_B)}
            stroke="#ffffff14"
            strokeDasharray="3 5"
          />
        ))}

        <path d={areaPath} fill="url(#cs-area)" className="cs-area" />

        {/* last week: faint dashed line */}
        <path d={prevPath} fill="none" stroke="#ffffff40" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />

        {/* this week: solid blue line that draws itself */}
        <path d={nowPath} pathLength={1} fill="none" stroke="#3d84ff" strokeWidth="2.5" strokeLinecap="round" className="cs-line" />

        {now.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 5 ? 4.5 : 3} fill={i === 5 ? '#fff' : '#0e1320'} stroke="#3d84ff" strokeWidth="2" />
        ))}

        {/* peak marker */}
        <line x1={peak.x} x2={peak.x} y1={peak.y + 6} y2={H - PAD_B} stroke="#3d84ff55" strokeDasharray="2 4" />
      </svg>

      <div className="mt-2 flex justify-between px-[3px] text-[10px] text-white/35">
        {DAYS.map((d, i) => (
          <span key={i} className="flex-1 text-center">{d}</span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-white/45">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#3d84ff]" /> This week</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-white/40" /> Last week</span>
      </div>
    </div>
  )
}