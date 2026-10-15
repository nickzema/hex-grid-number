import OBR, { buildText } from "@owlbear-rodeo/sdk";
import { fontByName, DEFAULT_FONT } from "./fonts.js";

export const ID = "com.zemaria.hex-grid-number";
export const CONFIG_KEY = `${ID}/config`;
export const LABEL_KEY = `${ID}/label`;
export const TOOL_ID = `${ID}/tool`;
export const MODE_READ = `${ID}/read`;
export const MAX_HEXES = 2500;

export const DEFAULTS = {
  anchor: null, // center of the first hex, in scene coordinates
  cols: 20,
  rows: 20,
  template: "A.01", // the first hex's key; its shape sets the style of every key
  shift: 1, // 1: every second column/row sits down/right. -1: up/left
  visibility: "SHOW", // SHOW: everyone, locked on | HIDE: players can opt in | OFF: players get nothing
  font: DEFAULT_FONT,
  textSize: 0.2, // fraction of the hex size (grid dpi)
  bold: true,
  italic: false,
  fillColor: "#111111",
  strokeColor: "#FCFBF8",
  strokeWidth: 2, // scene px, 0 = no border
  rot: 0, // degrees
  ox: 0, // label offset from the hex center, in hex sizes (dpi)
  oy: 0,
  layoutV: 2, // v2 centers labels using Owlbear's own measurements; older offsets were set against a shifted preview
};

const SQRT3_2 = Math.sqrt(3) / 2;
const mod2 = (n) => ((n % 2) + 2) % 2;

/* ---------- config ---------- */

// Merge saved settings over the defaults and carry old settings forward.
export function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS, ...(raw || {}) };
  if (raw && raw.layoutV !== 2) {
    cfg.ox = 0;
    cfg.oy = 0;
  }
  if (cfg.visibility === "ALL") cfg.visibility = "SHOW";
  else if (cfg.visibility === "GM") cfg.visibility = "OFF";
  if (raw && raw.fillColor === undefined && raw.color === "light") {
    cfg.fillColor = "#FFFFFF";
    cfg.strokeColor = "#111111";
  }
  return cfg;
}

export async function loadConfig() {
  const meta = await OBR.scene.getMetadata();
  return normalizeConfig(meta[CONFIG_KEY]);
}

export async function saveConfig(cfg) {
  await OBR.scene.setMetadata({ [CONFIG_KEY]: cfg });
}

/* ---------- naming ---------- */

// Spreadsheet-style columns: A..Z, then AA, AB, ... AZ, BA ...
function colIndex(letters) {
  const s = String(letters || "").toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return 0;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function colName(i) {
  let n = Math.max(0, i) + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export const SEPARATORS = ",.;:'-_`/\\| ";

// "A.01", "AA 01", "A01", "01.01", "c-1" ... column first, then row.
// Letters count A, B ... Z, AA ... ; numbers count up. Leading zeros set the padding.
const TEMPLATE_RE = /^([A-Za-z]+|-?\d+)([,.;:'\-_`/\\| ]?)(-?\d+)$/;

export function parseTemplate(text) {
  const m = TEMPLATE_RE.exec(String(text ?? "").trim());
  if (!m) return null;
  const [, colTok, sep, rowTok] = m;
  const alpha = /^[A-Za-z]+$/.test(colTok);
  if (!alpha && !sep) return null; // "0101" can't be split into column and row
  return {
    alpha,
    lower: alpha && colTok === colTok.toLowerCase(),
    colStart: alpha ? colIndex(colTok) : parseInt(colTok, 10),
    colWidth: colTok.replace("-", "").length,
    sep,
    rowStart: parseInt(rowTok, 10),
    rowWidth: rowTok.replace("-", "").length,
  };
}

let parsedFor = null;
let parsed = null;
function templateOf(cfg) {
  if (parsedFor !== cfg.template) {
    parsedFor = cfg.template;
    parsed = parseTemplate(cfg.template) || parseTemplate(DEFAULTS.template);
  }
  return parsed;
}

// 7 -> "07" at width 2, -7 -> "-07", 0 -> "00".
function num(n, width) {
  return (n < 0 ? "-" : "") + String(Math.abs(n)).padStart(width, "0");
}

export function hexKey(cfg, c, r) {
  const p = templateOf(cfg);
  let col;
  if (p.alpha) {
    col = colName(p.colStart + c);
    if (p.lower) col = col.toLowerCase();
  } else {
    col = num(p.colStart + c, p.colWidth);
  }
  const row = num(p.rowStart + r, p.rowWidth);
  return `${col}${p.sep}${row}`;
}

/* ---------- geometry ---------- */

export function isHex(type) {
  return type === "HEX_VERTICAL" || type === "HEX_HORIZONTAL";
}

// Offset of cell (c, r) from the anchor hex center.
// HEX_VERTICAL: pointy-top hexes in rows, dpi = hex width. Every second row shifts sideways.
// HEX_HORIZONTAL: flat-top hexes in columns, dpi = hex height. Every second column shifts up/down.
function cellOffset(type, dpi, shift, c, r) {
  if (type === "HEX_VERTICAL") {
    return { x: c * dpi + (mod2(r) ? (shift * dpi) / 2 : 0), y: r * dpi * SQRT3_2 };
  }
  return { x: c * dpi * SQRT3_2, y: r * dpi + (mod2(c) ? (shift * dpi) / 2 : 0) };
}

// Inverse of cellOffset for a point already snapped to a hex center.
function cellFromOffset(type, dpi, shift, dx, dy) {
  if (type === "HEX_VERTICAL") {
    const r = Math.round(dy / (dpi * SQRT3_2));
    const c = Math.round((dx - (mod2(r) ? (shift * dpi) / 2 : 0)) / dpi);
    return { c, r };
  }
  const c = Math.round(dx / (dpi * SQRT3_2));
  const r = Math.round((dy - (mod2(c) ? (shift * dpi) / 2 : 0)) / dpi);
  return { c, r };
}

async function gridInfo() {
  const [type, dpi] = await Promise.all([OBR.scene.grid.getType(), OBR.scene.grid.getDpi()]);
  return { type, dpi };
}

// Center of the hex under a scene position.
export async function snapToHex(position) {
  return OBR.scene.grid.snapPosition(position, 1, false, true);
}

// Center of the hex under the first selected item.
export async function selectedHexCenter() {
  const { type } = await gridInfo();
  if (!isHex(type)) return { ok: false, error: "Scene grid is not a hex grid." };
  const sel = await OBR.player.getSelection();
  if (!sel || sel.length === 0) return { ok: false, error: "Select a token on the first hex, then press Set." };
  const bounds = await OBR.scene.items.getItemBounds([sel[0]]);
  const center = await snapToHex(bounds.center);
  return { ok: true, center: { x: center.x, y: center.y } };
}

// Key of the hex under a scene position, or null if outside the keyed area.
export async function keyAt(position) {
  const cfg = await loadConfig();
  if (!cfg.anchor) return null;
  const { type, dpi } = await gridInfo();
  if (!isHex(type)) return null;
  const center = await snapToHex(position);
  const { c, r } = cellFromOffset(type, dpi, cfg.shift, center.x - cfg.anchor.x, center.y - cfg.anchor.y);
  if (c < 0 || r < 0 || c >= cfg.cols || r >= cfg.rows) return null;
  return hexKey(cfg, c, r);
}

/* ---------- labels ---------- */

const isLabel = (item) => item.metadata && item.metadata[LABEL_KEY] !== undefined;

async function clearFrom(api) {
  const ids = (await api.getItems(isLabel)).map((i) => i.id);
  for (let i = 0; i < ids.length; i += 200) {
    await api.deleteItems(ids.slice(i, i + 200));
  }
  return ids.length;
}

// Shared labels: real scene items everyone sees (SHOW mode).
export const clearLabels = () => clearFrom(OBR.scene.items);
// Private labels: drawn only in this browser (HIDE / OFF modes).
export const clearLocalLabels = () => clearFrom(OBR.scene.local);

// Where a text item's box sits relative to its `position`, and what it rotates about,
// measured with Owlbear's own bounds so labels land centered whatever the convention is.
let calib = null;
async function getCalib() {
  if (calib) return calib;
  const w = 100;
  const h = 40;
  const probe = (rot) =>
    buildText()
      .plainText("0")
      .textType("PLAIN")
      .width(w)
      .height(h)
      .position({ x: 0, y: 0 })
      .rotation(rot)
      .layer("DRAWING")
      .locked(true)
      .disableHit(true)
      .build();
  const a = probe(0);
  const b = probe(90);
  try {
    await OBR.scene.local.addItems([a, b]);
    const [ba, bb] = await Promise.all([OBR.scene.local.getItemBounds([a.id]), OBR.scene.local.getItemBounds([b.id])]);
    const kx = ba.center.x / w;
    const ky = ba.center.y / h;
    if (Number.isFinite(kx) && Number.isFinite(ky)) {
      // Rotated 90 degrees about the position the center moves to (-h*ky, w*kx);
      // about the box center it stays at (w*kx, h*ky).
      const dPos = Math.hypot(bb.center.x + h * ky, bb.center.y - w * kx);
      const dCen = Math.hypot(bb.center.x - w * kx, bb.center.y - h * ky);
      calib = { kx, ky, about: dCen < dPos ? "center" : "position" };
    }
  } catch (_) {
    /* fall back below */
  } finally {
    try {
      await OBR.scene.local.deleteItems([a.id, b.id]);
    } catch (_) {
      /* already gone */
    }
  }
  return calib || { kx: 0.5, ky: 0.5, about: "position" };
}

// Text items for every hex, or { error } if the scene can't take them.
async function buildLabels(cfg) {
  if (!cfg.anchor) return { error: "Set the first hex first." };
  const { type, dpi } = await gridInfo();
  if (!isHex(type)) return { error: "Scene grid is not a hex grid." };
  if (cfg.cols * cfg.rows > MAX_HEXES) return { error: `Too many hexes (max ${MAX_HEXES}).` };

  const font = fontByName(cfg.font);
  const fontPx = dpi * cfg.textSize;
  const theta = ((cfg.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const h = fontPx * 1.4;
  const cal = await getCalib();

  const items = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const key = hexKey(cfg, c, r);
      const w = key.length * fontPx * 0.8 + 8;
      const off = cellOffset(type, dpi, cfg.shift, c, r);
      const cx = cfg.anchor.x + off.x + cfg.ox * dpi;
      const cy = cfg.anchor.y + off.y + cfg.oy * dpi;
      // Place the item's position so the box center lands on (cx, cy).
      const kx = cal.kx * w;
      const ky = cal.ky * h;
      const px = cal.about === "center" ? cx - kx : cx - (kx * cos - ky * sin);
      const py = cal.about === "center" ? cy - ky : cy - (kx * sin + ky * cos);
      items.push(
        buildText()
          .plainText(key)
          .richText([{ type: "paragraph", children: [{ text: key, bold: !!cfg.bold, italic: !!cfg.italic }] }])
          .textType("RICH")
          .fontFamily(font.obr)
          .fontSize(fontPx)
          .fontWeight(cfg.bold ? 700 : 400)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fillColor(cfg.fillColor)
          .fillOpacity(1)
          .strokeColor(cfg.strokeColor)
          .strokeOpacity(cfg.strokeWidth > 0 ? 1 : 0)
          .strokeWidth(cfg.strokeWidth)
          .padding(0)
          .width(w)
          .height(h)
          .position({ x: px, y: py })
          .rotation(cfg.rot || 0)
          .layer("DRAWING")
          .locked(true)
          .disableHit(true)
          .visible(true)
          .metadata({ [LABEL_KEY]: true })
          .build()
      );
    }
  }
  return { items };
}

async function place(api, cfg) {
  const built = await buildLabels(cfg);
  if (built.error) return { ok: false, error: built.error };
  await clearFrom(api);
  for (let i = 0; i < built.items.length; i += 250) {
    await api.addItems(built.items.slice(i, i + 250));
  }
  return { ok: true, count: built.items.length };
}

export const applyLabels = (cfg) => place(OBR.scene.items, cfg);
export const applyLocalLabels = (cfg) => place(OBR.scene.local, cfg);

// Redraw requests collapse: only the newest one runs, and two never run at once.
function makeQueue(run) {
  let busy = false;
  let next = null;
  return (cfg, onResult) => {
    next = { cfg, onResult };
    if (busy) return;
    busy = true;
    (async () => {
      while (next) {
        const job = next;
        next = null;
        let res;
        try {
          res = await run(job.cfg);
        } catch (e) {
          res = { ok: false, error: `Could not place labels: ${e && e.message ? e.message : e}` };
        }
        if (job.onResult) job.onResult(res);
      }
      busy = false;
    })();
  };
}

export const queueLabels = makeQueue(applyLabels);
export const queueLocalLabels = makeQueue(applyLocalLabels);

/* ---------- personal show/hide (this browser only) ---------- */

const PERSONAL_KEY = `${ID}/personal`;
let personalMem = null;
let channel = null;
try {
  channel = new BroadcastChannel(PERSONAL_KEY);
} catch (_) {
  channel = null;
}

// GMs start with labels on, players start with them off.
export function getPersonal(role) {
  if (personalMem !== null) return personalMem;
  try {
    const v = localStorage.getItem(PERSONAL_KEY);
    if (v === "on") return true;
    if (v === "off") return false;
  } catch (_) {
    /* storage unavailable */
  }
  return role === "GM";
}

export function setPersonal(on) {
  personalMem = on;
  try {
    localStorage.setItem(PERSONAL_KEY, on ? "on" : "off");
  } catch (_) {
    /* storage unavailable */
  }
  if (channel) channel.postMessage(on);
}

export function onPersonalChange(cb) {
  const fromChannel = (e) => {
    personalMem = !!e.data;
    cb();
  };
  const fromStorage = (e) => {
    if (e.key === PERSONAL_KEY) {
      personalMem = e.newValue === "on";
      cb();
    }
  };
  if (channel) channel.addEventListener("message", fromChannel);
  window.addEventListener("storage", fromStorage);
  return () => {
    if (channel) channel.removeEventListener("message", fromChannel);
    window.removeEventListener("storage", fromStorage);
  };
}

// Who sees private labels in this browser right now.
export function wantsLocalLabels(role, cfg, personal) {
  if (!cfg.anchor || cfg.visibility === "SHOW") return false;
  if (role === "GM") return personal;
  return cfg.visibility === "HIDE" && personal;
}
