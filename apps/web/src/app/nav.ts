import { useCallback, useEffect, useState } from 'react';

export type Screen = 'overview' | 'process' | 'skills' | 'health';
export interface Route {
  screen: Screen;
  /** Process slug, when screen is 'process'. */
  process?: string;
}

/** `?process=<slug>` opens a process (deep link); `?screen=skills|health` opens those screens. */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const process = params.get('process');
  if (process) return { screen: 'process', process };
  const screen = params.get('screen');
  return { screen: screen === 'skills' || screen === 'health' ? screen : 'overview' };
}

export function routeUrl(route: Route, current: string = window.location.search): string {
  const params = new URLSearchParams(current);
  params.delete('screen');
  params.delete('process');
  if (route.screen === 'process' && route.process) params.set('process', route.process);
  else if (route.screen !== 'overview') params.set('screen', route.screen);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

/** Tiny history-based navigation: the pages are separate builds, so a router is not needed. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.search));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next: Route) => {
    window.history.pushState(null, '', routeUrl(next));
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
