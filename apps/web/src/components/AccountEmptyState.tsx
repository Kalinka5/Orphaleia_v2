import { ArrowRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import styles from './AccountEmptyState.module.css'

export function AccountEmptyState() {
  return <section className={styles.emptyState} aria-labelledby="empty-orders-title">
    <figure className={styles.character} aria-hidden="true">
      <img
        src="/assets/account/little-prince-empty-orders.png"
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
