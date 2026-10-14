import OBR, { buildText } from "@owlbear-rodeo/sdk";

export const ID = "com.zemaria.hex-grid-number";
export const CONFIG_KEY = `${ID}/config`;
export const LABEL_KEY = `${ID}/label`;
export const TOOL_ID = `${ID}/tool`;
export const MODE_READ = `${ID}/read`;
export const MODE_ANCHOR = `${ID}/anchor`;
export const MAX_HEXES = 2500;

export const DEFAULTS = {
  anchor: null, // center of the first hex, in scene coordinates
  cols: 20,
  rows: 20,
  startCol: "AA",
  startRow: 1,
  shift: 1, // 1: every second column/row sits down/right. -1: up/left
  players: true, // labels visible to players
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

function colIndex(letters) {
  const s = String(letters || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return 0;
  return (s.charCodeAt(0) - 65) * 26 + (s.charCodeAt(1) - 65);
}

function colName(i) {
  if (i < 0 || i >= 676) return String(i);
  return String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
}

export function hexKey(cfg, c, r) {
  const row = String(cfg.startRow + r).padStart(2, "0");
  return `${colName(colIndex(cfg.startCol) + c)}.${row}`;
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
  if (!cfg.anchor) return { ok: false, error: "Set the anchor hex first." };
  const { type, dpi } = await gridInfo();
  if (!isHex(type)) return { ok: false, error: "Scene grid is not a hex grid." };
  if (cfg.cols * cfg.rows > MAX_HEXES) return { ok: false, error: `Too many hexes (max ${MAX_HEXES}).` };

  await clearLabels();

  const w = dpi * 0.8;
  const h = dpi * 0.3;
  const items = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const off = cellOffset(type, dpi, cfg.shift, c, r);
      const cx = cfg.anchor.x + off.x;
      const cy = cfg.anchor.y + off.y - dpi * 0.28;
      items.push(
        buildText()
          .plainText(hexKey(cfg, c, r))
          .textType("PLAIN")
          .fontSize(dpi * 0.2)
          .fontWeight(700)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fillColor("#111111")
          .fillOpacity(0.9)
          .strokeColor("#FCFBF8")
          .strokeOpacity(0.9)
          .strokeWidth(2)
          .padding(0)
          .width(w)
          .height(h)
          .position({ x: cx - w / 2, y: cy - h / 2 })
          .layer("DRAWING")
          .locked(true)
          .disableHit(true)
          .visible(cfg.players)
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
