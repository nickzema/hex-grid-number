import { useRef, useState } from "react";

// Colors (sampled from Owlbear's own text color panel; white added) and border sizes laid out like its text toolbar:
// border sizes on the left (border panel only), color swatches on the right,
// and a "+" that opens a custom color picker with a hex box.
export const SWATCHES = [
  "#EF9D28", "#5A00F8", "#E9381D", "#E9381B",
  "#E9C7AC", "#7E2CF9", "#35008B", "#975AF9",
  "#EA3657", "#6100F8", "#4200F8", "#753FF9",
  "#17161A", "#7AA5B5", "#FFFFFF",
];

// Border sizes in scene px. The first is "none".
export const BORDER_WIDTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`.toUpperCase();
}

export function normalizeHex(text) {
  const t = String(text).trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(t)) return `#${t.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`.toUpperCase();
  return null;
}

function hexToHsv(hex) {
  const h6 = normalizeHex(hex) || "#000000";
  const r = parseInt(h6.slice(1, 3), 16) / 255;
  const g = parseInt(h6.slice(3, 5), 16) / 255;
  const b = parseInt(h6.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function NoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M4.5 13.5L13.5 4.5" />
    </svg>
  );
}

function CustomPicker({ start, onApply, onCancel }) {
  const [hsv, setHsv] = useState(() => hexToHsv(start));
  const [text, setText] = useState(normalizeHex(start) || "#000000");
  const sv = useRef(null);
  const hue = useRef(null);
  const drag = useRef(null);

  const set = (next) => {
    setHsv(next);
    setText(hsvToHex(next.h, next.s, next.v));
  };

  const fromPointer = (e) => {
    if (drag.current === "sv") {
      const r = sv.current.getBoundingClientRect();
      set({ ...hsv, s: clamp((e.clientX - r.left) / r.width, 0, 1), v: 1 - clamp((e.clientY - r.top) / r.height, 0, 1) });
    } else if (drag.current === "hue") {
      const r = hue.current.getBoundingClientRect();
      set({ ...hsv, h: clamp((e.clientX - r.left) / r.width, 0, 1) * 359.9 });
    }
  };
  const down = (kind) => (e) => {
    drag.current = kind;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPointer(e);
  };
  const up = (e) => {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* already released */
    }
  };

  const typed = (value) => {
    setText(value);
    const hex = normalizeHex(value);
    if (hex) setHsv(hexToHsv(hex));
  };

  const valid = normalizeHex(text);

  return (
    <div className="custom-picker">
      <div
        ref={sv}
        className="sv-box"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))` }}
        onPointerDown={down("sv")}
        onPointerMove={fromPointer}
        onPointerUp={up}
      >
        <span className="sv-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div ref={hue} className="hue-bar" onPointerDown={down("hue")} onPointerMove={fromPointer} onPointerUp={up}>
        <span className="hue-dot" style={{ left: `${(hsv.h / 359.9) * 100}%` }} />
      </div>
      <input
        className={`hex-input ${valid ? "" : "bad"}`}
        value={text}
        spellCheck={false}
        onChange={(e) => typed(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && valid && onApply(valid)}
      />
      <div className="picker-actions">
        <button className="round-btn" title="Cancel" onClick={onCancel}>
          {"✕"}
        </button>
        <button className="round-btn" title="Use this color" disabled={!valid} onClick={() => valid && onApply(valid)}>
          {"✓"}
        </button>
      </div>
    </div>
  );
}

export default function ColorPanel({ kind, color, width, onColor, onWidth, onClose }) {
  const [custom, setCustom] = useState(false);
  const current = (color || "").toUpperCase();

  return (
    <div className="panel-backdrop" onPointerDown={onClose}>
      <div className="color-panel" onPointerDown={(e) => e.stopPropagation()}>
        {kind === "stroke" && (
          <>
            <div className="panel-grid">
              {BORDER_WIDTHS.map((w, i) => (
                <button
                  key={w}
                  className={`cell ${width === w ? "on" : ""}`}
                  title={w === 0 ? "No border" : `${w}`}
                  onClick={() => onWidth(w)}
                >
                  {i === 0 ? <NoneIcon /> : <span className="dot" style={{ width: 2 + i * 1.05, height: 2 + i * 1.05 }} />}
                </button>
              ))}
            </div>
            <div className="panel-rule" />
          </>
        )}

        {custom ? (
          <CustomPicker
            start={color}
            onCancel={() => setCustom(false)}
            onApply={(hex) => {
              onColor(hex);
              setCustom(false);
            }}
          />
        ) : (
          <div className="panel-grid">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`cell swatch-cell ${current === c ? "on" : ""}`}
                style={{ background: c }}
                title={c}
                onClick={() => onColor(c)}
              />
            ))}
            <button className="cell plus" title="Custom color" onClick={() => setCustom(true)}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
