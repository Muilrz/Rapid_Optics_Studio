import {
  BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  Path, Shape, TorusGeometry, type BufferGeometry,
} from 'three'
import type { Breadboard, OpticalComponent, OpticalComponentType } from '../../core/optics'
import { getExcitationWavelengthPresentation } from '../studio/wavelengthPresentation'
import { boardCenter } from './model'

const metal = (color: number) => new MeshStandardMaterial({ color, roughness: 0.31, metalness: 0.78 })
const body = (geometry: BufferGeometry, color: number) => new Mesh(geometry, metal(color))

export function buildBoard(board: Breadboard) {
  const group = new Group()
  group.position.set(...boardCenter(board))
  const plate = body(new BoxGeometry(board.width_mm, 12, board.height_mm), 0x475769)
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
    new MeshBasicMaterial({ color: 0x1a2635 }),
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

const glass = (color: number, opacity = 0.62) =>
  new MeshPhysicalMaterial({
    color, metalness: 0.06, roughness: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.09,
    transparent: true, opacity, depthWrite: false,
    side: DoubleSide,
  })

function opticalDisc(radius: number, depth: number, color: number, opacity = 0.68) {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, depth, 48), glass(color, opacity))
  mesh.rotation.x = Math.PI / 2
  return mesh
}

function facingRim(radius: number, depth: number, color = 0x9facbc) {
  const ring = body(new CylinderGeometry(radius, radius, depth, 48, 1, true), color)
  ring.rotation.x = Math.PI / 2
  ring.material.side = DoubleSide
  return ring
}

const bodies = {
  laser: ({ radius, depth, component }: Dimensions) => {
    const housing = body(new BoxGeometry(depth, radius * 1.9, radius * 1.9), 0x465466)
    housing.position.x = -depth / 2
    const cover = body(new BoxGeometry(depth * .72, radius * .13, radius * 1.5), 0x8291a3)
    cover.position.set(-depth * .52, radius * .97, 0)
    const collar = body(new CylinderGeometry(radius * .43, radius * .43, depth * .23, 40), 0x8b9baa)
    collar.rotation.z = Math.PI / 2
    collar.position.x = -depth * .03
    const bezel = body(new CylinderGeometry(radius * .32, radius * .32, depth * .06, 40), 0x1a2635)
    bezel.rotation.z = Math.PI / 2
    bezel.position.x = depth * .095
    const wavelength = component.type === 'laser' ? component.parameters.wavelength_nm : 532
    const port = new Mesh(
      new CircleGeometry(radius * .225, 40),
      new MeshBasicMaterial({ color: getExcitationWavelengthPresentation(wavelength).color }),
    )
    port.rotation.y = Math.PI / 2
    port.position.x = depth * .14
    return [housing, cover, collar, bezel, port]
  },
  mirror: ({ radius, depth }: Dimensions) => {
    const backing = axialDisc(radius, depth, 0x344456)
    const face = axialDisc(radius * .96, Math.max(.16, depth * .08), 0xc1d7e5)
    face.position.z = depth * .5 + .08
    const rim = facingRim(radius * 1.04, Math.max(.6, depth * .35), 0x9eb0be)
    const edge = new Mesh(new TorusGeometry(radius * .96, Math.max(.45, radius * .045), 8, 48), metal(0xb6c8d7))
    edge.position.z = depth * .5 + .15
    return [backing, face, rim, edge]
  },
  dichroic: ({ radius, depth }: Dimensions) => {
    const mount = facingRim(radius * 1.07, depth, 0x566d7f)
    const coating = opticalDisc(radius * .97, Math.max(.2, depth * .15), 0x73c5e5, .72)
    const bezel = new Mesh(new TorusGeometry(radius, Math.max(.55, radius * .06), 8, 48), metal(0xb6c4cc))
    bezel.position.z = depth * .3
    return [mount, coating, bezel]
  },
  filter: ({ radius, depth }: Dimensions) => {
    const frame = facingRim(radius * 1.06, depth, 0x586576)
    const optic = opticalDisc(radius * .95, Math.max(.2, depth * .2), 0xc78ba5, .73)
    const rim = new Mesh(new TorusGeometry(radius, Math.max(.5, radius * .07), 8, 48), metal(0xadb7c2))
    rim.position.z = depth * .24
    return [frame, optic, rim]
  },
  objective: ({ radius, depth }: Dimensions) => {
    const barrel = facingRim(radius, depth, 0x354151)
    const lens = opticalDisc(radius * .9, Math.max(.25, depth * .1), 0x9ad9ee, .72)
    lens.position.z = depth * .3
    const front = facingRim(radius * 1.1, Math.max(.6, depth * .22), 0xa6b6c4)
    front.position.z = depth * .4
    const back = facingRim(radius * 1.07, Math.max(.6, depth * .18), 0x8191a2)
    back.position.z = -depth * .4
    const focusBand = facingRim(radius * 1.03, Math.max(.6, depth * .13), 0x657688)
    focusBand.position.z = -depth * .12
    return [barrel, lens, front, back, focusBand]
  },
  sample: ({ radius, depth }: Dimensions) => {
    const tray = body(new CylinderGeometry(radius * 1.06, radius * 1.06, Math.max(1, depth * .18), 40), 0x586675)
    tray.position.y = -depth * .43
    const vial = new Mesh(new CylinderGeometry(radius * .87, radius * .87, depth, 40),
      glass(0x8ed0e5, .4))
    const specimen = body(new CylinderGeometry(radius * .69, radius * .69, depth * .26, 40), 0xb4a5a1)
    specimen.position.y = -depth * .28
    const rim = body(new CylinderGeometry(radius * .93, radius * .93, Math.max(.7, depth * .1), 40), 0x9cabb8)
    rim.position.y = depth * .5
    return [tray, vial, specimen, rim]
  },
  spectrometer: ({ radius, depth }: Dimensions) => {
    const housing = body(new BoxGeometry(radius * 2, radius * 1.9, depth), 0x36485c)
    housing.position.z = depth / 2
    const face = body(new BoxGeometry(radius * 1.86, radius * 1.7, Math.max(.6, depth * .06)), 0x617385)
    face.position.z = -depth * .02
    const slitFrame = body(new BoxGeometry(radius * .27, radius * 1.16, Math.max(.4, depth * .09)), 0x1e2b39)
    slitFrame.position.z = -depth * .075
    const slit = new Mesh(new BoxGeometry(radius * .045, radius * .8, .14),
      new MeshBasicMaterial({ color: 0x9bd6f0 }))
    slit.position.z = -depth * .13
    const readout = body(new BoxGeometry(radius * .56, radius * .24, .2), 0x8ca7bf)
    readout.position.set(radius * .49, radius * .55, -depth * .06)
    return [housing, face, slitFrame, slit, readout]
  },
  prism: ({ radius, depth }: Dimensions) => {
    const triangle = new Shape()
    triangle.moveTo(-radius, 0)
    triangle.lineTo(radius, 0)
    triangle.lineTo(0, depth)
    triangle.closePath()
    const geometry = new ExtrudeGeometry(triangle, { depth: radius * 2, bevelEnabled: true,
      bevelSize: Math.min(.5, radius * .03), bevelThickness: Math.min(.5, radius * .03), bevelSegments: 2 })
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, radius, 0)
    const optic = new Mesh(geometry, glass(0x93cfef, .59))
    const base = body(new BoxGeometry(radius * 1.9, Math.max(1, depth * .16), radius * 1.5), 0x506174)
    base.position.y = -radius * .95
    return [optic, base]
  },
  'beam-splitter': ({ radius, depth }: Dimensions) => {
    const cube = new Mesh(new BoxGeometry(radius * 1.85, radius * 1.85, depth),
      glass(0x96caeb, .39))
    const interfacePlate = opticalDisc(radius * .81, Math.max(.2, depth * .08), 0x83c4e9, .71)
    const topRail = body(new BoxGeometry(radius * 2.04, radius * .16, depth * 1.04), 0x8596a5)
    topRail.position.y = radius * .94
    const bottomRail = body(new BoxGeometry(radius * 2.04, radius * .16, depth * 1.04), 0x546779)
    bottomRail.position.y = -radius * .94
    return [cube, interfacePlate, topRail, bottomRail]
  },
  pinhole: ({ radius, depth }: Dimensions) => {
    const plate = new Shape()
    plate.absarc(0, 0, radius + Math.max(2, radius * .35), 0, Math.PI * 2, false)
    const hole = new Path()
    hole.absarc(0, 0, radius, 0, Math.PI * 2, true)
    plate.holes.push(hole)
    const geometry = new ExtrudeGeometry(plate, { depth, bevelEnabled: false, curveSegments: 40 })
    geometry.translate(0, 0, -depth / 2)
    const aperture = body(geometry, 0x586c7f)
    const rim = new Mesh(new TorusGeometry(radius + Math.max(1, radius * .12),
      Math.max(.5, radius * .055), 8, 48), metal(0xaab9c5))
    rim.position.z = depth * .5 + .15
    return [aperture, rim]
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
    const post = body(new CylinderGeometry(3, 3, postTop, 24), 0x9aa8b8)
    post.position.y = postTop / 2 - height
    const foot = body(new CylinderGeometry(5.5, 7.4, Math.min(postTop, 4), 24), 0x647589)
    foot.position.y = Math.min(postTop, 4) / 2 - height
    group.add(post, foot)
  }
  const gap = height - extent - postTop
  if (holder && height > extent) {
    const gripHeight = Math.max(2, gap)
    const mount = body(new BoxGeometry(8, gripHeight, 8), 0x8492a2)
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
