import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  HELD_STATES,
  OPEN_STATES,
  ORDER_STATES,
  TERMINAL_STATES,
  canTransition,
} from '../src/index.ts';
import type { OrderState } from '../src/index.ts';

/** Parse the Mermaid stateDiagram straight from the spec so the test cannot drift from the doc. */
function loadDiagram() {
  const dir = join(import.meta.dirname, '..', '..', '..', 'docs', 'spec');
  const file = readdirSync(dir).find((f) => f.includes('Technical Documentation'));
  if (!file) throw new Error('Technical Documentation spec not found in docs/spec');
  const md = readFileSync(join(dir, file), 'utf8');
  const block = /```mermaid\s+stateDiagram-v2([\s\S]*?)```/.exec(md);
  if (!block) throw new Error('stateDiagram-v2 block not found');

  const edges = new Set<string>();
  const states = new Set<string>();
  const terminal = new Set<string>();
  let initial: string | undefined;
  for (const line of block[1]!.split('\n')) {
    const m = /^\s*(\[\*\]|\w+)\s+-->\s+(\[\*\]|\w+)/.exec(line);
    if (!m) continue;
    const [, from, to] = m as unknown as [string, string, string];
    if (from === '[*]') initial = to;
    else if (to === '[*]') terminal.add(from);
    else edges.add(`${from}>${to}`);
    for (const s of [from, to]) if (s !== '[*]') states.add(s);
  }
  return { edges, states, terminal, initial };
}

const codeEdges = () =>
  new Set(ORDER_STATES.flatMap((from) => ALLOWED_TRANSITIONS[from].map((to) => `${from}>${to}`)));

describe('order state machine matches the spec Mermaid diagram', () => {
  const diagram = loadDiagram();

  it('parsed a plausible diagram', () => {
    expect(diagram.edges.size).toBe(17);
    expect(diagram.initial).toBe('GATED');
  });
  it('has exactly the same states', () => {
    expect([...diagram.states].sort()).toEqual([...ORDER_STATES].sort());
  });
  it('has exactly the same transitions', () => {
    expect([...codeEdges()].sort()).toEqual([...diagram.edges].sort());
  });
  it('every state the diagram marks terminal has no outgoing edges in code', () => {
    for (const s of diagram.terminal) expect(ALLOWED_TRANSITIONS[s as OrderState]).toEqual([]);
  });
  it('code adds only CANCELLED and FAILED as terminal states beyond the diagram', () => {
    const extra = TERMINAL_STATES.filter((s) => !diagram.terminal.has(s)).sort();
    expect(extra).toEqual(['CANCELLED', 'FAILED']);
  });
});

describe('order state invariants', () => {
  it('canTransition agrees with the map, including the HELD→HELD reauthorize self-loop', () => {
    expect(canTransition('GATED', 'AWAITING_APPROVAL')).toBe(true);
    expect(canTransition('HELD', 'HELD')).toBe(true);
    expect(canTransition('DELIVERED', 'SETTLED')).toBe(true);
    expect(canTransition('SETTLED', 'HELD')).toBe(false);
    expect(canTransition('VOIDED', 'SETTLED')).toBe(false);
    expect(canTransition('REJECTED', 'AWAITING_APPROVAL')).toBe(false);
  });
  it('capture (→ SETTLED) is reachable only from DELIVERED', () => {
    const into = ORDER_STATES.filter((s) => canTransition(s, 'SETTLED'));
    expect(into).toEqual(['DELIVERED']);
  });
  it('a hold can never be captured without passing through IN_TRANSIT and DELIVERED', () => {
    expect(canTransition('HELD', 'DELIVERED')).toBe(false);
    expect(canTransition('HELD', 'SETTLED')).toBe(false);
    expect(canTransition('IN_TRANSIT', 'SETTLED')).toBe(false);
  });
  it('every state is reachable from GATED', () => {
    const seen = new Set<OrderState>(['GATED']);
    const queue: OrderState[] = ['GATED'];
    while (queue.length) {
      for (const n of ALLOWED_TRANSITIONS[queue.shift()!]) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect([...seen].sort()).toEqual([...ORDER_STATES].sort());
  });
  it('terminal states are exactly those with no outgoing transitions', () => {
    expect([...TERMINAL_STATES].sort()).toEqual(
      ['CANCELLED', 'FAILED', 'REFUNDED', 'REJECTED', 'RESOLVED_LOST', 'RESOLVED_WON', 'VOIDED'],
    );
  });
  it('HELD_STATES and OPEN_STATES are valid, and no terminal state is polled', () => {
    for (const s of [...HELD_STATES, ...OPEN_STATES]) expect(ORDER_STATES).toContain(s);
    for (const s of OPEN_STATES) expect(TERMINAL_STATES).not.toContain(s);
    expect([...HELD_STATES]).toEqual(['HELD', 'IN_TRANSIT']);
  });
});
