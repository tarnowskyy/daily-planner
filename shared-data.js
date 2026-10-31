// Built from the PC app's shared data logic.
const sharedData = (() => {
const modules = { crypto: globalThis.crypto };
const require = (name) => modules[name];
modules['./grocery'] = (() => {
const module = { exports: {} };
// Builds a day's grocery list. No Electron code, so it can be tested on its own.
const WHOLE_UNIT = 'count/whole';
const NEAT_DENOMINATORS = [2, 3, 4, 6, 8, 16];
const FRACTION_CHARACTERS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8' };

// Rough on purpose: the result is only compared with other results, never shown,
// so it's fine that "molasses" becomes "molass" as long as both spellings land on the same word.
function singular(word) {
  if (word.length < 4) return word;
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ie')) return `${word.slice(0, -2)}y`;
  if (/(oes|ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function matchingKey(name) {
  const words = name.trim().toLowerCase().split(/\s+/);
  words.push(singular(words.pop()));
  return words.join(' ');
}

const greatestDivisor = (a, b) => (b === 0 ? a : greatestDivisor(b, a % b));

function fraction(top, bottom) {
  const divisor = greatestDivisor(top, bottom);
  return { top: top / divisor, bottom: bottom / divisor };
}

function addFractions(a, b) {
  return fraction(a.top * b.bottom + b.top * a.bottom, a.bottom * b.bottom);
}

// Amounts add up as exact fractions, so 1/3 + 1/3 + 1/3 comes to 1 rather than 0.99.
// Returns null for anything that isn't a plain number, like "a handful".
function parseAmount(text) {
  const clean = text.replace(/[½⅓⅔¼¾⅛]/g, (character) => ` ${FRACTION_CHARACTERS[character]}`).trim();
  const mixed = clean.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole = '0', top, bottom] = mixed;
    if (Number(bottom) === 0) return null;
    return fraction(Number(whole) * Number(bottom) + Number(top), Number(bottom));
  }
  const decimal = clean.match(/^(\d*)\.?(\d*)$/);
  if (!decimal || (!decimal[1] && !decimal[2])) return null;
  return fraction(Number(decimal[1] + decimal[2]), 10 ** decimal[2].length);
}

function formatAmount({ top, bottom }) {
  const whole = Math.floor(top / bottom);
  const rest = top % bottom;
  if (rest === 0) return String(whole);
  if (!NEAT_DENOMINATORS.includes(bottom)) return String(Math.round((top / bottom) * 100) / 100);
  return whole ? `${whole} ${rest}/${bottom}` : `${rest}/${bottom}`;
}

function unitLabel({ unit, customUnit }) {
  if (unit === 'custom') return customUnit.trim();
  return unit === WHOLE_UNIT ? '' : unit;
}

function addToGroup(group, amountText) {
  const amount = parseAmount(amountText);
  group.uses += 1;
  if (amount) {
    group.total = group.total ? addFractions(group.total, amount) : amount;
    group.firstTyped ??= amountText;
  } else if (amountText) {
    group.typed.push(amountText);
  } else {
    group.blank = true;
  }
}

function groupText({ label, total, typed, blank, uses, firstTyped }) {
  const withLabel = (amount) => `${amount} ${label}`.trim();
  const parts = typed.map(withLabel);
  // A single amount is shown exactly as typed. Only a real sum gets reformatted.
  if (total) parts.unshift(withLabel(uses === 1 ? firstTyped : formatAmount(total)));
  if (blank && parts.length === 0) parts.push(label || 'some');
  return parts;
}

function amountsText(groups) {
  const parts = groups.flatMap(groupText);
  const measured = parts.filter((part) => part !== 'some');
  if (measured.length === 0) return '';
  return (measured.length < parts.length ? [...measured, 'some'] : measured).join(' + ');
}

function buildGroceryList(ingredients, checked = {}) {
  const items = new Map();
  for (const ingredient of ingredients) {
    const name = ingredient.name.trim();
    if (!name) continue;
    const itemKey = matchingKey(name);
    if (!items.has(itemKey)) items.set(itemKey, { name, groups: new Map() });
    const { groups } = items.get(itemKey);

    const label = unitLabel(ingredient);
    const unitKey = matchingKey(label);
    if (!groups.has(unitKey)) groups.set(unitKey, { label, total: null, typed: [], blank: false, uses: 0, firstTyped: null });
    addToGroup(groups.get(unitKey), ingredient.amount.trim());
  }
  return [...items]
    .map(([key, { name, groups }]) => ({
      key,
      name,
      amounts: amountsText([...groups.values()]),
      checked: checked[key] === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { buildGroceryList, matchingKey, parseAmount, formatAmount };

return module.exports;
})();
modules['./plannerData'] = (() => {
const module = { exports: {} };
// The planner's rules for changing data: rules, days, meals, recipes, tags, settings.
// Shared with the phone app, so it must stay free of file access and of any personal text.
// Each app supplies its own saving (markDirty) and its own default rules.
const crypto = require('crypto');
const { buildGroceryList } = require('./grocery');

const SCHEMA_VERSION = 1;
const MIN_TEXT_SIZE = 14;
const MAX_TEXT_SIZE = 24;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_TEXT_FIELDS = ['studyTopic', 'gymDay', 'deepWorkTarget'];

const RECIPE_TYPES = ['Solid', 'Liquid'];
const UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'fl oz',
  'ml',
  'L',
  'cup',
  'tbsp',
  'tsp',
  'pinch',
  'count/whole',
  'clove',
  'slice',
  'can',
  'package',
  'custom',
];

const DEFAULT_TIME_TAGS = ['Breakfast', 'Lunch', 'Dinner', 'After Gym', 'Mid-Afternoon', 'Snack'];

const withId = (fields) => ({ id: crypto.randomUUID(), ...fields });
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// One entry per kind of data. See "Data design" in STATUS.md.
function storeDefinitions(defaultRules) {
  return {
    settings: {
      fileName: 'settings.json',
      defaults: () => ({ textSize: 16, launchOnStartup: false }),
      isValid: isObject,
    },
    rules: {
      fileName: 'rules.json',
      defaults: () => ({ rules: defaultRules.map((text) => withId({ text })) }),
      isValid: (data) => isObject(data) && Array.isArray(data.rules),
    },
    days: {
      fileName: 'days.json',
      defaults: () => ({ days: {} }),
      isValid: (data) => isObject(data) && isObject(data.days),
    },
    recipes: {
      fileName: 'recipes.json',
      defaults: () => ({ recipes: [] }),
      isValid: (data) => isObject(data) && Array.isArray(data.recipes),
    },
    tags: {
      fileName: 'tags.json',
      defaults: () => ({ tags: DEFAULT_TIME_TAGS.map((name) => withId({ name })) }),
      isValid: (data) => isObject(data) && Array.isArray(data.tags),
    },
  };
}

function emptyDay() {
  return { studyTopic: '', gymDay: '', deepWorkTarget: '', meals: [], groceryChecked: {} };
}

// Returns whether anything moved.
function moveInList(list, id, offset) {
  const from = list.findIndex((item) => item.id === id);
  const to = from + offset;
  if (from === -1 || to < 0 || to >= list.length) return false;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return true;
}

function cleanIngredient({ name, amount, unit, customUnit }) {
  const knownUnit = UNITS.includes(unit) ? unit : '';
  return {
    name: String(name ?? '').trim(),
    amount: String(amount ?? '').trim(),
    unit: knownUnit,
    customUnit: knownUnit === 'custom' ? String(customUnit ?? '').trim() : '',
  };
}

class PlannerData {
  constructor() {
    this.data = {};
  }

  // Rules

  getRules() {
    return this.data.rules.rules;
  }

  addRule(text) {
    this.getRules().push(withId({ text }));
    this.markDirty('rules');
    return this.getRules();
  }

  updateRule(id, text) {
    const rule = this.getRules().find((candidate) => candidate.id === id);
    if (rule) {
      rule.text = text;
      this.markDirty('rules');
    }
    return this.getRules();
  }

  deleteRule(id) {
    this.data.rules.rules = this.getRules().filter((rule) => rule.id !== id);
    this.markDirty('rules');
    return this.getRules();
  }

  moveRule(id, offset) {
    if (moveInList(this.getRules(), id, offset)) this.markDirty('rules');
    return this.getRules();
  }

  // Days

  getDay(date) {
    return { ...emptyDay(), ...this.data.days.days[date] };
  }

  getDays(dates) {
    return Object.fromEntries(dates.map((date) => [date, this.getDay(date)]));
  }

  setDay(date, changes) {
    if (!DATE_PATTERN.test(date)) throw new Error(`Invalid date: ${date}`);
    this.data.days.days[date] = { ...this.getDay(date), ...changes };
    this.markDirty('days');
  }

  setDayField(date, field, value) {
    if (!DAY_TEXT_FIELDS.includes(field)) throw new Error(`Invalid day field: ${field}`);
    this.setDay(date, { [field]: String(value) });
  }

  // A day plus its grocery list, which is always worked out fresh from the current recipes.
  getDayPlan(date) {
    const day = this.getDay(date);
    return { ...day, grocery: buildGroceryList(this.dayIngredients(day), day.groceryChecked) };
  }

  // A meal only carries its own ingredients once its recipe has been deleted.
  dayIngredients(day) {
    return day.meals.flatMap((meal) => meal.ingredients ?? this.findRecipe(meal.recipeId)?.ingredients ?? []);
  }

  allMeals() {
    return Object.values(this.data.days.days).flatMap((day) => day.meals ?? []);
  }

  // Meals

  addMeal(date, recipeId, tagId) {
    const recipe = this.findRecipe(recipeId);
    if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);
    const tag = this.getTags().find((candidate) => candidate.id === tagId);
    const meal = withId({
      recipeId,
      recipeName: recipe.name,
      recipeType: recipe.type,
      timeTagId: tag?.id ?? null,
      timeTagName: tag?.name ?? '',
    });
    this.setDay(date, { meals: [...this.getDay(date).meals, meal] });
    return this.getDayPlan(date);
  }

  removeMeal(date, mealId) {
    this.setDay(date, { meals: this.getDay(date).meals.filter((meal) => meal.id !== mealId) });
    return this.getDayPlan(date);
  }

  moveMeal(date, mealId, offset) {
    const meals = [...this.getDay(date).meals];
    if (moveInList(meals, mealId, offset)) this.setDay(date, { meals });
    return this.getDayPlan(date);
  }

  // Adds to whatever is already planned, so copying can never wipe out a day.
  copyMeals(fromDate, toDate) {
    const copies = this.getDay(fromDate).meals.map((meal) => ({ ...structuredClone(meal), id: crypto.randomUUID() }));
    this.setDay(toDate, { meals: [...this.getDay(toDate).meals, ...copies] });
    return this.getDayPlan(toDate);
  }

  setGroceryChecked(date, key, checked) {
    const groceryChecked = { ...this.getDay(date).groceryChecked };
    if (checked) groceryChecked[key] = true;
    else delete groceryChecked[key];
    this.setDay(date, { groceryChecked });
  }

  // Recipes

  getRecipes() {
    return this.data.recipes.recipes;
  }

  findRecipe(id) {
    return this.getRecipes().find((recipe) => recipe.id === id);
  }

  // Creates the recipe or replaces it. Renaming or retyping one updates the days that use it,
  // so the Day View and Calendar never show an old name or count it wrongly.
  saveRecipe(input) {
    const name = String(input.name ?? '').trim();
    if (!input.id || !name) throw new Error('A recipe needs an id and a name.');
    const knownTagIds = this.getTags().map((tag) => tag.id);
    const recipe = {
      id: String(input.id),
      name,
      type: RECIPE_TYPES.includes(input.type) ? input.type : RECIPE_TYPES[0],
      tagIds: (input.tagIds ?? []).filter((id) => knownTagIds.includes(id)),
      ingredients: (input.ingredients ?? []).map(cleanIngredient).filter((ingredient) => ingredient.name),
      instructions: (input.instructions ?? []).map((step) => String(step).trim()).filter(Boolean),
      notes: String(input.notes ?? ''),
    };
    const recipes = this.getRecipes();
    const index = recipes.findIndex((candidate) => candidate.id === recipe.id);
    if (index === -1) recipes.push(recipe);
    else recipes[index] = recipe;
    this.markDirty('recipes');

    for (const meal of this.allMeals().filter((candidate) => candidate.recipeId === recipe.id)) {
      meal.recipeName = recipe.name;
      meal.recipeType = recipe.type;
      this.markDirty('days');
    }
    return recipes;
  }

  recipeUseCount(id) {
    return Object.values(this.data.days.days).filter((day) => day.meals?.some((meal) => meal.recipeId === id)).length;
  }

  // Days that used the recipe keep their own copy of its ingredients, so their grocery lists still work.
  deleteRecipe(id) {
    const recipe = this.findRecipe(id);
    if (!recipe) return this.getRecipes();
    for (const meal of this.allMeals().filter((candidate) => candidate.recipeId === id)) {
      meal.ingredients = structuredClone(recipe.ingredients);
      this.markDirty('days');
    }
    this.data.recipes.recipes = this.getRecipes().filter((candidate) => candidate.id !== id);
    this.markDirty('recipes');
    return this.getRecipes();
  }

  // Tags

  getTags() {
    return this.data.tags.tags;
  }

  addTag(name) {
    this.getTags().push(withId({ name }));
    this.markDirty('tags');
    return this.getTags();
  }

  renameTag(id, name) {
    const tag = this.getTags().find((candidate) => candidate.id === id);
    if (tag) {
      tag.name = name;
      this.markDirty('tags');
      for (const meal of this.allMeals().filter((candidate) => candidate.timeTagId === id)) {
        meal.timeTagName = name;
        this.markDirty('days');
      }
    }
    return this.getTags();
  }

  // Meals keep the tag's name as their own text, so past days still show it.
  deleteTag(id) {
    this.data.tags.tags = this.getTags().filter((tag) => tag.id !== id);
    this.markDirty('tags');
    for (const recipe of this.getRecipes().filter((candidate) => candidate.tagIds.includes(id))) {
      recipe.tagIds = recipe.tagIds.filter((tagId) => tagId !== id);
      this.markDirty('recipes');
    }
    return { tags: this.getTags(), recipes: this.getRecipes() };
  }

  // Settings

  getSettings() {
    const { textSize, launchOnStartup } = this.data.settings;
    return { textSize, launchOnStartup };
  }

  updateSettings(changes) {
    const settings = this.data.settings;
    if ('textSize' in changes) {
      const size = Number(changes.textSize);
      if (Number.isFinite(size)) settings.textSize = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, size));
    }
    if ('launchOnStartup' in changes) settings.launchOnStartup = Boolean(changes.launchOnStartup);
    this.markDirty('settings');
    return this.getSettings();
  }
}

module.exports = {
  PlannerData,
  storeDefinitions,
  DEFAULT_TIME_TAGS,
  UNITS,
  SCHEMA_VERSION,
  MIN_TEXT_SIZE,
  MAX_TEXT_SIZE,
};

return module.exports;
})();
return modules['./plannerData'];
})();
