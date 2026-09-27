import { describe, it, expect } from 'vitest';
import { mapDataToConfig } from '@/lib/config';
import baseConfig from '@/config/config.json';

const impactRow = {
  id: 1,
  key: 'verification.impact',
  value: 'impact-verification-uuid',
  createdAt: '',
};

const affiliateTemplateRow = {
  id: 2,
  key: 'affiliate.redbubbleTemplate',
  value: 'https://shop.pxf.io/c/1/2/3?u={url}',
  createdAt: '',
};

describe('mapDataToConfig', () => {
  it('expands dot-notation studio keys into nested config values', () => {
    const config = mapDataToConfig([impactRow]);
    expect(config.verification.impact).toBe('impact-verification-uuid');
  });

  it('expands affiliate dot-notation keys into the affiliate block', () => {
    const config = mapDataToConfig([affiliateTemplateRow]);
    expect(config.affiliate.redbubbleTemplate).toBe(
      'https://shop.pxf.io/c/1/2/3?u={url}',
    );
  });

  it('does not leak overrides into the base config defaults', () => {
    mapDataToConfig([impactRow]);
    expect(baseConfig.verification.impact).toBe('');
    expect(baseConfig.affiliate.redbubbleTemplate).toBe('');
  });
});
