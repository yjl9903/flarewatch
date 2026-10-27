import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Fetcher, JsonValue, MonitorTarget } from '@flarewatch/shared';
import { GlobalPingChecker } from '../../src/checkers/globalping';
import { finishedMeasurement } from '../helpers/globalping';
import { createMonitor as createHttpMonitor } from '@flarewatch/shared/testing/monitors';
import { freezeClock } from '@flarewatch/shared/testing/clock';

const fetchMock = vi.fn<Fetcher>();
const checker = new GlobalPingChecker(fetchMock);
const check = (monitor: MonitorTarget, token?: string) =>
  checker.check(
    monitor,
    monitor.checkProxy ?? '',
    { deadline: Date.now() + 55_000, subrequests: 10 },
    token,
  );

function createMonitor(overrides: Partial<MonitorTarget> = {}): MonitorTarget {
  return createHttpMonitor({ checkProxy: 'globalping://test-token', ...overrides });
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function mockCompletedMeasurement(measurement: JsonValue): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ id: 'measurement-1' }, 202))
    .mockResolvedValueOnce(jsonResponse(measurement));
}

describe('GlobalPingChecker', () => {
  beforeEach(() => {
    freezeClock(new Date('2025-01-15T12:00:00Z'));
  });

  it('uses the Worker secret and preserves encoded magic intersections', async () => {
    mockCompletedMeasurement(finishedMeasurement());
    const magic = 'CN+AS4134+eyeball-network';
    const monitor = createMonitor({
      checkProxy: `globalping://?${new URLSearchParams({ magic }).toString()}`,
    });

    expect((await check(monitor, 'SecretCaseSensitive')).result.ok).toBe(true);
    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer SecretCaseSensitive' });
    expect(JSON.parse(typeof options?.body === 'string' ? options.body : '')).toMatchObject({
      limit: 1,
      locations: [{ magic }],
    });
    expect(options?.body).not.toContain('SecretCaseSensitive');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toBeUndefined();
  });

  it.each([undefined, '', '   '])(
    'fails without making a request when the secret is %j',
    async (token) => {
      const result = await check(createMonitor({ checkProxy: 'globalping://?magic=SG' }), token);
      expect(result).toEqual({
        location: 'ERROR',
        result: { ok: false, error: 'GlobalPing: GLOBALPING_TOKEN secret is required' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('keeps legacy per-location tokens when a Worker secret is also set', async () => {
    mockCompletedMeasurement(finishedMeasurement());
    await check(createMonitor(), 'OtherAccountSecret');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    });
  });

  it('redacts a credential echoed by the API before logging or recording an error', async () => {
    const errorLog = vi.spyOn(console, 'error');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Rejected SecretToken' } }, 401),
    );
    const result = await check(createMonitor({ checkProxy: 'globalping://' }), 'SecretToken');
    expect(result.result).toMatchObject({ ok: false, error: 'GlobalPing: Rejected [redacted]' });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('SecretToken');
  });

  it('parses proxy settings and builds an HTTP measurement request', async () => {
    mockCompletedMeasurement(finishedMeasurement());

    const result = await check(
      createMonitor({
        method: 'OPTIONS',
        target: 'https://example.com:8443/health?ready=1',
        headers: { 'X-Region': 'eu', 'X-Retry': 2 },
        checkProxy: 'globalping://CaseSensitiveToken?magic=aws-us-east-1&ipVersion=6',
      }),
    );

    expect(result).toEqual({ location: 'FI/Helsinki', result: { ok: true, latency: 13 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.globalping.io/v1/measurements');
    const { body, ...request } = options ?? {};
    expect(request).toEqual({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer CaseSensitiveToken',
      },
      timeout: 5000,
      redirect: 'manual',
    });
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({
      type: 'http',
      limit: 1,
      target: 'example.com',
      locations: [{ magic: 'aws-us-east-1' }],
      measurementOptions: {
        request: {
          method: 'OPTIONS',
          path: '/health',
          query: '?ready=1',
          headers: {
            Host: 'example.com',
            'X-Region': 'eu',
            'X-Retry': '2',
          },
        },
        port: 8443,
        protocol: 'https',
        ipVersion: 6,
      },
    });
  });

  it('builds a TCP_PING measurement request', async () => {
    mockCompletedMeasurement({
      status: 'finished',
      results: [
        {
          probe: { country: 'DE', city: 'Frankfurt' },
          result: { status: 'finished', stats: { avg: 8.7 } },
        },
      ],
    });

    const result = await check(
      createMonitor({
        method: 'TCP_PING',
        target: 'example.com:8443',
        checkProxy: 'globalping://tcp-token?magic=eyeball-network&ipVersion=6',
      }),
    );

    expect(result).toEqual({ location: 'DE/Frankfurt', result: { ok: true, latency: 9 } });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(options?.body as string)).toEqual({
      type: 'ping',
      limit: 1,
      target: 'example.com',
      locations: [{ magic: 'eyeball-network' }],
      measurementOptions: {
        port: 8443,
        packets: 1,
        protocol: 'tcp',
        ipVersion: 6,
      },
    });
  });

  it('polls until the measurement is no longer in progress', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'measurement-1' }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: 'in-progress', results: [] }))
      .mockResolvedValueOnce(jsonResponse(finishedMeasurement()));

    const resultPromise = check(createMonitor());
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ location: 'FI/Helsinki', result: { ok: true, latency: 13 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.globalping.io/v1/measurements/measurement-1',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://api.globalping.io/v1/measurements/measurement-1',
    );
  });

  it('returns a timeout error when polling exceeds the monitor timeout', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'measurement-1' }, 202))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ status: 'in-progress', results: [] })),
      );

    const resultPromise = check(createMonitor({ timeout: 500 }));
    await vi.advanceTimersByTimeAsync(3000);
    const result = await resultPromise;

    expect(result).toEqual({
      location: 'ERROR',
      result: {
        ok: false,
        error: 'GlobalPing: GlobalPing measurement timeout',
        latency: 500,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('checks a JSON value in the body the probe reports', async () => {
    const monitor = createMonitor({ responseJsonPath: '$.status', responseJsonValue: 'ok' });

    mockCompletedMeasurement(finishedMeasurement({ rawBody: '{"status":"ok"}' }));
    expect(await check(monitor)).toEqual({
      location: 'FI/Helsinki',
      result: { ok: true, latency: 13 },
    });

    mockCompletedMeasurement(finishedMeasurement({ rawBody: '{"status":"down"}' }));
    expect(await check(monitor)).toEqual({
      location: 'FI/Helsinki',
      result: { ok: false, error: 'JSON value at $.status is not "ok"', latency: 13 },
    });
  });

  it('reports an empty-body redirect as a status failure rather than an invalid payload', async () => {
    mockCompletedMeasurement(
      finishedMeasurement({
        statusCode: 307,
        rawBody: null,
        tls: { authorized: true, expiresAt: '2025-02-20T12:00:00Z', issuer: { CN: 'Example CA' } },
      }),
    );

    expect(await check(createMonitor({ expectedCodes: [200] }))).toEqual({
      location: 'FI/Helsinki',
      result: { ok: false, error: 'Expected status 200, got 307', latency: 13 },
    });
  });

  it('accepts an HTTP response without a body or TLS certificate when no body assertion is set', async () => {
    mockCompletedMeasurement(finishedMeasurement({ statusCode: 204, rawBody: null, tls: null }));
    expect(await check(createMonitor({ target: 'http://example.com' }))).toEqual({
      location: 'FI/Helsinki',
      result: { ok: true, latency: 13 },
    });
  });

  it('still fails a keyword assertion when the API returns a null body', async () => {
    mockCompletedMeasurement(finishedMeasurement({ rawBody: null, tls: null }));
    expect((await check(createMonitor({ responseKeyword: 'ready' }))).result).toMatchObject({
      ok: false,
      error: 'Required keyword "ready" not found in response',
    });
  });

  it('still rejects a body of the wrong type', async () => {
    mockCompletedMeasurement(finishedMeasurement({ rawBody: { unexpected: true } }));
    expect((await check(createMonitor())).result).toMatchObject({
      ok: false,
      error: 'GlobalPing: invalid measurement payload',
    });
  });

  it('reports a TLS handshake timeout when Globalping returns a null status code', async () => {
    // China Unicom / Wuhan response: no HTTP response arrived before the TLS timeout.
    mockCompletedMeasurement(
      finishedMeasurement(
        {
          status: 'failed',
          failureSource: 'target',
          statusCode: null,
          rawBody: null,
          rawOutput: 'Request timed out during the TLS handshake.',
          timings: { total: 15000, dns: 2, tcp: 305, tls: null, firstByte: null, download: null },
          tls: null,
        },
        { country: 'CN', city: 'Wuhan' },
      ),
    );

    expect((await check(createMonitor())).result).toMatchObject({
      ok: false,
      error: 'GlobalPing: Measurement failed: Request timed out during the TLS handshake.',
    });
  });

  it('does not accept a finished HTTP measurement without a status code', async () => {
    mockCompletedMeasurement(finishedMeasurement({ statusCode: null }));

    expect((await check(createMonitor({ expectedCodes: [200] }))).result).toMatchObject({
      ok: false,
      error: 'Expected status 200, got 0',
    });
  });

  it('still rejects a status code of the wrong type', async () => {
    mockCompletedMeasurement(finishedMeasurement({ statusCode: '200' }));

    expect((await check(createMonitor())).result).toMatchObject({
      ok: false,
      error: 'GlobalPing: invalid measurement payload',
    });
  });

  it('returns TLS certificate information from the API’s flat fields', async () => {
    mockCompletedMeasurement(
      finishedMeasurement({
        tls: {
          authorized: true,
          expiresAt: '2025-02-20T12:00:00Z',
          issuer: { CN: 'Example CA' },
          subject: { CN: 'example.com' },
        },
      }),
    );

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'FI/Helsinki',
      result: {
        ok: true,
        latency: 13,
        ssl: {
          expiryDate: 1740052800,
          daysUntilExpiry: 36,
          issuer: 'Example CA',
          subject: 'example.com',
        },
      },
    });
  });

  it('passes when certificate expiry reaches the configured warning threshold', async () => {
    mockCompletedMeasurement(
      finishedMeasurement({
        tls: {
          authorized: true,
          expiresAt: '2025-01-29T12:00:00Z',
        },
      }),
    );

    const result = await check(
      createMonitor({ sslCheckEnabled: true, sslCheckDaysBeforeExpiry: 14 }),
    );

    expect(result).toEqual({
      location: 'FI/Helsinki',
      result: {
        ok: true,
        ssl: { expiryDate: 1738152000, daysUntilExpiry: 14 },
        latency: 13,
      },
    });
  });

  it.each(['2025-01-15T12:00:00Z', '2025-01-14T12:00:00Z'])(
    'fails an expired certificate at %s',
    async (expiresAt) => {
      mockCompletedMeasurement(finishedMeasurement({ tls: { authorized: true, expiresAt } }));
      expect((await check(createMonitor({ sslCheckEnabled: true }))).result).toMatchObject({
        ok: false,
        error: 'Certificate has expired',
      });
    },
  );

  it('fails a certificate check whose expiry date does not parse, without NaN metadata', async () => {
    mockCompletedMeasurement(
      finishedMeasurement({
        tls: { authorized: true, expiresAt: 'not-a-date' },
      }),
    );

    const result = await check(createMonitor({ sslCheckEnabled: true }));

    expect(result.result).toMatchObject({ ok: false, error: 'Invalid certificate expiry date' });
    expect(JSON.stringify(result)).not.toContain('NaN');
  });

  it('fails a measurement that finishes without a probe result', async () => {
    mockCompletedMeasurement({ status: 'finished', results: [] });

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: { ok: false, error: 'GlobalPing: No probe result returned' },
    });
  });

  it('fails an unauthorized TLS certificate by default', async () => {
    mockCompletedMeasurement(
      finishedMeasurement({
        tls: { authorized: false, error: 'unable to verify the first certificate' },
      }),
    );

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'FI/Helsinki',
      result: {
        ok: false,
        error: 'TLS error: unable to verify the first certificate',
        latency: 13,
      },
    });
  });

  it('ignores an unauthorized self-signed certificate when configured', async () => {
    mockCompletedMeasurement(
      finishedMeasurement({
        tls: { authorized: false, error: 'self signed certificate' },
      }),
    );

    const result = await check(createMonitor({ sslIgnoreSelfSigned: true }));

    expect(result).toEqual({ location: 'FI/Helsinki', result: { ok: true, latency: 13 } });
  });

  it('returns location ERROR when an unexpected request failure is caught', async () => {
    fetchMock.mockRejectedValue(new Error('service unavailable'));

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: { ok: false, error: 'GlobalPing: service unavailable' },
    });
  });
  it('fails the check when the measurement payload does not match the schema', async () => {
    // A probe entry missing `city` must fail schema validation, not render an undefined city.
    mockCompletedMeasurement({
      status: 'finished',
      results: [{ probe: { country: 'FI' }, result: { status: 'finished', statusCode: 200 } }],
    });

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: { ok: false, error: 'GlobalPing: invalid measurement payload' },
    });
  });

  it('stops reading a measurement that never ends instead of buffering it', async () => {
    const chunk = new TextEncoder().encode(' '.repeat(64 * 1024));
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(chunk),
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'measurement-1' }, 202))
      .mockResolvedValueOnce(new Response(endless));

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: { ok: false, error: 'GlobalPing: response is over 1048576 bytes' },
    });
  });

  it('fails the check when measurement creation returns no id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ notAnId: true }, 202));

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: {
        ok: false,
        error: 'GlobalPing: invalid measurement creation response',
      },
    });
  });

  it('uses the API error message on rejection', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Invalid token' } }, 401));

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: { ok: false, error: 'GlobalPing: Invalid token' },
    });
  });

  it('falls back to the status code when the error payload is malformed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('nope', 429));

    const result = await check(createMonitor());

    expect(result).toEqual({
      location: 'ERROR',
      result: { ok: false, error: 'GlobalPing: API error: 429' },
    });
  });
});
