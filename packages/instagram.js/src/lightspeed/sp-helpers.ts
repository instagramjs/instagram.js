import type { LsValue } from './types';

export function str(args: LsValue[], i: number): string {
  const v = args[i];
  return typeof v === 'string' ? v : '';
}

export function num(args: LsValue[], i: number): string {
  const v = args[i];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

export function bool(args: LsValue[], i: number): boolean {
  return args[i] === true;
}
