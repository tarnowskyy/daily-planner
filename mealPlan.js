const SOLID_TARGET = 3;
const LIQUID_LIMIT = 2;

function mealCountBadge(type, position) {
  if (type === 'Solid') {
    return position <= SOLID_TARGET ? `Solid ${position}/${SOLID_TARGET}` : `Solid +${position - SOLID_TARGET}`;
  }
  return position <= LIQUID_LIMIT ? `Liquid ${position}` : `Liquid +${position - LIQUID_LIMIT}`;
}

function mealCounterText(day) {
  const { solid, liquid } = mealCounts(day);
  return `Solid ${solid}/${SOLID_TARGET}, Liquid ${liquid}/1-${LIQUID_LIMIT}`;
}

function startAddingMeal(date) {
  state.picking = { date, recipe: null };
  state.recipeScreen = { mode: 'list' };
  state.view = 'recipes';
  render();
}

function groceryRow(date, item) {
  const row = h('label', { class: `grocery-item${item.checked ? ' grocery-done' : ''}` });
  const checkbox = h('input', {
    class: 'switch',
    type: 'checkbox',
    checked: item.checked,
    onChange: (event) => {
      item.checked = event.target.checked;
      row.classList.toggle('grocery-done', item.checked);
      planner.setGroceryChecked(date, item.key, item.checked);
    },
  });
  row.append(checkbox, h('span', {}, item.amounts ? `${item.name}: ${item.amounts}` : item.name));
  return row;
}

function copyMealsArea(date, update) {
  const message = h('p', { class: 'hint', role: 'status' });
  const dateInput = h('input', { class: 'input date-input', type: 'date', 'aria-label': 'Day to copy meals from' });

  async function copy() {
    const fromDate = dateInput.value;
    if (!fromDate) {
      message.textContent = 'Choose a day to copy from first.';
    } else if (fromDate === date) {
      message.textContent = 'That is the day you are on. Choose a different one.';
    } else {
      const { meals } = (await planner.getDays([fromDate]))[fromDate];
      if (meals.length === 0) {
        message.textContent = `${formatLong(fromDate)} has no meals to copy.`;
        return;
      }
      await update(planner.copyMeals(fromDate, date));
      message.textContent = `Added ${meals.length} ${meals.length === 1 ? 'meal' : 'meals'} from ${formatLong(fromDate)}.`;
    }
  }

  return h(
    'div',
    { class: 'copy-meals' },
    h('span', { class: 'field-label' }, 'Copy meals from another day'),
    h('div', { class: 'button-row' }, dateInput, button('Copy meals', copy)),
    message
  );
}

function mealPlanSection(date, initialPlan) {
  // Only this section redraws when meals change, so the page stays where it is.
  let plan = initialPlan;
  const toggle = button('', () => {
    state.mealPlanOpen = !state.mealPlanOpen;
    draw();
  });
  const counter = h('p', { class: 'meal-counter' });
  const list = h('ol', { class: 'meals' });
  const grocery = h('div', { class: 'grocery-list' });

  async function update(request) {
    plan = await request;
    draw();
  }

  const copyArea = copyMealsArea(date, update);
  const mealsPanel = panel(
    'Meals',
    counter,
    list,
    h('div', { class: 'button-row' }, button('Add meal', () => startAddingMeal(date), 'btn-primary')),
    copyArea
  );
  const groceryPanel = panel('Grocery list', grocery);

  function mealRow(meal, index, positions) {
    positions[meal.recipeType] = (positions[meal.recipeType] ?? 0) + 1;
    const recipe = findRecipe(meal.recipeId);
    const moveButton = (label, name, offset, disabled) =>
      button(label, () => update(planner.moveMeal(date, meal.id, offset)), 'btn-quiet', {
        disabled,
        title: name,
        'aria-label': name,
      });
    return h(
      'li',
      { class: 'rule' },
      h(
        'div',
        { class: 'rule-row' },
        h(
          'span',
          { class: 'rule-text' },
          recipe
            ? button(meal.recipeName, () => openRecipe(meal.recipeId), 'btn-link')
            : h('span', {}, meal.recipeName),
          meal.timeTagName ? h('span', { class: 'meal-badge' }, `[${meal.timeTagName}]`) : null,
          h('span', { class: 'meal-badge' }, `[${mealCountBadge(meal.recipeType, positions[meal.recipeType])}]`),
          recipe ? null : h('span', { class: 'field-label meal-note' }, 'recipe deleted')
        ),
        h(
          'span',
          { class: 'rule-actions' },
          moveButton('↑', 'Move meal up', -1, index === 0),
          moveButton('↓', 'Move meal down', 1, index === plan.meals.length - 1),
          button('Remove', () => update(planner.removeMeal(date, meal.id)), 'btn-quiet')
        )
      )
    );
  }

  function draw() {
    toggle.textContent = `Meal Plan (${mealCounterText(plan)})`;
    mealsPanel.hidden = !state.mealPlanOpen;
    groceryPanel.hidden = !state.mealPlanOpen;

    counter.textContent = mealCounterText(plan);
    const positions = {};
    list.replaceChildren(...plan.meals.map((meal, index) => mealRow(meal, index, positions)));

    grocery.replaceChildren(
      ...(plan.grocery.length
        ? plan.grocery.map((item) => groceryRow(date, item))
        : [h('p', { class: 'hint' }, 'Nothing to buy yet. Add meals whose recipes have ingredients.')])
    );
  }

  draw();
  return [h('section', { class: 'meal-plan' }, toggle), mealsPanel, groceryPanel];
}
