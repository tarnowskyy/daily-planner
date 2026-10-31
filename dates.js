// Dates are stored as "YYYY-MM-DD" in local time, so a day never shifts around midnight.

function dateToKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function keyToDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function todayKey() {
  return dateToKey(new Date());
}

function addDays(key, count) {
  const date = keyToDate(key);
  date.setDate(date.getDate() + count);
  return dateToKey(date);
}

// Weeks run Monday to Sunday.
function weekStartOf(key) {
  const daysSinceMonday = (keyToDate(key).getDay() + 6) % 7;
  return addDays(key, -daysSinceMonday);
}

function formatLong(key) {
  return keyToDate(key).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatWeekday(key) {
  return keyToDate(key).toLocaleDateString('en-US', { weekday: 'short' });
}

function formatMonthDay(key) {
  return keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekRange(startKey) {
  const endKey = addDays(startKey, 6);
  const year = keyToDate(endKey).getFullYear();
  return `${formatMonthDay(startKey)} – ${formatMonthDay(endKey)}, ${year}`;
}
