function startupPanel() {
  const toggle = h('input', {
    class: 'switch',
    type: 'checkbox',
    checked: state.settings.launchOnStartup,
    onChange: async (event) => {
      state.settings = await planner.updateSettings({ launchOnStartup: event.target.checked });
    },
  });
  return panel(
    'Startup',
    h('label', { class: 'setting-row' }, h('span', {}, 'Launch on Windows startup'), toggle),
    state.isPackaged
      ? null
      : h(
          'p',
          { class: 'hint' },
          'You are running the test version. Your choice is saved, but it only takes effect in the installed app.'
        )
  );
}

function textSizePanel() {
  const value = h('span', { class: 'slider-value' }, `${state.settings.textSize} px`);
  const slider = h('input', {
    class: 'slider',
    type: 'range',
    min: state.minTextSize,
    max: state.maxTextSize,
    step: 1,
    value: state.settings.textSize,
    'aria-label': 'Text size',
    onInput: async (event) => {
      const textSize = Number(event.target.value);
      value.textContent = `${textSize} px`;
      applyTextSize(textSize);
      state.settings = await planner.updateSettings({ textSize });
    },
  });
  return panel('Text size', h('div', { class: 'setting-row' }, slider, value));
}

function dataPanel() {
  const message = h('p', { class: 'hint', role: 'status' });

  async function runBackup(action, describeSuccess) {
    const result = await action();
    if (result.status === 'cancelled') return;
    if (result.status === 'error') {
      message.textContent = `That didn't work: ${result.message}`;
      return;
    }
    await describeSuccess(result);
  }

  return panel(
    'Your data',
    h('p', { class: 'field-label' }, 'Data folder'),
    h('p', { class: 'data-path' }, state.dataFolder),
    h(
      'div',
      { class: 'button-row' },
      button('Open data folder', async () => {
        const problem = await planner.openDataFolder();
        message.textContent = problem ? `That didn't work: ${problem}` : '';
      }),
      button('Export backup', () =>
        runBackup(planner.exportBackup, (result) => {
          message.textContent = `Backup saved to ${result.filePath}`;
        })
      ),
      button('Import backup', () =>
        runBackup(planner.importBackup, async () => {
          await reloadAfterImport();
        })
      )
    ),
    message
  );
}

function renderSettingsView(importSucceeded) {
  const panels = [startupPanel(), textSizePanel(), dataPanel()];
  if (importSucceeded) {
    panels.unshift(h('p', { class: 'notice-ok', role: 'status' }, 'Backup imported. Your data has been replaced.'));
  }
  return panels;
}
