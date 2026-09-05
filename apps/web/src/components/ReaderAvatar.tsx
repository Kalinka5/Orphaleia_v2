import { useEffect, useState } from 'react'
import { readerInitials } from './readerInitials'
import s from './ReaderAvatar.module.css'

type ReaderAvatarProps = {
  name: string
  src?: string | null
  size?: 'comment' | 'account' | 'admin'
}

export function ReaderAvatar({ name, src, size = 'comment' }: ReaderAvatarProps) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  return <span className={`${s.avatar} ${s[size]}`} aria-hidden="true">
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <span>{readerInitials(name)}</span>}
  </span>
}
