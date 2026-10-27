// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { AdminMonitor } from '@/lib/public-view';
import { renderWithProviders } from '../helpers/render';
import type { StatusView } from '@flarewatch/shared';

import { MonitorList } from '@/components/monitor-list';
import { useDisplayTimeZone } from '../helpers/display-time-zone';

useDisplayTimeZone('Asia/Shanghai');

const state: StatusView = { lastUpdate: 0, monitors: {} };

const heartbeatMonitors: AdminMonitor[] = [
  { id: 'job_a', name: 'Job A', method: 'HEARTBEAT', periodSeconds: 3600, graceSeconds: 60 },
  { id: 'job_b', name: 'Job B', method: 'HEARTBEAT', periodSeconds: 60, graceSeconds: 0 },
];

describe('MonitorList', () => {
  it('renders every card when the page has only heartbeats and no groups', () => {
    renderWithProviders(
      <MonitorList monitors={heartbeatMonitors} state={state} maintenances={[]} />,
    );

    expect(screen.getByText('Job A')).toBeTruthy();
    expect(screen.getByText('Job B')).toBeTruthy();
    expect(screen.queryByText('Scheduled jobs')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter monitors by kind' })).toBeNull();
  });

  it('shows 84 two-hour periods and counts only observed periods in the row label', () => {
    const lastUpdate = Date.parse('2025-01-15T12:30:00Z') / 1000;
    const startedAt = Date.parse('2025-01-15T10:00:00Z') / 1000;
    const outage = Date.parse('2025-01-15T10:30:00Z') / 1000;
    const young: StatusView = {
      lastUpdate,
      monitors: {
        quiet: { status: 'up', startedAt, incidents: [] },
        flaky: {
          status: 'up',
          startedAt,
          incidents: [{ start: [outage], end: outage + 3600, error: ['HTTP 503'] }],
        },
      },
    };
    const monitors: AdminMonitor[] = [
      { id: 'quiet', name: 'Quiet', method: 'GET' },
      { id: 'flaky', name: 'Flaky', method: 'GET' },
    ];

    const { container } = renderWithProviders(
      <MonitorList monitors={monitors} state={young} maintenances={[]} />,
    );
    const strips = container.querySelectorAll('[data-slot="row-bars"]');
    expect(strips).toHaveLength(2);
    for (const strip of strips) expect(strip.children).toHaveLength(84);
    expect(strips[1]?.querySelectorAll('.bg-status-down')).toHaveLength(1);

    expect(
      screen.getByRole('link', {
        name: /^Quiet, .*, no downtime in 2 monitored two-hour periods$/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: /^Flaky, .*, downtime in 1 of 2 monitored two-hour periods$/,
      }),
    ).toBeTruthy();
  });
});
