const DAY_FIELDS = [
  { field: 'studyTopic', label: 'Study Topic' },
  { field: 'gymDay', label: 'Gym Day' },
  { field: 'deepWorkTarget', label: 'Deep Work Target' },
];

function rulesPanel() {
  // Only this panel redraws when rules change, so the day fields below keep their cursor.
  const list = h('ol', { class: 'rules' });
  const addArea = h('div', { class: 'rules-add' });
  let editingId = null;
  let confirmingId = null;
  let adding = false;

  async function saveRules(request) {
    state.rules = await request;
    editingId = null;
    confirmingId = null;
    draw();
  }

  function textEditor(initialText, placeholder, onSave, onCancel) {
    const input = h('input', { class: 'input', type: 'text', value: initialText, placeholder, 'aria-label': 'Rule text' });
    const save = () => {
      const text = input.value.trim();
      if (text) onSave(text);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') save();
      if (event.key === 'Escape') onCancel();
    });
    const editor = h('div', { class: 'rule-editor' }, input, button('Save', save, 'btn-primary'), button('Cancel', onCancel));
    setTimeout(() => input.focus());
    return editor;
  }

  function ruleRow(rule, index) {
    if (rule.id === editingId) {
      return h(
        'li',
        { class: 'rule' },
        textEditor(
          rule.text,
          '',
          (text) => saveRules(planner.updateRule(rule.id, text)),
          () => {
            editingId = null;
            draw();
          }
        )
      );
    }
    if (rule.id === confirmingId) {
      return h(
        'li',
        { class: 'rule' },
        h(
          'div',
          { class: 'rule-row' },
          h('span', { class: 'rule-text' }, `Delete "${rule.text}"?`),
          h(
            'span',
            { class: 'rule-actions' },
            button('Delete', () => saveRules(planner.deleteRule(rule.id)), 'btn-danger'),
            button('Keep', () => {
              confirmingId = null;
              draw();
            })
          )
        )
      );
    }
    const moveButton = (label, name, offset, disabled) =>
      button(label, () => saveRules(planner.moveRule(rule.id, offset)), 'btn-quiet', {
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
        h('span', { class: 'rule-text' }, rule.text),
        h(
          'span',
          { class: 'rule-actions' },
          moveButton('↑', 'Move rule up', -1, index === 0),
          moveButton('↓', 'Move rule down', 1, index === state.rules.length - 1),
          button(
            'Edit',
            () => {
              editingId = rule.id;
              confirmingId = null;
              adding = false;
              draw();
            },
            'btn-quiet'
          ),
          button(
            'Delete',
            () => {
              confirmingId = rule.id;
              editingId = null;
              draw();
            },
            'btn-quiet'
          )
        )
      )
    );
  }

  function draw() {
    list.replaceChildren(...state.rules.map(ruleRow));
    if (adding) {
      addArea.replaceChildren(
        textEditor(
          '',
          'New rule',
          (text) => {
            adding = false;
            saveRules(planner.addRule(text));
          },
          () => {
            adding = false;
            draw();
          }
        )
      );
    } else {
      addArea.replaceChildren(
        button('Add rule', () => {
          adding = true;
          editingId = null;
          confirmingId = null;
          draw();
        })
      );
    }
  }

  draw();
  return panel('[DAILY RULES REMINDER]', list, addArea);
}

function dayLabel(date) {
  if (date === todayKey()) return 'Today';
  if (date === addDays(todayKey(), 1)) return 'Tomorrow';
  return null;
}

function dayHeaderPanel(date, day) {
  const label = dayLabel(date);
  const fields = DAY_FIELDS.map(({ field, label: fieldLabel }) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, fieldLabel),
      h('input', {
        class: 'input',
        type: 'text',
        value: day[field],
        onInput: (event) => planner.setDayField(date, field, event.target.value),
      })
    )
  );
  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'day-heading' },
      h(
        'div',
        { class: 'day-title' },
        h('h1', {}, formatLong(date)),
        label ? h('span', { class: 'badge' }, label) : null
      ),
      h(
        'div',
        { class: 'button-row' },
        button('←', () => openDay(addDays(date, -1)), '', { title: 'Previous day', 'aria-label': 'Previous day' }),
        button('→', () => openDay(addDays(date, 1)), '', { title: 'Next day', 'aria-label': 'Next day' }),
        button('Today', () => openDay(todayKey())),
        button('Plan tomorrow', () => openDay(addDays(todayKey(), 1)), 'btn-primary')
      )
    ),
    h('div', { class: 'field-grid' }, ...fields)
  );
}

function renderDayView(date, plan) {
  return [rulesPanel(), dayHeaderPanel(date, plan), ...mealPlanSection(date, plan)];
}
