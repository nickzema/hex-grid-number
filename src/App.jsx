import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
  CONFIG_KEY,
  DEFAULTS,
  LABEL_KEY,
  MAX_HEXES,
  MODES,
  SEPARATORS,
  hexCount,
  ringInfo,
  templateFor,
  loadConfig,
  normalizeConfig,
  saveConfig,
  hexKey,
  queueLabels,
  clearLabels,
  selectedHexCenter,
  getPersonal,
  setPersonal,
  onPersonalChange,
} from "./lib.js";
import { FONTS, fontFor } from "./fonts.js";
import Preview from "./Preview.jsx";
import ColorPanel from "./ColorPanel.jsx";
import HelpButton from "./HelpButton.jsx";
import StartBox from "./StartBox.jsx";

const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const DESIGN = 500;
const WHO = ["SHOW", "HIDE", "OFF"];
const MODE_NAMES = { GRID: "Grid", RING: "Ring", SPIRAL: "Spiral" };

const TOUR = [
  { selector: '[data-tour="set"]', text: "Select a token on the first hex (the center, in Ring and Spiral), then press Set." },
  { selector: '[data-tour="mode"]', text: "Grid counts columns and rows. Ring uses a letter per ring around the center. Spiral is one number winding out from the center." },
  { selector: '[data-tour="sample"]', text: "Click the text to type the first hex's number, like A.01, 01.01 or -7.-3 (Spiral: 1). Drag it to move it." },
  { selector: '[data-tour="format"]', text: "Fill, border, font and size apply to every hex. Click the sample text for round handles to rotate or resize it." },
  { selector: '[data-tour="players"]', text: "SHOW: everyone sees them. HIDE: players can turn them on for themselves, if they have the extension. OFF: players get nothing." },
  { selector: '[data-tour="eye"]', text: "Hides the numbers just for you in HIDE and OFF. In SHOW they're shared, so it can't." },
  { selector: '[data-tour="mlk"]', text: "Sends every hex to Map Location Keys, so each hex can hold notes there. Needs that extension." },
];

const TOUR_START = { selector: '[data-tour="start"]', text: "Click a hex to choose where numbering starts. The arrows pick clockwise or counter-clockwise." };

function Row({ label, children, tour, pin }) {
  return (
    <div className={`row ${pin ? "pin" : ""}`} data-tour={tour}>
      <span className="row-label">{label}</span>
      <div className="row-val">{children}</div>
    </div>
  );
}

function Field({ label, value, onCommit, numeric = true }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Row label={label}>
      <input
        value={text}
        inputMode={numeric ? "numeric" : "text"}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </Row>
  );
}

const MlkIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" />
    <text x="12" y="16.6" textAnchor="middle" fontSize="13.5" fontFamily="Georgia, 'Times New Roman', serif" fill="currentColor">
      1
    </text>
  </svg>
);

const Eye = ({ off }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

const clampInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
};

const BrandMark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <ellipse cx="12" cy="14" rx="5" ry="6.5" />
    <circle cx="12" cy="6" r="2.5" />
    <path d="M12 8v12M7 11L3 9M7 15l-4 1M7 18.5L4 21M17 11l4-2M17 15l4 1M17 18.5l3 2.5M10.5 4L8 1.5M13.5 4L16 1.5" />
  </svg>
);

const Footer = () => (
  <div className="brand-footer">
    <BrandMark />
    <span>Another Zemaria product</span>
  </div>
);

function Panel() {
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState(DEFAULTS);
  const [gridType, setGridType] = useState("HEX_HORIZONTAL");
  const [dpi, setDpi] = useState(150);
  const [msg, setMsg] = useState("");
  const [ask, setAsk] = useState(null); // { kind: "set" | "reset", text }
  const [panel, setPanel] = useState(null); // null | "fill" | "stroke"
  const [probe, setProbe] = useState("");
  const [personal, setPersonalState] = useState(null);
  const cfgRef = useRef(cfg);
  const timer = useRef(null);

  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);

  useEffect(() => {
    const off = [];
    OBR.player.getRole().then((r) => {
      setRole(r);
      setPersonalState(getPersonal(r));
    });
    const init = async () => {
      setCfg(await loadConfig());
      setGridType(await OBR.scene.grid.getType());
      setDpi(await OBR.scene.grid.getDpi());
      setReady(true);
    };
    OBR.scene.isReady().then((r) => r && init());
    off.push(OBR.scene.onReadyChange((r) => (r ? init() : setReady(false))));
    off.push(OBR.scene.onMetadataChange((m) => setCfg(normalizeConfig(m[CONFIG_KEY]))));
    off.push(
      OBR.scene.grid.onChange((g) => {
        setGridType(g.type);
        setDpi(g.dpi);
      })
    );
    off.push(
      onPersonalChange(() => OBR.player.getRole().then((r) => setPersonalState(getPersonal(r))))
    );

    // Tooltip on the font box: the font name of a selected Owlbear text item.
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

  const quiet = (res) => {
    if (!res.ok) setMsg(res.error);
  };

  const report = (res) => {
    if (res.ok) setMsg(`${res.count} labels placed.`);
    else setMsg(res.error);
  };

  // Save a change. In SHOW mode the shared labels redraw shortly after the last change;
  // in HIDE and OFF each browser redraws its own copy (see background.js).
  const update = async (patch, { redraw = true } = {}) => {
    const next = { ...cfgRef.current, ...patch };
    cfgRef.current = next;
    setCfg(next);
    await saveConfig(next);
    if (redraw && next.anchor && (next.visibility === "SHOW" || next.mlk || patch.mlk !== undefined)) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => queueLabels(cfgRef.current, next.visibility === "SHOW" ? report : quiet), 350);
    }
    return next;
  };

  const togglePersonal = () => {
    const on = !personal;
    setPersonal(on);
    setPersonalState(on);
  };

  if (!ready || personal === null) return <div className="app"><div className="empty-state">Open a scene.</div></div>;

  if (role !== "GM") {
    return (
      <div className="app">
        <div className="head">
          <h2>Hex Numbers</h2>
        </div>
        <div className="player-body">
          {cfg.visibility === "SHOW" && <div className="caption">Hex numbers are shown to everyone.</div>}
          {cfg.visibility === "OFF" && <div className="caption">Hex numbers are off.</div>}
          {cfg.visibility === "HIDE" && (
            <>
              <button className={`btn wide ${personal ? "" : "ghost"}`} onClick={togglePersonal}>
                {personal ? "Hide hex numbers" : "Show hex numbers"}
              </button>
              <div className="caption">Only you see them.</div>
            </>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  const flat = gridType !== "HEX_VERTICAL";
  const total = hexCount(cfg);
  const tooMany = total > MAX_HEXES;
  const ring = cfg.mode === "RING" ? ringInfo(cfg) : null;
  const summary = tooMany
    ? `${total} hexes is over the max of ${MAX_HEXES}.`
    : ring && ring.error
    ? ring.error
    : `${total} hexes.`;
  const problem = tooMany || (ring && ring.error);
  const tour = TOUR.flatMap((t, i) => (i === 1 && cfg.mode !== "GRID" ? [t, TOUR_START] : [t]));
  const previewCfg = { ...cfg, template: templateFor(cfg) };
  const shared = cfg.visibility === "SHOW";

  const doSet = async () => {
    setAsk(null);
    setMsg("");
    try {
      const res = await selectedHexCenter();
      if (!res.ok) return setMsg(res.error);
      const next = await update({ anchor: res.center });
      if (!shared) setMsg(`First hex set (${hexKey(next, 0, 0)}).`);
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
    setAsk({ kind: "reset", text: cfg.mlk ? "Remove all hex labels and their Map Location Keys entries?" : "Remove all hex labels?" });
  };

  const doReset = async () => {
    setAsk(null);
    clearTimeout(timer.current);
    try {
      const n = await clearLabels();
      await update({ anchor: null }, { redraw: false });
      setMsg(n ? `${n} labels removed.` : "Labels cleared.");
    } catch (e) {
      setMsg(`Could not reset: ${e && e.message ? e.message : e}`);
    }
  };

  const setVisibility = async (visibility) => {
    if (visibility === cfg.visibility) return;
    clearTimeout(timer.current);
    await update({ visibility }, { redraw: false });
    try {
      if (visibility === "SHOW") {
        if (cfgRef.current.anchor) queueLabels(cfgRef.current, report);
        else setMsg("Players will see hex numbers.");
      } else {
        // Shared labels come down; invisible Map Location Keys holders stay where they are needed.
        if (cfgRef.current.anchor) queueLabels(cfgRef.current, quiet);
        else await clearLabels();
        setMsg(visibility === "HIDE" ? "Players can turn hex numbers on for themselves." : "Players get no hex numbers.");
      }
    } catch (e) {
      setMsg(`Could not change who sees labels: ${e && e.message ? e.message : e}`);
    }
  };

  const toggleMlk = async () => {
    const on = !cfg.mlk;
    await update({ mlk: on });
    setMsg(
      !cfg.anchor
        ? on
          ? "On. Press Set, then every hex goes to Map Location Keys."
          : "Off."
        : on
        ? "Sending hexes to Map Location Keys."
        : "Stopped. Hexes with notes stay in Map Location Keys."
    );
  };

  const sizeNow = Math.round(cfg.textSize * 100);
  const sizes = SIZES.includes(sizeNow) ? SIZES : [...SIZES, sizeNow].sort((a, b) => a - b);
  const font = fontFor(cfg);
  const offsetIcons = flat ? ["↘", "↗"] : ["↘", "↙"];

  return (
    <div className="app">
      <div className="head">
        <h2>Hex Numbers</h2>
        <div className="head-right">
          <HelpButton title="How this works" steps={tour} />
          <button
            className="icon-btn"
            data-tour="eye"
            data-tip={shared ? "Shared in SHOW" : personal ? "Hide for me" : "Show for me"}
            disabled={shared}
            onClick={togglePersonal}
          >
            <Eye off={!shared && !personal} />
          </button>
          <button
            className={`icon-btn mlk-btn ${cfg.mlk ? "on" : ""}`}
            data-tour="mlk"
            data-tip={cfg.mlk ? "Sending hexes to Map Location Keys" : "Send hexes to Map Location Keys"}
            onClick={toggleMlk}
          >
            <MlkIcon />
          </button>
          <button className="btn" data-tour="set" onClick={onSet}>
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

      <div className="toolbar" data-tour="format">
        <button
          className={`swatch fill ${panel === "fill" ? "active" : ""}`}
          style={{ background: cfg.fillColor }}
          data-tip="Fill color"
          onClick={() => setPanel(panel === "fill" ? null : "fill")}
        />
        <button
          className={`swatch ring ${panel === "stroke" ? "active" : ""} ${cfg.strokeWidth ? "" : "none"}`}
          style={{ borderColor: cfg.strokeColor }}
          data-tip="Border"
          onClick={() => setPanel(panel === "stroke" ? null : "stroke")}
        />
        <span className="tb-sep" />
        <select
          className="font-select"
          style={{ fontFamily: font.css }}
          value={cfg.font}
          onChange={(e) =>
            e.target.value === "__selected"
              ? update({ font: "Custom", fontCustom: probe })
              : update({ font: e.target.value })
          }
        >
          {FONTS.map((f) => (
            <option key={f.name} value={f.name} style={{ fontFamily: f.css }}>
              {f.name}
            </option>
          ))}
          {cfg.font === "Custom" && <option value="Custom">{cfg.fontCustom}</option>}
          {probe && probe !== cfg.fontCustom && <option value="__selected">{`Selected text: ${probe}`}</option>}
        </select>
        <select className="size-select" value={sizeNow} onChange={(e) => update({ textSize: parseInt(e.target.value, 10) / 100 })}>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="tb-sep" />
        <button className={`fmt-btn bold ${cfg.bold ? "active" : ""}`} data-tip="Bold" onClick={() => update({ bold: !cfg.bold })}>
          B
        </button>
        <button className={`fmt-btn italic ${cfg.italic ? "active" : ""}`} data-tip="Italic" onClick={() => update({ italic: !cfg.italic })}>
          I
        </button>
      </div>

      <div className="body">
        <div className="stack">
          <div className="modes" data-tour="mode">
            {MODES.map((m) => (
              <button key={m} className={`seg-btn ${cfg.mode === m ? "active" : ""}`} onClick={() => update({ mode: m })}>
                {MODE_NAMES[m]}
              </button>
            ))}
          </div>

          {cfg.mode === "GRID" && (
            <>
              <Field label="Columns" value={cfg.cols} onCommit={(v) => update({ cols: clampInt(v, 1, 999, cfg.cols) })} />
              <Field label="Rows" value={cfg.rows} onCommit={(v) => update({ rows: clampInt(v, 1, 999, cfg.rows) })} />
              <Row label="Offset">
                <div className="seg-in">
                  <button className={`seg-btn arrow ${cfg.shift === 1 ? "active" : ""}`} data-tip="Second one sits lower" onClick={() => update({ shift: 1 })}>
                    {offsetIcons[0]}
                  </button>
                  <button className={`seg-btn arrow ${cfg.shift === -1 ? "active" : ""}`} data-tip="Second one sits higher" onClick={() => update({ shift: -1 })}>
                    {offsetIcons[1]}
                  </button>
                </div>
              </Row>
            </>
          )}
          {cfg.mode === "RING" && (
            <Field
              label="Last ring"
              numeric={false}
              value={cfg.lastRing}
              onCommit={(v) => update({ lastRing: String(v).trim() || cfg.lastRing })}
            />
          )}
          {cfg.mode === "SPIRAL" && (
            <Field label="Hexes" value={cfg.spiralCount} onCommit={(v) => update({ spiralCount: clampInt(v, 1, MAX_HEXES, cfg.spiralCount) })} />
          )}
          {cfg.mode !== "GRID" && <StartBox cfg={cfg} type={gridType} onChange={(patch) => update(patch)} />}

          <Row label="Players" tour="players">
            <div className="seg-in">
              {WHO.map((m) => (
                <button
                  key={m}
                  className={`seg-btn ${cfg.visibility === m ? "active" : ""}`}
                  data-tip={m === "SHOW" ? "Everyone sees them" : m === "HIDE" ? "Players can opt in" : "Players get nothing"}
                  onClick={() => setVisibility(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </Row>
        </div>

        <Preview
          cfg={previewCfg}
          flat={flat}
          dpi={dpi}
          onChange={(patch) => update(patch)}
          onTemplate={(t) => update(cfg.mode === "SPIRAL" ? { spiralTemplate: t } : { template: t })}
          onInvalid={(t) =>
            setMsg(
              cfg.mode === "SPIRAL"
                ? `"${t}" isn't a number. Use something like 1, 0 or 001.`
                : `"${t}" isn't a key. Use column then row, like A.01 or 01.01. Separators: ${SEPARATORS.trim()} or a space.`
            )
          }
        />
      </div>

      <div className={`caption ${!msg && problem ? "over" : ""}`}>{msg || summary}</div>

      <Footer />

      {panel && (
        <ColorPanel
          kind={panel}
          color={panel === "fill" ? cfg.fillColor : cfg.strokeColor}
          width={cfg.strokeWidth}
          onColor={(c) => update(panel === "fill" ? { fillColor: c } : { strokeColor: c })}
          onWidth={(w) => update({ strokeWidth: w })}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

// The popover is designed at 500 x 500. If Owlbear gives it less room, shrink everything
// together so nothing clips.
function useFit() {
  const calc = () => Math.min(1, window.innerWidth / DESIGN, window.innerHeight / DESIGN);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const on = () => setScale(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return scale;
}

export default function App() {
  const scale = useFit();
  return (
    <div className="fit" style={{ transform: scale < 1 ? `scale(${scale})` : "none" }}>
      <Panel />
    </div>
  );
}
