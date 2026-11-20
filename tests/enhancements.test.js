import assert from "node:assert/strict";
import { test } from "node:test";
import {
  orderedCustomRolls,
  rollOrderUpdates,
  bloodPotencyCost,
  acquisitionCost,
  supplementalXPUpdate,
  remainingXP,
} from "../scripts/rules.js";
import { createVampireSheet } from "../scripts/sheet.js";

const items = [
  { id: "a", name: "A", type: "customRoll", sort: 2000 },
  { id: "b", name: "B", type: "customRoll", sort: 1000 },
  { id: "power", name: "Poder", type: "power", sort: 0 },
];
test("saved rolls follow persisted item order instead of alphabetical order", () => {
  assert.deepEqual(
    orderedCustomRolls(items).map((item) => item.id),
    ["b", "a"],
  );
  assert.deepEqual(rollOrderUpdates(items, "a", -1), [
    { _id: "a", sort: 1000 },
    { _id: "b", sort: 2000 },
  ]);
  assert.deepEqual(rollOrderUpdates(items, "b", -1), []);
  assert.deepEqual(rollOrderUpdates(items, "a", 1), []);
  assert.throws(() => rollOrderUpdates(items, "power", 1));
  assert.equal(items[0].sort, 2000);
});

test("potency sums each new level, while individual acquisitions do not", () => {
  assert.equal(bloodPotencyCost(1, 3).cost, 50);
  assert.equal(bloodPotencyCost(9, 10).cost, 100);
  assert.equal(acquisitionCost("advantage", 4).cost, 12);
  assert.equal(acquisitionCost("formula", 3).cost, 9);
  assert.equal(acquisitionCost("ritual", 3).cost, 9);
  assert.throws(() => bloodPotencyCost(1, 11));
  assert.throws(() => acquisitionCost("ritual", 0));
  assert.throws(() => acquisitionCost("unknown", 3));
});

test("potency and XP are changed in one update; acquisitions only register their XP debit", () => {
  const source = { blood: { potency: 1 }, exp: { value: 60 }, experiences: [] };
  const request = {
    to: 3,
    label: "Potência de Sangue",
    expectedFrom: 1,
    expectedXP: 60,
    entryId: "new",
    timestamp: 1234,
  };
  const update = supplementalXPUpdate(source, { ...request, kind: "blood-potency" });
  assert.equal(update["system.blood.potency"], 3);
  assert.equal(remainingXP({ ...source, experiences: update["system.experiences"] }), 10);
  const ritual = supplementalXPUpdate(source, {
    ...request,
    kind: "ritual",
    label: "Ritual de teste",
  });
  assert.deepEqual(Object.keys(ritual), ["system.experiences"]);
  assert.equal(ritual["system.experiences"][0].value, -9);
  assert.equal(source.experiences.length, 0);
  assert.throws(
    () => supplementalXPUpdate(source, { ...request, kind: "blood-potency", expectedXP: 59 }),
    /mudou/,
  );
  assert.throws(
    () => supplementalXPUpdate(source, { ...request, kind: "blood-potency", expectedFrom: 2 }),
    /mudou/,
  );
  assert.throws(
    () =>
      supplementalXPUpdate(
        { ...source, exp: { value: 2 } },
        { ...request, kind: "formula", expectedXP: 2 },
      ),
    /insuficiente/,
  );
});

class Base {
  static PARTS = {};
}
const Sheet = createVampireSheet(Base);
test("explicit clan, other and Caitiff selections choose the correct discipline rate", () => {
  globalThis.game = { i18n: { lang: "pt-BR" } };
  globalThis.WOD5E = {
    Attributes: { getList: () => ({}) },
    Skills: { getList: () => ({}) },
    Disciplines: { getList: () => ({ auspex: { displayName: "Auspícios" } }) },
  };
  const system = { disciplines: { auspex: { value: 1 } }, exp: { value: 50 } };
  for (const [kind, cost] of [
    ["discipline-clan", 10],
    ["discipline-other", 14],
    ["discipline-caitiff", 12],
  ]) {
    const sheet = {
      actor: { system, _source: { system } },
      _training: { kind, path: "disciplines.auspex", to: "2" },
    };
    assert.equal(Sheet.prototype._advancementQuote.call(sheet).cost, cost);
  }
});
test("deletion requires confirmation, ownership and a custom roll", async () => {
  const deleted = [];
  const sheet = {
    actor: {
      isOwner: true,
      items,
      deleteEmbeddedDocuments: async (type, ids) => deleted.push(ids),
    },
    isEditable: true,
  };
  globalThis.ui = {
    notifications: {
      error: (message) => {
        throw new Error(message);
      },
    },
  };
  globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => false } } } };
  await Sheet.deleteRoll.call(sheet, {}, { dataset: { itemId: "a" } });
  assert.equal(deleted.length, 0);
  foundry.applications.api.DialogV2.confirm = async () => true;
  await Sheet.deleteRoll.call(sheet, {}, { dataset: { itemId: "power" } });
  assert.equal(deleted.length, 0);
  await Sheet.deleteRoll.call(sheet, {}, { dataset: { itemId: "a" } });
  assert.deepEqual(deleted, [["a"]]);
  sheet.actor.isOwner = false;
  await Sheet.deleteRoll.call(sheet, {}, { dataset: { itemId: "b" } });
  assert.equal(deleted.length, 1);
});

test("reordering writes only sort fields on custom rolls", async () => {
  const writes = [];
  const sheet = {
    actor: {
      isOwner: true,
      items,
      updateEmbeddedDocuments: async (type, updates) => writes.push(updates),
    },
    isEditable: true,
  };
  await Sheet.moveRoll.call(sheet, {}, { dataset: { itemId: "a", direction: "-1" } });
  assert.deepEqual(writes[0], [
    { _id: "a", sort: 1000 },
    { _id: "b", sort: 2000 },
  ]);
});
