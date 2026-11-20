import {
  MODULE_ID,
  CATEGORIES,
  advancementCost,
  advancementUpdate,
  baseRating,
  remainingXP,
  savedRollData,
  dicePreview,
  normalizeSearch,
} from "./rules.js";

const GROUP_NAMES = { attributes: "Atributos", skills: "Habilidades", disciplines: "Disciplinas" };
const REGISTRIES = { attributes: "Attributes", skills: "Skills", disciplines: "Disciplines" };
const NON_TRAITS = ["rituals", "ceremonies", "alchemy"];

export function catalogFor(actor) {
  return CATEGORIES.map((category) => {
    const definitions = WOD5E[REGISTRIES[category]].getList({});
    const traits = Object.entries(definitions)
      .filter(
        ([id, definition]) =>
          !definition.hidden && !(category === "disciplines" && NON_TRAITS.includes(id)),
      )
      .map(([id, definition]) => ({
        id,
        category,
        path: `${category}.${id}`,
        label: definition.displayName || definition.label || id,
        value: Number(actor.system[category]?.[id]?.value ?? (category === "attributes" ? 1 : 0)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    return { category, label: GROUP_NAMES[category], traits };
  });
}

export function createVampireSheet(BaseSheet) {
  return class EverestVampireSheet extends BaseSheet {
    static DEFAULT_OPTIONS = {
      classes: ["wod5e", "actor", "sheet", "vampire", "everest-v5-sheet"],
      position: { width: 1120, height: 860 },
      actions: {
        ev5SelectTrait: this.selectTrait,
        ev5SaveRoll: this.saveRoll,
        ev5RollPool: this.rollPool,
        ev5Advance: this.advance,
      },
    };

    static PARTS = {
      header: { template: `modules/${MODULE_ID}/templates/header.hbs` },
      tabs: { template: `modules/${MODULE_ID}/templates/tabs.hbs` },
      session: { template: `modules/${MODULE_ID}/templates/session.hbs` },
      advancement: { template: `modules/${MODULE_ID}/templates/advancement.hbs` },
      ...Object.fromEntries(
        Object.entries(BaseSheet.PARTS).filter(([key]) => !["header", "tabs"].includes(key)),
      ),
    };

    constructor(options = {}) {
      super(options);
      this.tabs = {
        session: {
          id: "session",
          group: "primary",
          title: "Em sessão",
          icon: '<i class="fa-solid fa-dice-d10"></i>',
        },
        advancement: {
          id: "advancement",
          group: "primary",
          title: "Evolução",
          icon: '<i class="fa-solid fa-arrow-trend-up"></i>',
        },
        ...this.tabs,
      };
      this.tabGroups.primary = "session";
      this._selectedPaths = new Set();
      this._rollName = "";
      this._modifier = 0;
      this._query = "";
      this._training = { path: "", to: "", rate: "" };
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      if (!this.actor.limited) context.ev5XP = remainingXP(this.actor._source.system);
      return context;
    }

    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (!["session", "advancement"].includes(partId) || this.actor.limited) return context;
      const catalog = catalogFor(this.actor);
      const traits = catalog.flatMap((group) => group.traits);
      const traitMap = new Map(traits.map((trait) => [trait.path, trait]));
      const savedRolls = this.actor.items
        .filter((item) => item.type === "customRoll")
        .map((item) => {
          const paths = Object.values(item.system.dicepool ?? {}).map((entry) => entry.path);
          const total =
            paths.reduce((sum, path) => sum + (traitMap.get(path)?.value ?? 0), 0) +
            Number(item.system.modifier ?? 0);
          return {
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            pool: Math.max(0, total),
            description: paths.map((path) => traitMap.get(path)?.label ?? path).join(" + "),
            modifier: item.system.modifier || 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const powers = this.actor.items
        .filter((item) => item.type === "power")
        .map((item) => ({
          id: item.id,
          uuid: item.uuid,
          name: item.name,
          discipline:
            traitMap.get(`disciplines.${item.system.discipline}`)?.label || item.system.discipline,
          level: item.system.level,
          cost: item.system.cost,
          rollable: Object.keys(item.system.dicepool ?? {}).length > 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        ...context,
        tab: context.tabs[partId],
        ev5: {
          catalog,
          savedRolls,
          powers,
          xp: remainingXP(this.actor._source.system),
          editable: this.actor.isOwner && this.isEditable,
        },
      };
    }

    async _onRender(...args) {
      await super._onRender(...args);
      this._ev5Listeners?.abort();
      if (this.actor.limited) return;
      this._ev5Listeners = new AbortController();
      const signal = this._ev5Listeners.signal;
      // These controls are transient UI state, never actor form fields. Stop
      // their changes before the native submitOnChange form handler sees them.
      for (const section of this.element.querySelectorAll(".ev5-session, .ev5-advancement")) {
        section.addEventListener(
          "change",
          (event) => {
            if (!event.target.matches("[data-ev5-input]")) return;
            event.stopPropagation();
            this._readUIState();
          },
          { signal },
        );
        section.addEventListener(
          "input",
          (event) => {
            if (!event.target.matches("[data-ev5-input]")) return;
            event.stopPropagation();
            this._readUIState();
          },
          { signal },
        );
        section.addEventListener(
          "keydown",
          (event) => {
            if (event.key === "Enter" && event.target.matches("input[data-ev5-input]"))
              event.preventDefault();
          },
          { signal },
        );
      }
      this._restoreUIState();
      this._updateComposer();
      this._updateAdvancement();
      this._filterRows();
    }

    _field(name) {
      return this.element.querySelector(`[data-ev5-input="${name}"]`);
    }

    _restoreUIState() {
      for (const [name, value] of Object.entries({
        search: this._query,
        rollName: this._rollName,
        modifier: this._modifier,
        trait: this._training.path,
        target: this._training.to,
        rate: this._training.rate,
      })) {
        const field = this._field(name);
        if (field) field.value = value;
      }
    }

    _readUIState() {
      this._query = this._field("search")?.value ?? this._query;
      this._rollName = this._field("rollName")?.value ?? this._rollName;
      this._modifier = Number(this._field("modifier")?.value ?? this._modifier);
      const path = this._field("trait")?.value ?? this._training.path;
      if (path !== this._training.path) {
        this._training.path = path;
        this._training.rate = "";
        this._training.to = path ? String(baseRating(this.actor._source.system, path) + 1) : "";
        this._restoreUIState();
      } else {
        this._training.to = this._field("target")?.value ?? this._training.to;
        this._training.rate = this._field("rate")?.value ?? this._training.rate;
      }
      this._updateComposer();
      this._updateAdvancement();
      this._filterRows();
    }

    _filterRows() {
      const query = normalizeSearch(this._query);
      let visible = 0;
      for (const row of this.element.querySelectorAll("[data-ev5-search]")) {
        const matches = normalizeSearch(row.dataset.ev5Search).includes(query);
        row.hidden = !matches;
        if (matches) visible++;
      }
      const empty = this.element.querySelector("[data-ev5-empty-search]");
      if (empty) empty.hidden = visible > 0 || !query;
    }

    _poolData() {
      const traits = catalogFor(this.actor).flatMap((group) => group.traits);
      const selected = traits.filter((trait) => this._selectedPaths.has(trait.path));
      const total =
        selected.reduce((sum, trait) => sum + trait.value, 0) +
        (Number.isInteger(this._modifier) ? this._modifier : 0);
      return { traits, selected, ...dicePreview(total, Number(this.actor.system.hunger.value)) };
    }

    _updateComposer() {
      const pool = this._poolData();
      for (const button of this.element.querySelectorAll('[data-action="ev5SelectTrait"]')) {
        button.setAttribute("aria-pressed", String(this._selectedPaths.has(button.dataset.path)));
      }
      const labels = this.element.querySelector("[data-ev5-selected]");
      if (labels)
        labels.textContent = pool.selected.length
          ? pool.selected.map((trait) => `${trait.label} ${trait.value}`).join(" + ")
          : "Selecione as características abaixo";
      const preview = this.element.querySelector("[data-ev5-preview]");
      if (preview)
        preview.textContent = `${pool.total} dados · ${pool.normal} comuns + ${pool.hunger} de Fome`;
      const disabled =
        !pool.selected.length ||
        !Number.isInteger(this._modifier) ||
        Math.abs(this._modifier) > 30 ||
        !this.actor.isOwner;
      for (const button of this.element.querySelectorAll(
        '[data-action="ev5RollPool"], [data-action="ev5SaveRoll"]',
      ))
        button.disabled = disabled;
    }

    _advancementQuote() {
      const trait = catalogFor(this.actor)
        .flatMap((group) => group.traits)
        .find((entry) => entry.path === this._training.path);
      if (!trait) throw new Error("Escolha a característica que deseja evoluir.");
      const source = this.actor._source.system;
      const from = baseRating(source, trait.path);
      const quote = advancementCost(
        trait.category,
        from,
        Number(this._training.to),
        this._training.rate,
      );
      return { ...quote, trait, from, to: Number(this._training.to), balance: remainingXP(source) };
    }

    _updateAdvancement() {
      const rate = this.element.querySelector("[data-ev5-rate]");
      if (rate) rate.hidden = !this._training.path.startsWith("disciplines.");
      const result = this.element.querySelector("[data-ev5-quote]");
      const submit = this.element.querySelector('[data-action="ev5Advance"]');
      if (!result || !submit) return;
      try {
        const quote = this._advancementQuote();
        result.textContent = `${quote.trait.label}: ${quote.from} → ${quote.to} · ${quote.steps.map((step) => `${step.level} × ${quote.multiplier}`).join(" + ")} = ${quote.cost} XP. Saldo após evolução: ${quote.balance - quote.cost} XP.`;
        submit.disabled = this._spending || quote.balance < quote.cost || !this.actor.isOwner;
      } catch (error) {
        result.textContent = error.message;
        submit.disabled = true;
      }
    }

    static selectTrait(_event, target) {
      const path = target.dataset.path;
      if (
        !catalogFor(this.actor).some((group) => group.traits.some((trait) => trait.path === path))
      )
        return;
      if (this._selectedPaths.has(path)) this._selectedPaths.delete(path);
      else if (this._selectedPaths.size < 3) this._selectedPaths.add(path);
      else return ui.notifications.info("Use até três características por rolagem.");
      this._updateComposer();
    }

    static async saveRoll() {
      if (!this.actor.isOwner || !this.isEditable || this._saving) return;
      this._saving = true;
      try {
        const pool = this._poolData();
        const data = savedRollData({
          name: this._rollName || pool.selected.map((trait) => trait.label).join(" + "),
          paths: [...this._selectedPaths],
          modifier: this._modifier,
          knownPaths: pool.traits.map((trait) => trait.path),
        });
        await this.actor.createEmbeddedDocuments("Item", [data]);
        ui.notifications.info(
          "Rolagem salva na ficha. O pool acompanha a evolução das características.",
        );
      } catch (error) {
        ui.notifications.error(error.message);
      } finally {
        this._saving = false;
      }
    }

    static async rollPool() {
      if (!this.actor.isOwner) return;
      try {
        const pool = this._poolData();
        savedRollData({
          name: "Pool",
          paths: [...this._selectedPaths],
          modifier: this._modifier,
          knownPaths: pool.traits.map((trait) => trait.path),
        });
        await WOD5E.api.RollFromDataset({
          actor: this.actor,
          dataset: {
            valuePaths: [...this._selectedPaths].map((path) => `${path}.value`).join(" "),
            selectors: [
              ...new Set([...this._selectedPaths].flatMap((path) => [...path.split("."), path])),
            ].join(" "),
            flatMod: this._modifier,
            label: this._rollName || pool.selected.map((trait) => trait.label).join(" + "),
            selectDialog: false,
          },
        });
      } catch (error) {
        ui.notifications.error(error.message);
      }
    }

    static async advance() {
      if (!this.actor.isOwner || !this.isEditable || this._spending) return;
      this._spending = true;
      this._updateAdvancement();
      try {
        const quote = this._advancementQuote();
        const rate = this._training.rate;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Confirmar evolução" },
          content: `<p>Aplicar a evolução de nível ${quote.from} para ${quote.to} por <strong>${quote.cost} XP</strong>?</p><p>Saldo: ${quote.balance} → ${quote.balance - quote.cost} XP.</p>`,
          rejectClose: false,
        });
        if (!confirmed) return;
        if (!this.actor.isOwner || !this.isEditable)
          throw new Error("Você não pode editar esta ficha.");
        const update = advancementUpdate(this.actor._source.system, {
          path: quote.trait.path,
          to: quote.to,
          rate,
          label: quote.trait.label,
          expectedFrom: quote.from,
          expectedXP: quote.balance,
          entryId: foundry.utils.randomID(16),
          timestamp: Date.now(),
        });
        await this.actor.update(update);
        ui.notifications.info(
          `Evolução aplicada. ${quote.cost} XP registrados no histórico da ficha.`,
        );
      } catch (error) {
        ui.notifications.error(error.message);
      } finally {
        this._spending = false;
        this._updateAdvancement();
      }
    }

    async _onClose(...args) {
      this._ev5Listeners?.abort();
      return super._onClose(...args);
    }
  };
}
