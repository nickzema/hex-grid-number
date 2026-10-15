import OBR, { buildCurve } from "@owlbear-rodeo/sdk";
import {
  ID,
  PICK_CHANNEL,
  loadConfig,
  saveConfig,
  getPersonal,
  onPersonalChange,
  wantsLocalLabels,
  queueLabels,
  queueLocalLabels,
  clearLocalLabels,
  snapToHex,
  getLattice,
  cellOutline,
  isSupported,
  hexKey,
} from "./lib.js";

// Private labels (HIDE and OFF modes) are drawn in each browser that has the
// extension installed. SHOW mode uses shared scene items drawn from the popover.
let syncTimer = null;
let lastSig = null;
function scheduleSync(reset) {
  if (reset === true) lastSig = null;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncLocal, 250);
}

// Selection and metadata events fire a lot, so only redraw when something
// that changes the labels is different from the last time.
async function syncLocal() {
  try {
    if (!(await OBR.scene.isReady())) {
      lastSig = null;
      return;
    }
    const [role, cfg, type, dpi] = await Promise.all([
      OBR.player.getRole(),
      loadConfig(),
      OBR.scene.grid.getType(),
      OBR.scene.grid.getDpi(),
    ]);
    const want = wantsLocalLabels(role, cfg, getPersonal(role));
    const sig = JSON.stringify(want ? [cfg, type, dpi] : null);
    if (sig === lastSig) return;
    lastSig = sig;
    if (want) queueLocalLabels(cfg);
    else await clearLocalLabels();
  } catch (_) {
    lastSig = null; // the scene changed under us; the next change syncs again
  }
}

/* ---------- picking the first hex by clicking on the map ---------- */

// A tool that exists only while you are choosing the first hex: it appears when you press Set,
// shows a highlight on the hex under the cursor, and goes away once you click one (or press Esc,
// or pick another tool).
const PICK_TOOL = `${ID}/pick`;
const PICK_MODE = `${ID}/pick-mode`;
const SELECT_TOOL = "rodeo.move";
const HILITE_KEY = `${ID}/pick-highlight`;

let picking = false;
let hiliteId = null;
let hiliteBusy = false;
let hiliteLast = null;
let stopToolWatch = null;

async function setHighlight(center) {
  if (hiliteBusy) return;
  const key = `${Math.round(center.x)},${Math.round(center.y)}`;
  if (key === hiliteLast) return;
  hiliteBusy = true;
  try {
    const [type, dpi] = await Promise.all([OBR.scene.grid.getType(), OBR.scene.grid.getDpi()]);
    const pts = cellOutline(type, dpi, await getLattice(type, dpi), center);
    if (hiliteId) {
      await OBR.scene.local.updateItems([hiliteId], (items) => {
        for (const it of items) it.points = pts;
      });
    } else {
      const item = buildCurve()
        .points(pts)
        .tension(0)
        .closed(true)
        .fillColor("#BB99FF")
        .fillOpacity(0.25)
        .strokeColor("#BB99FF")
        .strokeWidth(5)
        .layer("DRAWING")
        .locked(true)
        .disableHit(true)
        .metadata({ [HILITE_KEY]: true })
        .build();
      hiliteId = item.id;
      await OBR.scene.local.addItems([item]);
    }
    hiliteLast = key;
  } catch (_) {
    hiliteId = null;
  } finally {
    hiliteBusy = false;
  }
}

async function finishPick(message) {
  if (!picking) return;
  picking = false;
  if (stopToolWatch) stopToolWatch();
  stopToolWatch = null;
  hiliteLast = null;
  try {
    await OBR.scene.local.deleteItems((await OBR.scene.local.getItems((i) => i.metadata && i.metadata[HILITE_KEY])).map((i) => i.id));
  } catch (_) {
    /* already gone */
  }
  hiliteId = null;
  try {
    await OBR.tool.activateTool(SELECT_TOOL);
  } catch (_) {
    /* the tool is removed below anyway */
  }
  try {
    await OBR.tool.removeMode(PICK_MODE);
    await OBR.tool.remove(PICK_TOOL);
  } catch (_) {
    /* already removed */
  }
  if (message) OBR.notification.show(message);
}

async function pickedHex(position) {
  try {
    const [type, dpi] = await Promise.all([OBR.scene.grid.getType(), OBR.scene.grid.getDpi()]);
    if (!isSupported(type)) return finishPick("This grid type isn't supported.");
    const center = await snapToHex(position);
    const cfg = { ...(await loadConfig()), anchor: { x: center.x, y: center.y } };
    await saveConfig(cfg);
    queueLabels(cfg, (res) => {
      if (!res.ok) OBR.notification.show(res.error, "ERROR");
    });
    await finishPick(`First hex set (${hexKey(cfg, 0, 0)}).`);
  } catch (e) {
    await finishPick(`Could not set the first hex: ${e && e.message ? e.message : e}`);
  }
}

async function startPick() {
  if (picking) return;
  if ((await OBR.player.getRole()) !== "GM") return;
  picking = true;
  try {
    await OBR.tool.create({
      id: PICK_TOOL,
      icons: [{ icon: "/pick.svg", label: "Click the first hex", filter: { roles: ["GM"] } }],
      defaultMode: PICK_MODE,
    });
    await OBR.tool.createMode({
      id: PICK_MODE,
      icons: [{ icon: "/pick.svg", label: "Click the first hex", filter: { activeTools: [PICK_TOOL] } }],
      cursors: [{ cursor: "crosshair" }],
      onToolClick: async (_ctx, event) => {
        await pickedHex(event.pointerPosition);
        return false;
      },
      onToolMove: async (_ctx, event) => {
        try {
          await setHighlight(await snapToHex(event.pointerPosition));
        } catch (_) {
          /* off the map */
        }
      },
      onKeyDown: (_ctx, event) => {
        if (event.key === "Escape") finishPick("Cancelled.");
      },
    });
    stopToolWatch = OBR.tool.onToolChange((id) => {
      if (id !== PICK_TOOL) finishPick();
    });
    await OBR.tool.activateTool(PICK_TOOL);
    await OBR.tool.activateMode(PICK_TOOL, PICK_MODE);
    OBR.notification.show("Click the first hex on the map. Esc cancels.");
  } catch (e) {
    picking = true;
    await finishPick(`Could not start picking: ${e && e.message ? e.message : e}`);
  }
}

OBR.onReady(async () => {
  OBR.scene.onReadyChange(() => scheduleSync(true));
  OBR.scene.onMetadataChange(() => scheduleSync());
  OBR.scene.grid.onChange(() => scheduleSync());
  OBR.player.onChange(() => scheduleSync());
  onPersonalChange(() => scheduleSync());
  OBR.broadcast.onMessage(PICK_CHANNEL, () => startPick());
  scheduleSync(true);
});
