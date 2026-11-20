import assert from "node:assert/strict";
import { test } from "node:test";
import { acquisitionCost, supplementalXPUpdate, remainingXP } from "../scripts/rules.js";
import { createVampireSheet } from "../scripts/sheet.js";

test("a new specialty costs exactly 3 XP regardless of skill rating or level input", () => {
  for (const level of [undefined, 1, 3, 5, 10])
    assert.equal(acquisitionCost("specialty", level).cost, 3);
  class Base {
    static PARTS = {};
  }
  const Sheet = createVampireSheet(Base);
  const system = { exp: { value: 10 } };
  const quote = Sheet.prototype._advancementQuote.call({
    actor: { _source: { system } },
    _training: { kind: "specialty", name: "Furtividade: sombras", to: "5" },
  });
  assert.equal(quote.cost, 3);
  assert.equal(quote.to, 1);
});

test("specialty purchase debits 3 XP, records the acquisition and refuses insufficient balance", () => {
  const source = { exp: { value: 5 }, experiences: [] };
  const request = {
    kind: "specialty",
    label: "Furtividade: sombras",
    to: 1,
    expectedXP: 5,
    entryId: "specialty",
    timestamp: 1,
  };
  const update = supplementalXPUpdate(source, request);
  assert.equal(remainingXP({ ...source, experiences: update["system.experiences"] }), 2);
  assert.equal(update["system.experiences"][0].value, -3);
  assert.match(update["system.experiences"][0].name, /nova especialidade/);
  assert.doesNotMatch(update["system.experiences"][0].name, /nível/);
  assert.deepEqual(source.experiences, []);
  assert.throws(
    () => supplementalXPUpdate({ exp: { value: 2 } }, { ...request, expectedXP: 2 }),
    /insuficiente/,
  );
});
