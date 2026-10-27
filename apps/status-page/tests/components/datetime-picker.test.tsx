// @vitest-environment jsdom

import { useDisplayTimeZone } from '../helpers/display-time-zone';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { DateTimePicker } from '@/components/ui/datetime-picker';

useDisplayTimeZone('Asia/Shanghai');

const originalTimeZone = process.env.TZ;

// UTC and the host zone still read June 9 when the page zone is already on June 10.
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles';
});

afterAll(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe('DateTimePicker', () => {
  const value = new Date('2026-06-09T18:00:00Z');

  it('shows the value in UTC+8', () => {
    render(<DateTimePicker value={value} />);

    expect(screen.getByRole('button', { name: /Jun 10, 2026 02:00 UTC\+8/ })).toBeTruthy();
  });

  it('keeps the page-zone time when another day is picked', async () => {
    const changes: (Date | undefined)[] = [];
    render(<DateTimePicker value={value} onChange={(date) => changes.push(date)} />);

    fireEvent.click(screen.getByRole('button', { name: /Jun 10, 2026/ }));
    fireEvent.click(await screen.findByRole('button', { name: /June 15th, 2026/ }));

    expect(changes.map((date) => date?.toISOString())).toEqual(['2026-06-14T18:00:00.000Z']);
  });
});
