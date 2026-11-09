import {
  RamanMaterialDatasetSchema,
  type RamanMaterial,
} from './contracts'
import { createRamanMaterialRegistry } from './registry'

export const BUILT_IN_RAMAN_MATERIALS_VERSION =
  'raman-materials-v1' as const

/**
 * Exact Phase 3A migration of MAT and PEAK_INFO from the read-only Raman
 * Sandbox. Intensities, widths, fluorescence levels, and assignments are not
 * recalibrated or supplemented here.
 */
export const BUILT_IN_RAMAN_MATERIAL_DATASET =
  RamanMaterialDatasetSchema.parse({
    model_version: BUILT_IN_RAMAN_MATERIALS_VERSION,
    provenance: 'reference/raman_sandbox.html: MAT and PEAK_INFO',
    materials: [
      {
        id: 'material:silicon',
        name: 'Silicon',
        fluorescence_level: 0,
        peaks: [
          {
            shift_cm_1: 302,
            relative_intensity: 0.03,
            width_cm_1: 6,
            assignment: '二阶 2TA · 横声学声子倍频 (弱)',
          },
          {
            shift_cm_1: 520.7,
            relative_intensity: 1,
            width_cm_1: 1.5,
            assignment: '一阶光学声子 (F₂g 区中心光学声子) — 硅的特征峰',
          },
          {
            shift_cm_1: 963,
            relative_intensity: 0.05,
            width_cm_1: 12,
            assignment: '二阶 2TO · 横光学声子倍频 (弱)',
          },
        ],
      },
      {
        id: 'material:polystyrene',
        name: 'Polystyrene',
        fluorescence_level: 0.05,
        peaks: [
          {
            shift_cm_1: 620,
            relative_intensity: 0.3,
            width_cm_1: 9,
            assignment: '苯环面内变形 (环 C–C–C 弯曲)',
          },
          {
            shift_cm_1: 1001,
            relative_intensity: 1,
            width_cm_1: 8,
            assignment: '苯环呼吸振动 (对称环伸缩) — PS 标志峰',
          },
          {
            shift_cm_1: 1031,
            relative_intensity: 0.55,
            width_cm_1: 8,
            assignment: '环 C–H 面内弯曲',
          },
          {
            shift_cm_1: 1155,
            relative_intensity: 0.22,
            width_cm_1: 10,
            assignment: 'C–C 伸缩 / C–H 面内弯曲',
          },
          {
            shift_cm_1: 1450,
            relative_intensity: 0.32,
            width_cm_1: 12,
            assignment: 'CH₂ 剪式变形',
          },
          {
            shift_cm_1: 1583,
            relative_intensity: 0.3,
            width_cm_1: 10,
            assignment: '芳环 C=C 伸缩 (环象限伸缩)',
          },
          {
            shift_cm_1: 1602,
            relative_intensity: 0.62,
            width_cm_1: 9,
            assignment: '芳环 C=C 伸缩 (环骨架伸缩)',
          },
          {
            shift_cm_1: 2852,
            relative_intensity: 0.42,
            width_cm_1: 12,
            assignment: 'CH₂ 对称伸缩 (脂肪链)',
          },
          {
            shift_cm_1: 2904,
            relative_intensity: 0.3,
            width_cm_1: 11,
            assignment: 'CH₂ / CH 伸缩',
          },
          {
            shift_cm_1: 3054,
            relative_intensity: 0.46,
            width_cm_1: 10,
            assignment: '芳环 C–H 伸缩',
          },
        ],
      },
      {
        id: 'material:calcite',
        name: 'Calcite',
        fluorescence_level: 0.1,
        peaks: [
          {
            shift_cm_1: 155,
            relative_intensity: 0.25,
            width_cm_1: 6,
            assignment: '晶格振动 (平移 / 外模 Eg)',
          },
          {
            shift_cm_1: 282,
            relative_intensity: 0.5,
            width_cm_1: 6,
            assignment: '晶格振动 (CO₃ 转动 librational Eg)',
          },
          {
            shift_cm_1: 712,
            relative_intensity: 0.3,
            width_cm_1: 5,
            assignment: 'ν₄ · 碳酸根面内弯曲 (Eg)',
          },
          {
            shift_cm_1: 1086,
            relative_intensity: 1,
            width_cm_1: 4,
            assignment: 'ν₁ · 碳酸根对称伸缩 (A₁g) — 方解石主峰',
          },
          {
            shift_cm_1: 1436,
            relative_intensity: 0.1,
            width_cm_1: 10,
            assignment: 'ν₃ · 碳酸根反对称伸缩 (Raman 弱)',
          },
        ],
      },
    ],
  })

export const BUILT_IN_RAMAN_MATERIALS =
  BUILT_IN_RAMAN_MATERIAL_DATASET.materials

export const BUILT_IN_RAMAN_MATERIAL_REGISTRY =
  createRamanMaterialRegistry(BUILT_IN_RAMAN_MATERIALS)

export const findBuiltInRamanMaterial = (
  materialId: string,
): RamanMaterial | undefined =>
  BUILT_IN_RAMAN_MATERIAL_REGISTRY.find(materialId)

export const resolveBuiltInRamanMaterial = (
  materialId: string,
): RamanMaterial => BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve(materialId)

/** Project materials extend the built-in reference registry without mutating it. */
export const createProjectRamanMaterialRegistry = (custom: readonly RamanMaterial[] = []) =>
  custom.length ? createRamanMaterialRegistry([...BUILT_IN_RAMAN_MATERIALS, ...custom]) : BUILT_IN_RAMAN_MATERIAL_REGISTRY
