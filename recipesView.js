function findRecipe(id) {
  return state.recipes.find((recipe) => recipe.id === id);
}

function tagNames(recipe) {
  return state.tags.filter((tag) => recipe.tagIds.includes(tag.id)).map((tag) => tag.name);
}

function openRecipe(id) {
  state.recipeScreen = { mode: 'view', id, returnTo: state.view };
  state.view = 'recipes';
  render();
}

function showRecipeList() {
  state.recipeScreen = { mode: 'list' };
  render();
}

function leaveRecipe() {
  if (state.recipeScreen.returnTo === 'day') {
    state.recipeScreen = { mode: 'list' };
    state.view = 'day';
    render();
  } else {
    showRecipeList();
  }
}

function editRecipe(recipe) {
  const { returnTo } = state.recipeScreen;
  state.recipeScreen = { mode: 'edit', draft: structuredClone(recipe), isNew: false, returnTo };
  render();
}

function blankIngredient() {
  return { name: '', amount: '', unit: '', customUnit: '' };
}

function newRecipe() {
  const draft = {
    id: crypto.randomUUID(),
    name: '',
    type: 'Solid',
    tagIds: [],
    ingredients: [blankIngredient()],
    instructions: [],
    notes: '',
  };
  state.recipeScreen = { mode: 'edit', draft, isNew: true };
  render();
}

function ingredientText({ name, amount, unit, customUnit }) {
  const unitText = unit === 'custom' ? customUnit : unit === 'count/whole' ? '' : unit;
  return [amount, unitText, name].filter(Boolean).join(' ');
}

function recipeTitleBadges(recipe) {
  return h(
    'div',
    { class: 'recipe-badges' },
    h('span', { class: 'badge' }, recipe.type),
    ...tagNames(recipe).map((name) => h('span', { class: 'tag-label' }, name))
  );
}

// Recipe list

function pickingBanner() {
  const { date } = state.picking;
  return h(
    'p',
    { class: 'notice-ok picking-banner' },
    h('span', {}, `Choose a meal for ${formatLong(date)}.`),
    button('Cancel', () => {
      state.picking = null;
      openDay(date);
    })
  );
}

function recipeRow(recipe) {
  return h(
    'li',
    { class: 'recipe-row' },
    h(
      'div',
      { class: 'recipe-summary' },
      button(recipe.name, () => openRecipe(recipe.id), 'btn-link'),
      recipeTitleBadges(recipe)
    ),
    state.picking
      ? button(
          'Choose',
          () => {
            state.picking.recipe = recipe;
            render();
          },
          'btn-primary'
        )
      : null
  );
}

function matchesSearch(recipe, search) {
  return [recipe.name, ...tagNames(recipe)].some((text) => text.toLowerCase().includes(search));
}

function recipeList() {
  const results = h('ul', { class: 'recipe-list' });

  function drawResults() {
    const search = state.recipeSearch.trim().toLowerCase();
    const matches = state.recipes
      .filter((recipe) => matchesSearch(recipe, search))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (matches.length) {
      results.replaceChildren(...matches.map(recipeRow));
    } else {
      const empty = state.recipes.length ? 'No recipes match that search.' : 'No recipes yet. Tap New recipe to add one.';
      results.replaceChildren(h('li', { class: 'hint' }, empty));
    }
  }

  const searchBox = h('input', {
    class: 'input',
    type: 'text',
    value: state.recipeSearch,
    placeholder: 'Search by name or tag',
    'aria-label': 'Search recipes',
    onInput: (event) => {
      state.recipeSearch = event.target.value;
      drawResults();
    },
  });
  drawResults();

  return [
    state.picking ? pickingBanner() : null,
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'day-heading' }, h('h1', {}, 'Recipe book'), button('New recipe', newRecipe, 'btn-primary')),
      searchBox,
      results
    ),
  ].filter(Boolean);
}

// Choosing a time tag for the picked recipe

function timeTagPicker() {
  const { date, recipe } = state.picking;

  async function addMeal(tagId) {
    await planner.addMeal(date, recipe.id, tagId);
    state.picking = null;
    state.mealPlanOpen = true;
    openDay(date);
  }

  return [
    panel(
      `What time is ${recipe.name} on ${formatLong(date)}?`,
      h(
        'div',
        { class: 'button-row' },
        ...state.tags.map((tag) => button(tag.name, () => addMeal(tag.id), 'btn-primary')),
        button('No time tag', () => addMeal(null)),
        button('Back to recipes', () => {
          state.picking.recipe = null;
          render();
        })
      )
    ),
  ];
}

// Reading a recipe

function recipeDeleteArea(recipe) {
  const area = h('div', { class: 'recipe-delete' });

  function drawIdle() {
    area.replaceChildren(button('Delete recipe', confirmDelete));
  }

  async function confirmDelete() {
    const uses = await planner.recipeUseCount(recipe.id);
    const warning = uses
      ? `This recipe is used on ${uses} ${uses === 1 ? 'day' : 'days'}. Those days keep the meal and its grocery items, but the recipe itself will be gone. Delete it?`
      : `Delete "${recipe.name}"?`;
    area.replaceChildren(
      h('p', { class: 'recipe-warning' }, warning),
      h(
        'div',
        { class: 'button-row' },
        button(
          'Delete',
          async () => {
            state.recipes = await planner.deleteRecipe(recipe.id);
            leaveRecipe();
          },
          'btn-danger'
        ),
        button('Keep', drawIdle)
      )
    );
  }

  drawIdle();
  return area;
}

function recipeSection(title, content) {
  return h('div', { class: 'recipe-section' }, h('h2', { class: 'panel-title' }, title), content);
}

function recipeDetail(id) {
  const recipe = findRecipe(id);
  if (!recipe) {
    state.recipeScreen = { mode: 'list' };
    return recipeList();
  }
  return [
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'day-heading' },
        h('h1', {}, recipe.name),
        h(
          'div',
          { class: 'button-row' },
          button('Edit', () => editRecipe(recipe), 'btn-primary'),
          button('Back', leaveRecipe)
        )
      ),
      recipeTitleBadges(recipe),
      recipe.ingredients.length
        ? recipeSection(
            'Ingredients',
            h('ul', { class: 'recipe-items' }, ...recipe.ingredients.map((item) => h('li', {}, ingredientText(item))))
          )
        : null,
      recipe.instructions.length
        ? recipeSection(
            'Instructions',
            h('ol', { class: 'recipe-items' }, ...recipe.instructions.map((step) => h('li', {}, step)))
          )
        : null,
      recipe.notes ? recipeSection('Notes', h('p', { class: 'recipe-notes' }, recipe.notes)) : null,
      recipeDeleteArea(recipe)
    ),
  ];
}

// Editing a recipe. Every change saves straight away, like the rest of the app.

function ingredientRow(draft, ingredient, save, redraw, addRow) {
  const textInput = (field, placeholder, label, extra = {}) =>
    h('input', {
      class: 'input',
      type: 'text',
      value: ingredient[field],
      placeholder,
      'aria-label': label,
      onInput: (event) => {
        ingredient[field] = event.target.value;
        save();
      },
      ...extra,
    });

  const customUnit = textInput('customUnit', 'Unit', 'Custom unit');
  customUnit.hidden = ingredient.unit !== 'custom';

  const unit = h(
    'select',
    {
      class: 'input',
      'aria-label': 'Unit',
      onChange: (event) => {
        ingredient.unit = event.target.value;
        customUnit.hidden = ingredient.unit !== 'custom';
        if (!customUnit.hidden) customUnit.focus();
        save();
      },
    },
    h('option', { value: '' }, 'No unit'),
    ...state.units.map((name) => h('option', { value: name }, name))
  );
  unit.value = ingredient.unit;

  return h(
    'div',
    { class: 'ingredient-row' },
    textInput('amount', '1/2', 'Amount'),
    unit,
    customUnit,
    textInput('name', 'Ingredient', 'Ingredient name', {
      onKeydown: (event) => {
        if (event.key === 'Enter') addRow();
      },
    }),
    button(
      'Remove',
      () => {
        draft.ingredients = draft.ingredients.filter((candidate) => candidate !== ingredient);
        save();
        redraw();
      },
      'btn-quiet'
    )
  );
}

function ingredientsEditor(draft, save) {
  const rows = h('div', { class: 'ingredient-rows' });

  function addRow() {
    draft.ingredients.push(blankIngredient());
    draw();
    rows.lastElementChild.querySelector('input').focus();
  }

  function draw() {
    rows.replaceChildren(...draft.ingredients.map((item) => ingredientRow(draft, item, save, draw, addRow)));
  }

  draw();
  return recipeSection('Ingredients', h('div', {}, rows, button('Add ingredient', addRow)));
}

function instructionsEditor(draft, save) {
  const rows = h('ol', { class: 'step-rows' });

  function move(index, offset) {
    const [step] = draft.instructions.splice(index, 1);
    draft.instructions.splice(index + offset, 0, step);
    save();
    draw();
  }

  function stepRow(step, index) {
    const moveButton = (label, name, offset, disabled) =>
      button(label, () => move(index, offset), 'btn-quiet', { disabled, title: name, 'aria-label': name });
    return h(
      'li',
      { class: 'rule' },
      h(
        'div',
        { class: 'rule-row' },
        h('input', {
          class: 'input',
          type: 'text',
          value: step,
          'aria-label': `Step ${index + 1}`,
          onInput: (event) => {
            draft.instructions[index] = event.target.value;
            save();
          },
        }),
        h(
          'span',
          { class: 'rule-actions' },
          moveButton('↑', 'Move step up', -1, index === 0),
          moveButton('↓', 'Move step down', 1, index === draft.instructions.length - 1),
          button(
            'Remove',
            () => {
              draft.instructions.splice(index, 1);
              save();
              draw();
            },
            'btn-quiet'
          )
        )
      )
    );
  }

  function draw() {
    rows.replaceChildren(...draft.instructions.map(stepRow));
  }

  const addStep = button('Add step', () => {
    draft.instructions.push('');
    draw();
    rows.lastElementChild.querySelector('input').focus();
  });
  draw();
  return recipeSection('Instructions (optional)', h('div', {}, rows, addStep));
}

function tagChooser(draft, save) {
  const chips = state.tags.map((tag) =>
    h(
      'label',
      { class: 'tag-chip' },
      h('input', {
        type: 'checkbox',
        checked: draft.tagIds.includes(tag.id),
        onChange: (event) => {
          draft.tagIds = event.target.checked
            ? [...draft.tagIds, tag.id]
            : draft.tagIds.filter((id) => id !== tag.id);
          save();
        },
      }),
      h('span', {}, tag.name)
    )
  );
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, 'Tags'),
    chips.length ? h('div', { class: 'tag-chips' }, ...chips) : h('p', { class: 'hint' }, 'No tags yet. Add some in Settings.')
  );
}

function hasContent(draft) {
  return draft.instructions.length > 0 || draft.notes !== '' || draft.ingredients.some((item) => item.name || item.amount);
}

function recipeEditor() {
  const screen = state.recipeScreen;
  const { draft } = screen;
  const nameHint = h('p', { class: 'recipe-warning', role: 'alert', hidden: true }, 'A recipe needs a name. Changes are not saved until it has one.');
  const leaveAnyway = button('Leave without saving', closeEditor, '', { hidden: true });

  function save() {
    const named = draft.name.trim() !== '';
    if (named) {
      nameHint.hidden = true;
      leaveAnyway.hidden = true;
      planner.saveRecipe(draft).then((recipes) => {
        state.recipes = recipes;
      });
    } else {
      nameHint.hidden = false;
    }
  }

  function closeEditor() {
    const saved = findRecipe(draft.id);
    if (saved && !state.picking) {
      state.recipeScreen = { mode: 'view', id: draft.id, returnTo: screen.returnTo };
      render();
    } else if (screen.returnTo === 'day') {
      leaveRecipe();
    } else {
      showRecipeList();
    }
  }

  function done() {
    if (draft.name.trim() || (screen.isNew && !hasContent(draft))) {
      closeEditor();
    } else {
      nameHint.hidden = false;
      leaveAnyway.hidden = false;
    }
  }

  const nameInput = h('input', {
    class: 'input',
    type: 'text',
    value: draft.name,
    onInput: (event) => {
      draft.name = event.target.value;
      save();
    },
  });
  const typeSelect = h(
    'select',
    {
      class: 'input',
      onChange: (event) => {
        draft.type = event.target.value;
        save();
      },
    },
    h('option', { value: 'Solid' }, 'Solid'),
    h('option', { value: 'Liquid' }, 'Liquid')
  );
  typeSelect.value = draft.type;

  const notes = h('textarea', {
    class: 'input',
    rows: 3,
    value: draft.notes,
    'aria-label': 'Notes',
    onInput: (event) => {
      draft.notes = event.target.value;
      save();
    },
  });
  if (screen.isNew) setTimeout(() => nameInput.focus());

  return [
    h(
      'section',
      { class: 'panel recipe-form' },
      h('div', { class: 'day-heading' }, h('h1', {}, screen.isNew ? 'New recipe' : 'Edit recipe')),
      h(
        'div',
        { class: 'recipe-basics' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), nameInput),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Type'), typeSelect)
      ),
      tagChooser(draft, save),
      ingredientsEditor(draft, save),
      instructionsEditor(draft, save),
      recipeSection('Notes (optional)', notes),
      nameHint,
      h(
        'div',
        { class: 'button-row' },
        button('Done', done, 'btn-primary'),
        leaveAnyway
      ),
      h('p', { class: 'hint' }, 'Changes save automatically as you type.')
    ),
  ];
}

function renderRecipesView() {
  const { mode, id } = state.recipeScreen;
  if (mode === 'edit') return recipeEditor();
  if (state.picking?.recipe) return timeTagPicker();
  if (mode === 'view') return recipeDetail(id);
  return recipeList();
}
