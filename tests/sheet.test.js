import assert from "node:assert/strict";
import { test } from "node:test";
import { createVampireSheet } from "../scripts/sheet.js";

class NativeSheet {
  static PARTS = { header: {}, tabs: {}, stats: {}, limited: {} };
  constructor({ actor }) {
    this.actor = actor;
    this.isEditable = true;
    this.tabs = { stats: { id: "stats" } };
    this.tabGroups = {};
  }
}

globalThis.WOD5E = Object.fromEntries(
  [
    ["Attributes", { strength: { displayName: "Força" } }],
    ["Skills", { stealth: { displayName: "Furtividade" } }],
    ["Disciplines", { auspex: { displayName: "Auspícios" } }],
  ].map(([name, definitions]) => [name, { getList: () => definitions }]),
);
globalThis.game = { i18n: { lang: "pt-BR" } };
const errors = [];
globalThis.ui = { notifications: { info() {}, error: (message) => errors.push(message) } };
const Sheet = createVampireSheet(NativeSheet);

function setup(confirm) {
  errors.length = 0;
  const writes = [];
  const system = {
    attributes: { strength: { value: 2 } },
    skills: {},
    disciplines: {},
    hunger: { value: 2 },
    exp: { value: 30 },
    experiences: [],
  };
  const actor = {
    isOwner: true,
    system: { ...system, attributes: { strength: { value: 4 } } },
    _source: { system },
    update: async (data) => writes.push(data),
  };
  globalThis.foundry = {
    applications: { api: { DialogV2: { confirm } } },
    utils: { randomID: () => "transaction" },
  };
  const sheet = new Sheet({ actor });
  sheet._training = { path: "attributes.strength", to: "3", rate: "" };
  sheet._updateAdvancement = () => {};
  return { sheet, actor, writes };
}

test("alternative sheet retains native parts and begins in the session tab", () => {
  const { sheet } = setup(async () => true);
  assert.ok(Sheet.PARTS.stats);
  assert.ok(Sheet.PARTS.limited);
  assert.equal(sheet.tabGroups.primary, "session");
});

test("XP purchase uses source rating instead of an effect-modified rating", async () => {
  const { sheet, writes } = setup(async () => true);
  await Sheet.advance.call(sheet);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]["system.attributes.strength.value"], 3);
  assert.equal(writes[0]["system.experiences"][0].value, -15);
});

test("double-clicking while confirming cannot spend XP twice", async () => {
  let confirm;
  const { sheet, writes } = setup(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  const first = Sheet.advance.call(sheet);
  await Sheet.advance.call(sheet);
  confirm(true);
  await first;
  assert.equal(writes.length, 1);
});

test("cancel, revoked ownership and stale XP all leave the actor untouched", async () => {
  let state = setup(async () => false);
  await Sheet.advance.call(state.sheet);
  assert.equal(state.writes.length, 0);

  state = setup(async () => {
    state.actor.isOwner = false;
    return true;
  });
  await Sheet.advance.call(state.sheet);
  assert.equal(state.writes.length, 0);

  state = setup(async () => {
    state.actor._source.system.exp.value = 0;
    return true;
  });
  await Sheet.advance.call(state.sheet);
  assert.equal(state.writes.length, 0);
  assert.match(errors.at(-1), /mudou/);
});
