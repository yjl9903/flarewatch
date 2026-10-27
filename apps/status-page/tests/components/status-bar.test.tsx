// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { StatusView } from '@flarewatch/shared';

import { useDisplayTimeZone } from '../helpers/display-time-zone';

import { StatusBar } from '../../src/components/status-bar';

useDisplayTimeZone('Asia/Shanghai');

const NOW = 1_736_942_400;
const DAY = 86_400;
const state: StatusView = {
  lastUpdate: NOW,
  monitors: { api: { status: 'up', incidents: [], startedAt: NOW - 120 * DAY } },
};

function periods() {
  const { container } = render(<StatusBar monitorId="api" monitorName="API" state={state} />);
  const labels = (selector: string) =>
    [...container.querySelectorAll(`${selector} [aria-label]`)].map((day) =>
      day.getAttribute('aria-label'),
    );
  return { desktop: labels('.sm\\:flex'), mobile: labels('.sm\\:hidden') };
}

function bars() {
  const { desktop, mobile } = periods();
  return { desktop: desktop.length, mobile: mobile.length };
}

function measureWidth(width: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width, height: 24 }),
  );
}

describe('StatusBar', () => {
  it('labels periods in the page time zone and opens only the clicked period’s incidents', () => {
    const snapshot: StatusView = {
      lastUpdate: Date.parse('2025-01-15T12:30:00Z') / 1000,
      monitors: {
        api: {
          status: 'up',
          startedAt: Date.parse('2025-01-01T00:00:00Z') / 1000,
          incidents: [
            {
              start: [Date.parse('2025-01-15T10:00:00Z') / 1000],
              end: Date.parse('2025-01-15T11:00:00Z') / 1000,
              error: ['Request timed out'],
            },
          ],
        },
      },
    };
    render(<StatusBar monitorId="api" monitorName="API" state={snapshot} />);
    const label = 'Jan 15, 2025 18:30 – Jan 15, 2025 20:30';
    fireEvent.click(screen.getByRole('button', { name: `75.00% uptime from ${label}` }));
    expect(screen.getByRole('dialog', { name: `API incidents from ${label}` })).toBeTruthy();
    expect(screen.getByText('[18:30 - 19:00]')).toBeTruthy();
    expect(screen.getByText('Request timed out')).toBeTruthy();
  });

  it('shows no mobile periods before it knows its width', () => {
    expect(bars()).toEqual({ desktop: 84, mobile: 0 });
  });

  it('shows every period on a mobile bar wide enough for them', () => {
    measureWidth(10_000);
    expect(bars()).toEqual({ desktop: 84, mobile: 84 });
  });

  it('shows the latest periods that fit on a phone-width bar', () => {
    measureWidth(360);
    const { desktop, mobile } = periods();
    expect(mobile.length).toBeGreaterThan(0);
    expect(mobile.length).toBeLessThan(desktop.length);
    expect(mobile).toEqual(desktop.slice(-mobile.length));
  });
});
