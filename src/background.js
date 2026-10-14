import OBR from "@owlbear-rodeo/sdk";
import { TOOL_ID, MODE_READ, MODE_ANCHOR, loadConfig, saveConfig, keyAt, snapToHex, hexKey, isHex } from "./lib.js";

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
      const [role, cfg] = await Promise.all([OBR.player.getRole(), loadConfig()]);
      if (role !== "GM" && !cfg.players) return false;
      if (!cfg.anchor) {
        await OBR.notification.show("No hex numbering set up in this scene.", "WARNING");
        return false;
      }
      const key = await keyAt(event.pointerPosition);
      if (key) await OBR.notification.show(key, "INFO");
      else await OBR.notification.show("Outside the numbered area.", "WARNING");
      return false;
    },
  });

  // GM: click a hex to make it the first hex (AA.01).
  await OBR.tool.createMode({
    id: MODE_ANCHOR,
    icons: [{ icon: "/anchor.svg", label: "Set First Hex", filter: { activeTools: [TOOL_ID], roles: ["GM"] } }],
    cursors: [{ cursor: "crosshair" }],
    onToolClick: async (_ctx, event) => {
      const type = await OBR.scene.grid.getType();
      if (!isHex(type)) {
        await OBR.notification.show("Scene grid is not a hex grid.", "ERROR");
        return false;
      }
      const center = await snapToHex(event.pointerPosition);
      const cfg = await loadConfig();
      const next = { ...cfg, anchor: { x: center.x, y: center.y } };
      await saveConfig(next);
      await OBR.notification.show(`First hex set (${hexKey(next, 0, 0)}).`, "SUCCESS");
      await OBR.tool.activateMode(TOOL_ID, MODE_READ);
      return false;
    },
  });
});
