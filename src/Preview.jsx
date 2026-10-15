import { useEffect, useRef, useState } from "react";
import { fontByName } from "./fonts.js";
import { parseTemplate } from "./lib.js";

// The preview hex is drawn D px tall (flat-top) or wide (pointy-top), the same
// way the grid's dpi measures a hex. Label offset and size are stored in
// hex sizes, so what you see here is what lands on every hex.
export const D = 130;
const W = 250;
const H = 210;
const SQRT3 = Math.sqrt(3);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

export default function Preview({ cfg, flat, onChange, onTemplate, onInvalid }) {
  const boxRef = useRef(null);
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
  const font = fontByName(v.font);
  const dark = v.color !== "light";
  const fontPx = v.textSize * D;
  const cx = W / 2 + v.ox * D;
  const cy = H / 2 + v.oy * D;
  const valid = !!parseTemplate(text);

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
      moved: false,
    };
    liveRef.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "move") {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      setLiveBoth({ ox: clamp(g.ox0 + dx / D, -0.9, 0.9), oy: clamp(g.oy0 + dy / D, -0.9, 0.9) });
    } else if (g.kind === "rotate") {
      const c = center();
      let a = (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      const snap = Math.round(a / 15) * 15;
      if (Math.abs(a - snap) < 3) a = snap;
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
    if (parseTemplate(t)) {
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

  const halo = dark ? "#FCFBF8" : "#111111";
  const textStyle = {
    fontFamily: font.css,
    fontSize: `${fontPx}px`,
    fontWeight: v.bold ? 700 : 400,
    fontStyle: v.italic ? "italic" : "normal",
    color: dark ? "#111111" : "#FFFFFF",
    textShadow: `0 0 2px ${halo}, 0 0 2px ${halo}`,
    lineHeight: 1.3,
  };

  return (
    <div className="preview" ref={boxRef} style={{ width: W, height: H }} onPointerDown={deselect}>
      <svg width={W} height={H} className="preview-hex">
        <polygon
          points={hexPoints(flat, W / 2, H / 2)}
          fill={dark ? "#EDEBE4" : "#6f7468"}
          stroke="#111111"
          strokeWidth="1.5"
        />
      </svg>

      <div
        className={`preview-label ${selected ? "selected" : ""}`}
        style={{ left: cx, top: cy, transform: `translate(-50%, -50%) rotate(${v.rot}deg)` }}
        onPointerDown={(e) => begin("move", e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
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
            <span className="preview-stem" />
            <span
              className="handle rotate"
              title="Rotate"
              onPointerDown={(e) => begin("rotate", e)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
            <span
              className="handle resize"
              title="Resize"
              onPointerDown={(e) => begin("resize", e)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          </>
        )}
      </div>
    </div>
  );
}
