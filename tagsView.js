function tagNameTaken(name, ignoreId) {
  const lower = name.toLowerCase();
  return state.tags.some((tag) => tag.id !== ignoreId && tag.name.toLowerCase() === lower);
}

function tagsPanel() {
  const list = h('ul', { class: 'tag-list' });
  const addArea = h('div', { class: 'rules-add' });
  const message = h('p', { class: 'hint', role: 'status' });
  let editingId = null;
  let confirmingId = null;

  function nameEditor(initialName, placeholder, ignoreId, onSave, onCancel) {
    const input = h('input', { class: 'input', type: 'text', value: initialName, placeholder, 'aria-label': 'Tag name' });
    const save = () => {
      const name = input.value.trim();
      if (!name) return;
      if (tagNameTaken(name, ignoreId)) {
        message.textContent = `There is already a tag called ${name}.`;
        return;
      }
      message.textContent = '';
      onSave(name);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') save();
      if (event.key === 'Escape') onCancel();
    });
    setTimeout(() => input.focus());
    return h('div', { class: 'rule-editor' }, input, button('Save', save, 'btn-primary'), button('Cancel', onCancel));
  }

  function stopEditing() {
    editingId = null;
    confirmingId = null;
    message.textContent = '';
    draw();
  }

  async function saveTags(request) {
    state.tags = await request;
    stopEditing();
  }

  function tagRow(tag) {
    if (tag.id === editingId) {
      return h(
        'li',
        { class: 'rule' },
        nameEditor(tag.name, '', tag.id, (name) => saveTags(planner.renameTag(tag.id, name)), stopEditing)
      );
    }
    if (tag.id === confirmingId) {
      const uses = state.recipes.filter((recipe) => recipe.tagIds.includes(tag.id)).length;
      const usedBy = uses ? ` It will come off ${uses} ${uses === 1 ? 'recipe' : 'recipes'}.` : '';
      return h(
        'li',
        { class: 'rule' },
        h(
          'div',
          { class: 'rule-row' },
          h('span', { class: 'rule-text' }, `Delete "${tag.name}"?${usedBy} Meals already planned keep the label.`),
          h(
            'span',
            { class: 'rule-actions' },
            button(
              'Delete',
              async () => {
                Object.assign(state, await planner.deleteTag(tag.id));
                stopEditing();
              },
              'btn-danger'
            ),
            button('Keep', stopEditing)
          )
        )
      );
    }
    return h(
      'li',
      { class: 'rule' },
      h(
        'div',
        { class: 'rule-row' },
        h('span', { class: 'rule-text' }, tag.name),
        h(
          'span',
          { class: 'rule-actions' },
          button(
            'Rename',
            () => {
              editingId = tag.id;
              confirmingId = null;
              draw();
            },
            'btn-quiet'
          ),
          button(
            'Delete',
            () => {
              confirmingId = tag.id;
              editingId = null;
              draw();
            },
            'btn-quiet'
          )
        )
      )
    );
  }

  function drawAddArea() {
    addArea.replaceChildren(
      button('Add tag', () => {
        addArea.replaceChildren(
          nameEditor('', 'New tag', null, (name) => saveTags(planner.addTag(name)), stopEditing)
        );
      })
    );
  }

  function draw() {
    list.replaceChildren(...state.tags.map(tagRow));
    drawAddArea();
  }

  draw();
  return panel('Tags', list, addArea, message);
}

function renderTagsView() {
  return [tagsPanel()];
}
