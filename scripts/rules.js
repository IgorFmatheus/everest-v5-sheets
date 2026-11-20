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
