import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, MapPin, Pause, Play } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import type { Globe } from 'cobe'
import { formatSalesUnits } from '../rankingUtils'
import s from './MarketGlobe.module.css'

// Presentation fixtures, not measured country totals or BookScan data.
export const conceptMarkets = [
  { name: 'United Kingdom', location: [54, -2] as [number, number], units: 182400000 },
  { name: 'France', location: [47, 2] as [number, number], units: 156800000 },
  { name: 'Spain', location: [40, -4] as [number, number], units: 94700000 },
  { name: 'Brazil', location: [-14, -52] as [number, number], units: 72300000 },
  { name: 'Australia', location: [-25, 134] as [number, number], units: 51800000 },
]

export function MarketGlobe() {
  const container = useRef<HTMLDivElement>(null)
  const canvasHost = useRef<HTMLDivElement>(null)
  const globe = useRef<Globe | null>(null)
  const angle = useRef(3 * Math.PI / 2 + 2 * Math.PI / 180)
  const tilt = useRef(.6)
  const [selected, setSelected] = useState(0)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const dragging = useRef(false)
  const selectedRef = useRef(0)
  const markerLabel = useRef<HTMLDivElement>(null)
  const positionLabel = useCallback(() => {
    if (!markerLabel.current) return
    // Match COBE's orthographic projection without relying on CSS anchor support.
    const [lat, lon] = conceptMarkets[selectedRef.current].location.map((value) => value * Math.PI / 180)
    const x = .8 * Math.cos(lat) * Math.cos(lon)
    const y = .8 * Math.sin(lat)
    const z = -.8 * Math.cos(lat) * Math.sin(lon)
    const cp = Math.cos(angle.current), sp = Math.sin(angle.current)
    const ct = Math.cos(tilt.current), st = Math.sin(tilt.current)
    const px = cp * x + sp * z
    const py = sp * st * x + ct * y - cp * st * z
    const depth = -sp * ct * x + st * y + cp * ct * z
    markerLabel.current.style.left = `${(px + 1) * 50}%`
    markerLabel.current.style.top = `${(1 - py) * 50}%`
    markerLabel.current.style.visibility = depth > .04 ? 'visible' : 'hidden'
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!ready || failed || paused || reducedMotion || !container.current) return
    let frame = 0
    let last = 0
    let visible = false
    const tick = (time: number) => {
      if (!dragging.current && last) {
        angle.current += Math.min(time - last, 50) * .00012
        globe.current?.update({ phi: angle.current })
        positionLabel()
      }
      last = time
      frame = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      last = 0
      if (visible && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    observer.observe(container.current)
    document.addEventListener('visibilitychange', sync)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [ready, failed, paused, reducedMotion, positionLabel])

  useEffect(() => {
    const element = container.current
    if (!element) return
    let disposed = false
    let resize: ResizeObserver | undefined
    // Each effect owns a fresh canvas/context, including StrictMode and hot reload.
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    let pointer: { id: number; x: number; y: number } | null = null
    const down = (event: PointerEvent) => {
      if (!globe.current || pointer || !event.isPrimary || event.button !== 0) return
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
      dragging.current = true
      canvas.setPointerCapture(event.pointerId)
      canvas.style.cursor = 'grabbing'
    }
    const move = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return
      angle.current += (event.clientX - pointer.x) / 220
      tilt.current = Math.max(-1.3, Math.min(1.3, tilt.current + (event.clientY - pointer.y) / 350))
      pointer.x = event.clientX
      pointer.y = event.clientY
      globe.current?.update({ phi: angle.current, theta: tilt.current })
      positionLabel()
    }
    const up = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return
      pointer = null
      dragging.current = false
      canvas.style.cursor = 'grab'
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('lostpointercapture', up)
    canvasHost.current?.appendChild(canvas)
    setReady(false)
    setFailed(false)
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void import('cobe').then(({ default: createGlobe }) => {
        if (disposed) return
        let previousSize = 0
        const render = () => {
          const size = element.clientWidth
          if (!size || size === previousSize) return
          previousSize = size
          if (globe.current) {
            // Resizing must retain GPU buffers; destroy/recreate on the same
            // context leaves enabled attributes pointing at deleted buffers.
            globe.current.update({ width: size * 2, height: size * 2 })
            return
          }
          globe.current = createGlobe(canvas, {
            width: size * 2, height: size * 2, devicePixelRatio: 2,
            phi: angle.current, theta: tilt.current, dark: 0, diffuse: 1.5,
            mapSamples: 20000, mapBrightness: 5,
            baseColor: [.96, .97, .94], markerColor: [.16, .37, .30], glowColor: [.98, .98, .96],
            markers: conceptMarkets.map((market) => ({ location: market.location, size: .045 * Math.sqrt(market.units / conceptMarkets[0].units) })),
          })
          setReady(true)
          positionLabel()
        }
        try {
          render()
          resize = new ResizeObserver(() => { if (!disposed) { try { render() } catch { setFailed(true) } } })
          resize.observe(element)
        } catch { setFailed(true) }
      }).catch(() => { if (!disposed) setFailed(true) })
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => {
      disposed = true; observer.disconnect(); resize?.disconnect(); globe.current?.destroy(); globe.current = null
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up)
      dragging.current = false; canvas.remove()
    }
  }, [positionLabel])

  function rotate(delta: number) {
    angle.current += delta
    globe.current?.update({ phi: angle.current })
    positionLabel()
  }

  function selectMarket(index: number) {
    setSelected(index)
    selectedRef.current = index
    const [latitude, longitude] = conceptMarkets[index].location
    angle.current = 3 * Math.PI / 2 - longitude * Math.PI / 180
    tilt.current = latitude * Math.PI / 180
    globe.current?.update({ phi: angle.current, theta: tilt.current })
    positionLabel()
  }

  return <section className={s.section} aria-labelledby="market-globe-title">
    <header className={s.header}><div><span className={s.notice}>Concept preview · Fictional data</span><h2 id="market-globe-title">A world of readers</h2><p>Explore how annual print-book sales could compare across markets.</p></div><Link to="/rankings?preview=concept">Explore the chart <ArrowUpRight size={18} aria-hidden="true" /></Link></header>
    <div className={s.layout}>
      <figure className={s.figure}>
        <div ref={container} className={s.globe}>
          <div ref={canvasHost} className={failed ? s.hidden : undefined} />
          <div ref={markerLabel} className={s.markerLabel} aria-hidden="true" hidden={!ready || failed}>
            <span className={s.markerTooltip}><MapPin size={18} weight="fill" aria-hidden="true" />{conceptMarkets[selected].name}</span>
            <span className={s.markerRing} />
          </div>
          {(!ready || failed) && <p className={s.fallback}>{failed ? 'Globe unavailable. Explore the country list alongside it.' : 'Loading globe…'}</p>}
        </div>
        <div className={s.controls}><button type="button" disabled={!ready || failed} aria-label="Rotate globe left" onClick={() => rotate(-.45)}><ArrowLeft size={18} aria-hidden="true" /></button><span>Drag to explore</span><button type="button" disabled={!ready || failed} aria-label="Rotate globe right" onClick={() => rotate(.45)}><ArrowRight size={18} aria-hidden="true" /></button><button type="button" disabled={!ready || failed || reducedMotion} aria-label={reducedMotion ? 'Automatic rotation disabled by reduced-motion preference' : paused ? 'Resume automatic rotation' : 'Pause automatic rotation'} onClick={() => setPaused((value) => !value)}>{paused || reducedMotion ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}</button></div>
        <figcaption>Marker size represents illustrative sales volume. Unmarked countries are not zero-sales markets.</figcaption>
      </figure>
      <div className={s.panel}>
        <div className={s.listHeading}><h3>Print sales by market</h3><span>2025 example</span></div>
        <p className={s.disclaimer}>Invented totals and ordering for five example markets. Not actual sales or NielsenIQ BookScan data.</p>
        <ol className={s.list} aria-label="Illustrative country sales ranking">{conceptMarkets.map((market, index) => <li key={market.name}><button type="button" aria-pressed={selected === index} onClick={() => selectMarket(index)}><span className={s.rank}>{String(index + 1).padStart(2, '0')}</span><span>{market.name}</span><strong>{(market.units / 1000000).toFixed(1)}M<span className={s.srOnly}> illustrative copies sold</span></strong></button></li>)}</ol>
        <div className={s.selection} aria-live="polite"><span>{conceptMarkets[selected].name}</span><strong>{formatSalesUnits(conceptMarkets[selected].units)}</strong><small>Illustrative print copies in 2025</small></div>
        <p className={s.methodology}>A future licensed view would identify each market’s coverage and methodology. These examples are not a worldwide total.</p>
      </div>
    </div>
  </section>
}
