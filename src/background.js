import OBR from "@owlbear-rodeo/sdk";
import {
  loadConfig,
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
  OBR.scene.onReadyChange(() => scheduleSync(true));
  OBR.scene.onMetadataChange(() => scheduleSync());
  OBR.scene.grid.onChange(() => scheduleSync());
  OBR.player.onChange(() => scheduleSync());
  onPersonalChange(() => scheduleSync());
  scheduleSync(true);
});
