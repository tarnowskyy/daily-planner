const state = {
  view: 'day',
  date: todayKey(),
  weekStart: weekStartOf(todayKey()),
  knownToday: todayKey(),
  settings: null,
  rules: [],
  recipes: [],
  tags: [],
  units: [],
  mealPlanOpen: false,
  picking: null,
  recipeScreen: { mode: 'list' },
  recipeSearch: '',
  dataFolder: '',
  isPackaged: false,
  minTextSize: 14,
  maxTextSize: 24,
};

const DATE_CHECK_MS = 60 * 1000;
const viewElement = document.getElementById('view');
let latestRender = 0;

function applyTextSize(size) {
  document.documentElement.style.fontSize = `${size}px`;
}

async function render({ importSucceeded = false } = {}) {
  const thisRender = ++latestRender;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('tab-active', tab.dataset.view === state.view);
  }

  let content;
  if (state.view === 'day') {
    content = renderDayView(state.date, await planner.getDayPlan(state.date));
  } else if (state.view === 'calendar') {
    const days = await planner.getDays(weekDates(state.weekStart));
    content = renderCalendarView(state.weekStart, days);
  } else if (state.view === 'recipes') {
    content = renderRecipesView();
  } else if (state.view === 'tags') {
    content = renderTagsView();
  } else {
    content = renderSettingsView(importSucceeded);
  }

  // A quick second click may have started a newer render while this one waited for its data.
  if (thisRender === latestRender) {
    viewElement.replaceChildren(...content);
    window.scrollTo(0, 0);
  }
}

function openDay(date) {
  state.view = 'day';
  state.date = date;
  render();
}

function openWeek(weekStart) {
  state.view = 'calendar';
  state.weekStart = weekStart;
  render();
}

async function loadState() {
  Object.assign(state, await planner.getState());
  applyTextSize(state.settings.textSize);
}

async function reloadAfterImport() {
  await loadState();
  state.picking = null;
  state.recipeScreen = { mode: 'list' };
  await render({ importSucceeded: true });
}

async function showNotices() {
  const area = document.getElementById('notices');
  for (const text of await planner.getNotices()) {
    const notice = h('div', { class: 'banner', role: 'alert' }, h('span', {}, text));
    notice.append(button('Dismiss', () => notice.remove()));
    area.append(notice);
  }
}

// The app can stay open for days, so roll over to the new day at midnight,
// but never pull the page out from under someone who is typing.
function followNewDay() {
  const today = todayKey();
  if (today === state.knownToday || document.activeElement.matches('input, textarea, select')) return;
  const wasOnToday = state.date === state.knownToday;
  const wasOnThisWeek = state.weekStart === weekStartOf(state.knownToday);
  state.knownToday = today;
  if (wasOnToday) state.date = today;
  if (wasOnThisWeek) state.weekStart = weekStartOf(today);
  if (state.view === 'day' || state.view === 'calendar') render();
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    if (tab.dataset.view === 'calendar') state.weekStart = weekStartOf(state.date);
    state.picking = null;
    if (state.recipeScreen.mode === 'view') state.recipeScreen = { mode: 'list' };
    state.view = tab.dataset.view;
    render();
  });
}

planner.onSaveStatus((ok) => {
  document.getElementById('save-warning').hidden = ok;
});

setInterval(followNewDay, DATE_CHECK_MS);

loadState().then(() => {
  render();
  showNotices();
});
