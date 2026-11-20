export const MODULE_ID = "everest-v5-sheets";
export const CATEGORIES = ["attributes", "skills", "disciplines"];
export const DISCIPLINE_RATES = { clan: 5, other: 7, caitiff: 6 };

export function normalizeSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function parseTraitPath(path) {
  const match = /^(attributes|skills|disciplines)\.([a-zA-Z0-9_-]+)$/.exec(path ?? "");
  if (!match || ["__proto__", "constructor", "prototype"].includes(match[2])) {
    throw new Error("Característica inválida.");
  }
  return { category: match[1], id: match[2] };
}

export function advancementCost(category, from, to, disciplineRate) {
  const min = category === "attributes" ? 1 : 0;
  if (
    !CATEGORIES.includes(category) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < min ||
    to <= from ||
    to > 5
  ) {
    throw new Error("Escolha uma evolução válida, até o nível 5.");
  }
  const multiplier =
    category === "attributes" ? 5 : category === "skills" ? 3 : DISCIPLINE_RATES[disciplineRate];
  if (!multiplier) throw new Error("Selecione a categoria de custo da disciplina.");
  const steps = Array.from({ length: to - from }, (_, index) => ({
    level: from + index + 1,
    cost: (from + index + 1) * multiplier,
  }));
  return { multiplier, steps, cost: steps.reduce((sum, step) => sum + step.cost, 0) };
}

export function remainingXP(system) {
  return (
    (Number.parseInt(system.exp?.value) || 0) +
    (system.experiences ?? []).reduce((sum, entry) => sum + (Number.parseInt(entry.value) || 0), 0)
  );
}

export function baseRating(source, path) {
  const { category, id } = parseTraitPath(path);
  const value = source[category]?.[id]?.value;
  return value === undefined ? (category === "attributes" ? 1 : 0) : Number(value);
}

// Use the document source, not effect-modified values. Spend XP and change the
// trait in the same document update, recording the debit in the native ledger.
export function advancementUpdate(
  source,
  { path, to, rate, label, expectedFrom, expectedXP, entryId, timestamp },
) {
  const { category, id } = parseTraitPath(path);
  const from = baseRating(source, path);
  const balance = remainingXP(source);
  if (from !== expectedFrom || balance !== expectedXP)
    throw new Error("A ficha mudou. Confira o custo novamente.");
  const quote = advancementCost(category, from, to, rate);
  if (balance < quote.cost) throw new Error("XP disponível insuficiente.");
  if (!entryId || !Number.isFinite(timestamp)) throw new Error("Registro de evolução inválido.");
  const entry = {
    id: entryId,
    name: `${label}: ${from} → ${to} (${quote.cost} XP)`,
    value: -quote.cost,
    timestamp,
    everest: {
      path,
      from,
      to,
      rate: category === "disciplines" ? rate : undefined,
      cost: quote.cost,
    },
  };
  const update = {
    [`system.${category}.${id}.value`]: to,
    "system.experiences": [...(source.experiences ?? []), entry],
  };
  if (category === "disciplines") update[`system.disciplines.${id}.visible`] = true;
  return update;
}

export function savedRollData({ name, paths, modifier = 0, knownPaths }) {
  const cleanName = String(name ?? "")
    .trim()
    .slice(0, 100);
  if (!cleanName) throw new Error("Dê um nome à rolagem.");
  const unique = [...new Set(paths)];
  if (!unique.length || unique.length > 3 || !Number.isInteger(modifier) || Math.abs(modifier) > 30)
    throw new Error("Selecione de 1 a 3 características e um modificador válido.");
  for (const path of unique) {
    parseTraitPath(path);
    if (!knownPaths.includes(path)) throw new Error("Característica não encontrada na ficha.");
  }
  return {
    name: cleanName,
    type: "customRoll",
    img: "icons/svg/d10-grey.svg",
    system: {
      modifier,
      dicepool: Object.fromEntries(unique.map((path, index) => [`pool${index}`, { path }])),
    },
  };
}

export function dicePreview(total, hunger) {
  const pool = Math.max(0, total);
  const hungerDice = Math.min(pool, Math.max(0, hunger));
  return { total: pool, hunger: hungerDice, normal: pool - hungerDice };
}

export function orderedCustomRolls(items) {
  return [...items]
    .filter((item) => item.type === "customRoll")
    .sort(
      (a, b) =>
        (Number(a.sort) || 0) - (Number(b.sort) || 0) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

export function rollOrderUpdates(items, itemId, direction) {
  const ordered = orderedCustomRolls(items);
  const index = ordered.findIndex((item) => item.id === itemId);
  if (index < 0 || ![-1, 1].includes(direction)) throw new Error("Rolagem ou direção inválida.");
  const next = index + direction;
  if (next < 0 || next >= ordered.length) return [];
  [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
  return ordered.map((item, position) => ({ _id: item.id, sort: (position + 1) * 1000 }));
}

export function bloodPotencyCost(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > 10) {
    throw new Error("Escolha uma Potência de Sangue maior que a atual, até 10.");
  }
  const steps = Array.from({ length: to - from }, (_, index) => ({
    level: from + index + 1,
    cost: (from + index + 1) * 10,
  }));
  return { multiplier: 10, steps, cost: steps.reduce((sum, step) => sum + step.cost, 0) };
}

export function acquisitionCost(kind, level) {
  if (
    !["advantage", "formula", "ritual"].includes(kind) ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 5
  ) {
    throw new Error("Selecione de 1 a 5 pontos ou um nível de aquisição válido.");
  }
  return {
    cost: level * 3,
    calculation: kind === "advantage" ? `${level} ponto(s) × 3` : `nível ${level} × 3`,
  };
}

export function supplementalXPUpdate(
  source,
  { kind, to, label, expectedFrom, expectedXP, entryId, timestamp },
) {
  const name = String(label ?? "")
    .trim()
    .slice(0, 100);
  if (!name || !entryId || !Number.isFinite(timestamp))
    throw new Error("Informe o nome da aquisição.");
  if (remainingXP(source) !== expectedXP)
    throw new Error("A ficha mudou. Confira o custo novamente.");
  let quote;
  let from;
  if (kind === "blood-potency") {
    from = Number(source.blood?.potency ?? 0);
    if (from !== expectedFrom) throw new Error("A ficha mudou. Confira o custo novamente.");
    quote = bloodPotencyCost(from, to);
  } else quote = acquisitionCost(kind, to);
  if (remainingXP(source) < quote.cost) throw new Error("XP disponível insuficiente.");
  const update = {
    "system.experiences": [
      ...(source.experiences ?? []),
      {
        id: entryId,
        name: `${name}${kind === "blood-potency" ? `: ${from} → ${to}` : ` (${to} ${kind === "advantage" ? "ponto(s)" : "nível"})`} — ${quote.cost} XP`,
        value: -quote.cost,
        timestamp,
        everest: { kind, from, to, cost: quote.cost },
      },
    ],
  };
  if (kind === "blood-potency") update["system.blood.potency"] = to;
  return update;
}
