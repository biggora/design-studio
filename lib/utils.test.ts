import { describe, it, expect } from 'vitest';
import { 
  formatDate,
  truncateText,
  generateSlug,
  calculateReadingTime,
  getRedBubbleDesignPageLink,
} from './utils';

// formatDate

describe('formatDate', () => {
  it('formats Date objects correctly', () => {
    const date = new Date('2021-01-01T00:00:00Z');
    expect(formatDate(date)).toBe('January 1, 2021');
  });

  it('formats date strings correctly', () => {
    expect(formatDate('2021-12-25T00:00:00Z')).toBe('December 25, 2021');
  });

  it('throws for invalid date strings', () => {
    expect(() => formatDate('not-a-date')).toThrow();
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
});

// generateSlug

describe('generateSlug', () => {
  it('converts text to lowercase hyphen-separated slug', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('removes punctuation', () => {
    expect(generateSlug('Hello, World!!!')).toBe('hello-world');
  });

  it('handles multiple spaces', () => {
    expect(generateSlug(' multiple   spaces ')).toBe('-multiple-spaces-');
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
