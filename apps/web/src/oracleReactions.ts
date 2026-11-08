import type { OracleEvent, OracleState } from './bookOracle'

export const oracleExpressions = {
  welcoming: { file: 'character.webp', description: 'smiling warmly' },
  thinking: { file: 'character-thinking.webp', description: 'looking thoughtful with a furrowed brow' },
  skeptical: { file: 'character-skeptical.webp', description: 'raising an eyebrow in surprise' },
  angry: { file: 'character-angry.webp', description: 'frowning in playful frustration' },
  excited: { file: 'character-excited.webp', description: 'beaming with excitement' },
  defeated: { file: 'character-defeated.webp', description: 'giving a sheepish, amused smile' },
} as const

export type OracleEmotion = keyof typeof oracleExpressions
export type OracleReaction = { emotion: OracleEmotion; line: string }

export function oraclePortraitUrl(emotion: OracleEmotion) {
  return `/assets/book-oracle/${oracleExpressions[emotion].file}`
}

export function getOracleReaction(status: OracleState['status'] | null, events: OracleEvent[]): OracleReaction {
  if (status === 'success') return { emotion: 'excited', line: 'I knew we would find your story!' }
  if (status === 'defeat') return { emotion: 'defeated', line: 'You win this chapter. Rematch?' }
  if (status === 'guess') return { emotion: 'excited', line: 'Wait… I think I have it!' }
  if (status === null) return { emotion: 'welcoming', line: 'A keeper of stories. A reader of clues.' }

  const last = events.at(-1)
  if (!last) return { emotion: 'thinking', line: 'Let me open the right chapter…' }
  if (last.type === 'guess') return last.correct
    ? { emotion: 'excited', line: 'I knew we would find your story!' }
    : { emotion: 'skeptical', line: 'Not that one? The plot thickens!' }
  if (last.answer === 'probably') return { emotion: 'thinking', line: 'Probably… let me think about that.' }
  if (last.answer === 'probably-not') return { emotion: 'thinking', line: 'An unlikely clue is still a clue…' }
  if (last.answer === 'unknown') return { emotion: 'thinking', line: 'A little mystery. We can work with that.' }
  if (last.answer === 'yes') return { emotion: 'welcoming', line: 'Aha! Now we are getting somewhere.' }

  const recentAnswers = events.filter((event) => event.type === 'answer').slice(-4)
  if (recentAnswers.filter((event) => event.answer === 'no').length >= 3) {
    return { emotion: 'angry', line: 'Another no?! Even my turban is getting ruffled.' }
  }
  return { emotion: 'skeptical', line: 'No? An unexpected twist…' }
}
