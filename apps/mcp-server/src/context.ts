import { todayIso, LoamError } from '@loam/core';
import path from 'node:path';
import { NodeStore } from './node-store';
import { SearchIndex } from './search/search-index';

/** Runs jobs one at a time, so two tool calls cannot interleave their read-modify-write cycles. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job, job);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export interface Ready {
  store: NodeStore;
  search: SearchIndex;
  today: () => string;
}

export interface Ctx {
  /** Set when the folder could not be opened; every tool then answers with this text. */
  problem: string | null;
  ready: Ready | null;
  lock: Mutex;
}

export function createContext(folder: string | undefined, options: { forceBasicSearch?: boolean } = {}): Ctx {
  const lock = new Mutex();
  if (!folder || folder.trim() === '') {
    return {
      problem:
        'No knowledge base folder is configured. Give the server the folder you set up in the Loam app: in Claude Desktop that is the Loam extension\'s folder setting, in other agents the --folder path of the MCP configuration (Loam app → Connect your agent).',
      ready: null,
      lock,
    };
  }
  try {
    const store = new NodeStore(folder);
    const search = new SearchIndex(store, path.join(store.root, '.loam', 'index.sqlite'), { forceBasic: options.forceBasicSearch });
    return { problem: null, ready: { store, search, today: () => todayIso() }, lock };
  } catch (error) {
    return { problem: error instanceof LoamError ? error.message : `Could not open the knowledge base: ${(error as Error).message}`, ready: null, lock };
  }
}
