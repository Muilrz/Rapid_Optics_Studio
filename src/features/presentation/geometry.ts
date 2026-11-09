import {
  BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Path, Shape, type BufferGeometry,
} from 'three'
import type { Breadboard, OpticalComponent, OpticalComponentType } from '../../core/optics'
import { getExcitationWavelengthPresentation } from '../studio/wavelengthPresentation'
import { boardCenter } from './model'

const metal = (color: number) => new MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.35 })
const body = (geometry: BufferGeometry, color: number) => new Mesh(geometry, metal(color))

export function buildBoard(board: Breadboard) {
  const group = new Group()
  group.position.set(...boardCenter(board))
  const plate = body(new BoxGeometry(board.width_mm, 12, board.height_mm), 0x344553)
  plate.position.y = -6
  group.add(plate)

  const pitch = board.hole_pitch_mm
  const columns = Math.floor(board.width_mm / pitch + 1e-9) + 1
  const rows = Math.floor(board.height_mm / pitch + 1e-9) + 1
  // Limit each axis so even extremely dense imported grids have bounded cost.
  const stepX = Math.max(1, Math.ceil(columns / 100))
  const stepZ = Math.max(1, Math.ceil(rows / 100))
  const countX = Math.ceil(columns / stepX)
  const countZ = Math.ceil(rows / stepZ)
  if (!Number.isFinite(countX * countZ)) return group
  const radius = Math.min(2, pitch * 0.12)
  const holes = new InstancedMesh(
    new CircleGeometry(radius, 10),
    new MeshBasicMaterial({ color: 0x101821 }),
    countX * countZ,
  )
  const matrix = new Matrix4().makeRotationX(-Math.PI / 2)
  let index = 0
  for (let x = 0; x < countX; x++) {
    for (let z = 0; z < countZ; z++) {
      const centerX = x * stepX * pitch - board.width_mm / 2
      const centerZ = z * stepZ * pitch - board.height_mm / 2
      matrix.setPosition(centerX, 0.04, centerZ)
      holes.setMatrixAt(index++, matrix)
    }
  }
  group.add(holes)
  return group
}

interface Dimensions {
  radius: number
  depth: number
  component: OpticalComponent
}

function axialDisc(radius: number, depth: number, color: number, open = false) {
  const disc = body(new CylinderGeometry(radius, radius, depth, 32, 1, open), color)
  disc.rotation.x = Math.PI / 2
  return disc
}

const bodies = {
  laser: ({ radius, depth, component }: Dimensions) => {
    const housing = body(new BoxGeometry(depth, radius * 2, radius * 2), 0x354861)
    housing.position.x = -depth / 2
    const wavelength = component.type === 'laser' ? component.parameters.wavelength_nm : 532
    const port = new Mesh(
      new CircleGeometry(radius * 0.45, 24),
      new MeshBasicMaterial({ color: getExcitationWavelengthPresentation(wavelength).color }),
    )
    port.rotation.y = Math.PI / 2
    port.position.x = 0.05
    return [housing, port]
  },
  mirror: ({ radius, depth }: Dimensions) => [axialDisc(radius, depth, 0xc4d2dd)],
  dichroic: ({ radius, depth }: Dimensions) => [axialDisc(radius, depth, 0x62b8ce)],
  filter: ({ radius, depth }: Dimensions) => [axialDisc(radius, depth, 0x944866)],
  objective: ({ radius, depth }: Dimensions) => {
    const barrel = axialDisc(radius, depth, 0x3d4d60, true)
    barrel.material.side = DoubleSide
    const lens = axialDisc(radius * 0.93, depth * 0.12, 0x85c4da)
    const rim = axialDisc(radius * 1.08, depth * 0.2, 0xb1a386, true)
    rim.material.side = DoubleSide
    rim.position.z = -depth * 0.4
    return [barrel, lens, rim]
  },
  sample: ({ radius, depth }: Dimensions) => {
    const vial = new Mesh(
      new CylinderGeometry(radius, radius, depth, 24),
      new MeshStandardMaterial({ color: 0x83bbc9, transparent: true, opacity: 0.44, depthWrite: false }),
    )
    return [vial]
  },
  spectrometer: ({ radius, depth }: Dimensions) => {
    const housing = body(new BoxGeometry(radius * 2, radius * 2, depth), 0x314769)
    housing.position.z = depth / 2
    const slit = new Mesh(
      new BoxGeometry(radius * 0.16, radius * 1.35, 0.12),
      new MeshBasicMaterial({ color: 0x9fe2ff }),
    )
    return [housing, slit]
  },
  prism: ({ radius, depth }: Dimensions) => {
    const triangle = new Shape()
    triangle.moveTo(-radius, 0)
    triangle.lineTo(radius, 0)
    triangle.lineTo(0, depth)
    triangle.closePath()
    const geometry = new ExtrudeGeometry(triangle, { depth: radius * 2, bevelEnabled: false })
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, radius, 0)
    return [new Mesh(geometry, new MeshStandardMaterial({
      color: 0x90b7db, transparent: true, opacity: 0.66, depthWrite: false,
    }))]
  },
  'beam-splitter': ({ radius, depth }: Dimensions) => {
    const block = new Mesh(
      new BoxGeometry(radius * 2, radius * 2, depth),
      new MeshStandardMaterial({ color: 0xa9c8ed, transparent: true, opacity: 0.36, depthWrite: false }),
    )
    const interfacePlate = body(new BoxGeometry(radius * 2, radius * 2, depth * 0.08), 0x84a9bf)
    return [block, interfacePlate]
  },
  pinhole: ({ radius, depth }: Dimensions) => {
    const plate = new Shape()
    plate.absarc(0, 0, radius + Math.max(2, radius * 0.35), 0, Math.PI * 2, false)
    const hole = new Path()
    hole.absarc(0, 0, radius, 0, Math.PI * 2, true)
    plate.holes.push(hole)
    const geometry = new ExtrudeGeometry(plate, { depth, bevelEnabled: false, curveSegments: 24 })
    geometry.translate(0, 0, -depth / 2)
    return [body(geometry, 0x596470)]
  },
} satisfies Record<OpticalComponentType, (dimensions: Dimensions) => Mesh[]>

export function buildComponent(component: OpticalComponent) {
  const group = new Group()
  const radius = component.geometry.aperture_mm / 2
  const { visual_depth_mm: depth, beam_height_mm: height, post_height_mm, holder } = component.visualization
  const meshes = bodies[component.type]({ radius, depth, component })
  const optics = new Group()
  optics.name = component.type
  optics.add(...meshes)
  group.add(optics)
  const extent = component.type === 'sample' ? depth / 2 :
    component.type === 'pinhole' ? radius + Math.max(2, radius * 0.35) : radius
  const postTop = Math.min(post_height_mm, Math.max(0, height - extent))
  if (postTop > 0) {
    const post = body(new CylinderGeometry(3, 3, postTop, 16), 0x677785)
    post.position.y = postTop / 2 - height
    const foot = body(new CylinderGeometry(5, 7, Math.min(postTop, 4), 16), 0x495565)
    foot.position.y = Math.min(postTop, 4) / 2 - height
    group.add(post, foot)
  }
  const gap = height - extent - postTop
  if (holder && height > extent) {
    const gripHeight = Math.max(2, gap)
    const mount = body(new BoxGeometry(8, gripHeight, 8), 0x536577)
    mount.position.y = postTop + gripHeight / 2 - height
    if (component.type === 'laser') mount.position.x = -depth / 2
    group.add(mount)
  }
  if (!component.enabled) {
    for (const mesh of meshes) {
      mesh.material.transparent = true
      mesh.material.opacity *= 0.32
      mesh.material.depthWrite = false
    }
  }
  const marker = new Mesh(new BoxGeometry(radius * 2 + 10, extent * 2 + 10, depth + 10),
    new MeshBasicMaterial({ color: 0xffd57a, wireframe: true, transparent: true, opacity: 0.6 }))
  marker.visible = false
  group.add(marker)
  return { group, marker, labelHeight: extent + 11 }
}
