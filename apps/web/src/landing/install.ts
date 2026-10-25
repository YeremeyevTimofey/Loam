import '../styles/landing.css';

/**
 * The install guide is static HTML. This adds a Copy button to every command and config block, if the browser
 * allows it. Without JavaScript the text is still selectable.
 */
for (const pre of document.querySelectorAll<HTMLElement>('pre[data-copy]')) {
  const wrap = pre.parentElement;
  if (!wrap || !navigator.clipboard) continue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mt-1 inline-flex h-11 min-w-11 items-center justify-end rounded-md px-2 text-[15px] font-medium text-accent-ink underline underline-offset-4';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', `Copy: ${pre.getAttribute('aria-label') ?? 'text'}`);
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent ?? '');
      button.textContent = 'Copied';
      window.setTimeout(() => (button.textContent = 'Copy'), 1800);
    } catch {
      button.textContent = 'Press Ctrl+C';
    }
  });
  wrap.append(button);
}
