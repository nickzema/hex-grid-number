import OBR from "@owlbear-rodeo/sdk";
import {
  TOOL_ID,
  MODE_READ,
  loadConfig,
  keyAt,
  getPersonal,
  onPersonalChange,
  wantsLocalLabels,
  queueLocalLabels,
  clearLocalLabels,
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

OBR.onReady(async () => {
  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: "/icon.svg", label: "Hex Grid Number" }],
    defaultMode: MODE_READ,
  });

  // Click a hex to read its key.
  await OBR.tool.createMode({
    id: MODE_READ,
    icons: [{ icon: "/read.svg", label: "Read Hex Key", filter: { activeTools: [TOOL_ID] } }],
    cursors: [{ cursor: "crosshair" }],
    shortcut: "N",
    onToolClick: async (_ctx, event) => {
      try {
        const [role, cfg] = await Promise.all([OBR.player.getRole(), loadConfig()]);
        const canSee = role === "GM" || cfg.visibility === "SHOW" || (cfg.visibility === "HIDE" && getPersonal(role));
        if (!canSee) return false;
        if (!cfg.anchor) {
          await OBR.notification.show("No hex numbering set up in this scene.", "WARNING");
          return false;
        }
        const key = await keyAt(event.pointerPosition);
        if (key) await OBR.notification.show(key, "INFO");
        else await OBR.notification.show("Outside the numbered area.", "WARNING");
      } catch (e) {
        await OBR.notification.show(`Read hex key failed: ${e && e.message ? e.message : e}`, "ERROR");
      }
      return false;
    },
  });

  OBR.scene.onReadyChange(() => scheduleSync(true));
  OBR.scene.onMetadataChange(() => scheduleSync());
  OBR.scene.grid.onChange(() => scheduleSync());
  OBR.player.onChange(() => scheduleSync());
  onPersonalChange(() => scheduleSync());
  scheduleSync(true);
});
