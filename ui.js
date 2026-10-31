// Builds page elements. Text always goes in as plain text, so anything typed displays exactly as typed.
function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === 'class') element.className = value;
    else if (name.startsWith('on')) element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name in element) element[name] = value;
    else element.setAttribute(name, value);
  }
  element.append(...children.filter((child) => child !== null && child !== undefined));
  return element;
}

function button(label, onClick, className = '', props = {}) {
  return h('button', { class: `btn ${className}`.trim(), type: 'button', onClick, ...props }, label);
}

function panel(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, title), ...children);
}
