import { useEffect, useRef, useState } from "react";
import { fontFor } from "./fonts.js";
import { parseFor } from "./lib.js";

// The preview hex is drawn D px tall (flat-top) or wide (pointy-top), the same
// way the grid's dpi measures a hex. Label offset and size are stored in
// hex sizes, so what you see here is what lands on every hex.
export const D = 168;
const W = 256;
const H = 232;
const SQRT3 = Math.sqrt(3);
const SNAP = 6; // px: how close the label has to be to a snap spot

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function luminance(hex) {
  const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16) || 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function hexPoints(flat, cx, cy) {
  const R = D / SQRT3;
  const start = flat ? 0 : 30;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = ((start + i * 60) * Math.PI) / 180;
    pts.push(`${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const RotateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z" />
  </svg>
);

const EdgeIcon = ({ side }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {side === "left" ? (
      <>
        <path d="M4 5v14" />
        <path d="M20 12H9" />
        <path d="M13 8l-4 4 4 4" />
      </>
    ) : (
      <>
        <path d="M20 5v14" />
        <path d="M4 12h11" />
        <path d="M11 8l4 4-4 4" />
      </>
    )}
  </svg>
);

export default function Preview({ cfg, flat, dpi, onChange, onTemplate, onInvalid }) {
  const boxRef = useRef(null);
  const labelRef = useRef(null);
  const inputRef = useRef(null);
  const gesture = useRef(null);
  const liveRef = useRef(null);
  const skipCommit = useRef(false);
  const [live, setLive] = useState(null);
  const [selected, setSelected] = useState(false);
  const [text, setText] = useState(cfg.template);

  useEffect(() => {
    if (!selected) setText(cfg.template);
  }, [cfg.template, selected]);

  const v = live ? { ...cfg, ...live } : cfg;
  const font = fontFor(v);
  const fontPx = v.textSize * D;
  const cx = W / 2 + v.ox * D;
  const cy = H / 2 + v.oy * D;
  const valid = !!parseFor(cfg.mode, text);
  const hexHalf = flat ? D / 2 : D / SQRT3;

  const setLiveBoth = (patch) => {
    liveRef.current = { ...(liveRef.current || {}), ...patch };
    setLive(liveRef.current);
  };

  const center = () => {
    const r = boxRef.current.getBoundingClientRect();
    const l = liveRef.current ? { ...cfg, ...liveRef.current } : cfg;
    return { x: r.left + W / 2 + l.ox * D, y: r.top + H / 2 + l.oy * D };
  };

  const begin = (kind, e) => {
    e.preventDefault();
    e.stopPropagation();
    const c = center();
    gesture.current = {
      kind,
      sx: e.clientX,
      sy: e.clientY,
      ox0: cfg.ox,
      oy0: cfg.oy,
      size0: cfg.textSize,
      dist0: Math.max(10, Math.hypot(e.clientX - c.x, e.clientY - c.y)),
      lh: labelRef.current ? labelRef.current.offsetHeight : fontPx * 1.3,
      moved: false,
    };
    liveRef.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Light snap to the center line and five heights: very top, halfway up,
  // center, halfway down, very bottom (label edge touching the hex edge).
  const snapPos = (xPx, yPx, lh) => {
    const reach = Math.max(0, hexHalf - lh / 2);
    let x = xPx;
    let y = yPx;
    if (Math.abs(x) < SNAP) x = 0;
    let best = SNAP;
    for (const t of [-reach, -reach / 2, 0, reach / 2, reach]) {
      if (Math.abs(yPx - t) < best) {
        best = Math.abs(yPx - t);
        y = t;
      }
    }
    return { x, y };
  };

  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "move") {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      const p = snapPos(g.ox0 * D + dx, g.oy0 * D + dy, g.lh);
      setLiveBoth({ ox: clamp(p.x / D, -0.9, 0.9), oy: clamp(p.y / D, -0.9, 0.9) });
    } else if (g.kind === "rotate") {
      const c = center();
      let a = (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      const snap = Math.round(a / 15) * 15;
      if (Math.abs(a - snap) < 6) a = snap;
      g.moved = true;
      setLiveBoth({ rot: Math.round(a) });
    } else if (g.kind === "resize") {
      const c = center();
      const dist = Math.hypot(e.clientX - c.x, e.clientY - c.y);
      g.moved = true;
      setLiveBoth({ textSize: clamp(g.size0 * (dist / g.dist0), 0.04, 0.8) });
    }
  };

  const end = (e) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* already released */
    }
    const patch = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (g.moved && patch) onChange(patch);
    else if (g.kind === "move") {
      setSelected(true);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    }
  };

  const commit = () => {
    const t = text.trim();
    if (parseFor(cfg.mode, t)) {
      if (t !== cfg.template) onTemplate(t);
      setText(t);
    } else {
      setText(cfg.template);
      if (onInvalid) onInvalid(text);
    }
  };

  // Blurring the input commits the typed template (see onBlur).
  const deselect = () => {
    if (!selected) return;
    setSelected(false);
    if (inputRef.current) inputRef.current.blur();
  };

  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      deselect();
    } else if (e.key === "Escape") {
      skipCommit.current = true;
      setText(cfg.template);
      setSelected(false);
      e.currentTarget.blur();
    }
  };

  const strokePx = (v.strokeWidth || 0) * (D / (dpi || 150));
  const textStyle = {
    fontFamily: font.css,
    fontSize: `${fontPx}px`,
    fontWeight: v.bold ? 700 : 400,
    fontStyle: v.italic ? "italic" : "normal",
    color: v.fillColor,
    WebkitTextStroke: strokePx > 0 ? `${strokePx}px ${v.strokeColor}` : "0",
    paintOrder: "stroke fill",
    lineHeight: 1.4,
  };

  const handle = (kind, extra) => ({
    onPointerDown: (e) => begin(kind, e),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    ...extra,
  });

  return (
    <div className="preview" data-tour="sample" ref={boxRef} style={{ width: W, height: H }} onPointerDown={deselect}>
      <svg width={W} height={H} className="preview-hex">
        <polygon
          points={hexPoints(flat, W / 2, H / 2)}
          fill={luminance(v.fillColor) > 0.45 ? "#2d3146" : "#D9DCE6"}
          stroke={luminance(v.fillColor) > 0.45 ? "#6d7391" : "#9097b0"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      <div
        ref={labelRef}
        className={`preview-label ${selected ? "selected" : ""}`}
        style={{ left: cx, top: cy, transform: `translate(-50%, -50%) rotate(${v.rot}deg)` }}
        {...handle("move")}
      >
        <span className="preview-text" style={{ ...textStyle, visibility: selected ? "hidden" : "visible" }}>
          {text || " "}
        </span>
        <input
          ref={inputRef}
          className={`preview-input ${valid ? "" : "invalid"}`}
          style={{ ...textStyle, display: selected ? "block" : "none" }}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => {
            if (skipCommit.current) {
              skipCommit.current = false;
              return;
            }
            commit();
          }}
        />

        {selected && (
          <>
            <span className="preview-frame" />
            <span className="handle rotate" title="Rotate (double-click for straight)" onDoubleClick={() => onChange({ rot: 0 })} {...handle("rotate")}>
              <RotateIcon />
            </span>
            <span className="handle resize left" title="Resize" {...handle("resize")}>
              <EdgeIcon side="left" />
            </span>
            <span className="handle resize right" title="Resize" {...handle("resize")}>
              <EdgeIcon side="right" />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
