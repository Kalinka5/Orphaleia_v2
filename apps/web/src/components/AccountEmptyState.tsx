import { ArrowRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import styles from './IllustratedEmptyState.module.css'

export function AccountEmptyState() {
  return <section className={`${styles.emptyState} ${styles.accountCard}`} aria-labelledby="empty-orders-title">
    <figure className={styles.character} aria-hidden="true">
      <img
        src="/assets/account/little-prince-empty-orders.webp"
        srcSet="/assets/account/little-prince-empty-orders-480w.webp 480w, /assets/account/little-prince-empty-orders-768w.webp 768w"
        sizes="(max-width: 760px) 92vw, 42vw"
        alt=""
        width="1234"
        height="1275"
        decoding="async"
      />
    </figure>
    <div className={styles.copy}>
      <span className={styles.kicker}>AWAITING DEPARTURE</span>
      <h2 id="empty-orders-title">No orders yet</h2>
      <p>Your completed voyages will appear here.</p>
      <Link className={styles.action} to="/all-books">
        Browse the Catalog <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  </section>
}
