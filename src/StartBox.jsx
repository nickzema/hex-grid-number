import { neighborAngles } from "./lib.js";

// Ring and Spiral: the center hex and its six neighbors, numbered in the order the walk takes
// them. Click a neighbor to start there; the arrows flip the direction.
const R = 16; // hex corner radius, px
const STEP = Math.sqrt(3) * R; // center to neighbor center

function hexPoints(flat, cx, cy) {
  const start = flat ? 0 : 30;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = ((start + i * 60) * Math.PI) / 180;
    pts.push(`${(cx + (R - 1) * Math.cos(a)).toFixed(1)},${(cy + (R - 1) * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const Arrow = ({ ccw }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={ccw ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v5h-5" />
  </svg>
);

export default function StartBox({ cfg, type, onChange }) {
  const flat = type !== "HEX_VERTICAL";
  const angles = neighborAngles(type);
  const size = 84;
  const mid = size / 2;
  return (
    <div className="start-box" data-tour="start">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="start-svg">
        <polygon points={hexPoints(flat, mid, mid)} className="start-hex center" />
        <circle cx={mid} cy={mid} r="2.5" className="start-dot" />
        {angles.map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          const cx = mid + STEP * Math.cos(a);
          const cy = mid + STEP * Math.sin(a);
          const k = ((((cfg.dir === -1 ? -1 : 1) * (i - (cfg.start || 0))) % 6) + 6) % 6;
          return (
            <g key={i} className={`start-cell ${k === 0 ? "on" : ""}`} onClick={() => onChange({ start: i })}>
              <polygon points={hexPoints(flat, cx, cy)} className="start-hex" />
              <text x={cx} y={cy + 4} textAnchor="middle">
                {k + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="start-side">
        <span className="start-label">Start</span>
        <div className="seg-in start-dir">
          <button className={`seg-btn ${cfg.dir !== -1 ? "active" : ""}`} data-tip="Clockwise" onClick={() => onChange({ dir: 1 })}>
            <Arrow />
          </button>
          <button className={`seg-btn ${cfg.dir === -1 ? "active" : ""}`} data-tip="Counter-clockwise" onClick={() => onChange({ dir: -1 })}>
            <Arrow ccw />
          </button>
        </div>
      </div>
    </div>
  );
}
