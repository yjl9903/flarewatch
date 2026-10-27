import { formatDisplayShort } from '@/lib/date';
import { IconCircleCheck, IconAlertTriangle, IconCircleX, IconRefresh } from '@tabler/icons-react';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Maintenance, type StatusView } from '@flarewatch/shared';
import { countStatuses, getOverallStatus } from '@/lib/monitor-state';
import type { PublicMonitor } from '@/lib/public-view';
import { useAutoRefresh } from '@/lib/hooks/use-auto-refresh';
import { cn } from '@/lib/utils';

interface OverallStatusProps {
  monitors: PublicMonitor[];
  state: StatusView;
  maintenances: Maintenance[];
}

const statusConfig = {
  operational: {
    icon: IconCircleCheck,
    title: 'All systems operational',
    bgClass: 'bg-status-operational-bg',
    iconClass: 'text-status-operational-text',
  },
  degraded: {
    icon: IconAlertTriangle,
    title: 'Some systems are down',
    bgClass: 'bg-status-degraded-bg',
    iconClass: 'text-status-degraded-text',
  },
  down: {
    icon: IconCircleX,
    title: 'All systems down',
    bgClass: 'bg-status-down-bg',
    iconClass: 'text-status-down-text',
  },
};

export function OverallStatus({ monitors, state, maintenances }: OverallStatusProps) {
  const counts = countStatuses(monitors, state, maintenances);
  const { up, late, slow, expiry, down } = counts;
  const monitorCount = monitors.length;
  const jobCount = monitors.filter((monitor) => monitor.method === 'HEARTBEAT').length;
  const status = getOverallStatus(counts);
  const { currentTime, isStale, willRefreshSoon, refreshCountdown } = useAutoRefresh({
    lastUpdate: state.lastUpdate,
  });

  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const isInitialState = state.lastUpdate === 0;
  const secondsAgo = currentTime - state.lastUpdate;

  function getStatusTitle(): [title: string, count?: string] {
    if (status !== 'degraded') return [config.title];

    if (down === 0) {
      if (expiry > 0) {
        if (late + slow === 0)
          return [
            'Some systems have expiry warnings',
            `(${expiry} out of ${monitorCount - jobCount})`,
          ];
        return ['Some systems are degraded', `(${late + slow + expiry} out of ${monitorCount})`];
      }
      if (slow === 0) return ['Some jobs are running late', `(${late} out of ${jobCount})`];
      if (late === 0) {
        return ['Some systems are slow', `(${slow} out of ${monitorCount - jobCount})`];
      }
      return ['Some systems are degraded', `(${late + slow} out of ${monitorCount})`];
    }
    return ['Some systems are down', `(${down} out of ${monitorCount})`];
  }

  const [title, count] = getStatusTitle();

  function getRefreshMessage(): string {
    if (refreshCountdown !== null && refreshCountdown > 0) {
      return `Refreshing in ${refreshCountdown}s`;
    }
    if (willRefreshSoon) {
      return 'Refreshing...';
    }
    return 'Data is stale';
  }

  return (
    <Card size="flush" variant={status}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 px-3 py-2.5">
        <div
          className={cn(
            'flex h-6 w-9 items-center justify-center self-start rounded-full sm:h-7',
            config.bgClass,
          )}
        >
          <StatusIcon className={cn('h-6 w-6', config.iconClass)} />
        </div>

        <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
          <h2 className="text-base sm:text-lg font-semibold text-balance text-foreground">
            {title}
            {Boolean(count) && (
              <span className="whitespace-nowrap font-normal text-muted-foreground"> {count}</span>
            )}
          </h2>
          <p
            role="group"
            aria-label="Monitor status counts"
            className="text-xs font-medium tabular-nums text-muted-foreground"
          >
            <span className={up > 0 ? 'text-status-operational-text' : 'text-muted-foreground'}>
              {up} up
            </span>
            {late > 0 && (
              <>
                {' / '}
                <span className="text-status-degraded-text">{late} late</span>
              </>
            )}
            {slow > 0 && (
              <>
                {' / '}
                <span className="text-status-degraded-text">{slow} slow</span>
              </>
            )}
            {expiry > 0 && (
              <>
                {' / '}
                <span className="text-status-degraded-text">
                  {expiry} expiry warning{expiry === 1 ? '' : 's'}
                </span>
              </>
            )}
            {' / '}
            <span className={down > 0 ? 'text-status-down-text' : 'text-muted-foreground'}>
              {down} down
            </span>
          </p>
        </div>

        <div className="col-start-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <p className="text-xs text-muted-foreground">
            {isInitialState
              ? 'Running first check...'
              : `Last updated ${formatDisplayShort(state.lastUpdate)} (${secondsAgo}s ago)`}
          </p>

          {!isInitialState && isStale && (
            <Tooltip>
              <TooltipTrigger
                className={cn(
                  'flex cursor-help items-center gap-1.5 text-xs text-status-degraded-text',
                  !willRefreshSoon && 'animate-pulse',
                )}
              >
                <IconRefresh className={cn('h-3.5 w-3.5', willRefreshSoon && 'animate-spin')} />
                <span>{getRefreshMessage()}</span>
              </TooltipTrigger>
              <TooltipContent>
                Page will auto-refresh when data is more than 5 minutes old
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </Card>
  );
}
