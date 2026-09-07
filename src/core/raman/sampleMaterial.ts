import type { SampleComponent } from '../optics'
import { BUILT_IN_RAMAN_MATERIAL_REGISTRY } from './builtinMaterials'
import type { RamanMaterial } from './contracts'
import type { RamanMaterialRegistry } from './registry'

/** Resolves the existing generic Sample material reference at the Raman edge. */
export const resolveSampleMaterial = (
  sample: Pick<SampleComponent, 'parameters'>,
  registry: RamanMaterialRegistry = BUILT_IN_RAMAN_MATERIAL_REGISTRY,
): RamanMaterial => registry.resolve(sample.parameters.material_id)
