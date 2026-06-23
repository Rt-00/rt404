/** Date/label formatting helpers (PT-BR), kept pure for unit testing. */

const FULL = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const MONTH = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  timeZone: 'UTC',
});

/** "20 de junho de 2026" */
export function formatDate(date: Date): string {
  return FULL.format(date);
}

/** ISO date (YYYY-MM-DD) for <time datetime>. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lowercase month name in PT-BR, e.g. "junho". */
export function monthName(monthIndex0: number): string {
  // Use a fixed day to avoid DST/edge issues.
  return MONTH.format(new Date(Date.UTC(2020, monthIndex0, 15)));
}

/** Capitalized difficulty label. */
export function difficultyLabel(difficulty: string): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
