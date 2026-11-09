import {
  AmbientLight, Box3, Color, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { OpticalScene } from '../../core/optics'
import { studioStore } from '../../store/studioStore'
import { frameCamera, type CameraPreset } from './camera3d'
import { createSceneObjects } from './sceneObjects'

const fallbackBounds = new Box3(new Vector3(-250, -12, -150), new Vector3(250, 50, 150))

interface ViewerStatus {
  message: string
  retry: boolean
}

export function mountViewer(host: HTMLDivElement, report: (status: ViewerStatus | null) => void) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', 'Rendered 3D optical bench')
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false })
  if (!context) throw new Error('WebGL 2 is unavailable. Check browser graphics settings and retry.')

  const renderer = new WebGLRenderer({ canvas, context })
  const scene = new Scene()
  scene.background = new Color(0x0a1017)
  const camera = new PerspectiveCamera(42)
  const controls = new OrbitControls(camera, canvas)
  controls.maxPolarAngle = Math.PI / 2 - 0.015
  controls.enableDamping = false
  const objects = createSceneObjects()
  const light = new DirectionalLight(0xfff4e7, 2.4)
  light.position.set(180, 400, 220)
  scene.add(new AmbientLight(0xc6dcff, 1.6), light, objects.root)

  const labelLayer = document.createElement('div')
  labelLayer.className = 'presentation-labels'
  host.append(canvas, labelLayer)
  const labels = new Map<string, HTMLSpanElement>()
  const projected = new Vector3()
  let raf = 0
  let width = 0
  let height = 0
  let pixelRatio = 0
  let intersecting = true
  let lost = false
  let disposed = false
  let failed = false
  let showLabels = true
  let preset: CameraPreset | null = 'Isometric'

  function syncLabels(bench: OpticalScene) {
    const ids = new Set<string>()
    for (const component of bench.components) {
      ids.add(component.id)
      let label = labels.get(component.id)
      if (!label) {
        label = document.createElement('span')
        label.dataset.componentId = component.id
        labels.set(component.id, label)
        labelLayer.append(label)
      }
      const text = component.enabled ? component.name : component.name + ' (disabled)'
      if (label.textContent !== text) label.textContent = text
    }
    for (const [id, label] of labels) {
      if (ids.has(id)) continue
      label.remove()
      labels.delete(id)
    }
  }

  function render() {
    raf = 0
    if (!canRender()) return
    try {
      renderer.render(scene, camera)
      if (!showLabels) return
      for (const [id, label] of labels) {
        const entry = objects.components.get(id)
        if (!entry) continue
        projected.setFromMatrixPosition(entry.group.matrixWorld)
        projected.y += entry.labelHeight
        projected.project(camera)
        const visible = Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 &&
          projected.z >= -1 && projected.z <= 1
        label.hidden = !visible
        if (visible) {
          const x = (projected.x + 1) * width / 2
          const y = (1 - projected.y) * height / 2
          label.style.transform = 'translate(' + x + 'px, ' + y + 'px) translate(-50%, -100%)'
        }
      }
    } catch {
      fail('3D rendering stopped. Retry to restart the viewer.')
    }
  }

  function canRender() {
    return !disposed && !lost && !failed && intersecting && !document.hidden && width > 0 && height > 0
  }

  function invalidate() {
    if (!raf && canRender()) raf = requestAnimationFrame(render)
  }

  function cancelFrame() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  function applyPreset(view: CameraPreset) {
    preset = view
    const bounds = objects.bounds()
    frameCamera(camera, controls, bounds.isEmpty() ? fallbackBounds : bounds, view)
    invalidate()
  }

  function resize() {
    if (disposed || failed || lost) return
    const nextWidth = host.clientWidth
    const nextHeight = host.clientHeight
    if (!nextWidth || !nextHeight) {
      width = height = 0
      cancelFrame()
      return
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75)
    if (nextWidth === width && nextHeight === height && ratio === pixelRatio) return
    width = nextWidth
    height = nextHeight
    pixelRatio = ratio
    try {
      renderer.setPixelRatio(ratio)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      if (preset) applyPreset(preset)
      else camera.updateProjectionMatrix()
      invalidate()
    } catch {
      fail('3D viewport could not resize. Retry to restart the viewer.')
    }
  }

  function fail(message: string) {
    failed = true
    cancelFrame()
    report({ message, retry: true })
  }

  function onLost(event: Event) {
    event.preventDefault()
    lost = true
    cancelFrame()
    report({ message: 'The WebGL context was lost. Waiting for recovery. You can also retry.', retry: true })
  }

  function onRestored() {
    lost = false
    if (failed) return
    report(null)
    resize()
    invalidate()
  }

  function onVisibility() {
    if (document.hidden) cancelFrame()
    else {
      resize()
      invalidate()
    }
  }

  function onControlStart() {
    preset = null
  }

  function onControlChange() {
    if (controls.target.y < 0) {
      camera.position.y -= controls.target.y
      controls.target.y = 0
      camera.updateMatrixWorld()
    }
    invalidate()
  }

  const unsubscribe = studioStore.subscribe((next, previous) => {
    if (failed || disposed) return
    try {
      const sceneChanged = next.authoritative.scene !== previous.authoritative.scene
      const presentationChanged = sceneChanged || next.derived.trace !== previous.derived.trace ||
        next.derived.ramanContexts !== previous.derived.ramanContexts
      const selectionChanged = next.editor.selectedComponentIds !== previous.editor.selectedComponentIds
      if (presentationChanged) {
        objects.update(next.authoritative.scene, next.derived.trace, next.derived.ramanContexts)
        if (sceneChanged) syncLabels(next.authoritative.scene)
      }
      if (presentationChanged || selectionChanged) {
        objects.select(next.editor.selectedComponentIds)
        invalidate()
      }
    } catch {
      fail('The 3D scene could not update. Retry to rebuild the viewer.')
    }
  })
  const resizeObserver = new ResizeObserver(resize)
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting
    if (intersecting) invalidate()
    else cancelFrame()
  })

  function dispose() {
    if (disposed) return
    disposed = true
    cancelFrame()
    unsubscribe()
    resizeObserver.disconnect()
    visibilityObserver.disconnect()
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resize', resize)
    controls.removeEventListener('start', onControlStart)
    controls.removeEventListener('change', onControlChange)
    controls.dispose()
    objects.dispose()
    labels.clear()
    renderer.dispose()
    renderer.forceContextLoss()
    host.replaceChildren()
  }

  try {
    const initial = studioStore.getState()
    objects.update(initial.authoritative.scene, initial.derived.trace, initial.derived.ramanContexts)
    objects.select(initial.editor.selectedComponentIds)
    syncLabels(initial.authoritative.scene)
    controls.addEventListener('start', onControlStart)
    controls.addEventListener('change', onControlChange)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', resize)
    resizeObserver.observe(host)
    visibilityObserver.observe(host)
    resize()
  } catch (error) {
    dispose()
    throw error
  }

  return {
    dispose,
    preset(view: CameraPreset) {
      if (!failed && !lost) applyPreset(view)
    },
    visibility(beam: boolean, cone: boolean, label: boolean) {
      objects.beams.visible = beam
      objects.cones.visible = cone
      showLabels = label
      labelLayer.hidden = !label
      invalidate()
    },
  }
}
