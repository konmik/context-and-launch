import { describe, it, expect } from 'vitest';
import { getViewMode, setViewMode, getForestViewport, setForestViewport } from './forest-local-state.js';

function createStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
}

function throwingStorage() {
  return {
    getItem: (): string | null => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
}

describe('forest-local-state', () => {
  it('getViewMode returns kanban by default', () => {
    expect(getViewMode(createStorage(), 'proj')).toBe('kanban');
  });

  it('getViewMode/setViewMode round-trip', () => {
    const s = createStorage();
    setViewMode(s, 'proj', 'forest');
    expect(getViewMode(s, 'proj')).toBe('forest');
    setViewMode(s, 'proj', 'kanban');
    expect(getViewMode(s, 'proj')).toBe('kanban');
  });

  it('getViewMode rejects an invalid value', () => {
    const s = createStorage();
    s.setItem('view-mode:proj', 'invalid');
    expect(() => getViewMode(s, 'proj')).toThrow('Invalid view mode for project proj');
  });

  it('getViewMode surfaces storage errors', () => {
    expect(() => getViewMode(throwingStorage(), 'proj')).toThrow('denied');
  });

  it('getForestViewport returns undefined by default', () => {
    expect(getForestViewport(createStorage(), 'proj')).toBeUndefined();
  });

  it('getForestViewport/setForestViewport round-trip', () => {
    const s = createStorage();
    setForestViewport(s, 'proj', { x: 100, y: 200, scale: 1.5 });
    expect(getForestViewport(s, 'proj')).toEqual({ x: 100, y: 200, scale: 1.5 });
  });

  it('getForestViewport rejects invalid JSON', () => {
    const s = createStorage();
    s.setItem('forest-viewport:proj', 'not json');
    expect(() => getForestViewport(s, 'proj')).toThrow();
  });

  it('getForestViewport rejects missing fields', () => {
    const s = createStorage();
    s.setItem('forest-viewport:proj', JSON.stringify({ x: 1 }));
    expect(() => getForestViewport(s, 'proj')).toThrow('Invalid Forest viewport for project proj');
  });

  it('setForestViewport surfaces storage errors', () => {
    expect(() => setForestViewport(throwingStorage(), 'proj', { x: 0, y: 0, scale: 1 })).toThrow('denied');
  });

  it('view mode is scoped per project', () => {
    const s = createStorage();
    setViewMode(s, 'proj-a', 'forest');
    setViewMode(s, 'proj-b', 'kanban');
    expect(getViewMode(s, 'proj-a')).toBe('forest');
    expect(getViewMode(s, 'proj-b')).toBe('kanban');
  });
});
