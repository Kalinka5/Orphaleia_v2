import { describe, expect, it } from 'vitest'
import type { OracleAnswer, OracleEvent } from '../bookOracle'
import { getOracleReaction } from '../oracleReactions'

const answers = (...values: OracleAnswer[]): OracleEvent[] => values.map((answer, i) => ({ type: 'answer', question_id: `q${i}`, answer }))

describe('oracle reactions', () => {
  it.each(['probably', 'probably-not', 'unknown'] as const)('thinks about %s even after a run of no answers', (answer) => {
    expect(getOracleReaction('question', answers('no', 'no', 'no', answer)).emotion).toBe('thinking')
  })

  it('escalates recent no answers, then relaxes on yes or as old clues fall out of the window', () => {
    expect(getOracleReaction('question', answers('no')).emotion).toBe('skeptical')
    expect(getOracleReaction('question', answers('no', 'no')).emotion).toBe('skeptical')
    expect(getOracleReaction('question', answers('no', 'no', 'no')).emotion).toBe('angry')
    expect(getOracleReaction('question', answers('no', 'yes', 'no', 'no')).emotion).toBe('angry')
    expect(getOracleReaction('question', answers('no', 'no', 'no', 'yes')).emotion).toBe('welcoming')
    expect(getOracleReaction('question', answers('no', 'no', 'no', 'yes', 'yes', 'no')).emotion).toBe('skeptical')
  })

  it('gives game outcomes priority over previous frustration', () => {
    const events = answers('no', 'no', 'no')
    expect(getOracleReaction('guess', events).emotion).toBe('excited')
    expect(getOracleReaction('success', events).emotion).toBe('excited')
    expect(getOracleReaction('defeat', events).emotion).toBe('defeated')
  })

  it('reacts immediately to confirmations and rejected guesses', () => {
    expect(getOracleReaction('question', [{ type: 'guess', book_id: 'the-hobbit', correct: false }]).emotion).toBe('skeptical')
    expect(getOracleReaction('question', [{ type: 'guess', book_id: 'the-hobbit', correct: true }]).emotion).toBe('excited')
  })

  it('reconstructs the same mood from a saved or shortened transcript and resets cleanly', () => {
    const events = answers('no', 'no', 'no')
    expect(getOracleReaction('question', JSON.parse(JSON.stringify(events)))).toEqual(getOracleReaction('question', events))
    expect(getOracleReaction('question', events.slice(0, -1)).emotion).toBe('skeptical')
    expect(getOracleReaction('question', []).emotion).toBe('thinking')
    expect(getOracleReaction(null, []).emotion).toBe('welcoming')
  })
})
