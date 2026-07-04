export function parseTicketNumber(
  raw: string
): { prefix: string; num: number; paddingWidth: number } | null {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^([A-Z]+)-(\d+)$/);
  if (!match) return null;
  const prefix = match[1];
  const digits = match[2];
  return { prefix, num: parseInt(digits, 10), paddingWidth: digits.length };
}

export function formatTicketNumber(
  prefix: string,
  num: number,
  paddingWidth: number
): string {
  return `${prefix}-${String(num).padStart(paddingWidth, '0')}`;
}

export function extractPrefixFromInput(raw: string): string | null {
  const match = raw.match(/^[A-Za-z]+/);
  if (!match) return null;
  return match[0].toUpperCase();
}

function nextNumberForPrefix(
  parsed: Array<{ prefix: string; num: number; paddingWidth: number }>,
  prefix: string,
): string {
  const samePrefix = parsed.filter((p) => p.prefix === prefix);
  if (samePrefix.length === 0) return formatTicketNumber(prefix, 1, 4);
  let highest = samePrefix[0];
  for (const p of samePrefix) {
    if (p.num > highest.num) highest = p;
  }
  return formatTicketNumber(prefix, highest.num + 1, highest.paddingWidth);
}

export function suggestNextTicketNumber(
  tickets: Array<{ number: string; createdAt?: string }>,
  prefix?: string | null,
): string | null {
  const parsed = tickets
    .map((t) => {
      const p = parseTicketNumber(t.number);
      return p ? { ...p, createdAt: t.createdAt } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p != null);

  if (prefix != null) return nextNumberForPrefix(parsed, prefix);

  if (parsed.length === 0) return null;

  parsed.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return -1;
    if (!b.createdAt) return 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
  const mostRecent = parsed[parsed.length - 1];

  return nextNumberForPrefix(parsed, mostRecent.prefix);
}
