// Statistics formatting, following the DOT acceptance checks for zero vs
// unknown vs unavailable and for stale values.
//
// - A measured zero stays "0 <unit>" (with source + period); it is never shown
//   as "Not measured".
// - A value that was never measured shows "Not measured" and is never rendered
//   as zero.
// - A value that was attempted but is unavailable or errored shows its cause,
//   then labels the value as stale (if relevant).
// - A trend is only reported when there is a valid previous comparison.
// - When the cause is unknown, the display says "Unavailable" without inventing
//   a cause, and still labels any stale value.

export type StatState = 'measured' | 'unmeasured' | 'unavailable' | 'stale';

export interface StatConfig {
  value: number | null | undefined;
  unit: string;
  source: string;
  period: string;
  state: StatState;
  detail?: string;
}

export function formatStat(config: StatConfig): string {
  const { value, unit, source, period, state, detail } = config;

  // Measured (including measured zero) renders the value with its unit.
  const measured = (value === null || value === undefined) ? null : `${value} ${unit}`;

  switch (state) {
    case 'unmeasured': {
      // Null / unmeasured is never 0, and never shown as "0".
      return `Not measured · ${source} · ${period}`;
    }
    case 'unavailable': {
      // Unavailable or error: the cause, then the source and period.
      const cause = detail ?? 'unavailable';
      return `Unavailable · ${cause} · ${source} · ${period}`;
    }
    case 'stale': {
      const text = measured ?? 'Not measured';
      return `${text} · ${source} · ${period} · stale`;
    }
    case 'measured': {
      if (value === null || value === undefined) {
        return `Not measured · ${source} · ${period}`;
      }
      return `${value} ${unit} · ${source} · ${period}`;
    }
  }
}

export type Trend = 'up' | 'down' | 'flat' | null;

export function compareTrend(current: number, previous: number | null): Trend {
  // A trend is only valid when there is a previous comparison baseline.
  if (previous === null || previous === undefined) return null;
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}
