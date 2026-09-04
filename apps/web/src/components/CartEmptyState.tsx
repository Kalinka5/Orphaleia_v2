import { ArrowRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import styles from './IllustratedEmptyState.module.css'

export function CartEmptyState() {
  return <section className={styles.emptyState} aria-labelledby="empty-cart-title">
    <figure className={styles.character} aria-hidden="true">
      <img
        src="/assets/cart/paddington-empty-bag.png"
        alt=""
        width="1216"
        height="1293"
        decoding="async"
      />
    </figure>
    <div className={styles.copy}>
      <span className={styles.kicker}>READY FOR THE JOURNEY</span>
      <h2 id="empty-cart-title">Your bag is waiting</h2>
      <p>Choose a book and begin a new route.</p>
      <Link className={styles.action} to="/all-books">
        Browse the Catalog <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  </section>
}
