import { beforeEach, afterEach } from 'vite-plus/test';
import { pageConfig } from '@flarewatch/config';

/** Use a real page configuration independently of the operator's local settings. */
export function useDisplayTimeZone(timeZone: string) {
  const original = pageConfig.timeZone;
  beforeEach(() => {
    pageConfig.timeZone = timeZone;
  });
  afterEach(() => {
    pageConfig.timeZone = original;
  });
}
