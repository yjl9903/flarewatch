import { pageConfig } from '@flarewatch/config';
import { useDisplayTimeZone } from '../helpers/display-time-zone';
import { describe, it, expect, vi } from 'vite-plus/test';
import {
  isValidYearMonth,
  shiftYearMonth,
  getDisplayMonthBounds,
  generateCalendarGrids,
  formatDuration,
  formatCadence,
  formatDisplay,
  formatDisplayShort,
  getDateKey,
  startOfDisplayDay,
  formatDisplayZone,
} from '@/lib/date';

useDisplayTimeZone('Asia/Shanghai');

describe('isValidYearMonth', () => {
  it('accepts valid year-month strings', () => {
    expect(isValidYearMonth('2024-01')).toBe(true);
    expect(isValidYearMonth('2024-12')).toBe(true);
    expect(isValidYearMonth('1999-06')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidYearMonth('2024-1')).toBe(false);
    expect(isValidYearMonth('24-01')).toBe(false);
    expect(isValidYearMonth('2024/01')).toBe(false);
    expect(isValidYearMonth('invalid')).toBe(false);
    expect(isValidYearMonth(null)).toBe(false);
    expect(isValidYearMonth(undefined)).toBe(false);
  });

  it('rejects invalid month values', () => {
    expect(isValidYearMonth('2024-00')).toBe(false);
    expect(isValidYearMonth('2024-13')).toBe(false);
  });
});

describe('shiftYearMonth', () => {
  it('shifts months forward', () => {
    expect(shiftYearMonth('2024-01', 1)).toBe('2024-02');
    expect(shiftYearMonth('2024-06', 3)).toBe('2024-09');
  });

  it('shifts months backward', () => {
    expect(shiftYearMonth('2024-03', -1)).toBe('2024-02');
    expect(shiftYearMonth('2024-06', -3)).toBe('2024-03');
  });

  it('handles year boundaries', () => {
    expect(shiftYearMonth('2024-12', 1)).toBe('2025-01');
    expect(shiftYearMonth('2024-01', -1)).toBe('2023-12');
    expect(shiftYearMonth('2024-06', 12)).toBe('2025-06');
  });
});

describe('getDisplayMonthBounds', () => {
  it('returns correct month boundaries', () => {
    const { monthStart, monthEnd } = getDisplayMonthBounds('2024-01');
    expect(monthStart.toISOString()).toBe('2023-12-31T16:00:00.000Z');
    expect(monthEnd.toISOString()).toBe('2024-01-31T15:59:59.999Z');
  });

  it('handles February in leap year', () => {
    const { monthEnd } = getDisplayMonthBounds('2024-02');
    expect(monthEnd.getUTCDate()).toBe(29);
  });

  it('handles February in non-leap year', () => {
    const { monthEnd } = getDisplayMonthBounds('2023-02');
    expect(monthEnd.getUTCDate()).toBe(28);
  });
});

describe('generateCalendarGrids', () => {
  it.each([
    {
      month: '2024-02',
      weeks: 5,
      first: [null, null, null, 1, 2, 3, 4],
      last: [26, 27, 28, 29, null, null, null],
    },
    {
      month: '2023-10',
      weeks: 6,
      first: [null, null, null, null, null, null, 1],
      last: [30, 31, null, null, null, null, null],
    },
    {
      month: '2024-04',
      weeks: 5,
      first: [1, 2, 3, 4, 5, 6, 7],
      last: [29, 30, null, null, null, null, null],
    },
  ])(
    'aligns $month Monday-first and marks UTC+8 today and future days',
    ({ month, weeks, first, last }) => {
      const [grid] = generateCalendarGrids(new Date(`${month}-15T23:59:59Z`), 1);

      expect(grid?.yearMonth).toBe(month);
      expect(grid?.weeks).toHaveLength(weeks);
      expect(grid?.weeks.every((week) => week.length === 7)).toBe(true);
      expect(
        grid?.weeks[0]?.map((day) => (day ? Number(formatDisplay(day.date, 'd')) : null)),
      ).toEqual(first);
      expect(
        grid?.weeks.at(-1)?.map((day) => (day ? Number(formatDisplay(day.date, 'd')) : null)),
      ).toEqual(last);
      const days = grid?.weeks.flat().filter((day) => day !== null) ?? [];
      expect(days.filter((day) => day.isToday).map((day) => day.date.toISOString())).toEqual([
        `${month}-15T16:00:00.000Z`,
      ]);
      for (const day of days) expect(day.isFuture).toBe(Number(formatDisplay(day.date, 'd')) > 16);
    },
  );

  it('rolls months back across a year boundary', () => {
    const grids = generateCalendarGrids(new Date('2025-03-15T12:00:00Z'), 3, '2025-01');

    expect(grids.map((grid) => grid.yearMonth)).toEqual(['2024-11', '2024-12', '2025-01']);
    expect(grids.map((grid) => grid.weeks.flat().filter(Boolean).length)).toEqual([30, 31, 31]);
    expect(
      grids.map(
        (grid) =>
          grid.weeks
            .flat()
            .filter((day) => day !== null)
            .map((day) => getDateKey(day.date))[0],
      ),
    ).toEqual(['2024-11-01', '2024-12-01', '2025-01-01']);
  });
});

describe('formatCadence', () => {
  it('picks the shortest unit that divides the period evenly', () => {
    expect(formatCadence(900)).toBe('15m');
    expect(formatCadence(1800)).toBe('30m');
    expect(formatCadence(3600)).toBe('1h');
    expect(formatCadence(86400)).toBe('24h');
    expect(formatCadence(604800)).toBe('7d');
  });

  it('renders zero as 0s instead of 0h', () => {
    expect(formatCadence(0)).toBe('0s');
  });

  it('falls back to seconds for odd values', () => {
    expect(formatCadence(90)).toBe('90s');
  });

  it('prefers the larger unit when both divide', () => {
    expect(formatCadence(172800)).toBe('2d');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(45000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('keeps a zero secondary unit unpadded', () => {
    expect(formatDuration(240000)).toBe('4m 0s');
    expect(formatDuration(7200000)).toBe('2h 0m');
    expect(formatDuration(3660000)).toBe('1h 1m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(4320000)).toBe('1h 12m');
  });

  it('formats days and hours', () => {
    expect(formatDuration(90000000)).toBe('1d 1h');
    expect(formatDuration(86400000)).toBe('1d 0h');
  });

  it('handles zero and negative values', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-1000)).toBe('0m');
  });

  it('respects minUnit option', () => {
    expect(formatDuration(30000, { minUnit: 'minutes' })).toBe('0m');
    expect(formatDuration(90000, { minUnit: 'minutes' })).toBe('1m');
  });
});

describe('configured display time', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])(
    'keeps the UTC+8 date across year boundaries on a %s host',
    (hostZone) => {
      vi.stubEnv('TZ', hostZone);
      const instant = new Date('2026-12-31T16:05:00Z');
      expect(formatDisplayShort(instant.getTime() / 1000)).toBe('Jan 1, 00:05 UTC+8');
      expect(getDateKey(instant)).toBe('2027-01-01');
      expect(formatDisplay(instant, 'HH:mm')).toBe('00:05');
      const [grid] = generateCalendarGrids(instant, 1);
      expect(grid?.yearMonth).toBe('2027-01');
      expect(
        grid?.weeks
          .flat()
          .find((day) => day?.isToday)
          ?.date.toISOString(),
      ).toBe('2026-12-31T16:00:00.000Z');
    },
  );
});

describe('other configured time zones', () => {
  it('defaults to UTC when no time zone is set', () => {
    delete pageConfig.timeZone;
    expect(formatDisplayShort(Date.parse('2026-12-31T16:05:00Z') / 1000)).toBe('Dec 31, 16:05 UTC');
  });

  it('uses 23- and 25-hour days at daylight saving transitions', () => {
    pageConfig.timeZone = 'America/New_York';
    for (const [instant, hours] of [
      ['2026-03-08T12:00:00Z', 23],
      ['2026-11-01T12:00:00Z', 25],
    ] as const) {
      const date = new Date(instant);
      const start = startOfDisplayDay(date);
      const next = startOfDisplayDay(date, 1);
      expect(next.getTime() - start.getTime()).toBe(hours * 60 * 60 * 1000);
      expect(formatDisplay(start, 'HH:mm')).toBe('00:00');
      expect(formatDisplay(next, 'HH:mm')).toBe('00:00');
    }
    expect(formatDisplayZone(new Date('2026-01-01T12:00:00Z'))).toBe('UTC-5');
    expect(formatDisplayZone(new Date('2026-07-01T12:00:00Z'))).toBe('UTC-4');
  });

  it('labels a fractional-hour zone without rounding it', () => {
    pageConfig.timeZone = 'Asia/Kolkata';
    expect(formatDisplayShort(Date.parse('2026-10-27T12:00:00Z') / 1000)).toBe(
      'Oct 27, 17:30 UTC+5:30',
    );
  });
});
