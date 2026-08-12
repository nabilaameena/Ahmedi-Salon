// Tiny frosted-glass toast system — replaces alert() for graceful feedback.

let stack = null;
function ensureStack() {
  if (stack) return stack;
  stack = document.createElement('div');
  stack.className = 'toast-stack';
  document.body.appendChild(stack);
  return stack;
}

export function toast(message, type = 'default', ms = 3200) {
  const s = ensureStack();
  const node = document.createElement('div');
  node.className = 'toast toast-' + type;
  node.textContent = message;
  s.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  const remove = () => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  };
  const timer = setTimeout(remove, ms);
  node.addEventListener('click', () => { clearTimeout(timer); remove(); });
}