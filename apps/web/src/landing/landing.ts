import '../styles/landing.css';

/**
 * The only script on the landing page. Folder access exists in Chromium browsers on a computer
 * (File System Access API). Elsewhere, "Start with my folder" is disabled and says why; the demo always works.
 */
const folder = document.getElementById('cta-folder');
const note = document.getElementById('cta-note');
if (folder && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker !== 'function') {
  folder.setAttribute('aria-disabled', 'true');
  folder.removeAttribute('href');
  folder.setAttribute('role', 'link');
  folder.setAttribute('aria-describedby', 'cta-note');
  folder.removeAttribute('class');
  folder.className =
    'inline-flex h-11 items-center justify-center rounded-md border border-line bg-surface px-5 font-medium leading-none text-ink opacity-50 cursor-not-allowed';
  if (note) note.hidden = false;
}
