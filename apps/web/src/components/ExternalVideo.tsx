import { Play } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getExternalVideoDetails } from '../externalVideo'
import s from './ExternalVideo.module.css'

export function ExternalVideo({ url, title }: { url: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  const video = getExternalVideoDetails(url)

  if (!video) return <div className={s.unavailable}>This video is currently unavailable.</div>

  if (loaded) return <iframe src={video.embedUrl} title={title} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />

  return <div className={s.consent}>
    <span className={s.icon}><Play size={28} weight="fill" aria-hidden="true" /></span>
    <div>
      <h3>External video</h3>
      <p>This video is hosted by {video.provider}. Loading it will share your IP address and device information with the provider. Read our <Link to="/privacy#cookies">Privacy Policy</Link>.</p>
    </div>
    <button type="button" onClick={() => setLoaded(true)}>Load external video</button>
  </div>
}
