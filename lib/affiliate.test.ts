import { describe, it, expect } from 'vitest';
import {
  applyRedbubbleAffiliate,
  applyTeepublicReferral,
  getAffiliateOptions,
} from '@/lib/affiliate';

describe('applyRedbubbleAffiliate', () => {
  const dest = 'https://www.redbubble.com/shop/ap/12345';

  it('returns the destination unchanged when the template is empty', () => {
    expect(applyRedbubbleAffiliate(dest, '')).toBe(dest);
  });

  it('returns the destination unchanged when the template is not a URL', () => {
    expect(applyRedbubbleAffiliate(dest, 'not a url')).toBe(dest);
    expect(applyRedbubbleAffiliate(dest, 'javascript:alert(1)')).toBe(dest);
  });

  it('returns the destination unchanged when the template lacks the {url} placeholder', () => {
    expect(
      applyRedbubbleAffiliate(dest, 'https://shop.pxf.io/c/1/2/3'),
    ).toBe(dest);
  });

  it('wraps the destination with a URL-encoded copy in the {url} placeholder', () => {
    expect(
      applyRedbubbleAffiliate(dest, 'https://shop.pxf.io/c/1/2/3?u={url}'),
    ).toBe(
      `https://shop.pxf.io/c/1/2/3?u=${encodeURIComponent(dest)}`,
    );
  });

  it('encodes query characters in the destination', () => {
    expect(
      applyRedbubbleAffiliate(
        'https://www.redbubble.com/shop?p=x&y=1',
        'https://shop.pxf.io/c/1/2/3?u={url}',
      ),
    ).toBe(
      'https://shop.pxf.io/c/1/2/3?u=https%3A%2F%2Fwww.redbubble.com%2Fshop%3Fp%3Dx%26y%3D1',
    );
  });

  it('returns the destination unchanged when it is empty', () => {
    expect(applyRedbubbleAffiliate('', 'https://shop.pxf.io/c/1/2/3?u={url}')).toBe('');
  });
});

describe('applyTeepublicReferral', () => {
  it('returns the link unchanged when the referral id is empty', () => {
    expect(applyTeepublicReferral('https://www.teepublic.com/t-shirt/1', '')).toBe(
      'https://www.teepublic.com/t-shirt/1',
    );
  });

  it('returns null through when the link is missing', () => {
    expect(applyTeepublicReferral(null, '1234')).toBe(null);
  });

  it('appends ref_id to a link without a query string', () => {
    expect(
      applyTeepublicReferral('https://www.teepublic.com/t-shirt/1', '1234'),
    ).toBe('https://www.teepublic.com/t-shirt/1?ref_id=1234');
  });

  it('preserves existing query params and replaces an existing ref_id', () => {
    expect(
      applyTeepublicReferral(
        'https://www.teepublic.com/t-shirt/1?color=black',
        '1234',
      ),
    ).toBe('https://www.teepublic.com/t-shirt/1?color=black&ref_id=1234');
    expect(
      applyTeepublicReferral(
        'https://www.teepublic.com/t-shirt/1?ref_id=old&color=black',
        '1234',
      ),
    ).toBe('https://www.teepublic.com/t-shirt/1?ref_id=1234&color=black');
  });

  it('returns an invalid link unchanged', () => {
    expect(applyTeepublicReferral('not a url', '1234')).toBe('not a url');
  });
});

describe('getAffiliateOptions', () => {
  it('reads the affiliate slice and falls back to empty strings', () => {
    expect(getAffiliateOptions({})).toEqual({
      redbubbleTemplate: '',
      teepublicReferralId: '',
    });
    expect(
      getAffiliateOptions({
        affiliate: {
          redbubbleTemplate: 'https://shop.pxf.io/c/1/2/3?u={url}',
          teepublicReferralId: '1234',
        },
      }),
    ).toEqual({
      redbubbleTemplate: 'https://shop.pxf.io/c/1/2/3?u={url}',
      teepublicReferralId: '1234',
    });
  });
});
