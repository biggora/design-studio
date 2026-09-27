import { describe, it, expect } from 'vitest';
import { mapDataToConfig } from '@/lib/config';
import baseConfig from '@/config/config.json';

const impactRow = {
  id: 1,
  key: 'verification.impact',
  value: 'impact-verification-uuid',
  createdAt: '',
};

describe('mapDataToConfig', () => {
  it('expands dot-notation studio keys into nested config values', () => {
    const config = mapDataToConfig([impactRow]);
    expect(config.verification.impact).toBe('impact-verification-uuid');
  });

  it('does not leak overrides into the base config defaults', () => {
    mapDataToConfig([impactRow]);
    expect(baseConfig.verification.impact).toBe('');
  });
});
