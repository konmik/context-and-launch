import { describe, it, expect } from 'vitest';
import {
  parseTicketNumber,
  formatTicketNumber,
  suggestNextTicketNumber,
  extractPrefixFromInput,
} from './ticket-number.js';

describe('parseTicketNumber', () => {
  it('parses ST-0006', () => {
    expect(parseTicketNumber('ST-0006')).toEqual({
      prefix: 'ST',
      num: 6,
      paddingWidth: 4,
    });
  });

  it('parses BUG-0012', () => {
    expect(parseTicketNumber('BUG-0012')).toEqual({
      prefix: 'BUG',
      num: 12,
      paddingWidth: 4,
    });
  });

  it('parses X-1 with padding width 1', () => {
    expect(parseTicketNumber('X-1')).toEqual({
      prefix: 'X',
      num: 1,
      paddingWidth: 1,
    });
  });

  it('parses PROJ-001', () => {
    expect(parseTicketNumber('PROJ-001')).toEqual({
      prefix: 'PROJ',
      num: 1,
      paddingWidth: 3,
    });
  });

  it('returns null for plain number 42', () => {
    expect(parseTicketNumber('42')).toBeNull();
  });

  it('returns null for free text fix-login', () => {
    expect(parseTicketNumber('fix-login')).toBeNull();
  });

  it('returns null for trailing dash ST-', () => {
    expect(parseTicketNumber('ST-')).toBeNull();
  });

  it('returns null for leading dash -0006', () => {
    expect(parseTicketNumber('-0006')).toBeNull();
  });

  it('returns null for lowercase st-0006', () => {
    expect(parseTicketNumber('st-0006')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTicketNumber('')).toBeNull();
  });

  it('returns null for mixed case St-0006', () => {
    expect(parseTicketNumber('St-0006')).toBeNull();
  });

  it('returns null for multiple dashes A-B-1', () => {
    expect(parseTicketNumber('A-B-1')).toBeNull();
  });
});

describe('formatTicketNumber', () => {
  it('formats with zero padding', () => {
    expect(formatTicketNumber('ST', 7, 4)).toBe('ST-0007');
  });

  it('formats with no extra padding needed', () => {
    expect(formatTicketNumber('BUG', 12, 4)).toBe('BUG-0012');
  });

  it('formats with padding width 1', () => {
    expect(formatTicketNumber('X', 5, 1)).toBe('X-5');
  });

  it('overflows past padding width', () => {
    expect(formatTicketNumber('ST', 10000, 4)).toBe('ST-10000');
  });

  it('formats with large padding', () => {
    expect(formatTicketNumber('A', 1, 6)).toBe('A-000001');
  });
});

describe('extractPrefixFromInput', () => {
  it('extracts uppercase prefix from "BUG"', () => {
    expect(extractPrefixFromInput('BUG')).toBe('BUG');
  });

  it('strips trailing dash from "BUG-"', () => {
    expect(extractPrefixFromInput('BUG-')).toBe('BUG');
  });

  it('strips trailing dash and digits from "BUG-7"', () => {
    expect(extractPrefixFromInput('BUG-7')).toBe('BUG');
  });

  it('uppercases lowercase input "bug"', () => {
    expect(extractPrefixFromInput('bug')).toBe('BUG');
  });

  it('uppercases lowercase with digits "bug-0012"', () => {
    expect(extractPrefixFromInput('bug-0012')).toBe('BUG');
  });

  it('returns null for empty string', () => {
    expect(extractPrefixFromInput('')).toBeNull();
  });

  it('returns null for digits-only "123"', () => {
    expect(extractPrefixFromInput('123')).toBeNull();
  });

  it('returns null for leading dash "-BUG"', () => {
    expect(extractPrefixFromInput('-BUG')).toBeNull();
  });

  it('returns null for leading space " BUG"', () => {
    expect(extractPrefixFromInput(' BUG')).toBeNull();
  });
});

describe('suggestNextTicketNumber', () => {
  it('returns null for empty array', () => {
    expect(suggestNextTicketNumber([])).toBeNull();
  });

  it('returns null when all tickets are unparseable', () => {
    expect(
      suggestNextTicketNumber([
        { number: '42' },
        { number: 'fix-login' },
        { number: 'no-format' },
      ])
    ).toBeNull();
  });

  it('suggests next number for single ticket', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0006', createdAt: '2024-01-01T00:00:00Z' },
      ])
    ).toBe('ST-0007');
  });

  it('uses prefix from most recently created ticket', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'BUG-0001', createdAt: '2024-06-01T00:00:00Z' },
      ])
    ).toBe('BUG-0002');
  });

  it('finds highest number across all tickets with chosen prefix', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0005', createdAt: '2024-02-01T00:00:00Z' },
        { number: 'ST-0010', createdAt: '2024-03-01T00:00:00Z' },
      ])
    ).toBe('ST-0011');
  });

  it('handles gaps in numbering', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0010', createdAt: '2024-02-01T00:00:00Z' },
      ])
    ).toBe('ST-0011');
  });

  it('treats missing createdAt as oldest', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'OLD-0001' },
        { number: 'NEW-0001', createdAt: '2024-06-01T00:00:00Z' },
      ])
    ).toBe('NEW-0002');
  });

  it('all tickets missing createdAt still works', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0003' },
        { number: 'ST-0001' },
      ])
    ).toBe('ST-0004');
  });

  it('uses padding width from the highest numbered ticket', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0099', createdAt: '2024-02-01T00:00:00Z' },
      ])
    ).toBe('ST-0100');
  });

  it('ignores unparseable tickets in the mix', () => {
    expect(
      suggestNextTicketNumber([
        { number: '42' },
        { number: 'ST-0003', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'fix-login' },
      ])
    ).toBe('ST-0004');
  });

  it('prefix from most recent, highest from another ticket with same prefix', () => {
    // Most recent is ST-0002 but ST-0010 exists with a higher num
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0010', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0002', createdAt: '2024-06-01T00:00:00Z' },
      ])
    ).toBe('ST-0011');
  });

  it('overflow past padding width produces wider number', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-99', createdAt: '2024-01-01T00:00:00Z' },
      ])
    ).toBe('ST-100');
  });

  it('multiple prefixes, most recent determines prefix, highest num from that prefix', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'BUG-0005', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0001', createdAt: '2024-03-01T00:00:00Z' },
        { number: 'ST-0003', createdAt: '2024-02-01T00:00:00Z' },
        { number: 'BUG-0010', createdAt: '2024-04-01T00:00:00Z' },
      ])
    ).toBe('BUG-0011');
  });

  it('with explicit prefix matching existing tickets returns highest+1', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0005', createdAt: '2024-02-01T00:00:00Z' },
        { number: 'BUG-0001', createdAt: '2024-03-01T00:00:00Z' },
      ], 'ST')
    ).toBe('ST-0006');
  });

  it('with explicit prefix not matching any ticket returns PREFIX-0001', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
      ], 'FEAT')
    ).toBe('FEAT-0001');
  });

  it('with explicit prefix where other-prefix tickets exist but not requested returns PREFIX-0001', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0010', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'BUG-0005', createdAt: '2024-02-01T00:00:00Z' },
      ], 'FEAT')
    ).toBe('FEAT-0001');
  });

  it('with explicit prefix and mixed tickets returns highest+1 across all', () => {
    expect(
      suggestNextTicketNumber([
        { number: 'ST-0001', createdAt: '2024-01-01T00:00:00Z' },
        { number: 'ST-0010', createdAt: '2024-02-01T00:00:00Z' },
        { number: 'BUG-0001', createdAt: '2024-03-01T00:00:00Z' },
      ], 'ST')
    ).toBe('ST-0011');
  });
});
