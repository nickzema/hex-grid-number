import OBR from "@owlbear-rodeo/sdk";
import { TOOL_ID, MODE_READ, loadConfig, keyAt } from "./lib.js";

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
        if (role !== "GM" && !cfg.players) return false;
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
});
