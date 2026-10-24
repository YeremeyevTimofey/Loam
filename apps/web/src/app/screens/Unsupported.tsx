import { Wordmark } from '../components/Logo';
import { SiteFooter } from '../components/SiteFooter';
import { Button } from '../components/ui/button';

/** §4.4: no folder access in this browser. Say why, and offer the demo, which works everywhere. */
export function UnsupportedScreen() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="gutter flex flex-1 flex-col py-6">
        <Wordmark className="mx-auto mb-10 w-full max-w-[var(--wide)] md:mb-16" />
        <div className="measure appear flex-1">
          <h1 className="t-h1 mb-4">This browser can’t open a folder yet</h1>
          <p className="mb-3">
            Loam saves your knowledge base as ordinary files in a folder on your computer. Browsers can only allow that in Chrome, Edge and other Chromium-based browsers on a computer. Firefox, Safari and phones can’t.
          </p>
          <p className="mb-8">You can still look around: the example below is a filled-in knowledge base that works in any browser, and nothing in it is saved.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <a href="/app?demo=1" className="hover:no-underline">
                See a filled example
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/" className="hover:no-underline">
                Back to the home page
              </a>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
