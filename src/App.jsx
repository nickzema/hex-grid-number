import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
  CONFIG_KEY,
  DEFAULTS,
  LABEL_KEY,
  MAX_HEXES,
  SEPARATORS,
  loadConfig,
  saveConfig,
  hexKey,
  queueLabels,
  clearLabels,
  setLabelVisibility,
  selectedHexCenter,
} from "./lib.js";
import { FONTS, fontByName } from "./fonts.js";
import Preview from "./Preview.jsx";

const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

function Field({ label, value, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="chip-row">
      <span className="chip field-chip">{label}</span>
      <div className="box">
        <input
          value={text}
          inputMode="numeric"
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
  const [gridType, setGridType] = useState("HEX_HORIZONTAL");
  const [msg, setMsg] = useState("");
  const [ask, setAsk] = useState(null); // { kind: "set" | "reset", text }
  const [probe, setProbe] = useState("");
  const cfgRef = useRef(cfg);
  const timer = useRef(null);

  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);

  useEffect(() => {
    const off = [];
    OBR.player.getRole().then(setRole);
    const init = async () => {
      setCfg(await loadConfig());
      setGridType(await OBR.scene.grid.getType());
      setReady(true);
    };
    OBR.scene.isReady().then((r) => r && init());
    off.push(OBR.scene.onReadyChange((r) => (r ? init() : setReady(false))));
    off.push(OBR.scene.onMetadataChange((m) => setCfg({ ...DEFAULTS, ...(m[CONFIG_KEY] || {}) })));
    off.push(OBR.scene.grid.onChange((g) => setGridType(g.type)));

    // Shows the font name of a selected Owlbear text item, so the dropdown can be checked.
    off.push(
      OBR.player.onChange(async (player) => {
        try {
          const ids = player.selection || [];
          if (ids.length !== 1) return setProbe("");
          const [item] = await OBR.scene.items.getItems(ids);
          if (item && item.type === "TEXT" && !(item.metadata && item.metadata[LABEL_KEY] !== undefined)) {
            setProbe(item.text.style.fontFamily);
          } else setProbe("");
        } catch (_) {
          setProbe("");
        }
      })
    );
    return () => {
      off.forEach((f) => f());
      clearTimeout(timer.current);
    };
  }, []);

  const report = (res) => {
    if (res.ok) setMsg(res.off ? "Labels are off." : `${res.count} labels placed.`);
    else setMsg(res.error);
  };

  // Save a change, then redraw the labels shortly after the last change.
  const update = async (patch, { redraw = true } = {}) => {
    const next = { ...cfgRef.current, ...patch };
    cfgRef.current = next;
    setCfg(next);
    await saveConfig(next);
    if (redraw && next.anchor) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => queueLabels(cfgRef.current, report), 350);
    }
    return next;
  };

  if (role && role !== "GM") return <div className="app"><div className="empty-state">GM only.</div></div>;
  if (!ready) return <div className="app"><div className="empty-state">Open a scene.</div></div>;

  const flat = gridType !== "HEX_VERTICAL";
  const total = cfg.cols * cfg.rows;
  const tooMany = total > MAX_HEXES;

  const doSet = async () => {
    setAsk(null);
    setMsg("");
    try {
      const res = await selectedHexCenter();
      if (!res.ok) return setMsg(res.error);
      const next = await update({ anchor: res.center });
      setMsg(next.visibility === "OFF" ? `First hex set (${hexKey(next, 0, 0)}). Labels are off.` : `First hex set (${hexKey(next, 0, 0)}).`);
    } catch (e) {
      setMsg(`Could not set first hex: ${e && e.message ? e.message : e}`);
    }
  };

  const onSet = async () => {
    setMsg("");
    if (!cfg.anchor) return doSet();
    // Check the selection first so the question is only asked when Set can work.
    const res = await selectedHexCenter().catch((e) => ({ ok: false, error: String(e && e.message ? e.message : e) }));
    if (!res.ok) return setMsg(res.error);
    setAsk({ kind: "set", text: "Move the first hex to the selected token?" });
  };

  const onReset = () => {
    setMsg("");
    setAsk({ kind: "reset", text: "Remove all hex labels?" });
  };

  const doReset = async () => {
    setAsk(null);
    clearTimeout(timer.current);
    try {
      const n = await clearLabels();
      await update({ anchor: null }, { redraw: false });
      setMsg(`${n} labels removed.`);
    } catch (e) {
      setMsg(`Could not reset: ${e && e.message ? e.message : e}`);
    }
  };

  const setVisibility = async (visibility) => {
    const was = cfg.visibility;
    if (visibility === was) return;
    if (!cfg.anchor) return update({ visibility }, { redraw: false });
    clearTimeout(timer.current);
    await update({ visibility }, { redraw: false });
    try {
      if (visibility === "OFF") {
        await clearLabels();
        setMsg("Labels are off.");
      } else if (was === "OFF") {
        queueLabels({ ...cfgRef.current }, report);
      } else {
        await setLabelVisibility(visibility === "ALL");
      }
    } catch (e) {
      setMsg(`Could not change who sees labels: ${e && e.message ? e.message : e}`);
    }
  };

  const sizeNow = Math.round(cfg.textSize * 100);
  const sizes = SIZES.includes(sizeNow) ? SIZES : [...SIZES, sizeNow].sort((a, b) => a - b);
  const font = fontByName(cfg.font);

  const offsetIcons = flat ? ["↘", "↗"] : ["↘", "↙"];

  return (
    <div className="app">
      <div className="list-toolbar head">
        <h2>Hex Numbers</h2>
        <div className="head-actions">
          <button className="btn" onClick={onSet}>
            Set
          </button>
          <button className="btn" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      {ask && (
        <div className="confirm">
          <span>{ask.text}</span>
          <button className="btn" onClick={ask.kind === "set" ? doSet : doReset}>
            Yes
          </button>
          <button className="btn text" onClick={() => setAsk(null)}>
            No
          </button>
        </div>
      )}

      <div className="format-bar">
        <button
          className={`swatch light ${cfg.color === "light" ? "active" : ""}`}
          title="White text"
          onClick={() => update({ color: "light" })}
        />
        <button
          className={`swatch dark ${cfg.color !== "light" ? "active" : ""}`}
          title="Dark text"
          onClick={() => update({ color: "dark" })}
        />
        <select
          className="font-select"
          style={{ fontFamily: font.css }}
          value={cfg.font}
          onChange={(e) => update({ font: e.target.value })}
        >
          {FONTS.map((f) => (
            <option key={f.name} value={f.name} style={{ fontFamily: f.css }}>
              {f.name}
            </option>
          ))}
        </select>
        <select className="size-select" value={sizeNow} onChange={(e) => update({ textSize: parseInt(e.target.value, 10) / 100 })}>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className={`fmt-btn bold ${cfg.bold ? "active" : ""}`} title="Bold" onClick={() => update({ bold: !cfg.bold })}>
          B
        </button>
        <button className={`fmt-btn italic ${cfg.italic ? "active" : ""}`} title="Italic" onClick={() => update({ italic: !cfg.italic })}>
          I
        </button>
      </div>

      <div className="body">
        <div className="stack left">
          <Field label="Columns" value={cfg.cols} onCommit={(v) => update({ cols: clampInt(v, 1, 999, cfg.cols) })} />
          <Field label="Rows" value={cfg.rows} onCommit={(v) => update({ rows: clampInt(v, 1, 999, cfg.rows) })} />

          <div className="seg-toggle">
            <span className="seg-label">Offset</span>
            <button className={`seg-btn arrow ${cfg.shift === 1 ? "active" : ""}`} title="Every second one sits down / right" onClick={() => update({ shift: 1 })}>
              {offsetIcons[0]}
            </button>
            <button className={`seg-btn arrow ${cfg.shift === -1 ? "active" : ""}`} title="Every second one sits up / left" onClick={() => update({ shift: -1 })}>
              {offsetIcons[1]}
            </button>
          </div>

          <div className="seg-toggle">
            {["ALL", "GM", "OFF"].map((v) => (
              <button key={v} className={`seg-btn ${cfg.visibility === v ? "active" : ""}`} onClick={() => setVisibility(v)}>
                {v}
              </button>
            ))}
          </div>

          {tooMany && <div className="caption over">{`${total} hexes is over the max of ${MAX_HEXES}.`}</div>}
        </div>

        <Preview
          cfg={cfg}
          flat={flat}
          onChange={(patch) => update(patch)}
          onTemplate={(template) => update({ template })}
          onInvalid={(t) =>
            setMsg(`"${t}" isn't a key. Use column then row, like A.01 or 01.01. Separators: ${SEPARATORS.trim()} or a space.`)
          }
        />
      </div>

      {msg && <div className="caption">{msg}</div>}
      {probe && <div className="caption probe">{`Selected text font: ${probe}`}</div>}

      <div className="brand-footer">
        <span className="brand-mark"></span>
        <span>Another Zemaria product</span>
      </div>
    </div>
  );
}
