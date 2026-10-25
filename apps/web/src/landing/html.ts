/** Escapes text for HTML. Everything the landing generators insert goes through this. */
export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const num = (n: number): string => n.toLocaleString('en-US');

const BADGE = 'inline-flex h-[22px] items-center whitespace-nowrap rounded-sm px-2 text-[13px] font-medium leading-none';
export const badge = (tone: 'neutral' | 'success' | 'warning' | 'danger' | 'muted', text: string): string => {
  const cls = { neutral: 'bg-accent-soft text-accent-ink', success: 'bg-success-soft text-success-ink', warning: 'bg-warning-soft text-warning-ink', danger: 'bg-danger-soft text-danger', muted: 'border border-line text-muted' }[tone];
  return `<span class="${BADGE} ${cls}">${esc(text)}</span>`;
};

export const button = (href: string, label: string, kind: 'primary' | 'secondary' = 'primary', extra = ''): string =>
  `<a href="${esc(href)}" class="${extra} inline-flex h-11 items-center justify-center rounded-md px-5 font-medium leading-none no-underline transition-[background-color,border-color,translate] duration-150 ease-calm hover:no-underline active:translate-y-px ${
    kind === 'primary' ? 'bg-accent text-on-accent hover:bg-accent-hover' : 'border border-line bg-surface text-ink hover:border-soil'
  }">${esc(label)}</a>`;
