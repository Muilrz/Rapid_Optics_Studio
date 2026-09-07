import type { MaterialId } from '../optics'
import {
  RamanMaterialIdSchema,
  RamanMaterialSchema,
  type RamanMaterial,
} from './contracts'

export class UnknownRamanMaterialError extends Error {
  readonly materialId: MaterialId

  constructor(materialId: MaterialId) {
    super(`Unknown Raman material ID: ${materialId}`)
    this.name = 'UnknownRamanMaterialError'
    this.materialId = materialId
  }
}

export interface RamanMaterialRegistry {
  readonly materials: readonly RamanMaterial[]
  readonly ids: readonly MaterialId[]
  find(materialId: string): RamanMaterial | undefined
  resolve(materialId: string): RamanMaterial
}

/** Validates and snapshots definitions before exposing deterministic lookup. */
export const createRamanMaterialRegistry = (
  definitions: readonly unknown[],
): RamanMaterialRegistry => {
  const materials = definitions.map((definition) =>
    RamanMaterialSchema.parse(definition),
  )
  const byId = new Map<MaterialId, RamanMaterial>()

  for (const material of materials) {
    if (byId.has(material.id)) {
      throw new RangeError(`Duplicate Raman material ID: ${material.id}`)
    }
    byId.set(material.id, material)
  }

  const frozenMaterials = Object.freeze([...materials])
  const ids = Object.freeze(frozenMaterials.map(({ id }) => id))

  return Object.freeze({
    materials: frozenMaterials,
    ids,
    find: (materialId: string) => {
      const parsed = RamanMaterialIdSchema.safeParse(materialId)
      return parsed.success ? byId.get(parsed.data) : undefined
    },
    resolve: (materialId: string) => {
      const parsedId = RamanMaterialIdSchema.parse(materialId)
      const material = byId.get(parsedId)
      if (!material) {
        throw new UnknownRamanMaterialError(parsedId)
      }
      return material
    },
  })
}
