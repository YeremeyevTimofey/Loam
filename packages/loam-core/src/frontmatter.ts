import matter from 'gray-matter';
import { LoamError } from './types';

/**
 * gray-matter ships a JavaScript front-matter engine (`---js`) that evaluates code. Skills come from
 * strangers, so every engine except YAML is replaced with one that refuses.
 */
const refuse = {
  parse: () => {
    throw new LoamError('Only plain YAML front matter is allowed.');
  },
};
const ENGINES = {
  js: refuse,
  javascript: refuse,
  coffee: refuse,
  coffeescript: refuse,
  cson: refuse,
  json: refuse,
  toml: refuse,
};

export interface ParsedDoc {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

/** Strips BOM, converts CRLF to LF. All text entering the core goes through this. */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeValue(v)]));
  }
  return value;
}

/**
 * gray-matter calls Buffer.from() on its input, and browsers have no Buffer. It only keeps the result
 * as `orig`, so a stand-in with the two functions it touches is enough (Node keeps its real Buffer).
 */
function ensureBuffer(): void {
  const g = globalThis as { Buffer?: unknown };
  if (g.Buffer === undefined) g.Buffer = { from: (s: string) => new TextEncoder().encode(s), isBuffer: () => false };
}

export function parseDoc(raw: string): ParsedDoc {
  ensureBuffer();
  const text = normalizeText(raw);
  if (text.startsWith('---')) {
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    if (firstLine.trim() !== '---') {
      throw new LoamError('The front matter must start with a plain "---" line.');
    }
  }
  let parsed;
  try {
    parsed = matter(text, { engines: ENGINES });
  } catch (error) {
    if (error instanceof LoamError) throw error;
    const reason = error instanceof Error ? error.message.split('\n')[0] : 'unknown error';
    throw new LoamError(`The front matter at the top of the file could not be read (${reason}).`);
  }
  const data = normalizeValue(parsed.data) as Record<string, unknown>;
  const hasFrontmatter = text.startsWith('---') && Object.keys(data).length > 0;
  return { data, body: parsed.content.replace(/^\n+/, ''), hasFrontmatter };
}

const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const NUMBERISH = /^[-+]?(\d[\d_]*)(\.\d+)?([eE][-+]?\d+)?$|^0[xob]/i;
// Plain (unquoted) strings may contain these. ":" and "#" are left out on purpose: "10:30" reads back as a number in YAML 1.1.
const PLAIN = /^[\p{L}\p{N}_][\p{L}\p{N}_ ./+()&'’!?%@;=*-]*$/u;

function scalar(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const plain = PLAIN.test(value) && !value.endsWith(' ') && !RESERVED.test(value) && !NUMBERISH.test(value);
  return plain ? value : JSON.stringify(value);
}

function dumpValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => scalar(item as string | number | boolean | null)).join(', ')}]`;
  }
  if (value !== null && typeof value === 'object') {
    // Nested values (kept when a person added them by hand): JSON is valid YAML.
    try {
      return JSON.stringify(value);
    } catch {
      throw new LoamError(`Front matter field "${key}" cannot be written.`);
    }
  }
  return scalar(value as string | number | boolean | null);
}

/** Writes `---`-delimited YAML (flat keys, lists in flow style) followed by the body. Output is deterministic. */
export function stringifyDoc(data: Record<string, unknown>, body: string): string {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => `${key}: ${dumpValue(key, value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '').trimEnd()}\n`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}
