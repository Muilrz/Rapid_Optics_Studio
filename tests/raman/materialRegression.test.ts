import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_RAMAN_MATERIAL_DATASET,
  BUILT_IN_RAMAN_MATERIALS,
  BUILT_IN_RAMAN_MATERIALS_VERSION,
  RamanMaterialDatasetSchema,
} from '../../src/core/raman'

const referencePeakData = {
  'material:silicon': [
    [302, 0.03, 6],
    [520.7, 1, 1.5],
    [963, 0.05, 12],
  ],
  'material:polystyrene': [
    [620, 0.3, 9],
    [1001, 1, 8],
    [1031, 0.55, 8],
    [1155, 0.22, 10],
    [1450, 0.32, 12],
    [1583, 0.3, 10],
    [1602, 0.62, 9],
    [2852, 0.42, 12],
    [2904, 0.3, 11],
    [3054, 0.46, 10],
  ],
  'material:calcite': [
    [155, 0.25, 6],
    [282, 0.5, 6],
    [712, 0.3, 5],
    [1086, 1, 4],
    [1436, 0.1, 10],
  ],
} as const

const referenceAssignments = {
  'material:silicon': [
    '二阶 2TA · 横声学声子倍频 (弱)',
    '一阶光学声子 (F₂g 区中心光学声子) — 硅的特征峰',
    '二阶 2TO · 横光学声子倍频 (弱)',
  ],
  'material:polystyrene': [
    '苯环面内变形 (环 C–C–C 弯曲)',
    '苯环呼吸振动 (对称环伸缩) — PS 标志峰',
    '环 C–H 面内弯曲',
    'C–C 伸缩 / C–H 面内弯曲',
    'CH₂ 剪式变形',
    '芳环 C=C 伸缩 (环象限伸缩)',
    '芳环 C=C 伸缩 (环骨架伸缩)',
    'CH₂ 对称伸缩 (脂肪链)',
    'CH₂ / CH 伸缩',
    '芳环 C–H 伸缩',
  ],
  'material:calcite': [
    '晶格振动 (平移 / 外模 Eg)',
    '晶格振动 (CO₃ 转动 librational Eg)',
    'ν₄ · 碳酸根面内弯曲 (Eg)',
    'ν₁ · 碳酸根对称伸缩 (A₁g) — 方解石主峰',
    'ν₃ · 碳酸根反对称伸缩 (Raman 弱)',
  ],
} as const

describe('built-in Raman material regression', () => {
  it('validates the versioned dataset with explicit reference provenance', () => {
    expect(
      RamanMaterialDatasetSchema.parse(BUILT_IN_RAMAN_MATERIAL_DATASET),
    ).toStrictEqual(BUILT_IN_RAMAN_MATERIAL_DATASET)
    expect(BUILT_IN_RAMAN_MATERIAL_DATASET.model_version).toBe(
      BUILT_IN_RAMAN_MATERIALS_VERSION,
    )
    expect(BUILT_IN_RAMAN_MATERIAL_DATASET.provenance).toBe(
      'reference/raman_sandbox.html: MAT and PEAK_INFO',
    )
  })

  it('contains exactly Silicon, Polystyrene, and Calcite in stable ID order', () => {
    expect(
      BUILT_IN_RAMAN_MATERIALS.map(({ id, name, fluorescence_level }) => ({
        id,
        name,
        fluorescence_level,
      })),
    ).toEqual([
      {
        id: 'material:silicon',
        name: 'Silicon',
        fluorescence_level: 0,
      },
      {
        id: 'material:polystyrene',
        name: 'Polystyrene',
        fluorescence_level: 0.05,
      },
      {
        id: 'material:calcite',
        name: 'Calcite',
        fluorescence_level: 0.1,
      },
    ])
  })

  it.each(BUILT_IN_RAMAN_MATERIALS)(
    'preserves the authoritative $name peak triples',
    (material) => {
      expect(
        material.peaks.map((peak) => [
          peak.shift_cm_1,
          peak.relative_intensity,
          peak.width_cm_1,
        ]),
      ).toEqual(
        referencePeakData[material.id as keyof typeof referencePeakData],
      )
    },
  )

  it.each(BUILT_IN_RAMAN_MATERIALS)(
    'preserves the authoritative $name peak assignments',
    (material) => {
      expect(material.peaks.map(({ assignment }) => assignment)).toEqual(
        referenceAssignments[
          material.id as keyof typeof referenceAssignments
        ],
      )
    },
  )
})
