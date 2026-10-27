// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { HeartbeatStatus, StatusView } from '@flarewatch/shared';
import { OverallStatus } from '@/components/overall-status';
import type { PublicMonitor } from '@/lib/public-view';
import { renderWithProviders } from '../helpers/render';

/** A page whose last `jobs` monitors are heartbeats. */
function page(statuses: Array<HeartbeatStatus | 'slow' | 'expiry'>, jobs: number) {
  const isJob = (i: number) => i >= statuses.length - jobs;
  const monitors: PublicMonitor[] = statuses.map((_, i) => ({
    id: `m${i}`,
    name: `M${i}`,
    method: isJob(i) ? 'HEARTBEAT' : 'GET',
    ...(!isJob(i) && { maxLatencyMs: 500 }),
  }));
  const state: StatusView = {
    lastUpdate: Math.floor(Date.now() / 1000),
    monitors: Object.fromEntries(
      statuses.map((status, i) => [
        `m${i}`,
        status === 'slow'
          ? { status: 'up', incidents: [], latest: { loc: 'FRA', ping: 900, time: 1000 } }
          : status === 'expiry'
            ? { status: 'degraded', incidents: [], warning: 'Certificate expires soon' }
            : {
                status,
                incidents: status === 'down' ? [{ start: [1000], error: ['Error'] }] : [],
                ...(isJob(i) && { heartbeat: { status } }),
              },
      ]),
    ),
  };
  return { monitors, state, maintenances: [] };
}

describe('OverallStatus', () => {
  it.each([
    [
      ['expiry', 'up', 'up'],
      'Some systems have expiry warnings (1 out of 3)',
      '2 up / 1 expiry warning / 0 down',
    ],
    [
      ['expiry', 'slow', 'up'],
      'Some systems are degraded (2 out of 3)',
      '1 up / 1 slow / 1 expiry warning / 0 down',
    ],
    [
      ['expiry', 'up', 'late'],
      'Some systems are degraded (2 out of 3)',
      '1 up / 1 late / 1 expiry warning / 0 down',
    ],
    [
      ['expiry', 'down', 'up'],
      'Some systems are down (1 out of 3)',
      '1 up / 1 expiry warning / 1 down',
    ],
    [
      ['expiry', 'expiry', 'up'],
      'Some systems have expiry warnings (2 out of 3)',
      '1 up / 2 expiry warnings / 0 down',
    ],
  ] as const)('counts expiry warnings apart in %s', (statuses, title, summary) => {
    renderWithProviders(
      <OverallStatus
        {...page([...statuses], statuses.some((status) => status === 'late') ? 1 : 0)}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe(title);
    expect(screen.getByRole('group', { name: 'Monitor status counts' }).textContent).toBe(summary);
  });

  it('counts a monitor with both expiry and latency degradation once', () => {
    const props = page(['expiry', 'up'], 0);
    props.state.monitors.m0!.latest = { loc: 'HEL', ping: 900, time: 1000 };
    renderWithProviders(<OverallStatus {...props} />);
    expect(screen.getByRole('heading').textContent).toBe(
      'Some systems have expiry warnings (1 out of 2)',
    );
    expect(screen.getByRole('group', { name: 'Monitor status counts' }).textContent).toBe(
      '1 up / 1 expiry warning / 0 down',
    );
  });
  it('reports all operational when nothing is down or late', () => {
    renderWithProviders(<OverallStatus {...page(['up', 'up', 'up'], 3)} />);

    expect(screen.getByRole('heading').textContent).toBe('All systems operational');
    expect(screen.getByRole('group', { name: 'Monitor status counts' }).textContent).toBe(
      '3 up / 0 down',
    );
  });

  it('raises the degraded banner for a late heartbeat with nothing down', () => {
    renderWithProviders(<OverallStatus {...page(['up', 'up', 'up', 'up', 'late'], 2)} />);

    expect(screen.getByRole('heading').textContent).toBe('Some jobs are running late (1 out of 2)');
  });

  it('splits late out of the up count and counts every visible monitor', () => {
    renderWithProviders(
      <OverallStatus {...page(['up', 'down', 'pending', 'running', 'late'], 3)} />,
    );

    expect(screen.getByRole('heading').textContent).toBe('Some systems are down (1 out of 5)');
    expect(screen.getByRole('group', { name: 'Monitor status counts' }).textContent).toBe(
      '3 up / 1 late / 1 down',
    );
  });

  it('raises the degraded banner for a slow check with nothing down', () => {
    renderWithProviders(<OverallStatus {...page(['up', 'slow', 'up', 'up', 'up'], 2)} />);

    expect(screen.getByRole('heading').textContent).toBe('Some systems are slow (1 out of 3)');
    expect(screen.getByRole('group', { name: 'Monitor status counts' }).textContent).toBe(
      '4 up / 1 slow / 0 down',
    );
  });

  it('names both kinds when a check is slow and a job is late', () => {
    renderWithProviders(<OverallStatus {...page(['up', 'slow', 'up', 'late'], 2)} />);

    expect(screen.getByRole('heading').textContent).toBe('Some systems are degraded (2 out of 4)');
    expect(screen.getByRole('group', { name: 'Monitor status counts' }).textContent).toBe(
      '2 up / 1 late / 1 slow / 0 down',
    );
  });
});
