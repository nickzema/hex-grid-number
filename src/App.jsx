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
  layout,
  ringInfo,
  templateFor,
  loadConfig,
  normalizeConfig,
  saveConfig,
  hexKey,
  queueLabels,
  clearLabels,
  previewLabels,
  mlkSummary,
  sendToMlk,
  MLK_INSTALL,
  ID,
  selectedHexCenter,
  getPersonal,
  getSavedColors,
  saveColor,
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
// Changing any of these can change which hexes exist or what they're called.
const LAYOUT_KEYS = ["mode", "cols", "rows", "shift", "template", "spiralTemplate", "spiralCount", "lastRing", "start", "dir", "anchor"];
const SEEN_KEY = `${ID}/mlk-seen`;
const mlkSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch (_) {
    return false;
  }
};
const markMlkSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch (_) {
    /* storage unavailable */
  }
};

const TOUR = [
  { selector: '[data-tour="set"]', text: "Select a token on the first hex (the center, in Ring and Spiral), then press Set." },
  { selector: '[data-tour="mode"]', text: "Grid counts columns and rows. Ring uses a letter per ring around the center. Spiral is one number winding out from the center." },
  { selector: '[data-tour="sample"]', text: "Click the text to type the first hex's number, like A.01, 01.01 or -7.-3 (Spiral: 1). Drag it to move it." },
  { selector: '[data-tour="format"]', text: "Fill, border, font and size apply to every hex. Click the sample text for round handles to rotate or resize it." },
  { selector: '[data-tour="players"]', text: "SHOW: everyone sees them. HIDE: players can turn them on for themselves, if they have the extension. OFF: players get nothing." },
  { selector: '[data-tour="eye"]', text: "Hides the numbers just for you in HIDE and OFF. In SHOW they're shared, so it can't." },
  { selector: '[data-tour="mlk"]', text: `Sends the hexes to Map Location Keys, so each hex can hold notes there. That extension has to be installed: paste ${MLK_INSTALL} into Owlbear's Add Extension box.` },
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

const ALIGNS = [
  ["LEFT", "Left"],
  ["CENTER", "Center"],
  ["RIGHT", "Right"],
];

// Four lines, long and short, pushed to the left, middle or right.
const AlignIcon = ({ align }) => {
  const line = (y, len) => {
    const x = align === "LEFT" ? 4 : align === "RIGHT" ? 20 - len : 12 - len / 2;
    return <path d={`M${x} ${y}h${len}`} />;
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {line(6, 16)}
      {line(10.7, 10)}
      {line(15.3, 16)}
      {line(20, 10)}
    </svg>
  );
};

function AlignMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="align-wrap" ref={ref}>
      <button className="align-btn" data-tip="Text alignment" aria-label="Text alignment" onClick={() => setOpen(!open)}>
        <AlignIcon align={value} />
        <svg width="10" height="6" viewBox="0 0 10 6">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="align-menu">
          {ALIGNS.map(([k, name]) => (
            <button
              key={k}
              className={`fmt-btn ${value === k ? "active" : ""}`}
              data-tip={name}
              aria-label={name}
              onClick={() => {
                onChange(k);
                setOpen(false);
              }}
            >
              <AlignIcon align={k} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

const Footer = () => (
  <div className="brand-footer">
    <img src="/zemaria-icon.png" alt="" />
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
  const [ask, setAsk] = useState(null); // { text, link?, buttons: [{ label, run }] }
  const [sent, setSent] = useState(0); // how many hexes are in Map Location Keys
  const [panel, setPanel] = useState(null); // null | "fill" | "stroke"
  const [probe, setProbe] = useState("");
  const [probeColors, setProbeColors] = useState([]);
  const [savedColors, setSavedColors] = useState(getSavedColors);
  const [personal, setPersonalState] = useState(null);
  const cfgRef = useRef(cfg);
  const timer = useRef(null);
  const sentTimer = useRef(null);

  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);

  const refreshSent = () => mlkSummary().then((r) => setSent(r.sent)).catch(() => {});

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
      refreshSent();
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
    off.push(
      OBR.scene.items.onChange(() => {
        clearTimeout(sentTimer.current);
        sentTimer.current = setTimeout(refreshSent, 600);
      })
    );

    // Tooltip on the font box: the font name of a selected Owlbear text item.
    off.push(
      OBR.player.onChange(async (player) => {
        try {
          const ids = player.selection || [];
          if (ids.length !== 1) {
            setProbe("");
            setProbeColors([]);
            return;
          }
          const [item] = await OBR.scene.items.getItems(ids);
          if (item && item.type === "TEXT" && !(item.metadata && item.metadata[LABEL_KEY] !== undefined)) {
            const st = item.text.style;
            setProbe(st.fontFamily);
            setProbeColors([st.fillColor, st.strokeWidth > 0 ? st.strokeColor : null].filter(Boolean));
          } else {
            setProbe("");
            setProbeColors([]);
          }
        } catch (_) {
          setProbe("");
          setProbeColors([]);
        }
      })
    );
    return () => {
      off.forEach((f) => f());
      clearTimeout(timer.current);
      clearTimeout(sentTimer.current);
    };
  }, []);

  // Quiet unless hexes were placed or something failed.
  const report = (res) => {
    if (!res.ok) setMsg(res.error);
    else if (res.added) setMsg(`${res.added} hexes placed.`);
    refreshSent();
  };

  // Messages fade after a few seconds instead of sitting there.
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(""), 7000);
    return () => clearTimeout(t);
  }, [msg]);

  // Save a change and keep the hexes on the map in step. Hexes are updated in place; one is
  // only removed when its number or hex stops existing, and if that would remove hexes that
  // are in Map Location Keys, ask first (confirmed: true skips the question).
  const update = async (patch, { redraw = true, confirmed = false } = {}) => {
    const next = { ...cfgRef.current, ...patch };
    if (!confirmed && redraw && next.anchor && LAYOUT_KEYS.some((k) => k in patch)) {
      const pv = await previewLabels(next).catch(() => null);
      if (pv && pv.ok && pv.entries > 0) {
        const n = pv.noted;
        setAsk({
          text: n
            ? `This replaces the hexes and erases the notes in ${n} Map Location Keys ${n === 1 ? "entry" : "entries"}. Continue?`
            : `This replaces the hexes and their ${pv.entries} Map Location Keys entries. Continue?`,
          buttons: [{ label: "Yes", run: () => (setAsk(null), update(patch, { confirmed: true })) }],
        });
        return cfgRef.current;
      }
    }
    cfgRef.current = next;
    setCfg(next);
    await saveConfig(next);
    if (redraw && next.anchor) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => queueLabels(cfgRef.current, report), 350);
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
  // Longest number in this layout (the labels' shared box width, shown in the sample).
  let maxLen = 1;
  if (cfg.align === "LEFT" || cfg.align === "RIGHT") {
    const lay = layout(cfg, gridType, dpi);
    if (lay && lay.items) maxLen = lay.items.reduce((m, h) => Math.max(m, h.key.length), 1);
  }
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
    setAsk({ text: "Move the first hex to the selected token?", buttons: [{ label: "Yes", run: doSet }] });
  };

  const onReset = () => {
    setMsg("");
    setAsk({
      text: sent ? "Remove all hex labels and their Map Location Keys entries?" : "Remove all hex labels?",
      buttons: [{ label: "Yes", run: doReset }],
    });
  };

  const doReset = async () => {
    setAsk(null);
    clearTimeout(timer.current);
    try {
      const n = await clearLabels();
      await update({ anchor: null }, { redraw: false });
      setMsg(n ? `${n} labels removed.` : "Labels cleared.");
      refreshSent();
    } catch (e) {
      setMsg(`Could not reset: ${e && e.message ? e.message : e}`);
    }
  };

  // Hexes are never deleted to hide them: the same labels just turn invisible (or visible).
  const setVisibility = async (visibility) => {
    if (visibility === cfg.visibility) return;
    clearTimeout(timer.current);
    await update({ visibility });
    setMsg(
      visibility === "SHOW"
        ? "Players will see hex numbers."
        : visibility === "HIDE"
        ? "Players can turn hex numbers on for themselves."
        : "Players get no hex numbers."
    );
  };

  const sendMlk = async (how) => {
    setAsk(null);
    try {
      const res = await sendToMlk(how);
      if (!res.ok) return setMsg(res.error);
      markMlkSeen();
      setMsg(res.added ? `${res.added} hexes sent to Map Location Keys.` : `All ${res.count} hexes were already in Map Location Keys.`);
      refreshSent();
    } catch (e) {
      setMsg(`Could not send hexes: ${e && e.message ? e.message : e}`);
    }
  };

  // The only thing that sends hexes to Map Location Keys.
  const onMlk = async () => {
    setMsg("");
    if (!cfg.anchor) return setMsg("Press Set first, then send the hexes.");
    const s = await mlkSummary().catch(() => ({ labels: 0, sent: 0, noted: 0 }));
    if (!s.labels) return setMsg("The hexes aren't on the map yet. Try again in a moment.");
    if (s.sent) {
      setAsk({
        text: `${s.sent} of ${s.labels} hexes are already in Map Location Keys.${s.noted ? " Delete and add erases their notes." : ""}`,
        buttons: [
          { label: "Add", run: () => sendMlk("add") },
          { label: "Delete and add", run: () => sendMlk("replace") },
        ],
      });
    } else if (!mlkSeen()) {
      setAsk({
        text: "This needs the Map Location Keys extension. If you don't have it, paste this into Owlbear's Add Extension box:",
        link: MLK_INSTALL,
        buttons: [{ label: "Send hexes", run: () => sendMlk("add") }],
      });
    } else {
      sendMlk("add");
    }
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
            className={`icon-btn mlk-btn ${sent ? "on" : ""}`}
            data-tour="mlk"
            data-tip={sent ? "Hexes are in Map Location Keys" : "Send hexes to Map Location Keys"}
            onClick={onMlk}
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
          {ask.link && <input className="link-box" readOnly value={ask.link} onFocus={(e) => e.target.select()} />}
          <div className="confirm-btns">
            {ask.buttons.map((b) => (
              <button key={b.label} className="btn" onClick={b.run}>
                {b.label}
              </button>
            ))}
            <button className="btn text" onClick={() => setAsk(null)}>
              {ask.buttons.length === 1 && ask.buttons[0].label === "Yes" ? "No" : "Cancel"}
            </button>
          </div>
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
        <AlignMenu value={cfg.align || "CENTER"} onChange={(align) => update({ align })} />
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
          maxLen={maxLen}
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
          saved={savedColors}
          extra={probeColors}
          onSave={(hex) => setSavedColors(saveColor(hex))}
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
