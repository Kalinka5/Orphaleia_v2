import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Group, Material, Mesh, Object3D, PerspectiveCamera, Scene, Texture, WebGLRenderer } from 'three'
import type { Book } from '../types'
import s from '../styles.module.css'

export type HeroBook = Pick<Book, 'slug' | 'title' | 'cover_url'>

type ScenePhase = 'loading' | 'ready' | 'fallback' | 'reduced-motion'

type Slot = {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}

class Spring {
  value: number
  target: number
  velocity = 0

  constructor(value: number, private stiffness = 95, private damping = 14) {
    this.value = value
    this.target = value
  }

  set(value: number) {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  update(delta: number) {
    const acceleration = this.stiffness * (this.target - this.value) - this.damping * this.velocity
    this.velocity += acceleration * delta
    this.value += this.velocity * delta
    return this.value
  }
}

type BookRig = {
  slug: string
  root: Group
  float: Group
  frontPivot: Group
  hit: Mesh
  baseScale: number
  phase: number
  springs: {
    x: Spring
    y: Spring
    z: Spring
    rx: Spring
    ry: Spring
    rz: Spring
    scale: Spring
    lift: Spring
    tiltX: Spring
    tiltY: Spring
    cover: Spring
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const desktopSlots: Slot[] = [
  { position: [-3.42, -0.48, -0.58], rotation: [-0.04, 0.38, 0.19], scale: 0.9 },
  { position: [-1.72, -0.17, -0.14], rotation: [-0.04, 0.2, 0.08], scale: 1.08 },
  { position: [0, 0.18, 0.58], rotation: [-0.04, -0.04, -0.025], scale: 1.3 },
  { position: [1.72, -0.19, -0.16], rotation: [-0.04, -0.2, -0.08], scale: 1.08 },
  { position: [3.42, -0.5, -0.6], rotation: [-0.04, -0.38, -0.19], scale: 0.9 },
]

const mobileSlots: Slot[] = [
  { position: [-1.32, -0.98, -0.2], rotation: [-0.04, 0.34, 0.17], scale: 1.08 },
  { position: [0, -0.54, 0.54], rotation: [-0.04, -0.04, -0.025], scale: 1.24 },
  { position: [1.32, -1.02, -0.22], rotation: [-0.04, -0.34, -0.16], scale: 1.08 },
]

const edgeColors = [0x295267, 0x7c413c, 0x294851, 0xc6973d, 0x6c5635]

function useCompactHero() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return compact
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

function disposeScene(scene: Scene, renderer: WebGLRenderer, textures: Texture[]) {
  const geometries = new Set<{ dispose: () => void }>()
  const materials = new Set<Material>()
  const textureSet = new Set(textures)

  scene.traverse((object: Object3D) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    if (mesh.geometry) geometries.add(mesh.geometry)
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    meshMaterials.forEach((material) => {
      if (!material) return
      materials.add(material)
      const mapped = material as Material & { map?: Texture; bumpMap?: Texture }
      if (mapped.map) textureSet.add(mapped.map)
      if (mapped.bumpMap) textureSet.add(mapped.bumpMap)
    })
  })

  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textureSet.forEach((texture) => texture.dispose())
  renderer.renderLists.dispose()
  renderer.dispose()
  renderer.forceContextLoss()
}

export function BookHeroScene({ books }: { books: HeroBook[] }) {
  const stageRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackDragRef = useRef({ pointerId: -1, startX: 0, startY: 0, horizontal: false })
  const reducedMotion = useReducedMotion()
  const compact = useCompactHero()
  const sceneBooks = useMemo(() => compact ? books.slice(1, 4) : books.slice(0, 5), [books, compact])
  const [phase, setPhase] = useState<ScenePhase>(reducedMotion ? 'reduced-motion' : 'loading')
  const [fallbackReason, setFallbackReason] = useState(reducedMotion ? 'reduced-motion' : '')

  useEffect(() => {
    if (reducedMotion) {
      setPhase('reduced-motion')
      setFallbackReason('reduced-motion')
      return
    }
    if (sceneBooks.length < 3 || !stageRef.current || !canvasRef.current) {
      setPhase('fallback')
      setFallbackReason('insufficient-book-data')
      return
    }

    const stage = stageRef.current
    const canvas = canvasRef.current
    let cancelled = false
    let renderer: WebGLRenderer | undefined
    let scene: Scene | undefined
    let camera: PerspectiveCamera | undefined
    let animationFrame = 0
    let resizeObserver: ResizeObserver | undefined
    let intersectionObserver: IntersectionObserver | undefined
    let visible = true
    let running = false
    let lastTime = performance.now()
    let cleanupScene: (() => void) | undefined

    setPhase('loading')
    setFallbackReason('')

    async function initialise() {
      try {
        const THREE = await import('three')
        if (cancelled) return

        const context = canvas.getContext('webgl2', { alpha: true, antialias: true })
        if (!context) throw new Error('webgl2-unavailable')

        renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true })
        renderer.setClearColor(0x000000, 0)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 0.96
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFShadowMap

        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(27, 1, 0.1, 40)
        camera.position.set(0, 0.12, 9.4)

        const hemisphere = new THREE.HemisphereLight(0xdde5ff, 0x080d1d, 1.35)
        scene.add(hemisphere)
        const key = new THREE.DirectionalLight(0xfff4df, 3.1)
        key.position.set(-2.6, 4.8, 6.2)
        key.castShadow = true
        key.shadow.mapSize.set(1024, 1024)
        key.shadow.camera.left = -5
        key.shadow.camera.right = 5
        key.shadow.camera.top = 5
        key.shadow.camera.bottom = -5
        key.shadow.camera.near = 1
        key.shadow.camera.far = 18
        key.shadow.bias = -0.00035
        scene.add(key)
        const rim = new THREE.DirectionalLight(0xa8cfbd, 1.45)
        rim.position.set(4.5, 2.4, -2.8)
        scene.add(rim)
        const fill = new THREE.PointLight(0xe7b9c2, 1.1, 18)
        fill.position.set(3.4, -0.4, 4)
        scene.add(fill)

        const bookRoot = new THREE.Group()
        scene.add(bookRoot)

        const shadowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 8),
          new THREE.ShadowMaterial({ color: 0x050816, opacity: 0.24, transparent: true }),
        )
        shadowPlane.position.z = -1.08
        shadowPlane.receiveShadow = true
        scene.add(shadowPlane)

        const textureLoader = new THREE.TextureLoader()
        const textures = await Promise.all(sceneBooks.map(async (book) => {
          const texture = await textureLoader.loadAsync(book.cover_url).catch(() => {
            throw new Error('texture-load-failed')
          })
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8)
          return texture
        }))
        if (cancelled) {
          if (scene && renderer) disposeScene(scene, renderer, textures)
          return
        }

        const coverGeometry = new THREE.BoxGeometry(1.7, 2.58, 0.045)
        const backGeometry = new THREE.BoxGeometry(1.7, 2.58, 0.04)
        const blockGeometry = new THREE.BoxGeometry(1.61, 2.45, 0.27)
        const spineGeometry = new THREE.BoxGeometry(0.08, 2.58, 0.36)
        const hitGeometry = new THREE.BoxGeometry(1.94, 2.82, 0.82)
        const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })
        const rigs: BookRig[] = []
        const hitToRig = new Map<Object3D, BookRig>()

        const initialSlots = compact ? mobileSlots : desktopSlots
        sceneBooks.forEach((book, index) => {
          const root = new THREE.Group()
          const float = new THREE.Group()
          root.add(float)
          bookRoot.add(root)

          const edgeColor = edgeColors[index]
          const edgeMaterial = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.64, metalness: 0.01 })
          const frontMaterial = new THREE.MeshStandardMaterial({ map: textures[index], roughness: 0.52, metalness: 0.01 })
          const backMaterial = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.72, metalness: 0.01 })
          const endpaperMaterial = new THREE.MeshStandardMaterial({ color: 0xe8dfca, roughness: 0.94 })
          const paperMaterial = new THREE.MeshStandardMaterial({ color: 0xeee5d1, roughness: 0.98 })
          const paperEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.92 })
          const spineMaterial = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.76, metalness: 0.01 })

          const backCover = new THREE.Mesh(backGeometry, [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, endpaperMaterial, backMaterial])
          backCover.position.z = -0.18
          backCover.castShadow = true
          backCover.receiveShadow = true
          float.add(backCover)

          const pageBlock = new THREE.Mesh(blockGeometry, [paperEdgeMaterial, paperEdgeMaterial, paperEdgeMaterial, paperEdgeMaterial, paperMaterial, paperMaterial])
          pageBlock.position.set(0.025, 0, -0.02)
          pageBlock.castShadow = true
          pageBlock.receiveShadow = true
          float.add(pageBlock)

          const frontPivot = new THREE.Group()
          frontPivot.position.set(-0.85, 0, 0.18)
          const frontCover = new THREE.Mesh(coverGeometry, [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, endpaperMaterial])
          frontCover.position.x = 0.85
          frontCover.castShadow = true
          frontCover.receiveShadow = true
          frontPivot.add(frontCover)
          float.add(frontPivot)

          const spine = new THREE.Mesh(spineGeometry, spineMaterial)
          spine.position.set(-0.84, 0, 0)
          spine.castShadow = true
          float.add(spine)

          const hit = new THREE.Mesh(hitGeometry, hitMaterial)
          const slot = initialSlots[index]
          hit.position.set(slot.position[0], slot.position[1], slot.position[2] + 0.08)
          hit.rotation.set(...slot.rotation)
          hit.scale.setScalar(slot.scale)
          bookRoot.add(hit)

          const rig: BookRig = {
            slug: book.slug,
            root,
            float,
            frontPivot,
            hit,
            baseScale: slot.scale,
            phase: index * 1.8 + 0.4,
            springs: {
              x: new Spring(slot.position[0], 76, 16),
              y: new Spring(slot.position[1] - 3.2, 58, 13),
              z: new Spring(slot.position[2], 76, 16),
              rx: new Spring(slot.rotation[0], 80, 17),
              ry: new Spring(slot.rotation[1], 80, 17),
              rz: new Spring(slot.rotation[2] + (index - (initialSlots.length - 1) / 2) * 0.12, 80, 17),
              scale: new Spring(slot.scale, 86, 18),
              lift: new Spring(0, 72, 17),
              tiltX: new Spring(0, 86, 19),
              tiltY: new Spring(0, 86, 19),
              cover: new Spring(0, 68, 17),
            },
          }
          rigs.push(rig)
          hitToRig.set(hit, rig)
          window.setTimeout(() => {
            if (!cancelled) rig.springs.y.target = slot.position[1]
          }, 130 + index * 125)
        })

        const raycaster = new THREE.Raycaster()
        const pointer = new THREE.Vector2(0, 0)
        const localPoint = new THREE.Vector3()
        const rootTiltX = new Spring(0, 72, 16)
        const rootTiltY = new Spring(0, 72, 16)
        let hovered: BookRig | null = null
        let pointerSeen = false
        let pointerType = 'mouse'
        let pointerDown = false
        let dragStarted = false
        let downX = 0
        let downY = 0
        let dragPointerId: number | null = null
        let currentSlots = initialSlots

        const setHovered = (rig: BookRig | null) => {
          if (hovered === rig) return
          hovered = rig
          stage.dataset.activeBook = rig?.slug ?? ''
        }

        const castPointer = () => {
          if (!camera) return
          raycaster.setFromCamera(pointer, camera)
          const hits = raycaster.intersectObjects(rigs.map((rig) => rig.hit), false)
          const rig = hits.length ? hitToRig.get(hits[0].object) ?? null : null
          setHovered(rig)
          if (rig && hits[0]) rig.hit.worldToLocal(localPoint.copy(hits[0].point))
        }

        const updatePointer = (event: PointerEvent) => {
          const bounds = canvas.getBoundingClientRect()
          pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1
          pointer.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1
          pointerSeen = true
          pointerType = event.pointerType || 'mouse'
        }

        const onPointerMove = (event: PointerEvent) => {
          if (dragPointerId !== null && event.pointerId !== dragPointerId) return
          updatePointer(event)
          if (pointerDown && pointerType !== 'mouse') {
            const dx = event.clientX - downX
            const dy = event.clientY - downY
            if (!dragStarted && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) dragStarted = true
            if (dragStarted) {
              event.preventDefault()
              rootTiltY.target = clamp(dx / Math.max(1, canvas.clientWidth) * 0.95, -0.24, 0.24)
              rootTiltX.target = clamp(-dy / Math.max(1, canvas.clientHeight) * 0.42, -0.08, 0.08)
            }
          } else if (pointerType === 'mouse') {
            castPointer()
          }
        }

        const onPointerDown = (event: PointerEvent) => {
          updatePointer(event)
          if (pointerType === 'mouse') return
          pointerDown = true
          dragStarted = false
          dragPointerId = event.pointerId
          downX = event.clientX
          downY = event.clientY
          setHovered(null)
          stage.dataset.dragging = 'true'
        }

        const endPointer = (event?: PointerEvent) => {
          if (event && dragPointerId !== null && event.pointerId !== dragPointerId) return
          pointerDown = false
          dragStarted = false
          dragPointerId = null
          rootTiltX.target = 0
          rootTiltY.target = 0
          setHovered(null)
          stage.dataset.dragging = 'false'
        }

        const onPointerLeave = () => {
          if (!pointerDown) {
            pointerSeen = false
            setHovered(null)
            rootTiltX.target = 0
            rootTiltY.target = 0
          }
        }

        const applySlots = () => {
          if (!renderer || !camera) return
          const width = Math.max(1, stage.clientWidth)
          const height = Math.max(1, stage.clientHeight)
          const mobile = sceneBooks.length === 3
          const slots = mobile ? mobileSlots : desktopSlots
          currentSlots = slots
          renderer.setSize(width, height, false)
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.6))
          camera.aspect = width / height
          camera.position.z = mobile ? 10.2 : clamp(9.4 * height / 680, 9.4, 12.4)
          camera.updateProjectionMatrix()
          bookRoot.scale.setScalar(mobile ? clamp(width / 430, 0.76, 1) : clamp(width / 1300, 0.86, 1.08))
          bookRoot.position.y = mobile ? -0.2 : -0.65
          rigs.forEach((rig, index) => {
            const slot = slots[index]
            rig.baseScale = slot.scale
            rig.springs.x.target = slot.position[0]
            rig.springs.y.target = slot.position[1]
            rig.springs.z.target = slot.position[2]
            rig.springs.rx.target = slot.rotation[0]
            rig.springs.ry.target = slot.rotation[1]
            rig.springs.rz.target = slot.rotation[2]
            rig.hit.position.set(slot.position[0], slot.position[1], slot.position[2] + 0.08)
            rig.hit.rotation.set(...slot.rotation)
            rig.hit.scale.setScalar(slot.scale)
          })
        }

        const renderFrame = (time: number) => {
          animationFrame = 0
          if (!renderer || !scene || !camera || cancelled || !running) return
          const delta = Math.min((time - lastTime) / 1000, 0.033)
          lastTime = time
          const seconds = time / 1000

          if (pointerSeen && pointerType === 'mouse') {
            rootTiltY.target = pointer.x * 0.025
            rootTiltX.target = -pointer.y * 0.012
          }

          rigs.forEach((rig) => {
            const active = rig === hovered && pointerType === 'mouse'
            const index = rigs.indexOf(rig)
            const activeIndex = hovered ? rigs.indexOf(hovered) : -1
            const slot = currentSlots[index]
            const springs = rig.springs
            const neighbourDirection = activeIndex >= 0 && index !== activeIndex ? Math.sign(index - activeIndex) : 0
            springs.x.target = slot.position[0] + neighbourDirection * 0.18
            springs.z.target = slot.position[2] + (active ? 0.12 : activeIndex >= 0 ? -0.08 : 0)
            springs.lift.target = active ? 0.5 : 0
            springs.scale.target = rig.baseScale * (active ? 1.065 : 1)
            springs.cover.target = active ? 0.3 + clamp((localPoint.x + 0.97) / 1.94, 0, 1) * 0.2 : 0
            springs.tiltY.target = active ? clamp(localPoint.x * 0.24, -0.2, 0.2) : 0
            springs.tiltX.target = active ? clamp(-localPoint.y * 0.12, -0.13, 0.13) : 0

            rig.float.position.y = Math.sin(seconds * 0.72 + rig.phase) * 0.035
            rig.float.rotation.z = Math.sin(seconds * 0.62 + rig.phase) * 0.005
            const lift = springs.lift.update(delta)
            rig.root.position.set(springs.x.update(delta), springs.y.update(delta), springs.z.update(delta) + lift)
            rig.root.rotation.set(
              springs.rx.update(delta) + springs.tiltX.update(delta),
              springs.ry.update(delta) + springs.tiltY.update(delta),
              springs.rz.update(delta),
            )
            rig.root.scale.setScalar(Math.max(0.001, springs.scale.update(delta)))
            rig.frontPivot.rotation.y = -springs.cover.update(delta)
          })

          bookRoot.rotation.x = rootTiltX.update(delta)
          bookRoot.rotation.y = rootTiltY.update(delta)
          camera.lookAt(0, -0.2, 0)
          renderer.render(scene, camera)
          if (running) animationFrame = requestAnimationFrame(renderFrame)
        }

        const start = () => {
          if (running || cancelled || !visible || document.hidden) return
          running = true
          lastTime = performance.now()
          animationFrame = requestAnimationFrame(renderFrame)
        }

        const stop = () => {
          running = false
          if (animationFrame) cancelAnimationFrame(animationFrame)
          animationFrame = 0
        }

        const onVisibilityChange = () => {
          if (document.hidden) stop()
          else start()
        }

        const onContextLost = (event: Event) => {
          event.preventDefault()
          stop()
          setHovered(null)
          setFallbackReason('webgl-context-lost')
          setPhase('fallback')
        }

        canvas.addEventListener('pointermove', onPointerMove, { passive: false })
        canvas.addEventListener('pointerdown', onPointerDown)
        canvas.addEventListener('pointerleave', onPointerLeave)
        canvas.addEventListener('webglcontextlost', onContextLost)
        window.addEventListener('pointerup', endPointer)
        window.addEventListener('pointercancel', endPointer)
        document.addEventListener('visibilitychange', onVisibilityChange)

        resizeObserver = new ResizeObserver(applySlots)
        resizeObserver.observe(stage)
        intersectionObserver = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting
          if (visible) start()
          else stop()
        }, { rootMargin: '120px 0px' })
        intersectionObserver.observe(stage)

        applySlots()
        renderer.compile(scene, camera)
        renderer.render(scene, camera)
        stage.dataset.activeBook = ''
        stage.dataset.dragging = 'false'
        setPhase('ready')
        start()

        cleanupScene = () => {
          stop()
          resizeObserver?.disconnect()
          intersectionObserver?.disconnect()
          canvas.removeEventListener('pointermove', onPointerMove)
          canvas.removeEventListener('pointerdown', onPointerDown)
          canvas.removeEventListener('pointerleave', onPointerLeave)
          canvas.removeEventListener('webglcontextlost', onContextLost)
          window.removeEventListener('pointerup', endPointer)
          window.removeEventListener('pointercancel', endPointer)
          document.removeEventListener('visibilitychange', onVisibilityChange)
          if (scene && renderer) disposeScene(scene, renderer, textures)
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
          setFallbackReason(['webgl2-unavailable', 'texture-load-failed'].includes(errorMessage)
            ? errorMessage
            : 'initialization-failed')
          setPhase('fallback')
        }
        if (scene && renderer) disposeScene(scene, renderer, [])
      }
    }

    void initialise()
    return () => {
      cancelled = true
      if (animationFrame) cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      cleanupScene?.()
    }
  }, [compact, reducedMotion, sceneBooks])

  const activateFallbackBook = (event: ReactPointerEvent<HTMLElement>, slug: string) => {
    if (phase !== 'fallback' || event.pointerType === 'touch') return
    event.currentTarget.dataset.hovered = 'true'
    if (stageRef.current) stageRef.current.dataset.activeBook = slug
  }

  const moveFallbackBook = (event: ReactPointerEvent<HTMLElement>) => {
    if (phase !== 'fallback' || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1, -1, 1)
    const y = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1, -1, 1)
    event.currentTarget.style.setProperty('--hover-tilt-x', `${(-y * 9).toFixed(2)}deg`)
    event.currentTarget.style.setProperty('--hover-tilt-y', `${(x * 13).toFixed(2)}deg`)
    event.currentTarget.style.setProperty('--cover-open', `${(-24 - (x + 1) * 7).toFixed(2)}deg`)
  }

  const deactivateFallbackBook = (event: ReactPointerEvent<HTMLElement>) => {
    if (phase !== 'fallback' || event.pointerType === 'touch') return
    delete event.currentTarget.dataset.hovered
    event.currentTarget.style.removeProperty('--hover-tilt-x')
    event.currentTarget.style.removeProperty('--hover-tilt-y')
    event.currentTarget.style.removeProperty('--cover-open')
    if (stageRef.current) stageRef.current.dataset.activeBook = ''
  }

  const beginFallbackDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (phase !== 'fallback' || event.pointerType === 'mouse') return
    fallbackDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, horizontal: false }
    event.currentTarget.dataset.dragging = 'true'
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic test events and a few embedded browsers do not own the pointer.
    }
  }

  const moveFallbackDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = fallbackDragRef.current
    if (phase !== 'fallback' || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) drag.horizontal = true
    if (!drag.horizontal) return
    event.preventDefault()
    const tilt = clamp(dx / Math.max(1, event.currentTarget.clientWidth) * 32, -14, 14)
    event.currentTarget.style.setProperty('--fan-drag-y', `${tilt.toFixed(2)}deg`)
  }

  const endFallbackDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = fallbackDragRef.current
    if (phase !== 'fallback' || drag.pointerId !== event.pointerId) return
    fallbackDragRef.current = { pointerId: -1, startX: 0, startY: 0, horizontal: false }
    event.currentTarget.style.setProperty('--fan-drag-y', '0deg')
    event.currentTarget.dataset.dragging = 'false'
  }

  return <figure
    ref={stageRef}
    className={s.heroBookStage}
    data-testid="hero-book-stage"
    data-scene-state={phase}
    data-fallback-reason={fallbackReason}
    data-active-book=""
    data-dragging="false"
    onPointerDown={beginFallbackDrag}
    onPointerMove={moveFallbackDrag}
    onPointerUp={endFallbackDrag}
    onPointerCancel={endFallbackDrag}
    role="img"
    aria-label={`A hovering fan of ${sceneBooks.length === 5 ? 'five' : 'three'} featured books: ${sceneBooks.map((book) => book.title).join(', ')}.`}
  >
    <div className={s.heroBookFallback} data-testid="hero-book-fallback" aria-hidden="true">
      {sceneBooks.map((book) => <span
        className={s.heroFallbackBook}
        data-hero-book-slug={book.slug}
        key={book.slug}
        onPointerEnter={(event) => activateFallbackBook(event, book.slug)}
        onPointerMove={moveFallbackBook}
        onPointerLeave={deactivateFallbackBook}
      >
        <span className={s.heroFallbackBookShell} data-hero-book-visual>
          <span className={s.heroFallbackPages} />
          <span className={s.heroFallbackFront}>
            <img src={book.cover_url} alt="" width="1024" height="1536" fetchPriority="high" decoding="async" />
          </span>
        </span>
      </span>)}
    </div>
    <canvas ref={canvasRef} className={s.heroBookCanvas} aria-hidden="true" />
  </figure>
}
