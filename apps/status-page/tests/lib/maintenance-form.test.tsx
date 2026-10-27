// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vite-plus/test';
import type { Maintenance } from '@flarewatch/shared';
import { useMaintenanceForm, toMaintenancePatch } from '@/lib/hooks/use-maintenance-form';
import { useDisplayTimeZone } from '../helpers/display-time-zone';

useDisplayTimeZone('Asia/Shanghai');

describe('maintenance form time zone', () => {
  it('uses the page time zone for a new repeating window', () => {
    const { result } = renderHook(() => useMaintenanceForm());
    expect(result.current.formData.timeZone).toBe('Asia/Shanghai');
  });

  it.each([undefined, 'America/New_York'])(
    'preserves an existing repeat zone of %s',
    (timeZone) => {
      const maintenance: Maintenance = {
        id: 'backup',
        body: 'Backup maintenance',
        start: '2026-10-27T16:30:00Z',
        repeat: { every: 'week', timeZone },
        createdAt: 0,
        updatedAt: 0,
      };
      const { result } = renderHook(() => useMaintenanceForm(maintenance));
      const form = result.current.formData;
      expect(form.timeZone).toBe(timeZone ?? 'UTC');
      const patch = toMaintenancePatch({ ...form, start: new Date(maintenance.start) });
      expect(patch.start).toBe('2026-10-27T16:30:00.000Z');
      expect(patch.repeat?.timeZone).toBe(timeZone ?? 'UTC');
    },
  );
});
