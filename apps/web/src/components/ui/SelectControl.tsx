import { Check, CaretDown } from '@phosphor-icons/react'
import { CSSProperties, KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './SelectControl.module.css'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectControlProps = {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  name?: string
  disabled?: boolean
  busy?: boolean
  required?: boolean
  invalid?: boolean
  describedBy?: string
  placement?: 'auto' | 'top' | 'bottom'
  labelMode?: 'hidden' | 'stacked' | 'inline'
  className?: string
}

type MenuPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
}

const MENU_GAP = 6
const VIEWPORT_GUTTER = 12

export function SelectControl({
  label,
  value,
  options,
  onChange,
  name,
  disabled = false,
  busy = false,
  required = false,
  invalid = false,
  describedBy,
  placement = 'auto',
  labelMode = 'hidden',
  className = '',
}: SelectControlProps) {
  const id = useId()
  const buttonId = `${id}-button`
  const listboxId = `${id}-listbox`
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]
  const enabledIndexes = useMemo(() => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0), [options])

  const calculatePosition = useCallback(() => {
    const trigger = buttonRef.current?.getBoundingClientRect()
    if (!trigger) return
    const availableBelow = window.innerHeight - trigger.bottom - VIEWPORT_GUTTER
    const availableAbove = trigger.top - VIEWPORT_GUTTER
    const openAbove = placement === 'top' || (placement === 'auto' && availableBelow < 260 && availableAbove > availableBelow)
    const maxHeight = Math.max(160, Math.min(360, openAbove ? availableAbove - MENU_GAP : availableBelow - MENU_GAP))
    const width = Math.min(Math.max(trigger.width, 180), window.innerWidth - VIEWPORT_GUTTER * 2)
    const left = Math.min(Math.max(VIEWPORT_GUTTER, trigger.left), window.innerWidth - width - VIEWPORT_GUTTER)
    const top = openAbove ? Math.max(VIEWPORT_GUTTER, trigger.top - maxHeight - MENU_GAP) : trigger.bottom + MENU_GAP
    setMenuPosition({ left, top, width, maxHeight })
  }, [placement])

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus())
  }

  function moveActive(direction: 1 | -1) {
    if (!enabledIndexes.length) return
    const currentPosition = enabledIndexes.indexOf(activeIndex)
    const start = currentPosition >= 0 ? currentPosition : 0
    const next = (start + direction + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[next])
  }

  function selectIndex(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setActiveIndex(index)
    close(true)
  }

  function handleTypeahead(key: string) {
    window.clearTimeout(typeaheadTimerRef.current)
    typeaheadRef.current = `${typeaheadRef.current}${key}`.toLocaleLowerCase()
    const match = options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(typeaheadRef.current))
    if (match >= 0) setActiveIndex(match)
    typeaheadTimerRef.current = window.setTimeout(() => { typeaheadRef.current = '' }, 500)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || busy) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(selectedIndex)
      } else {
        moveActive(event.key === 'ArrowDown' ? 1 : -1)
      }
      return
    }
    if (event.key === 'Home' && open) {
      event.preventDefault()
      if (enabledIndexes.length) setActiveIndex(enabledIndexes[0])
      return
    }
    if (event.key === 'End' && open) {
      event.preventDefault()
      if (enabledIndexes.length) setActiveIndex(enabledIndexes[enabledIndexes.length - 1])
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      selectIndex(activeIndex)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(selectedIndex)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'Tab' && open) {
      close()
      return
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (!open) setOpen(true)
      handleTypeahead(event.key)
    }
  }

  useLayoutEffect(() => {
    if (!open) return
    calculatePosition()
    const activeOption = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
    activeOption?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, calculatePosition, open, options.length])

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) close()
    }
    const handleViewport = () => calculatePosition()
    document.addEventListener('pointerdown', handleOutside)
    window.addEventListener('resize', handleViewport)
    window.addEventListener('scroll', handleViewport, true)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      window.removeEventListener('resize', handleViewport)
      window.removeEventListener('scroll', handleViewport, true)
    }
  }, [calculatePosition, open])

  useEffect(() => () => window.clearTimeout(typeaheadTimerRef.current), [])
  useEffect(() => setActiveIndex(selectedIndex), [selectedIndex])

  const portalStyle = menuPosition ? ({
    '--select-left': `${menuPosition.left}px`,
    '--select-top': `${menuPosition.top}px`,
    '--select-width': `${menuPosition.width}px`,
    '--select-max-height': `${menuPosition.maxHeight}px`,
  } as CSSProperties) : undefined

  return <div className={`${styles.control} ${styles[labelMode]} ${className}`}>
    <span className={labelMode === 'hidden' ? styles.srOnly : styles.label} id={`${id}-label`}>{label}</span>
    {name && <input type="hidden" name={name} value={value} />}
    <button
      ref={buttonRef}
      id={buttonId}
      className={styles.trigger}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-labelledby={`${id}-label ${buttonId}`}
      aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
      disabled={disabled || busy || options.length === 0}
      aria-busy={busy || undefined}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onClick={() => {
        if (open) close()
        else {
          setActiveIndex(selectedIndex)
          setOpen(true)
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <span>{busy ? 'Loading…' : selected?.label ?? 'Select an option'}</span>
      <CaretDown className={styles.caret} size={16} aria-hidden="true" />
    </button>
    {open && menuPosition && createPortal(
      <ul
        ref={listRef}
        id={listboxId}
        className={styles.listbox}
        role="listbox"
        aria-labelledby={`${id}-label`}
        style={portalStyle}
      >
        {options.map((option, index) => <li
          id={`${id}-option-${index}`}
          className={`${styles.option} ${index === activeIndex ? styles.active : ''} ${option.value === value ? styles.selected : ''}`}
          data-option-index={index}
          key={`${option.value}-${index}`}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          onPointerMove={() => !option.disabled && setActiveIndex(index)}
          onClick={() => selectIndex(index)}
        >
          <span>{option.label}</span>
          {option.value === value && <Check size={17} weight="bold" aria-hidden="true" />}
        </li>)}
      </ul>,
      document.body,
    )}
  </div>
}
