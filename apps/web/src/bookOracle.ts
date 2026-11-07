import { z } from 'zod'
import type { components } from './generated/api'

export type OracleManifest = components['schemas']['OracleManifest']
export type OracleState = components['schemas']['OracleQuestionState'] | components['schemas']['OracleGuessState'] | components['schemas']['OracleSuccessState'] | components['schemas']['OracleDefeatState']
export type OracleEvent = components['schemas']['OracleAnswerEvent'] | components['schemas']['OracleGuessEvent']
export type OracleAnswer = components['schemas']['OracleAnswerEvent']['answer']
export const ORACLE_STORAGE_KEY = 'orphaleia.book-oracle'

const savedRound = z.object({
  version: z.string().max(32),
  events: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('answer'), question_id: z.string().min(1).max(100), answer: z.enum(['yes', 'no', 'probably', 'probably-not', 'unknown']) }).strict(),
    z.object({ type: z.literal('guess'), book_id: z.string().min(1).max(100), correct: z.boolean() }).strict(),
  ])).max(123),
}).strict()

export function readOracleRound(): { round: { version: string; events: OracleEvent[] } | null; unavailable: boolean; invalid: boolean } {
  try {
    const raw = sessionStorage.getItem(ORACLE_STORAGE_KEY)
    if (!raw) return { round: null, unavailable: false, invalid: false }
    const parsed = savedRound.safeParse(JSON.parse(raw))
    return { round: parsed.success ? parsed.data : null, unavailable: false, invalid: !parsed.success }
  } catch (error) {
    return { round: null, unavailable: !(error instanceof SyntaxError), invalid: error instanceof SyntaxError }
  }
}
