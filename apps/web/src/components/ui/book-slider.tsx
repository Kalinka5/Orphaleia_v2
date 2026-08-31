import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import HTMLFlipBook from 'react-pageflip'
import styles from './book-slider.module.css'

export type BookSliderCorner = 'top' | 'bottom'
export type BookSliderState = 'user_fold' | 'fold_corner' | 'flipping' | 'read'

type PageFlipApi = {
  flip: (page: number, corner?: BookSliderCorner) => void
  flipNext: (corner?: BookSliderCorner) => void
  flipPrev: (corner?: BookSliderCorner) => void
  getCurrentPageIndex: () => number
  turnToPage: (page: number) => void
  startUserTouch: (point: { x: number; y: number }) => void
  userMove: (point: { x: number; y: number }, isTouch: boolean) => void
  userStop: (point: { x: number; y: number }, isSwipe?: boolean) => void
}

type ReactPageFlipHandle = {
  pageFlip: () => PageFlipApi | undefined
}

export type BookSliderHandle = {
  flipNext: (corner?: BookSliderCorner) => void
  flipPrevious: (corner?: BookSliderCorner) => void
  flipToPage: (page: number, corner?: BookSliderCorner) => void
  turnToPage: (page: number) => void
}

type Props = {
  children: ReactElement[]
  className?: string
  initialPage?: number
  reducedMotion?: boolean
  testId?: string
  onPageChange?: (page: number) => void
  onInteractionStateChange?: (state: BookSliderState) => void
}

const BookSlider = forwardRef<BookSliderHandle, Props>(function BookSlider({
  children,
  className = '',
  initialPage = 0,
  reducedMotion = false,
  testId,
  onPageChange,
  onInteractionStateChange,
}, forwardedRef) {
  const bookRef = useRef<ReactPageFlipHandle | null>(null)
  const dragRef = useRef<{ pointerId: number; corner: BookSliderCorner } | null>(null)
  const pendingPageRef = useRef(initialPage)
  const [interactionState, setInteractionState] = useState<BookSliderState>('read')

  function handleInteractionState(state: BookSliderState) {
    setInteractionState(state)
    if (state === 'read') onPageChange?.(pendingPageRef.current)
    onInteractionStateChange?.(state)
  }

  function handlePageFlip(page: number) {
    pendingPageRef.current = page
  }

  function pagePoint(event: PointerEvent<HTMLDivElement>, corner?: BookSliderCorner) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const rawY = event.clientY - bounds.top
    const activeCorner = corner ?? (rawY < bounds.height / 2 ? 'top' : 'bottom')

    // StPageFlip can invert a top fold into a second lower flap when the pointer
    // crosses the page midpoint. Keep each physical corner in its own hemisphere.
    const y = activeCorner === 'top'
      ? Math.min(rawY, bounds.height * 0.44)
      : Math.max(rawY, bounds.height * 0.56)

    return { point: { x, y }, corner: activeCorner }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if ((event.target as HTMLElement).closest('a, button')) return
    const api = bookRef.current?.pageFlip()
    if (!api) return
    const { point, corner } = pagePoint(event)
    dragRef.current = { pointerId: event.pointerId, corner }
    api.startUserTouch(point)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const api = bookRef.current?.pageFlip()
    if (!api) return
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId) {
      api.userMove(pagePoint(event, drag.corner).point, event.pointerType !== 'mouse')
      event.preventDefault()
      return
    }
    if (event.pointerType === 'mouse') api.userMove(pagePoint(event).point, false)
  }

  function finishPointerDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    bookRef.current?.pageFlip()?.userStop(pagePoint(event, drag.corner).point)
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useImperativeHandle(forwardedRef, () => ({
    flipNext: (corner = 'bottom') => bookRef.current?.pageFlip()?.flipNext(corner),
    flipPrevious: (corner = 'bottom') => bookRef.current?.pageFlip()?.flipPrev(corner),
    flipToPage: (page, corner = 'bottom') => bookRef.current?.pageFlip()?.flip(page, corner),
    turnToPage: (page) => bookRef.current?.pageFlip()?.turnToPage(page),
  }), [])

  return <div
    className={`${styles.root} ${className}`.trim()}
    data-testid={testId}
    data-state={interactionState}
    data-turning={interactionState !== 'read'}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={finishPointerDrag}
    onPointerCancel={finishPointerDrag}
  >
    <HTMLFlipBook
      ref={bookRef}
      className={styles.book}
      style={{}}
      width={576}
      height={729}
      size="stretch"
      minWidth={320}
      maxWidth={576}
      minHeight={405}
      maxHeight={729}
      startPage={initialPage}
      drawShadow={!reducedMotion}
      flippingTime={reducedMotion ? 1 : 560}
      usePortrait={false}
      startZIndex={10}
      autoSize
      maxShadowOpacity={0.56}
      showCover={false}
      mobileScrollSupport
      clickEventForward
      useMouseEvents={false}
      swipeDistance={34}
      showPageCorners={!reducedMotion}
      disableFlipByClick
      onFlip={(event) => handlePageFlip(Number(event.data))}
      onChangeState={(event) => handleInteractionState(event.data as BookSliderState)}
    >
      {children}
    </HTMLFlipBook>
  </div>
})

export default BookSlider
