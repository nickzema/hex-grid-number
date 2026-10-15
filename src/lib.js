import OBR, { buildText } from "@owlbear-rodeo/sdk";
import { fontFor, DEFAULT_FONT } from "./fonts.js";

export const ID = "com.zemaria.hex-grid-number";
export const CONFIG_KEY = `${ID}/config`;
export const LABEL_KEY = `${ID}/label`;
export const TOOL_ID = `${ID}/tool`;
export const MODE_READ = `${ID}/read`;
export const MAX_HEXES = 2500;
// Map Location Keys (by Alvaro Cavalcanti) lists every text item that carries this metadata.
export const MLK_KEY = "es.memorablenaton.map-location-keys/metadata";
export const MLK_INSTALL = "https://map-location-keys.vercel.app/manifest.json";
// A short fingerprint of how a label looks, so unchanged labels are left alone.
const SIG_KEY = `${ID}/sig`;
const mlkDefault = (key) => `# ${key}\n\n**Description:**\n\n**Features:**\n\n**Creatures:**\n\n**Notes:**`;
// An entry nobody has written in yet.
const mlkUntouched = (meta, key) => !meta || (meta.locationKey === mlkDefault(key) && !meta.playerInfo && !meta.isPlayerVisible);

export const MODES = ["GRID", "RING", "SPIRAL"];

export const DEFAULTS = {
  anchor: null, // center of the first hex (the center hex in RING and SPIRAL), in scene coordinates
  mode: "GRID", // GRID: columns and rows | RING: the letter is the ring | SPIRAL: one number spiraling out
  lastRing: "D", // RING: the last ring to number, in the template's style (a letter, or a number for 01.01)
  spiralTemplate: "1", // SPIRAL: the center hex's number; its shape sets the padding
  spiralCount: 61, // SPIRAL: how many hexes to number
  start: 0, // RING and SPIRAL: which of the six neighbors the walk starts at (0 = top, then clockwise)
  dir: 1, // RING and SPIRAL: 1 clockwise, -1 counter-clockwise
  cols: 20,
  rows: 20,
  template: "A.01", // the first hex's key; its shape sets the style of every key
  shift: 1, // 1: every second column/row sits down/right. -1: up/left
  visibility: "SHOW", // SHOW: everyone, locked on | HIDE: players can opt in | OFF: players get nothing
  font: DEFAULT_FONT,
  fontCustom: "", // fontFamily copied from a selected Owlbear text item (font: "Custom")
  textSize: 0.2, // fraction of the hex size (grid dpi)
  bold: true,
  italic: false,
  align: "CENTER", // LEFT | CENTER | RIGHT: how a number sits in its label box
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

// SPIRAL numbers: "1", "0", "001", "-3".
export function parseSpiral(text) {
  const m = /^(-?\d+)$/.exec(String(text ?? "").trim());
  if (!m) return null;
  return { start: parseInt(m[1], 10), width: m[1].replace("-", "").length };
}

export const parseFor = (mode, text) => (mode === "SPIRAL" ? parseSpiral(text) : parseTemplate(text));
export const templateFor = (cfg) => (cfg.mode === "SPIRAL" ? cfg.spiralTemplate : cfg.template);

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

// RING: how many rings go past the center, from the "last ring" box.
export function ringInfo(cfg) {
  const p = parseTemplate(cfg.template) || parseTemplate(DEFAULTS.template);
  const t = String(cfg.lastRing ?? "").trim();
  let last;
  if (p.alpha) {
    if (!/^[A-Za-z]+$/.test(t)) return { error: "Last ring needs letters, like D." };
    last = colIndex(t);
  } else {
    if (!/^-?\d+$/.test(t)) return { error: "Last ring needs a number." };
    last = parseInt(t, 10);
  }
  const rings = last - p.colStart;
  if (rings < 0) return { error: "Last ring comes before the first ring." };
  return { rings, total: 1 + 3 * rings * (rings + 1) };
}

export function hexCount(cfg) {
  if (cfg.mode === "RING") {
    const info = ringInfo(cfg);
    return info.error ? 0 : info.total;
  }
  if (cfg.mode === "SPIRAL") return cfg.spiralCount;
  return cfg.cols * cfg.rows;
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

// Angles (degrees, y down, so increasing = clockwise) of the six neighbors: from the top for
// flat-top hexes, from the upper right for pointy-top hexes.
export const neighborAngles = (type) => (type === "HEX_VERTICAL" ? [-60, 0, 60, 120, 180, 240] : [-90, -30, 30, 90, 150, 210]);

// The six neighbor steps in walking order: begin at neighbor `start`, then go round in `dir`.
// Every neighbor sits exactly one dpi away.
function neighborDirs(type, dpi, start = 0, dir = 1) {
  const angles = neighborAngles(type);
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (angles[(((start || 0) + (dir === -1 ? -k : k)) % 6 + 6) % 6] * Math.PI) / 180;
    return { x: Math.cos(a) * dpi, y: Math.sin(a) * dpi };
  });
}

// Ring n (n >= 1) has 6n hexes, starting at the top and going clockwise.
function ringOffsets(n, dirs) {
  if (n === 0) return [{ x: 0, y: 0 }];
  const out = [];
  for (let k = 0; k < 6; k++) {
    const a = dirs[k];
    const step = dirs[(k + 2) % 6];
    for (let i = 0; i < n; i++) out.push({ x: n * a.x + i * step.x, y: n * a.y + i * step.y });
  }
  return out;
}

// Every keyed hex as { key, x, y }, x/y measured from the anchor hex center.
export function layout(cfg, type, dpi) {
  const out = [];
  if (cfg.mode === "RING") {
    const info = ringInfo(cfg);
    if (info.error) return { error: info.error };
    const p = parseTemplate(cfg.template) || parseTemplate(DEFAULTS.template);
    const dirs = neighborDirs(type, dpi, cfg.start, cfg.dir);
    for (let ring = 0; ring <= info.rings; ring++) {
      let col = p.alpha ? colName(p.colStart + ring) : num(p.colStart + ring, p.colWidth);
      if (p.alpha && p.lower) col = col.toLowerCase();
      ringOffsets(ring, dirs).forEach((o, i) => out.push({ key: `${col}${p.sep}${num(p.rowStart + i, p.rowWidth)}`, x: o.x, y: o.y }));
    }
  } else if (cfg.mode === "SPIRAL") {
    const sp = parseSpiral(cfg.spiralTemplate) || { start: 1, width: 1 };
    const dirs = neighborDirs(type, dpi, cfg.start, cfg.dir);
    for (let ring = 0; out.length < cfg.spiralCount; ring++) {
      let offs = ringOffsets(ring, dirs);
      // From ring 2 on, start a little before the top so each ring picks up right next to
      // where the last one ended and the spiral never jumps.
      if (ring >= 2) offs = [...offs.slice(5 * ring + 1), ...offs.slice(0, 5 * ring + 1)];
      for (const o of offs) {
        if (out.length >= cfg.spiralCount) break;
        out.push({ key: num(sp.start + out.length, sp.width), x: o.x, y: o.y });
      }
    }
  } else {
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        const o = cellOffset(type, dpi, cfg.shift, c, r);
        out.push({ key: hexKey(cfg, c, r), x: o.x, y: o.y });
      }
    }
  }
  return { items: out };
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
  const lay = layout(cfg, type, dpi);
  if (lay.error) return null;
  const dx = center.x - cfg.anchor.x;
  const dy = center.y - cfg.anchor.y;
  for (const h of lay.items) {
    if (Math.hypot(h.x - dx, h.y - dy) < dpi * 0.4) return h.key;
  }
  return null;
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
async function buildLabels(cfg, opts = {}) {
  if (!cfg.anchor) return { error: "Set the first hex first." };
  const { type, dpi } = await gridInfo();
  if (!isHex(type)) return { error: "Scene grid is not a hex grid." };
  if (hexCount(cfg) > MAX_HEXES) return { error: `Too many hexes (max ${MAX_HEXES}).` };
  const lay = layout(cfg, type, dpi);
  if (lay.error) return { error: lay.error };

  const font = fontFor(cfg);
  const fontPx = dpi * cfg.textSize;
  const theta = ((cfg.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const h = fontPx * 1.4;
  const cal = await getCalib();
  // Every label box is as wide as the longest number, so Left and Right line the numbers up.
  const longest = lay.items.reduce((m, hx) => Math.max(m, hx.key.length), 1);
  const w = longest * fontPx * 0.8 + 8;
  const align = ["LEFT", "RIGHT"].includes(cfg.align) ? cfg.align : "CENTER";

  const items = [];
  for (const hex of lay.items) {
    {
      const key = hex.key;
      const cx = cfg.anchor.x + hex.x + cfg.ox * dpi;
      const cy = cfg.anchor.y + hex.y + cfg.oy * dpi;
      const center = `${Math.round(cfg.anchor.x + hex.x)},${Math.round(cfg.anchor.y + hex.y)}`;
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
          .textAlign(align)
          .textAlignVertical("MIDDLE")
          .fillColor(cfg.fillColor)
          .fillOpacity(opts.anchor ? 0 : 1)
          .strokeColor(cfg.strokeColor)
          .strokeOpacity(!opts.anchor && cfg.strokeWidth > 0 ? 1 : 0)
          .strokeWidth(cfg.strokeWidth)
          .padding(0)
          .width(w)
          .height(h)
          .position({ x: px, y: py })
          .rotation(cfg.rot || 0)
          .layer("DRAWING")
          .locked(true)
          .disableHit(true)
          .visible(!opts.anchor)
          .metadata({ [LABEL_KEY]: center })
          .build()
      );
    }
  }
  return { items };
}

// Private labels (this browser only): simply redrawn from scratch.
async function place(api, cfg) {
  const built = await buildLabels(cfg);
  if (built.error) return { ok: false, error: built.error };
  await clearFrom(api);
  for (let i = 0; i < built.items.length; i += 250) {
    await api.addItems(built.items.slice(i, i + 250));
  }
  return { ok: true, count: built.items.length };
}

const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const itemKey = (item) => `${item.metadata[LABEL_KEY]}|${(item.text && item.text.plainText) || ""}`;

// Shared labels are real scene items that Map Location Keys entries live on, so they are
// never deleted to change how they look. A label is kept (with everything attached to it)
// while its hex and its number stay the same; only a different number or hex replaces it.
async function planShared(cfg) {
  const built = await buildLabels(cfg, { anchor: cfg.visibility !== "SHOW" });
  if (built.error) return built;
  const existing = await OBR.scene.items.getItems(isLabel);
  const have = new Map();
  const remove = [];
  for (const it of existing) {
    const k = itemKey(it);
    if (have.has(k)) remove.push(it);
    else have.set(k, it);
  }
  const add = [];
  const update = [];
  for (const b of built.items) {
    b.metadata[SIG_KEY] = hash(JSON.stringify([b.position, b.rotation, b.visible, b.text]));
    const it = have.get(itemKey(b));
    if (it) {
      have.delete(itemKey(b));
      if (it.metadata[SIG_KEY] !== b.metadata[SIG_KEY]) update.push({ id: it.id, b });
    } else {
      add.push(b);
    }
  }
  for (const it of have.values()) remove.push(it);
  const entries = remove.filter((i) => i.metadata[MLK_KEY]);
  const noted = entries.filter((i) => !mlkUntouched(i.metadata[MLK_KEY], (i.text && i.text.plainText) || ""));
  return { built, add, update, remove, entries: entries.length, noted: noted.length };
}

// What a layout change would remove: how many hexes, how many are in Map Location Keys,
// and how many of those have something written in them.
export async function previewLabels(cfg) {
  const p = await planShared(cfg);
  if (p.error) return { ok: false, error: p.error };
  return { ok: true, removed: p.remove.length, entries: p.entries, noted: p.noted };
}

export async function syncLabels(cfg) {
  const p = await planShared(cfg);
  if (p.error) return { ok: false, error: p.error };
  const api = OBR.scene.items;
  for (let i = 0; i < p.add.length; i += 250) await api.addItems(p.add.slice(i, i + 250));
  for (let i = 0; i < p.update.length; i += 250) {
    const group = new Map(p.update.slice(i, i + 250).map((u) => [u.id, u.b]));
    await api.updateItems(
      (it) => group.has(it.id),
      (items) => {
        for (const it of items) {
          const b = group.get(it.id);
          it.position = b.position;
          it.rotation = b.rotation;
          it.visible = b.visible;
          it.text.richText = b.text.richText;
          it.text.style = b.text.style;
          it.text.width = b.text.width;
          it.text.height = b.text.height;
          it.metadata[SIG_KEY] = b.metadata[SIG_KEY];
        }
      }
    );
  }
  const gone = p.remove.map((i) => i.id);
  for (let i = 0; i < gone.length; i += 200) await api.deleteItems(gone.slice(i, i + 200));
  return { ok: true, count: p.built.items.length, added: p.add.length, updated: p.update.length, removed: gone.length };
}

// How many hexes exist and how many of them are in Map Location Keys.
export async function mlkSummary() {
  const labels = await OBR.scene.items.getItems(isLabel);
  const tagged = labels.filter((i) => i.metadata[MLK_KEY]);
  const noted = tagged.filter((i) => !mlkUntouched(i.metadata[MLK_KEY], (i.text && i.text.plainText) || ""));
  return { labels: labels.length, sent: tagged.length, noted: noted.length };
}

// Send the hexes that are on the map to Map Location Keys.
// "add": hexes already there keep their entries (and notes); the rest are added.
// "replace": every entry starts over, which erases notes.
export async function sendToMlk(how) {
  const api = OBR.scene.items;
  const labels = await api.getItems(isLabel);
  if (!labels.length) return { ok: false, error: "Set the first hex first." };
  const ids = new Set(labels.filter((i) => how === "replace" || !i.metadata[MLK_KEY]).map((i) => i.id));
  const list = [...ids];
  for (let i = 0; i < list.length; i += 200) {
    const group = new Set(list.slice(i, i + 200));
    await api.updateItems(
      (it) => group.has(it.id),
      (items) => {
        for (const it of items) {
          it.metadata[MLK_KEY] = { locationKey: mlkDefault(it.text.plainText), isPlayerEditable: true };
          // Map Location Keys only looks at TEXT and PROP layer items.
          it.layer = "TEXT";
        }
      }
    );
  }
  return { ok: true, count: labels.length, added: list.length };
}

export const applyLabels = syncLabels;
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

/* ---------- saved colors (this browser only) ---------- */

const COLORS_KEY = `${ID}/colors`;
let colorsMem = [];

export function getSavedColors() {
  try {
    const v = JSON.parse(localStorage.getItem(COLORS_KEY) || "[]");
    if (Array.isArray(v)) colorsMem = v.filter((c) => /^#[0-9A-F]{6}$/i.test(c)).map((c) => c.toUpperCase());
  } catch (_) {
    /* storage unavailable: keep what we have in memory */
  }
  return colorsMem;
}

export function saveColor(hex) {
  const c = String(hex).toUpperCase();
  if (!colorsMem.includes(c)) colorsMem = [...colorsMem, c];
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(colorsMem));
  } catch (_) {
    /* storage unavailable */
  }
  return colorsMem;
}

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
