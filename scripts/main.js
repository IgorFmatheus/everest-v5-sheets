import { createVampireSheet } from "./sheet.js";
import { MODULE_ID } from "./rules.js";

Hooks.once("init", async () => {
  if (game.system.id !== "wod5e" || game.system.version !== "5.3.15") {
    Hooks.once("ready", () =>
      ui.notifications.warn("Everest V5 Sheets requer wod5e 5.3.15 e Foundry 13."),
    );
    return;
  }
  // Extend the installed system; do not redistribute its engine or modify actors.
  const { VampireActorSheet } =
    await import("/systems/wod5e/system/actor/vtm/vampire-actor-sheet.js");
  const EverestVampireSheet = createVampireSheet(VampireActorSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    EverestVampireSheet,
    {
      types: ["vampire"],
      label: "Everest — V5 • Sessão e Evolução",
      makeDefault: false,
    },
  );
});
