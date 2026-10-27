import { format } from 'date-fns';
import { TZDate } from 'react-day-picker';
import { pageConfig } from '@flarewatch/config';

export function getDisplayTimeZone(): string {
  return pageConfig.timeZone ?? 'UTC';
}

/** Explicit page zone: rendering never depends on the server or browser's local zone. */
export function toDisplayDate(date: Date): TZDate {
  return new TZDate(date.getTime(), getDisplayTimeZone());
}

/** A local calendar day boundary, including when the configured zone observes DST. */
export function startOfDisplayDay(date: Date, offsetDays = 0): Date {
  const local = toDisplayDate(date);
  local.setDate(local.getDate() + offsetDays);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime());
}

export function formatDisplayZone(date: Date): string {
  const offset = -toDisplayDate(date).getTimezoneOffset();
  if (offset === 0) return 'UTC';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `UTC${offset > 0 ? '+' : '-'}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

export function formatDisplayShort(seconds: number): string {
  const date = new Date(seconds * 1000);
  return `${formatDisplay(date, 'MMM d, HH:mm')} ${formatDisplayZone(date)}`;
}

export function parseYearMonth(value: string) {
  const [yearStr = '1970', monthStr = '01'] = value.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
  };
}

export function isValidYearMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function shiftYearMonth(value: string, deltaMonths: number): string {
  const { year, month } = parseYearMonth(value);
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return shifted.toISOString().slice(0, 7);
}

export function getDisplayMonthBounds(value: string) {
  const { year, month } = parseYearMonth(value);
  const monthIndex = month - 1;
  const monthStart = new Date(new TZDate(year, monthIndex, 1, getDisplayTimeZone()).getTime());
  const monthEnd = new Date(
    new TZDate(year, monthIndex + 1, 1, getDisplayTimeZone()).getTime() - 1,
  );
  return { monthStart, monthEnd };
}

export function formatDisplay(date: Date, pattern: string): string {
  return format(toDisplayDate(date), pattern);
}

export function getDateKey(date: Date): string {
  return formatDisplay(date, 'yyyy-MM-dd');
}

export interface CalendarDay {
  date: Date;
  isToday: boolean;
  isFuture: boolean;
}

export interface CalendarMonthGrid {
  yearMonth: string;
  label: string;
  weeks: (CalendarDay | null)[][];
}

/**
 * Calendar window ends at `endYearMonth` (or the month of `now`); weeks are Mon–Sun, `null`-padded.
 */
export function generateCalendarGrids(
  now: Date,
  monthCount: number,
  endYearMonth?: string,
): CalendarMonthGrid[] {
  const wallNow = toDisplayDate(now);
  const todayYear = wallNow.getFullYear();
  const todayMonth = wallNow.getMonth();
  const todayMidnight = startOfDisplayDay(now).getTime();

  let endYear = todayYear;
  let endMonth = todayMonth;
  if (endYearMonth) {
    const parsed = parseYearMonth(endYearMonth);
    endYear = parsed.year;
    endMonth = parsed.month - 1; // 0-indexed
  }

  const grids: CalendarMonthGrid[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const firstOfMonth = new TZDate(endYear, endMonth - i, 1, getDisplayTimeZone());
    const year = firstOfMonth.getFullYear();
    const month = firstOfMonth.getMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    // Mon=0, Tue=1, ..., Sun=6
    const firstDayOfWeek = (firstOfMonth.getDay() + 6) % 7;

    const weeks: (CalendarDay | null)[][] = [];
    let currentWeek: (CalendarDay | null)[] = [];

    for (let p = 0; p < firstDayOfWeek; p++) {
      currentWeek.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(new TZDate(year, month, d, getDisplayTimeZone()).getTime());
      const dateMs = date.getTime();

      currentWeek.push({
        date,
        isToday: dateMs === todayMidnight,
        isFuture: dateMs > todayMidnight,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    const yearMonth = getDateKey(firstOfMonth).slice(0, 7);
    const label = formatDisplay(firstOfMonth, 'MMMM yyyy');

    grids.push({ yearMonth, label, weeks });
  }

  return grids;
}

/** Human duration like "2d 3h"; `minUnit: 'minutes'` stops the breakdown at minutes (default 'seconds'). */
export function formatDuration(ms: number, options?: { minUnit?: 'seconds' | 'minutes' }): string {
  if (ms <= 0) return '0m';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (options?.minUnit === 'minutes') return `${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format a period in seconds the way the card header reads it:
 * 900 -> "15m", 3600 -> "1h", 86400 -> "24h", 604800 -> "7d".
 * Days start at 48h so a daily job stays "24h", like the mockup.
 */
export function formatCadence(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds >= 2 * 86400 && seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
