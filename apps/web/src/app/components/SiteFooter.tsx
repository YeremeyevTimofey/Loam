import { ISSUES_URL, REPO_URL, repoFile } from '../lib/links';
import { NewTabLink } from './NewTabLink';

/** Where the code lives, how to report a problem, the licence. On every screen, including the start screen. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <nav aria-label="About Loam" className="wide gutter flex flex-wrap items-center gap-x-5 gap-y-1 py-3 text-[15px]">
        <span className="t-secondary">Loam is free and open source.</span>
        <NewTabLink href={REPO_URL}>Code on GitHub</NewTabLink>
        <NewTabLink href={ISSUES_URL}>Report a problem</NewTabLink>
        <NewTabLink href={repoFile('LICENSE')}>Licence</NewTabLink>
      </nav>
    </footer>
  );
}
