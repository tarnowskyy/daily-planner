function weekDates(startKey) {
  return Array.from({ length: 7 }, (_, offset) => addDays(startKey, offset));
}

function mealCounts(day) {
  const countOf = (type) => day.meals.filter((meal) => meal.recipeType === type).length;
  return { solid: countOf('Solid'), liquid: countOf('Liquid') };
}

function calendarDetail(label, value) {
  return h(
    'div',
    { class: 'day-card-detail' },
    h('span', { class: 'field-label' }, label),
    h('span', { class: value ? '' : 'empty-value' }, value || '—')
  );
}

function dayCard(date, day) {
  const today = todayKey();
  const { solid, liquid } = mealCounts(day);
  const classes = ['day-card'];
  if (date === today) classes.push('day-card-today');
  if (date < today) classes.push('day-card-past');
  return h(
    'button',
    { class: classes.join(' '), type: 'button', onClick: () => openDay(date) },
    h(
      'div',
      { class: 'day-card-date' },
      h('span', { class: 'day-card-weekday' }, formatWeekday(date)),
      h('span', {}, formatMonthDay(date))
    ),
    calendarDetail('Study', day.studyTopic),
    calendarDetail('Gym', day.gymDay),
    calendarDetail('DW Target', day.deepWorkTarget),
    h(
      'div',
      { class: 'day-card-meals' },
      h('span', {}, `Solid ${solid}/3`),
      h('span', {}, `Liquid ${liquid}/1-2`)
    )
  );
}

function renderCalendarView(weekStart, days) {
  const dates = weekDates(weekStart);
  return [
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'day-heading' },
        h('h1', {}, formatWeekRange(weekStart)),
        h(
          'div',
          { class: 'button-row' },
          button('←', () => openWeek(addDays(weekStart, -7)), '', { title: 'Previous week', 'aria-label': 'Previous week' }),
          button('→', () => openWeek(addDays(weekStart, 7)), '', { title: 'Next week', 'aria-label': 'Next week' }),
          button('This week', () => openWeek(weekStartOf(todayKey())))
        )
      ),
      h('div', { class: 'week-grid' }, ...dates.map((date) => dayCard(date, days[date])))
    ),
  ];
}
