import { beforeEach, afterEach } from 'vite-plus/test';
import { pageZone } from '@/lib/page-zone';

/** Use a fixed page zone independently of the deployed configuration. */
export function useDisplayTimeZone(timeZone: string) {
  const original = pageZone.timezone;
  beforeEach(() => {
    pageZone.timezone = timeZone;
  });
  afterEach(() => {
    pageZone.timezone = original;
  });
}
