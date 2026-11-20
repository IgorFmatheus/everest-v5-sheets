import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advancementCost,
  advancementUpdate,
  remainingXP,
  savedRollData,
  normalizeSearch,
  dicePreview,
  parseTraitPath,
} from "../scripts/rules.js";

test("V5 costs use the new rating and add every intermediate dot", () => {
  assert.equal(advancementCost("attributes", 2, 3).cost, 15);
  assert.equal(advancementCost("attributes", 2, 4).cost, 35);
  assert.equal(advancementCost("skills", 0, 1).cost, 3);
  assert.equal(advancementCost("skills", 2, 4).cost, 21);
  assert.equal(advancementCost("disciplines", 1, 2, "clan").cost, 10);
  assert.equal(advancementCost("disciplines", 1, 2, "other").cost, 14);
  assert.equal(advancementCost("disciplines", 1, 2, "caitiff").cost, 12);
  assert.equal(advancementCost("disciplines", 0, 2, "other").cost, 21);
});

test("invalid advancements and an unspecified discipline category are rejected", () => {
  for (const args of [
    ["attributes", 0, 1],
    ["attributes", 2, 2],
    ["skills", 2, 1],
    ["skills", 2, 6],
    ["skills", 2, 3.5],
    ["disciplines", 1, 2],
    ["other", 1, 2],
  ]) {
    assert.throws(() => advancementCost(...args));
  }
});

const source = {
  attributes: { strength: { value: 2 } },
  skills: { stealth: { value: 1 } },
  disciplines: { auspex: { value: 1 } },
  exp: { value: 10, max: 10 },
  experiences: [
    { id: "earned", value: 30 },
    { id: "spent", value: -5 },
  ],
};
const request = {
  path: "attributes.strength",
  to: 3,
  label: "Força",
  expectedFrom: 2,
  expectedXP: 35,
  entryId: "new",
  timestamp: 1234,
};

test("legacy XP and native ledger entries produce the available balance", () => {
  assert.equal(remainingXP(source), 35);
  assert.equal(
    remainingXP({ exp: { value: "10" }, experiences: [{ value: "7" }, { value: "-3" }] }),
    14,
  );
  assert.equal(remainingXP({}), 0);
});

test("advancement is one update of the base trait and native XP ledger, without mutating source", () => {
  const before = structuredClone(source);
  const update = advancementUpdate(source, request);
  assert.equal(update["system.attributes.strength.value"], 3);
  assert.equal(update["system.experiences"].at(-1).value, -15);
  assert.equal(update["system.experiences"].at(-1).everest.from, 2);
  assert.deepEqual(source, before);
  assert.equal(remainingXP({ ...source, experiences: update["system.experiences"] }), 20);
});

test("insufficient XP, changed ratings, and stale XP snapshots never produce an update", () => {
  assert.throws(() => advancementUpdate(source, { ...request, to: 5 }), /insuficiente/);
  assert.throws(() => advancementUpdate(source, { ...request, expectedFrom: 1 }), /mudou/);
  assert.throws(() => advancementUpdate(source, { ...request, expectedXP: 50 }), /mudou/);
});

test("discipline advancement makes the discipline visible and debits the chosen rate", () => {
  const update = advancementUpdate(source, {
    ...request,
    path: "disciplines.auspex",
    expectedFrom: 1,
    to: 2,
    rate: "other",
  });
  assert.equal(update["system.disciplines.auspex.value"], 2);
  assert.equal(update["system.disciplines.auspex.visible"], true);
  assert.equal(update["system.experiences"].at(-1).value, -14);
});

test("saved rolls store native trait paths instead of freezing dice totals", () => {
  const paths = ["attributes.strength", "skills.stealth"];
  const roll = savedRollData({ name: " Teste ", paths, modifier: -1, knownPaths: paths });
  assert.equal(roll.name, "Teste");
  assert.equal(roll.type, "customRoll");
  assert.deepEqual(
    Object.values(roll.system.dicepool),
    paths.map((path) => ({ path })),
  );
  assert.equal(roll.system.modifier, -1);
  assert.throws(() => savedRollData({ name: "Teste", paths, knownPaths: [] }));
  assert.throws(() => savedRollData({ name: "Teste", paths, knownPaths: paths, modifier: 1.5 }));
});

test("unsafe trait paths are rejected and searching ignores Portuguese accents", () => {
  assert.throws(() => parseTraitPath("attributes.__proto__"));
  assert.throws(() => parseTraitPath("skills.stealth.value"));
  assert.equal(normalizeSearch("  Persuasão  "), "persuasao");
  assert.equal(normalizeSearch("Inteligência"), "inteligencia");
});

test("preview never creates more hunger dice than the pool", () => {
  assert.deepEqual(dicePreview(3, 5), { total: 3, hunger: 3, normal: 0 });
  assert.deepEqual(dicePreview(7, 2), { total: 7, hunger: 2, normal: 5 });
  assert.deepEqual(dicePreview(-2, 3), { total: 0, hunger: 0, normal: 0 });
});
