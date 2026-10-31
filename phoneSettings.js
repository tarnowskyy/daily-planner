// The phone's Settings screen. It replaces the PC's and reuses its text size and tag panels.

const countOf = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`;

function backupStatusText() {
  const { neverBackedUp, days } = phoneStorage.backupAge();
  if (neverBackedUp) return 'You have not saved a backup yet.';
  if (days === 0) return 'Last backup: today.';
  return `Last backup: ${countOf(days, 'day')} ago.`;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  h('a', { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

// Returns whether a backup was handed over. Must run straight from a tap, with nothing awaited first.
async function saveBackupFile() {
  const file = phoneStorage.backupFile();
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
    }
  }
  downloadFile(file);
  return true;
}

function backupPanel() {
  const status = h('p', { class: 'backup-status' });
  const message = h('p', { class: 'hint', role: 'status' });
  const confirmArea = h('div', { class: 'backup-confirm' });
  const undoArea = h('div', {});

  function drawStatus() {
    status.textContent = backupStatusText();
    status.classList.toggle('backup-overdue', phoneStorage.backupAge().overdue);
    if (phoneStorage.backupAge().overdue) {
      status.textContent += ' It has been over a week, so save one soon.';
    }
  }

  async function replaceWith(data) {
    try {
      await planner.replaceData(data);
      await reloadAfterImport();
    } catch (error) {
      confirmArea.replaceChildren();
      message.textContent = `That didn't work, and your data was not changed: ${error.message}`;
    }
  }

  function askBeforeReplacing(text, data) {
    message.textContent = '';
    confirmArea.replaceChildren(
      h('p', { class: 'recipe-warning' }, text),
      h(
        'div',
        { class: 'button-row' },
        button('Replace my data', () => replaceWith(data), 'btn-danger'),
        button('Cancel', () => confirmArea.replaceChildren())
      )
    );
  }

  const filePicker = h('input', {
    type: 'file',
    hidden: true,
    'aria-label': 'Choose a backup file',
    onChange: async (event) => {
      const [file] = event.target.files;
      event.target.value = '';
      if (!file) return;
      try {
        const backup = await planner.readBackup(await file.text());
        const saved = backup.savedAt ? ` saved ${new Date(backup.savedAt).toLocaleString('en-US')}` : '';
        askBeforeReplacing(
          `Replace everything on this phone with the backup${saved}? It has ${countOf(backup.recipeCount, 'recipe')} and ${countOf(backup.dayCount, 'planned day')}. ` +
            'Your current data is copied first, so you can undo this.',
          backup.data
        );
      } catch (error) {
        confirmArea.replaceChildren();
        message.textContent = error.message;
      }
    },
  });

  async function drawUndo() {
    const copy = await planner.latestSafetyCopy();
    if (!copy) return;
    const saved = new Date(copy.savedAt).toLocaleString('en-US');
    undoArea.replaceChildren(
      button('Undo last import', () => askBeforeReplacing(`Go back to your data from ${saved}?`, copy.data))
    );
  }

  drawStatus();
  drawUndo();
  return panel(
    'Backup',
    status,
    h(
      'div',
      { class: 'button-row' },
      button(
        'Save backup to Files',
        async () => {
          message.textContent = '';
          if (await saveBackupFile()) {
            state.settings = await planner.markBackupMade();
            drawStatus();
            message.textContent = 'Backup saved.';
          }
        },
        'btn-primary'
      ),
      button('Import backup', () => filePicker.click()),
      undoArea
    ),
    filePicker,
    confirmArea,
    message,
    h(
      'p',
      { class: 'hint' },
      'Your data is only on this phone and is never sent anywhere. Removing the app from your Home Screen erases it, so keep a backup in Files.'
    )
  );
}

function renderSettingsView(importSucceeded) {
  const panels = [backupPanel(), textSizePanel(), tagsPanel(), h('p', { class: 'hint app-version' }, `App version ${APP_VERSION}`)];
  if (importSucceeded) {
    panels.unshift(h('p', { class: 'notice-ok', role: 'status' }, 'Backup imported. Your data has been replaced.'));
  }
  return panels;
}
