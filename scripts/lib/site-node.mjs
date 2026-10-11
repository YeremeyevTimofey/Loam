import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSite } from './site.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Node-side access to site.config.json (build scripts, Vite config, checks). */
export const site = resolveSite(JSON.parse(readFileSync(path.join(root, 'site.config.json'), 'utf8')));
