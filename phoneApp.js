// Phone-only behavior around the shared screens. Loaded just before the shared app.js.

// The rules take up too much of a phone screen with buttons under each one,
// so the buttons stay tucked away until asked for. Tapping a rule edits it.
let managingRules = false;
const sharedRulesPanel = rulesPanel;

rulesPanel = function () {
  const rules = sharedRulesPanel();
  rules.classList.toggle('rules-managing', managingRules);
  const toggle = button('Reorder or delete', () => {
    managingRules = !managingRules;
    rules.classList.toggle('rules-managing', managingRules);
    toggle.textContent = managingRules ? 'Done' : 'Reorder or delete';
  });
  if (managingRules) toggle.textContent = 'Done';
  rules.append(toggle);
  return rules;
};

document.getElementById('view').addEventListener('click', (event) => {
  const row = event.target.closest('.rules .rule-text')?.closest('.rule-row');
  if (!row) return;
  [...row.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Edit')?.click();
});

// On the phone this tab is labeled Today, so it always goes back to today.
document.querySelector('.tab[data-view="day"]').addEventListener('click', () => {
  state.date = todayKey();
});

function isBusy() {
  return document.activeElement.matches('input, textarea, select') || state.recipeScreen.mode === 'edit' || Boolean(state.picking);
}

// A new version has taken over. Switch now unless that would interrupt something;
// if it would, the next launch picks it up.
async function useNewVersion() {
  if (isBusy()) return;
  await phoneStorage.flush();
  location.reload();
}

async function startOfflineSupport() {
  if (!('serviceWorker' in navigator)) return;
  const hadVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadVersion) useNewVersion();
  });
  const registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  // iPhones often resume the app instead of restarting it, so check on resume too.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
}

function showInstallHint() {
  if (navigator.standalone !== false) return;
  phoneStorage.notices.push('You are in Safari. Add this to your Home Screen and use it from there, or your data may not be kept.');
}

// iPhones can freeze the app the moment it leaves the screen, so save right away.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') phoneStorage.flush();
  else followNewDay();
});
window.addEventListener('pagehide', () => phoneStorage.flush());

storageReady
  .then(() => {
    showInstallHint();
    return navigator.storage?.persist?.();
  })
  .catch((error) => {
    console.error('Could not open data:', error);
    document
      .getElementById('view')
      .replaceChildren(
        panel(
          'Your data could not be opened',
          h('p', {}, 'Nothing was changed. Close the app fully and open it again. If this keeps happening, restart the phone.')
        )
      );
  });

startOfflineSupport().catch((error) => console.error('Offline setup failed:', error));
