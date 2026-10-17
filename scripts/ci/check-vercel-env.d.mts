export interface Requirement {
  label: string;
  anyOf: string[];
}
export const REQUIREMENTS: Requirement[];
export const FORBIDDEN_PUBLIC: RegExp;
export function parseEnvNames(text: string): Set<string>;
export function checkEnv(names: Set<string>): { ok: boolean; missing: Requirement[]; exposed: string[] };
