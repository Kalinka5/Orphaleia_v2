import { ArrowRight, Compass, LinkSimple, Repeat, Trash } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api'
import type { ReadingCurrentAccount } from '../types'
import { ErrorState, RouteState as State } from './ui/RouteState'
import s from './ReadingCurrentAccountSection.module.css'

export function ReadingCurrentAccountSection() {
  const client = useQueryClient()
  const current = useQuery({ queryKey: ['reading-current', 'account'], queryFn: () => api<ReadingCurrentAccount>('/users/me/reading-current') })

  async function removeProfile() {
    await api('/users/me/reading-current', { method: 'DELETE' })
    await client.invalidateQueries({ queryKey: ['reading-current', 'account'] })
  }

  async function revokeShare(shareId: string) {
    await api(`/users/me/reading-current/shares/${shareId}`, { method: 'DELETE' })
    await client.invalidateQueries({ queryKey: ['reading-current', 'account'] })
  }

  if (current.isLoading) return <State title="Finding your saved current…" loading />
  if (current.error) return <ErrorState error={current.error} retry={() => void current.refetch()} />

  const profile = current.data?.profile
  return <section aria-labelledby="account-current-title">
    <header className={s.heading}><span>READING CURRENT</span><h2 id="account-current-title">The stories closest to you</h2><p>Your newest completed voyage replaces the one before it. Public links remain separate until you revoke them or they expire.</p></header>
    {!profile ? <div className={s.empty}>
      <Compass size={32} aria-hidden="true" /><div><h3>No current charted yet</h3><p>Eight playful choices will find a genre and three books matched to the reading mood you have now.</p></div><Link className={s.primary} to="/reading-current" state={{ readingCurrentSource: 'account' }}>Find your reading current <ArrowRight size={17} aria-hidden="true" /></Link>
    </div> : <>
      <article className={s.profile}>
        <div className={s.constellation}><span>LATEST VOYAGE</span><h3>{profile.result.primary_genre.name}</h3><p className={s.archetype}>{profile.result.archetype.name}</p><p>{profile.result.explanation}</p><div>{profile.result.related_genres.map((genre) => <Link key={genre.id} to={`/genres/${genre.slug}`}>{genre.name}</Link>)}</div></div>
        <div className={s.profileAside}><small>Completed {new Date(profile.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small>{profile.is_stale && <p>This saved voyage uses an earlier question set. Retake it to create new public links.</p>}<Link className={s.primary} to={`/genres/${profile.result.primary_genre.slug}`}>Open your shelf <ArrowRight size={16} aria-hidden="true" /></Link><Link className={s.secondary} to="/reading-current" state={{ readingCurrentSource: 'account' }}><Repeat size={16} aria-hidden="true" /> Retake the voyage</Link><button className={s.remove} type="button" onClick={() => void removeProfile().catch((error) => window.alert(errorMessage(error)))}><Trash size={15} aria-hidden="true" /> Remove saved result</button></div>
      </article>
      <section className={s.shares} aria-labelledby="account-shares-title"><div><span>PUBLIC LINKS</span><h3 id="account-shares-title">Active shares</h3></div>{current.data?.shares.length ? <ul>{current.data.shares.map((share) => <li key={share.id}><div><LinkSimple size={18} aria-hidden="true" /><span><a href={share.url}>{share.display_name ? `Shared as ${share.display_name}` : 'Anonymous reading current'}</a><small>Expires {new Date(share.expires_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small></span></div><button type="button" onClick={() => void revokeShare(share.id).catch((error) => window.alert(errorMessage(error)))}><Trash size={15} aria-hidden="true" /> Revoke</button></li>)}</ul> : <p>No active public links. You can create one from your result page.</p>}</section>
    </>}
  </section>
}
