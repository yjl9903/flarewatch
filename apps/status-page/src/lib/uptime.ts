import type { LatencySample, StatusView } from '@flarewatch/shared';
import { formatDisplay, startOfDisplayDay, toDisplayDate } from './date';
import { STATUS_BAR, TIME_MS, UPTIME_DAYS, UPTIME_THRESHOLDS } from './constants';

const MIN_MONITOR_AGE_SECONDS = 60;

/** state.lastUpdate, not Date.now(), so SSR and hydration agree; null before the first check run. */
function getNowSeconds(state: StatusView): number | null {
  return state.lastUpdate > 0 ? state.lastUpdate : null;
}

function hasMonitorData(monitorId: string, state: StatusView): boolean {
  const nowSec = getNowSeconds(state);
  if (nowSec === null) return false;
  const startedAt = state.monitors[monitorId]?.startedAt;
  if (!startedAt) return false;
  return nowSec - startedAt >= MIN_MONITOR_AGE_SECONDS;
}

export function calculateUptimePercent(monitorId: string, state: StatusView): number | null {
  const nowSec = getNowSeconds(state);
  if (nowSec === null) return null;
  if (!hasMonitorData(monitorId, state)) return null;

  const incidents = state.monitors[monitorId]?.incidents;
  if (!incidents || incidents.length === 0) return 100;
  const windowDaysAgoSec = nowSec - UPTIME_DAYS * 24 * 60 * 60;

  const monitorStartSec = state.monitors[monitorId]?.startedAt;
  const windowStartSec =
    monitorStartSec && monitorStartSec > windowDaysAgoSec ? monitorStartSec : windowDaysAgoSec;

  const totalTimeSec = nowSec - windowStartSec;
  if (totalTimeSec <= 0) return 100;

  let totalDowntimeSec = 0;

  for (const incident of incidents) {
    const firstStart = incident.start[0];
    if (firstStart === undefined) continue;
    const incidentStartSec = Math.max(firstStart, windowStartSec);
    const incidentEndSec = Math.min(incident.end ?? nowSec, nowSec);

    if (incidentEndSec > incidentStartSec) {
      totalDowntimeSec += incidentEndSec - incidentStartSec;
    }
  }

  const uptimePercent = ((totalTimeSec - totalDowntimeSec) / totalTimeSec) * 100;

  return Math.max(0, Math.min(100, uptimePercent));
}

export function getMonitorError(monitorId: string, state: StatusView): string | null {
  const incidents = state.monitors[monitorId]?.incidents;
  const lastIncident = incidents?.[incidents.length - 1];
  if (!lastIncident || lastIncident.end !== undefined) return null;
  return lastIncident.error[lastIncident.error.length - 1] ?? 'Unknown error';
}

export function getLatestLatency(monitorId: string, state: StatusView): LatencySample | null {
  return state.monitors[monitorId]?.latest ?? null;
}

/** Rounds like `toFixed`, but uptime below 100 never shows as 100%. */
export function formatPercent(percent: number, decimals: number): string {
  const rounded = percent.toFixed(decimals);
  if (percent < 100 && Number(rounded) >= 100) {
    return `${(100 - 10 ** -decimals).toFixed(decimals)}%`;
  }
  return `${rounded}%`;
}

export function formatUptimeDisplay(
  uptimePercent: number | null,
  hasStarted: boolean,
  decimals: number,
): string {
  if (uptimePercent !== null) {
    return formatPercent(uptimePercent, decimals);
  }
  return hasStarted ? 'Starting...' : 'Pending';
}

type DayStatus = 'up' | 'down' | 'partial' | 'unknown';

interface DayIncidentDetail {
  startSec: number;
  startTime: string;
  endTime: string;
  error: string;
}

export interface AggregatedDayIncident extends DayIncidentDetail {
  monitorName: string;
  monitorId: string;
}

export interface AggregatedDayData {
  date: Date;
  status: DayStatus;
  uptime: number | null;
  incidents: AggregatedDayIncident[];
}

export interface DailyStatusData {
  date: Date;
  status: DayStatus;
  uptime: number;
  downtime: number;
  incidents: DayIncidentDetail[];
}

function createUnknownDay(date: Date): DailyStatusData {
  return { date, status: 'unknown', uptime: 100, downtime: 0, incidents: [] };
}

/** Calculate downtime only within the part of a period the monitor has observed. */
function generatePeriodStatus(
  monitorId: string,
  state: StatusView,
  date: Date,
  endDate: Date,
): DailyStatusData {
  const nowSec = getNowSeconds(state);
  if (nowSec === null || !hasMonitorData(monitorId, state)) return createUnknownDay(date);

  const incidents = state.monitors[monitorId]?.incidents ?? [];
  const monitorStartSec = state.monitors[monitorId]?.startedAt;
  const periodStartSec = Math.floor(date.getTime() / 1000);
  const periodEndSec = Math.floor(endDate.getTime() / 1000);
  if (monitorStartSec && periodEndSec <= monitorStartSec) return createUnknownDay(date);

  const effectivePeriodStartSec = monitorStartSec
    ? Math.max(periodStartSec, monitorStartSec)
    : periodStartSec;
  const effectivePeriodEndSec = Math.min(periodEndSec, nowSec);
  const effectivePeriodStartMs = effectivePeriodStartSec * 1000;
  const effectivePeriodEndMs = effectivePeriodEndSec * 1000;

  let downtime = 0;
  const periodIncidents: DayIncidentDetail[] = [];

  for (const incident of incidents) {
    const incidentStart = incident.start[0];
    if (incidentStart === undefined) continue;
    const incidentEnd = incident.end ?? nowSec;

    if (incidentEnd > effectivePeriodStartSec && incidentStart < effectivePeriodEndSec) {
      const overlapStart = Math.max(incidentStart, effectivePeriodStartSec);
      const overlapEnd = Math.min(incidentEnd, effectivePeriodEndSec);
      downtime += (overlapEnd - overlapStart) * 1000;

      for (let j = 0; j < incident.error.length; j++) {
        const partStart = incident.start[j];
        if (partStart === undefined) continue;
        const nextStart = incident.start[j + 1];
        const partEnd =
          j === incident.error.length - 1 ? (incident.end ?? nowSec) : (nextStart ?? nowSec);

        if (partEnd > effectivePeriodStartSec && partStart < effectivePeriodEndSec) {
          const clampedStart = Math.max(partStart, effectivePeriodStartSec);
          const clampedEnd = Math.min(partEnd, effectivePeriodEndSec);
          const errorMsg = incident.error[j];

          periodIncidents.push({
            startSec: partStart,
            startTime: formatDisplay(new Date(clampedStart * 1000), 'HH:mm'),
            endTime: formatDisplay(new Date(clampedEnd * 1000), 'HH:mm'),
            error: errorMsg ?? 'Unknown error',
          });
        }
      }
    }
  }

  const duration = effectivePeriodEndMs - effectivePeriodStartMs;
  const uptimePercent = duration > 0 ? ((duration - downtime) / duration) * 100 : 100;

  let status: DayStatus;
  if (effectivePeriodEndSec <= effectivePeriodStartSec) {
    status = 'unknown';
  } else if (uptimePercent >= UPTIME_THRESHOLDS.EXCELLENT) {
    status = 'up';
  } else if (uptimePercent >= UPTIME_THRESHOLDS.GOOD) {
    status = 'partial';
  } else {
    status = 'down';
  }

  return { date, status, uptime: uptimePercent, downtime, incidents: periodIncidents };
}

export function generateDailyStatus(monitorId: string, state: StatusView): DailyStatusData[] {
  const now = new Date((getNowSeconds(state) ?? 0) * 1000);
  return Array.from({ length: UPTIME_DAYS }, (_, index) => {
    const date = startOfDisplayDay(now, index - UPTIME_DAYS + 1);
    return generatePeriodStatus(monitorId, state, date, startOfDisplayDay(date, 1));
  });
}

export interface StatusPeriodData extends DailyStatusData {
  endDate: Date;
}

/** 84 clock-aligned periods in the page zone, including the current partial period. */
export function generateRecentStatus(monitorId: string, state: StatusView): StatusPeriodData[] {
  const now = toDisplayDate(new Date((getNowSeconds(state) ?? 0) * 1000));
  const hours = STATUS_BAR.HOURS_PER_SEGMENT;
  const currentHour = Math.floor(now.getHours() / hours) * hours;
  const count = (STATUS_BAR.DAYS * TIME_MS.DAY) / (hours * TIME_MS.HOUR);
  return Array.from({ length: count }, (_, index) => {
    const clockHour = currentHour - (count - index - 1) * hours;
    const day = startOfDisplayDay(now, Math.floor(clockHour / 24));
    const hour = ((clockHour % 24) + 24) % 24;
    const start = toDisplayDate(day);
    const end = toDisplayDate(day);
    start.setHours(hour, 0, 0, 0);
    end.setHours(hour + hours, 0, 0, 0);
    const date = new Date(start.getTime());
    const endDate = new Date(end.getTime());
    return { ...generatePeriodStatus(monitorId, state, date, endDate), endDate };
  });
}

export function generateAggregateDailyStatus(
  monitorIds: string[],
  monitorNameMap: Map<string, string>,
  state: StatusView,
): AggregatedDayData[] {
  if (monitorIds.length === 0) {
    return [];
  }

  const allMonitorDays = monitorIds.map((id) => generateDailyStatus(id, state));
  const dayCount = allMonitorDays[0]?.length ?? 0;
  const result: AggregatedDayData[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const date = allMonitorDays[0]![dayIndex]!.date;

    let hasDown = false;
    let hasPartial = false;
    let allUnknown = true;
    let uptimeSum = 0;
    let uptimeCount = 0;
    const incidents: AggregatedDayIncident[] = [];

    for (let m = 0; m < monitorIds.length; m++) {
      const dayData = allMonitorDays[m]![dayIndex]!;
      const monitorId = monitorIds[m]!;
      const monitorName = monitorNameMap.get(monitorId) ?? monitorId;

      if (dayData.status !== 'unknown') {
        allUnknown = false;
        uptimeSum += dayData.uptime;
        uptimeCount++;
      }

      if (dayData.status === 'down') hasDown = true;
      if (dayData.status === 'partial') hasPartial = true;

      for (const incident of dayData.incidents) {
        incidents.push({ ...incident, monitorName, monitorId });
      }
    }

    let status: DayStatus;
    if (allUnknown) {
      status = 'unknown';
    } else if (hasDown) {
      status = 'down';
    } else if (hasPartial) {
      status = 'partial';
    } else {
      status = 'up';
    }

    result.push({
      date,
      status,
      uptime: uptimeCount > 0 ? uptimeSum / uptimeCount : null,
      incidents,
    });
  }

  return result;
}
