/** §12C.4: sticky, 40px high on a computer, warning at 8%, honest about what demo mode is. On a phone the text wraps and the bar grows. */
export function DemoBanner() {
  return (
    <div className="sticky top-0 z-30 bg-bg">
      <div role="status" className="flex min-h-10 flex-wrap items-center justify-center gap-x-3 bg-warning-soft px-4 py-0.5 text-center text-[15px] text-warning-ink">
        <span>Demo mode — changes are not saved</span>
        <a href="/app" className="inline-flex min-h-11 items-center font-medium text-warning-ink underline underline-offset-4 md:-my-0.5">
          Use my own folder
        </a>
      </div>
    </div>
  );
}
