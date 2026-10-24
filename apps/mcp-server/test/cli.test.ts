import { describe, expect, it } from 'vitest';
import { parseCli, resolveFolderInput, usage } from '../src/cli';

describe('command line of the server (how every agent except Claude Desktop starts it)', () => {
  it('reads --folder in all the forms agents and people write it', () => {
    expect(parseCli(['--folder', '/Users/sarah/Loam'])).toEqual({ kind: 'run', folder: '/Users/sarah/Loam' });
    expect(parseCli(['--folder=/Users/sarah/Loam'])).toEqual({ kind: 'run', folder: '/Users/sarah/Loam' });
    expect(parseCli(['-f', 'C:\\Users\\Sarah\\Loam'])).toEqual({ kind: 'run', folder: 'C:\\Users\\Sarah\\Loam' });
    expect(parseCli(['/Users/sarah/My Loam'])).toEqual({ kind: 'run', folder: '/Users/sarah/My Loam' });
  });
  it('falls back to LOAM_FOLDER, and the argument wins over it', () => {
    expect(parseCli([], { LOAM_FOLDER: '/from/env' })).toEqual({ kind: 'run', folder: '/from/env' });
    expect(parseCli(['--folder', '/from/arg'], { LOAM_FOLDER: '/from/env' })).toEqual({ kind: 'run', folder: '/from/arg' });
    expect(parseCli([], {})).toEqual({ kind: 'run', folder: undefined });
    expect(parseCli([], { LOAM_FOLDER: '   ' })).toEqual({ kind: 'run', folder: undefined });
  });
  it('expands ~ and strips quotes some launchers leave in', () => {
    expect(resolveFolderInput('~/Loam', '/Users/sarah')).toBe('/Users/sarah/Loam');
    expect(resolveFolderInput('~', '/Users/sarah')).toBe('/Users/sarah');
    expect(resolveFolderInput('~\\Loam', 'C:\\Users\\Sarah')).toBe('C:\\Users\\Sarah\\Loam');
    expect(resolveFolderInput('"/Users/sarah/My Loam"')).toBe('/Users/sarah/My Loam');
    expect(resolveFolderInput("'/Users/sarah/Loam'")).toBe('/Users/sarah/Loam');
    expect(resolveFolderInput('~user/x', '/h')).toBe('~user/x');
  });
  it('understands --check, --help and --version', () => {
    expect(parseCli(['--check', '--folder', '/x'])).toEqual({ kind: 'check', folder: '/x' });
    expect(parseCli(['--help'])).toEqual({ kind: 'help' });
    expect(parseCli(['-v'])).toEqual({ kind: 'version' });
  });
  it('explains mistakes instead of starting with a wrong folder', () => {
    expect(parseCli(['--folder'])).toMatchObject({ kind: 'error', message: expect.stringContaining('needs a path') });
    expect(parseCli(['--folder', '--check'])).toMatchObject({ kind: 'error' });
    expect(parseCli(['--bogus'])).toMatchObject({ kind: 'error', message: 'Unknown option "--bogus".' });
  });

  it('points to the repository in --help when the build knows it, and says nothing otherwise', () => {
    expect(usage('https://github.com/owner/repo')).toMatch(/\n\nSource, documentation and issues: https:\/\/github\.com\/owner\/repo$/);
    expect(usage(undefined)).not.toMatch(/github|issues/i);
    expect(usage(undefined)).toContain('Connect your agent');
  });
});
