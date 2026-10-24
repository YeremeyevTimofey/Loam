import type { Site } from './site.d.mts';

export const REGISTRY_DESCRIPTION: string;
export const REGISTRY_SCHEMA: string;
export function mcpName(site: Site): string;
export function serverJson(input: { site: Site; version: string }): Record<string, unknown> & {
  name: string;
  description: string;
  version: string;
  packages: { registryType: string; identifier: string; version: string; transport: { type: string }; environmentVariables: { name: string; isRequired: boolean }[] }[];
};
