import { useEffect, useState } from 'react'
import { oracleExpressions, oraclePortraitUrl, type OracleEmotion, type OracleReaction } from '../oracleReactions'
import s from './BookOracle.module.css'

export function BookOraclePortrait({ reaction, turn, waiting }: { reaction: OracleReaction; turn: number; waiting: boolean }) {
  const [visible, setVisible] = useState<OracleEmotion>('welcoming')
  const playing = turn > 0

  // Decode before swapping so an uncached reaction never leaves an empty portrait.
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = reject
    })
    image.src = oraclePortraitUrl(reaction.emotion)
    void loaded.then(() => image.decode?.()).then(() => {
      if (!cancelled) setVisible(reaction.emotion)
    }).catch(() => { /* Keep the last portrait when an asset cannot load. */ })
    return () => { cancelled = true; image.onload = null; image.onerror = null }
  }, [reaction.emotion])

  // Warm the remaining small WebP portraits once play begins.
  useEffect(() => {
    if (!playing) return
    const images = Object.keys(oracleExpressions).map((emotion) => {
      const image = new Image()
      image.src = oraclePortraitUrl(emotion as OracleEmotion)
      return image
    })
    return () => { for (const image of images) image.src = '' }
  }, [playing])

  return <aside className={s.portrait} aria-label="The Orphaleia book oracle" data-emotion={reaction.emotion} data-waiting={waiting}>
    <div className={s.portraitCircle} aria-hidden="true" />
    <div className={s.characterFrame}>
      <img key={`${visible}-${turn}`} className={s.oracle} data-expression={visible} src={oraclePortraitUrl(visible)} alt={`The male book oracle in a red feathered turban and blue-and-gold vest, ${oracleExpressions[visible].description}, holding his magical book.`} width="1024" height="1024" fetchPriority="high" />
    </div>
    <p className={s.portraitCaption} role="status" aria-live="polite" aria-atomic="true">{reaction.line}</p>
  </aside>
}
