import { useState } from 'react';
import { Tooltip, TooltipContent } from '@/components/ui/tooltip';
import { BarCell } from '@/components/ui/status-cell';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconX } from '@tabler/icons-react';
import type { StatusView } from '@flarewatch/shared';
import { formatPercent, generateRecentStatus, type StatusPeriodData } from '@/lib/uptime';
import { formatDisplay, formatDuration } from '@/lib/date';
import { cn } from '@/lib/utils';
import { useContainerWidth } from '@/lib/hooks/use-container-width';
import { STATUS_BAR } from '@/lib/constants';

interface StatusBarSegmentProps {
  period: StatusPeriodData;
  isMobile: boolean;
  onClick: (period: StatusPeriodData) => void;
}

function periodLabel(period: StatusPeriodData): string {
  const endTime = formatDisplay(period.endDate, 'HH:mm');
  return `${formatDisplay(period.date, 'MMM d, yyyy HH:mm')} – ${endTime === '00:00' ? '24:00' : endTime}`;
}

function StatusBarSegment({ period, isMobile, onClick }: StatusBarSegmentProps) {
  return (
    <Tooltip>
      <BarCell
        aria-label={
          period.status === 'unknown'
            ? `No data for ${periodLabel(period)}`
            : `${formatPercent(period.uptime, 2)} uptime from ${periodLabel(period)}`
        }
        status={period.status}
        interactive={period.downtime > 0}
        className={cn('h-6', isMobile ? 'w-2.5 shrink-0' : 'min-w-0 flex-1')}
        onClick={() => onClick(period)}
      />
      <TooltipContent side="top">
        <div className="font-medium">
          {period.status === 'unknown'
            ? 'No data'
            : `${formatPercent(period.uptime, 2)} from ${periodLabel(period)}`}
        </div>
        {period.downtime > 0 && (
          <div className="text-muted-foreground">
            {`Down for ${formatDuration(period.downtime)} (click for detail)`}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

interface StatusBarProps {
  monitorId: string;
  monitorName?: string;
  state: StatusView;
}

export function StatusBar({ monitorId, monitorName, state }: StatusBarProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<StatusPeriodData | null>(null);
  const periods = generateRecentStatus(monitorId, state);

  const { ref, width, isReady } = useContainerWidth();

  const mobileBarCount = isReady
    ? Math.min(Math.floor(width / STATUS_BAR.MOBILE_BAR_WIDTH), periods.length)
    : 0;

  const mobileBars = mobileBarCount > 0 ? periods.slice(-mobileBarCount) : [];

  function handlePeriodClick(period: StatusPeriodData) {
    if (period.downtime > 0 && period.incidents.length > 0) {
      setSelectedPeriod(period);
    }
  }

  return (
    <>
      <div className="hidden sm:flex items-center gap-0.5 overflow-hidden rounded">
        {periods.map((period) => (
          <StatusBarSegment
            key={period.date.toISOString()}
            period={period}
            isMobile={false}
            onClick={handlePeriodClick}
          />
        ))}
      </div>

      <div ref={ref} className="flex sm:hidden items-center gap-0.5 overflow-hidden rounded">
        {mobileBars.map((period) => (
          <StatusBarSegment
            key={period.date.toISOString()}
            period={period}
            isMobile={true}
            onClick={handlePeriodClick}
          />
        ))}
      </div>

      <Dialog open={!!selectedPeriod} onOpenChange={(open) => !open && setSelectedPeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {selectedPeriod &&
                  `${monitorName || monitorId} incidents from ${periodLabel(selectedPeriod)}`}
              </DialogTitle>
              <DialogClose
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Close">
                    <IconX className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </DialogHeader>

          <div className="space-y-2">
            {selectedPeriod?.incidents.map((incident) => (
              <div
                key={`${incident.startTime}-${incident.endTime}`}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="font-mono text-xs text-muted-foreground mb-1">
                  [{incident.startTime} - {incident.endTime}]
                </div>
                <div className="text-foreground">{incident.error}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
