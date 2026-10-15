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
  visibility: "ALL", // ALL | GM | OFF
  font: DEFAULT_FONT,
  textSize: 0.2, // fraction of the hex size (grid dpi)
  bold: true,
  italic: false,
  color: "dark", // dark | light
  rot: 0, // degrees
  ox: 0, // label offset from the hex center, in hex sizes (dpi)
  oy: 0,
};

const SQRT3_2 = Math.sqrt(3) / 2;
const mod2 = (n) => ((n % 2) + 2) % 2;

/* ---------- config ---------- */

export async function loadConfig() {
  const meta = await OBR.scene.getMetadata();
  return { ...DEFAULTS, ...(meta[CONFIG_KEY] || {}) };
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
const TEMPLATE_RE = /^([A-Za-z]+|\d+)([,.;:'\-_`/\\| ]?)(\d+)$/;

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
    colWidth: colTok.length,
    sep,
    rowStart: parseInt(rowTok, 10),
    rowWidth: rowTok.length,
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

export function hexKey(cfg, c, r) {
  const p = templateOf(cfg);
  let col;
  if (p.alpha) {
    col = colName(p.colStart + c);
    if (p.lower) col = col.toLowerCase();
  } else {
    col = String(p.colStart + c).padStart(p.colWidth, "0");
  }
  const row = String(p.rowStart + r).padStart(p.rowWidth, "0");
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

export async function clearLabels() {
  const ids = (await OBR.scene.items.getItems(isLabel)).map((i) => i.id);
  for (let i = 0; i < ids.length; i += 200) {
    await OBR.scene.items.deleteItems(ids.slice(i, i + 200));
  }
  return ids.length;
}

export async function setLabelVisibility(visible) {
  await OBR.scene.items.updateItems(isLabel, (items) => {
    for (const item of items) item.visible = visible;
  });
}

export async function applyLabels(cfg) {
  if (cfg.visibility === "OFF") {
    await clearLabels();
    return { ok: true, count: 0, off: true };
  }
  if (!cfg.anchor) return { ok: false, error: "Set the first hex first." };
  const { type, dpi } = await gridInfo();
  if (!isHex(type)) return { ok: false, error: "Scene grid is not a hex grid." };
  if (cfg.cols * cfg.rows > MAX_HEXES) return { ok: false, error: `Too many hexes (max ${MAX_HEXES}).` };

  await clearLabels();

  const font = fontByName(cfg.font);
  const dark = cfg.color !== "light";
  const fill = dark ? "#111111" : "#FFFFFF";
  const stroke = dark ? "#FCFBF8" : "#111111";
  const fontPx = dpi * cfg.textSize;
  const theta = ((cfg.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const h = fontPx * 1.4;
  const visible = cfg.visibility === "ALL";

  const items = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const key = hexKey(cfg, c, r);
      const w = key.length * fontPx * 0.8 + 8;
      const off = cellOffset(type, dpi, cfg.shift, c, r);
      const cx = cfg.anchor.x + off.x + cfg.ox * dpi;
      const cy = cfg.anchor.y + off.y + cfg.oy * dpi;
      // Items rotate about their position (top-left), so place that point so the
      // text's center lands on (cx, cy) after rotating.
      const px = cx - ((w / 2) * cos - (h / 2) * sin);
      const py = cy - ((w / 2) * sin + (h / 2) * cos);
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
          .fillColor(fill)
          .fillOpacity(0.9)
          .strokeColor(stroke)
          .strokeOpacity(0.9)
          .strokeWidth(2)
          .padding(0)
          .width(w)
          .height(h)
          .position({ x: px, y: py })
          .rotation(cfg.rot || 0)
          .layer("DRAWING")
          .locked(true)
          .disableHit(true)
          .visible(visible)
          .metadata({ [LABEL_KEY]: true })
          .build()
      );
    }
  }
  for (let i = 0; i < items.length; i += 250) {
    await OBR.scene.items.addItems(items.slice(i, i + 250));
  }
  return { ok: true, count: items.length };
}

// Redraw requests collapse: only the newest one runs, and two never run at once.
let busy = false;
let next = null;
export function queueLabels(cfg, onResult) {
  next = { cfg, onResult };
  if (busy) return;
  busy = true;
  (async () => {
    while (next) {
      const job = next;
      next = null;
      let res;
      try {
        res = await applyLabels(job.cfg);
      } catch (e) {
        res = { ok: false, error: `Could not place labels: ${e && e.message ? e.message : e}` };
      }
      if (job.onResult) job.onResult(res);
    }
    busy = false;
  })();
}
