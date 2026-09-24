import { describe, it, expect } from 'vitest';
import { 
  formatDate,
  truncateText,
  generateSlug,
  calculateReadingTime,
  getRedBubbleDesignPageLink,
  sanitizeUrl,
  parsePageParam,
} from '@/lib/utils';

// formatDate

describe('formatDate', () => {
  it('formats Date objects correctly', () => {
    const date = new Date('2021-01-01T00:00:00Z');
    expect(formatDate(date)).toBe('January 1, 2021');
  });

  it('formats date strings correctly', () => {
    expect(formatDate('2021-12-25T00:00:00Z')).toBe('December 25, 2021');
  });

  it('returns "Date unavailable" for invalid date strings', () => {
    expect(formatDate('not-a-date')).toBe('Date unavailable');
  });

  it('returns "Date unavailable" for null or undefined', () => {
    expect(formatDate(null)).toBe('Date unavailable');
    expect(formatDate(undefined)).toBe('Date unavailable');
  });
});

// truncateText

describe('truncateText', () => {
  it('returns original text when below max length', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates long text and adds ellipsis', () => {
    expect(truncateText('hello world', 5)).toBe('hello...');
  });

  it('returns empty string for null or undefined', () => {
    expect(truncateText(null, 10)).toBe('');
    expect(truncateText(undefined, 10)).toBe('');
  });
});

// generateSlug

describe('generateSlug', () => {
  it('converts text to lowercase hyphen-separated slug', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('removes punctuation', () => {
    expect(generateSlug('Hello, World!!!')).toBe('hello-world');
  });

  it('handles multiple spaces without leading or trailing hyphens', () => {
    expect(generateSlug(' multiple   spaces ')).toBe('multiple-spaces');
  });

  it('normalizes unicode characters', () => {
    expect(generateSlug('Café & Restaurant')).toBe('cafe-restaurant');
  });
});

// calculateReadingTime

describe('calculateReadingTime', () => {
  it('returns 1 for empty string', () => {
    expect(calculateReadingTime('')).toBe(1);
  });

  it('rounds up partial minutes', () => {
    const text = Array(201).fill('word').join(' ');
    expect(calculateReadingTime(text)).toBe(2);
  });

  it('calculates single minute for 200 words', () => {
    const text = Array(200).fill('word').join(' ');
    expect(calculateReadingTime(text)).toBe(1);
  });
});

// getRedBubbleDesignPageLink

describe('getRedBubbleDesignPageLink', () => {
  it('generates a proper design page URL', () => {
    expect(getRedBubbleDesignPageLink(123)).toBe('https://www.redbubble.com/shop/ap/123');
  });
});

// sanitizeUrl

describe('sanitizeUrl', () => {
  it('returns valid http/https URLs unchanged', () => {
    expect(sanitizeUrl('https://example.com/test')).toBe('https://example.com/test');
    expect(sanitizeUrl('http://example.com/')).toBe('http://example.com/');
    expect(sanitizeUrl('  https://example.com/path  ')).toBe('https://example.com/path');
  });

  it('returns "#" for javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
    expect(sanitizeUrl('javascript:void(0)')).toBe('#');
  });

  it('returns "#" for empty, null, undefined, or invalid strings', () => {
    expect(sanitizeUrl('')).toBe('#');
    expect(sanitizeUrl('   ')).toBe('#');
    expect(sanitizeUrl(null)).toBe('#');
    expect(sanitizeUrl(undefined)).toBe('#');
    expect(sanitizeUrl('not-a-valid-url')).toBe('#');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('#');
  });
});

// parsePageParam

describe('parsePageParam', () => {
  it('returns 1 when undefined', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it('returns 1 for empty string', () => {
    expect(parsePageParam('')).toBe(1);
  });

  it('parses a valid digit string', () => {
    expect(parsePageParam('3')).toBe(3);
  });

  it('returns 1 for "0"', () => {
    expect(parsePageParam('0')).toBe(1);
  });

  it('returns 1 for negative numbers', () => {
    expect(parsePageParam('-2')).toBe(1);
  });

  it('returns 1 for decimal values', () => {
    expect(parsePageParam('1.5')).toBe(1);
  });

  it('returns 1 for non-numeric strings', () => {
    expect(parsePageParam('abc')).toBe(1);
  });

  it('parses zero-padded digit strings', () => {
    expect(parsePageParam('007')).toBe(7);
  });
});
