import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
  CONFIG_KEY,
  DEFAULTS,
  MAX_HEXES,
  loadConfig,
  saveConfig,
  hexKey,
  applyLabels,
  clearLabels,
  setLabelVisibility,
  snapToHex,
  isHex,
} from "./lib.js";

function Field({ label, value, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="chip-row">
      <span className="chip field-chip">{label}</span>
      <div className="box">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onCommit(text)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </div>
    </div>
  );
}

const clampInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
};

export default function App() {
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const off = [];
    OBR.player.getRole().then(setRole);
    const init = async () => {
      setCfg(await loadConfig());
      setReady(true);
    };
    OBR.scene.isReady().then((r) => r && init());
    off.push(OBR.scene.onReadyChange((r) => (r ? init() : setReady(false))));
    off.push(OBR.scene.onMetadataChange((m) => setCfg({ ...DEFAULTS, ...(m[CONFIG_KEY] || {}) })));
    return () => off.forEach((f) => f());
  }, []);

  const update = async (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    await saveConfig(next);
    return next;
  };

  if (role && role !== "GM") return <div className="app"><div className="empty-state">GM only.</div></div>;
  if (!ready) return <div className="app"><div className="empty-state">Open a scene.</div></div>;

  const total = cfg.cols * cfg.rows;
  const tooMany = total > MAX_HEXES;

  // Set the first hex from a selected token/image sitting on it (no map click needed).
  const useSelected = async () => {
    setMsg("");
    try {
      const type = await OBR.scene.grid.getType();
      if (!isHex(type)) {
        setMsg("Scene grid is not a hex grid.");
        return;
      }
      const sel = await OBR.player.getSelection();
      if (!sel || sel.length === 0) {
        setMsg("Select a token on the first hex, then press Set.");
        return;
      }
      const bounds = await OBR.scene.items.getItemBounds([sel[0]]);
      const center = await snapToHex(bounds.center);
      const next = await update({ anchor: { x: center.x, y: center.y } });
      setMsg(`First hex set (${hexKey(next, 0, 0)}).`);
    } catch (e) {
      setMsg(`Could not set first hex: ${e && e.message ? e.message : e}`);
    }
  };

  const show = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await applyLabels(cfg);
      setMsg(res.ok ? `${res.count} labels placed.` : res.error);
    } catch (e) {
      setMsg("Something went wrong placing labels.");
    }
    setBusy(false);
  };

  const clear = async () => {
    setBusy(true);
    const n = await clearLabels();
    setMsg(`${n} labels removed.`);
    setBusy(false);
  };

  const togglePlayers = async (value) => {
    await update({ players: value });
    await setLabelVisibility(value);
  };

  return (
    <div className="app">
      <div className="list-toolbar">
        <h2>Hex Numbers</h2>
      </div>

      <div className="stack">
        <div className="status-box">
          <span className="status-label">First hex</span>
          <span className="status-value">{cfg.anchor ? hexKey(cfg, 0, 0) : "Not set"}</span>
          <button className="btn anchor-btn" onClick={useSelected}>
            {cfg.anchor ? "Reset" : "Set"}
          </button>
        </div>

        <Field label="Columns" value={cfg.cols} onCommit={(v) => update({ cols: clampInt(v, 1, 999, cfg.cols) })} />
        <Field label="Rows" value={cfg.rows} onCommit={(v) => update({ rows: clampInt(v, 1, 999, cfg.rows) })} />
        <Field
          label="Start col"
          value={cfg.startCol}
          onCommit={(v) => update({ startCol: /^[A-Za-z]{1,3}$/.test(v.trim()) ? v.trim().toUpperCase() : cfg.startCol })}
        />
        <Field
          label="Start row"
          value={cfg.startRow}
          onCommit={(v) => update({ startRow: clampInt(v, 0, 999, cfg.startRow) })}
        />

        <Field
          label="Font"
          value={cfg.fontFamily}
          onCommit={(v) => update({ fontFamily: v.trim() || cfg.fontFamily })}
        />
        <Field label="Size %" value={cfg.fontSize} onCommit={(v) => update({ fontSize: clampInt(v, 5, 80, cfg.fontSize) })} />

        <div className="seg-toggle">
          <span className="seg-label">Position</span>
          {["TOP", "MIDDLE", "BOTTOM"].map((p) => (
            <button key={p} className={`seg-btn ${cfg.labelPos === p ? "active" : ""}`} onClick={() => update({ labelPos: p })}>
              {p === "TOP" ? "Top" : p === "MIDDLE" ? "Middle" : "Bottom"}
            </button>
          ))}
        </div>

        <div className="seg-toggle">
          <span className="seg-label">Offset</span>
          <button className={`seg-btn ${cfg.shift === 1 ? "active" : ""}`} onClick={() => update({ shift: 1 })}>
            Down / Right
          </button>
          <button className={`seg-btn ${cfg.shift === -1 ? "active" : ""}`} onClick={() => update({ shift: -1 })}>
            Up / Left
          </button>
        </div>

        <div className="seg-toggle">
          <span className="seg-label">Players</span>
          <button className={`seg-btn ${cfg.players ? "active" : ""}`} onClick={() => togglePlayers(true)}>
            See
          </button>
          <button className={`seg-btn ${!cfg.players ? "active" : ""}`} onClick={() => togglePlayers(false)}>
            Hidden
          </button>
        </div>

        <div className="status-box">
          <span className="status-label">Hexes</span>
          <span className={`status-value ${tooMany ? "over" : ""}`}>
            {total}
            {tooMany ? ` (max ${MAX_HEXES})` : ""}
          </span>
        </div>

        <div className="action-row">
          <button className="btn" disabled={busy || tooMany || !cfg.anchor} onClick={show}>
            Show labels
          </button>
          <button className="btn text danger" disabled={busy} onClick={clear}>
            Clear
          </button>
        </div>

        {msg && <div className="caption">{msg}</div>}
      </div>

      <div className="brand-footer">
        <span className="brand-mark"></span>
        <span>Another Zemaria product</span>
      </div>
    </div>
  );
}
