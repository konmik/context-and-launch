import { describe, it, expect } from 'vitest';
import {
  buildLookup,
  effectiveParent,
  resolveScope,
  isGroup,
  representativeInScope,
  internalDependencies,
  externalDependencies,
  computeDepths,
  autoLayoutPositions,
  CARD_WIDTH,
  ROW_GAP,
  H_GAP,
  type ForestTicket,
} from './forest-graph.js';

function ticket(number: string, opts?: { dependsOn?: string[]; memberOf?: string }): ForestTicket {
  return {
    number,
    title: number,
    folderName: number.toLowerCase(),
    dependsOn: opts?.dependsOn,
    memberOf: opts?.memberOf,
  };
}

describe('effectiveParent', () => {
  it('returns memberOf when the parent exists in the list', () => {
    const tickets = [ticket('G'), ticket('A', { memberOf: 'G' })];
    expect(effectiveParent(tickets[1], buildLookup(tickets).allNumbers)).toBe('G');
  });

  it('returns undefined when memberOf references an absent ticket', () => {
    const tickets = [ticket('A', { memberOf: 'MISSING' })];
    expect(effectiveParent(tickets[0], buildLookup(tickets).allNumbers)).toBeUndefined();
  });

  it('returns undefined when memberOf is not set', () => {
    const tickets = [ticket('A')];
    expect(effectiveParent(tickets[0], buildLookup(tickets).allNumbers)).toBeUndefined();
  });
});

describe('resolveScope', () => {
  it('returns root-level tickets for undefined scope', () => {
    const tickets = [ticket('A'), ticket('B', { memberOf: 'G' }), ticket('G')];
    const scope = resolveScope(tickets, undefined);
    expect(scope.map(t => t.number).sort()).toEqual(['A', 'G']);
  });

  it('returns group members for a group scope', () => {
    const tickets = [ticket('G'), ticket('A', { memberOf: 'G' }), ticket('B', { memberOf: 'G' }), ticket('C')];
    const scope = resolveScope(tickets, 'G');
    expect(scope.map(t => t.number).sort()).toEqual(['A', 'B']);
  });

  it('treats absent parent as root-level', () => {
    const tickets = [ticket('A', { memberOf: 'GONE' })];
    const scope = resolveScope(tickets, undefined);
    expect(scope.map(t => t.number)).toEqual(['A']);
  });
});

describe('isGroup', () => {
  it('returns true when tickets have this as their parent', () => {
    const tickets = [ticket('G'), ticket('A', { memberOf: 'G' })];
    expect(isGroup(tickets, 'G')).toBe(true);
  });

  it('returns false when no ticket has this as parent', () => {
    const tickets = [ticket('G'), ticket('A')];
    expect(isGroup(tickets, 'G')).toBe(false);
  });

  it('returns false when members are absent (archived)', () => {
    const tickets = [ticket('G')];
    expect(isGroup(tickets, 'G')).toBe(false);
  });
});

describe('representativeInScope', () => {
  it('returns the ticket itself when it is directly in scope', () => {
    const tickets = [ticket('A'), ticket('B')];
    expect(representativeInScope(buildLookup(tickets), 'A', undefined)).toBe('A');
  });

  it('climbs to the group that is in the root scope', () => {
    const tickets = [ticket('G'), ticket('A', { memberOf: 'G' })];
    expect(representativeInScope(buildLookup(tickets), 'A', undefined)).toBe('G');
  });

  it('returns the member when in a group scope', () => {
    const tickets = [ticket('G'), ticket('A', { memberOf: 'G' })];
    expect(representativeInScope(buildLookup(tickets), 'A', 'G')).toBe('A');
  });

  it('returns undefined for a ticket outside the scope subtree', () => {
    const tickets = [ticket('G'), ticket('A', { memberOf: 'G' }), ticket('X')];
    expect(representativeInScope(buildLookup(tickets), 'X', 'G')).toBeUndefined();
  });

  it('handles nested groups', () => {
    const tickets = [
      ticket('G1'),
      ticket('G2', { memberOf: 'G1' }),
      ticket('A', { memberOf: 'G2' }),
    ];
    const lookup = buildLookup(tickets);
    expect(representativeInScope(lookup, 'A', undefined)).toBe('G1');
    expect(representativeInScope(lookup, 'A', 'G1')).toBe('G2');
    expect(representativeInScope(lookup, 'A', 'G2')).toBe('A');
  });

  it('guards against cycles in the membership chain', () => {
    const tickets = [ticket('A', { memberOf: 'B' }), ticket('B', { memberOf: 'A' })];
    expect(representativeInScope(buildLookup(tickets), 'A', undefined)).toBeUndefined();
  });
});

describe('internalDependencies', () => {
  it('returns direct dependencies in scope', () => {
    const tickets = [ticket('A'), ticket('B', { dependsOn: ['A'] })];
    const result = internalDependencies(tickets, undefined);
    expect(result).toEqual([{
      fromNumber: 'B',
      toNumber: 'A',
      relations: [{ fromNumber: 'B', toNumber: 'A' }],
    }]);
  });

  it('reroutes dependencies through group representatives', () => {
    const tickets = [
      ticket('G'),
      ticket('A', { memberOf: 'G' }),
      ticket('B', { dependsOn: ['A'] }),
    ];
    const result = internalDependencies(tickets, undefined);
    expect(result).toEqual([{
      fromNumber: 'B',
      toNumber: 'G',
      relations: [{ fromNumber: 'B', toNumber: 'A' }],
    }]);
  });

  it('deduplicates dependencies that map to the same representatives', () => {
    const tickets = [
      ticket('G'),
      ticket('A', { memberOf: 'G' }),
      ticket('C', { memberOf: 'G' }),
      ticket('B', { dependsOn: ['A', 'C'] }),
    ];
    const result = internalDependencies(tickets, undefined);
    expect(result).toEqual([{
      fromNumber: 'B',
      toNumber: 'G',
      relations: [
        { fromNumber: 'B', toNumber: 'A' },
        { fromNumber: 'B', toNumber: 'C' },
      ],
    }]);
  });

  it('drops dependencies where from and to map to the same representative', () => {
    const tickets = [
      ticket('G'),
      ticket('A', { memberOf: 'G', dependsOn: ['B'] }),
      ticket('B', { memberOf: 'G' }),
    ];
    const result = internalDependencies(tickets, undefined);
    expect(result).toEqual([]);
  });

  it('ignores absent dependency references', () => {
    const tickets = [ticket('A', { dependsOn: ['MISSING'] })];
    const result = internalDependencies(tickets, undefined);
    expect(result).toEqual([]);
  });
});

describe('externalDependencies', () => {
  it('returns empty for root scope', () => {
    const tickets = [ticket('A'), ticket('B', { dependsOn: ['A'] })];
    expect(externalDependencies(tickets, undefined)).toEqual([]);
  });

  it('returns down when member depends on outside ticket', () => {
    const tickets = [
      ticket('G'),
      ticket('A', { memberOf: 'G', dependsOn: ['X'] }),
      ticket('X'),
    ];
    const result = externalDependencies(tickets, 'G');
    expect(result).toEqual([{
      memberNumber: 'A',
      direction: 'down',
      relations: [{ fromNumber: 'A', toNumber: 'X' }],
    }]);
  });

  it('returns up when outside ticket depends on member', () => {
    const tickets = [
      ticket('G'),
      ticket('A', { memberOf: 'G' }),
      ticket('X', { dependsOn: ['A'] }),
    ];
    const result = externalDependencies(tickets, 'G');
    expect(result).toEqual([{
      memberNumber: 'A',
      direction: 'up',
      relations: [{ fromNumber: 'X', toNumber: 'A' }],
    }]);
  });
});

describe('computeDepths', () => {
  it('assigns depth 0 to nodes with no dependencies', () => {
    const depths = computeDepths(['A', 'B'], []);
    expect(depths.get('A')).toBe(0);
    expect(depths.get('B')).toBe(0);
  });

  it('assigns depth 1 to a direct dependent', () => {
    const depths = computeDepths(['A', 'B'], [{ fromNumber: 'B', toNumber: 'A' }]);
    expect(depths.get('A')).toBe(0);
    expect(depths.get('B')).toBe(1);
  });

  it('assigns depth based on max dependency depth (above every one of them)', () => {
    const deps = [
      { fromNumber: 'C', toNumber: 'A' },
      { fromNumber: 'C', toNumber: 'B' },
      { fromNumber: 'B', toNumber: 'A' },
    ];
    const depths = computeDepths(['A', 'B', 'C'], deps);
    expect(depths.get('A')).toBe(0);
    expect(depths.get('B')).toBe(1);
    expect(depths.get('C')).toBe(2);
  });

  it('handles transitive chains', () => {
    const deps = [
      { fromNumber: 'D', toNumber: 'C' },
      { fromNumber: 'C', toNumber: 'B' },
      { fromNumber: 'B', toNumber: 'A' },
    ];
    const depths = computeDepths(['A', 'B', 'C', 'D'], deps);
    expect(depths.get('A')).toBe(0);
    expect(depths.get('B')).toBe(1);
    expect(depths.get('C')).toBe(2);
    expect(depths.get('D')).toBe(3);
  });

  it('guards against cycles without crashing', () => {
    const deps = [
      { fromNumber: 'A', toNumber: 'B' },
      { fromNumber: 'B', toNumber: 'A' },
    ];
    const depths = computeDepths(['A', 'B'], deps);
    expect(depths.get('A')).toBeDefined();
    expect(depths.get('B')).toBeDefined();
  });
});

describe('autoLayoutPositions', () => {
  it('places bottom row at y=0', () => {
    const nodes = [ticket('A'), ticket('B')];
    const result = autoLayoutPositions(nodes, []);
    expect(result['A'].y).toBe(0);
    expect(result['B'].y).toBe(0);
  });

  it('places dependent above its dependency', () => {
    const nodes = [ticket('A'), ticket('B', { dependsOn: ['A'] })];
    const deps = [{ fromNumber: 'B', toNumber: 'A' }];
    const result = autoLayoutPositions(nodes, deps);
    expect(result['A'].y).toBe(0);
    expect(result['B'].y).toBe(-ROW_GAP);
  });

  it('does not overlap nodes in the same row', () => {
    const nodes = [ticket('A'), ticket('B'), ticket('C')];
    const result = autoLayoutPositions(nodes, []);
    const xs = [result['A'].x, result['B'].x, result['C'].x].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(H_GAP);
    }
  });

  it('is deterministic (sorted by ticket number)', () => {
    const nodes = [ticket('C'), ticket('A'), ticket('B')];
    const result1 = autoLayoutPositions(nodes, []);
    const result2 = autoLayoutPositions([ticket('B'), ticket('C'), ticket('A')], []);
    expect(result1).toEqual(result2);
  });

  it('centers a dependent above its dependency', () => {
    const nodes = [ticket('A'), ticket('B', { dependsOn: ['A'] })];
    const deps = [{ fromNumber: 'B', toNumber: 'A' }];
    const result = autoLayoutPositions(nodes, deps);
    expect(result['B'].x).toBe(result['A'].x);
  });
});
