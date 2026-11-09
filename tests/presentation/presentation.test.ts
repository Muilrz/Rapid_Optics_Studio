import { describe, expect, it, vi } from 'vitest'
import { Box3, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ComponentIdSchema, OpticalSceneSchema, Transform2DSchema, traceOpticalScene } from '../../src/core/optics'
import { buildRamanOpticalContexts } from '../../src/core/raman'
import { COMPONENT_DEFINITIONS, createStudioComponent } from '../../src/project/components/componentDefinitions'
import { DEFAULT_RAMAN_SCENE, DEFAULT_SIMULATION_CONFIGURATION } from '../../src/project/defaults/defaultRamanScene'
import { benchPoint, boardCenter, buildOpticalPresentation, componentPose } from '../../src/features/presentation/model'
import { frameCamera } from '../../src/features/presentation/camera3d'
import { buildBoard, buildComponent } from '../../src/features/presentation/geometry'
import { createSceneObjects, disposeObject } from '../../src/features/presentation/sceneObjects'
import { createBranchingStressScene } from '../fixtures/hardeningScenes'

const derive = (scene = DEFAULT_RAMAN_SCENE) => {
  const trace = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)
  return { trace, contexts: buildRamanOpticalContexts(scene, trace) }
}

const edited = (type: string, patch: object) => OpticalSceneSchema.parse({
  ...DEFAULT_RAMAN_SCENE,
  components: DEFAULT_RAMAN_SCENE.components.map((component) => component.type === type
    ? { ...component, ...patch } : component),
})

describe('Phase 6 optical presentation', () => {
  it('preserves millimeters and the right-handed angle convention', () => {
    const mirror = DEFAULT_RAMAN_SCENE.components[1]
    const component = { ...mirror, transform: Transform2DSchema.parse({ x_mm: 75, y_mm: 40, rotation_deg: 90 }) }
    const pose = componentPose(component)
    expect(pose.position).toEqual([75, 50, -40])
    const tangent = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), pose.yaw)
    expect(tangent.x).toBeCloseTo(0)
    expect(tangent.z).toBeCloseTo(-1)
    expect(boardCenter(DEFAULT_RAMAN_SCENE.breadboards[0])).toEqual([250, 0, 150])
  })

  it('builds the physical board, an aligned instanced grid and all ten optical bodies', () => {
    const board = buildBoard(DEFAULT_RAMAN_SCENE.breadboards[0])
    const holes = board.children.find((child) => child instanceof InstancedMesh)
    expect(holes?.count).toBe(21 * 13)
    const matrix = new Matrix4()
    holes?.getMatrixAt(14, matrix)
    expect(new Vector3().setFromMatrixPosition(matrix).add(board.position).toArray()).toEqual([25, expect.closeTo(0.04), 25])
    disposeObject(board)
    for (const definition of Object.values(COMPONENT_DEFINITIONS)) {
      const component = createStudioComponent(definition.type, ComponentIdSchema.parse('test:' + definition.type), { x: 0, y: 0 })
      const { group, marker } = buildComponent(component)
      expect(group.getObjectByName(definition.type)?.children.length).toBeGreaterThan(0)
      expect(group.children.length).toBeGreaterThan(2)
      expect(marker.visible).toBe(false)
      disposeObject(group)
    }
  })

  it('uses exact Trace endpoints and existing sample/focus and modeled channel data', () => {
    const { trace, contexts } = derive()
    const before = JSON.stringify([DEFAULT_RAMAN_SCENE, trace, contexts])
    const { beams, markers } = buildOpticalPresentation(DEFAULT_RAMAN_SCENE, trace, contexts)
    expect(beams.map(({ id }) => id)).toEqual(trace.segments.map(({ rayId }) => rayId))
    expect(beams.map(({ end }) => end)).toEqual(trace.segments.map(({ end }) => benchPoint(end, 50)))
    expect(beams.some(({ kind, rayleigh }) => kind === 'raman' && rayleigh)).toBe(true)
    const hit = trace.events.find((event) => event.kind === 'component-interaction' && event.componentType === 'sample')
    expect(hit?.kind).toBe('component-interaction')
    if (hit?.kind !== 'component-interaction') throw new Error('Missing sample interaction')
    expect(markers[0].position).toEqual(benchPoint(hit.point, 50))
    expect(markers[0].focus).toBe(contexts[0].focus)
    expect(markers[0].cone?.base).toEqual([325, 50, 200])
    expect(JSON.stringify([DEFAULT_RAMAN_SCENE, trace, contexts])).toBe(before)
  })

  it('preserves branches and separates a blocked excitation from an excited sample without detection', () => {
    const branched = createBranchingStressScene(2)
    const { trace, contexts } = derive(branched)
    const presentation = buildOpticalPresentation(branched, trace, contexts)
    expect(presentation.beams.length).toBeGreaterThan(3)
    expect(presentation.beams.map(({ id }) => id)).toEqual(trace.segments.map(({ rayId }) => rayId))

    const disconnected = edited('mirror', { enabled: false })
    const noExcitation = derive(disconnected)
    const disconnectedView = buildOpticalPresentation(disconnected, noExcitation.trace, noExcitation.contexts)
    expect(disconnectedView.markers).toHaveLength(0)
    expect(disconnectedView.beams.every(({ kind, rayleigh }) => kind === 'excitation' && !rayleigh)).toBe(true)

    const noDetector = edited('spectrometer', { enabled: false })
    const noReturn = derive(noDetector)
    const noReturnView = buildOpticalPresentation(noDetector, noReturn.trace, noReturn.contexts)
    expect(noReturnView.markers).toHaveLength(1)
    expect(noReturnView.beams.some(({ kind }) => kind === 'return-probe')).toBe(true)
    expect(noReturnView.beams.every(({ kind, rayleigh }) => kind !== 'raman' && !rayleigh)).toBe(true)
  })

  it('retains hardware on pose/name/selection changes and disposes replaced or removed resources', () => {
    const objects = createSceneObjects()
    const { trace, contexts } = derive()
    objects.update(DEFAULT_RAMAN_SCENE, trace, contexts)
    const mirror = DEFAULT_RAMAN_SCENE.components[1]
    const entry = objects.components.get(mirror.id)!
    const mesh = entry.group.getObjectByName('mirror')!.children[0] as Mesh
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose')
    const disposeMaterial = vi.spyOn(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, 'dispose')
    const beam = objects.beams.children[0]

    const renamed = edited('mirror', { name: 'Fold mirror' })
    objects.update(renamed, trace, contexts)
    objects.select([mirror.id])
    expect(objects.components.get(mirror.id)).toBe(entry)
    expect(entry.marker.visible).toBe(true)
    expect(objects.beams.children[0]).toBe(beam)

    const moved = edited('mirror', { transform: { x_mm: 225, y_mm: -100, rotation_deg: -30 } })
    const movedResults = derive(moved)
    objects.update(moved, movedResults.trace, movedResults.contexts)
    expect(objects.components.get(mirror.id)).toBe(entry)
    expect(entry.group.position.toArray()).toEqual([225, 50, 100])
    expect(entry.group.rotation.y).toBeCloseTo(-Math.PI / 6)
    expect(objects.beams.getObjectByName(beam.name)).not.toBe(beam)
    expect(disposeGeometry).not.toHaveBeenCalled()

    const deleted = { ...moved, components: moved.components.filter(({ id }) => id !== mirror.id) }
    const deletedResults = derive(deleted)
    objects.update(deleted, deletedResults.trace, deletedResults.contexts)
    expect(objects.components.has(mirror.id)).toBe(false)
    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(disposeMaterial).toHaveBeenCalledOnce()
    objects.dispose()
    expect(objects.root.children).toHaveLength(0)
  })
})

describe('3D camera framing', () => {
  it.each(['Top', 'Front', 'Isometric', 'Reset Camera'] as const)('fits an off-origin board at narrow aspect in %s', (preset) => {
    const bounds = new Box3(new Vector3(-30, -12, -40), new Vector3(470, 85, 260))
    const camera = new PerspectiveCamera(42, 0.5)
    const controls = new OrbitControls(camera)
    frameCamera(camera, controls, bounds, preset)
    camera.updateMatrixWorld()

    expect(controls.target.toArray()).toEqual(bounds.getCenter(new Vector3()).toArray())
    expect(camera.near).toBeGreaterThan(0)
    expect(controls.getDistance()).toBeLessThan(controls.maxDistance)
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera)
          expect(Math.max(...projected.toArray().map(Math.abs))).toBeLessThan(1)
        }
      }
    }
  })
})
