import { formatDisplayShort } from '@/lib/date';

interface DateRangeProps {
  start: Date;
  end: Date | null;
  noEndLabel: string;
  noEndClassName?: string;
}

export function DateRange({ start, end, noEndLabel, noEndClassName }: DateRangeProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span>
        <strong>From</strong> {formatDisplayShort(start.getTime() / 1000)}
      </span>
      {end ? (
        <span>
          <strong>To</strong> {formatDisplayShort(end.getTime() / 1000)}
        </span>
      ) : (
        <span className={noEndClassName}>{noEndLabel}</span>
      )}
    </div>
  );
}
