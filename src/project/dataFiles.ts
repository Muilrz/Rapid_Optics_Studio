import { z } from 'zod'
import { RamanMaterialSchema } from '../core/raman'
import { projectDesignShape, validateDesign, SpectrumFileSchema, PROJECT_VERSION, type SpectrumFile } from './projectSchema'
import { checkPlainData, parseJson } from './projectSerialization'
import type { ProcessingPipeline, SpectrumSeries } from '../core/analysis/processing'

const OpticalConfigurationSchema = z.strictObject({
  format: z.literal('rapid-optics-optical-configuration'),
  schemaVersion: z.literal(PROJECT_VERSION),
  ...projectDesignShape,
})
export type OpticalConfiguration = z.infer<typeof OpticalConfigurationSchema>

export function parseOpticalConfiguration(text: string): OpticalConfiguration {
  const input = parseJson(text)
  checkPlainData(input)
  if (typeof input === 'object' && input !== null && 'type' in input && input.type === 'raman-optics-config') {
    throw new Error('Demo layout uses pixel coordinates and omits instrument parameters. Open a versioned Rapid Optics optical configuration.')
  }
  const design = OpticalConfigurationSchema.parse(input)
  validateDesign(design)
  return design
}

export function serializeOpticalConfiguration(design: Omit<OpticalConfiguration, 'format' | 'schemaVersion'>) {
  validateDesign(design)
  return JSON.stringify(OpticalConfigurationSchema.parse({
    ...design, format: 'rapid-optics-optical-configuration', schemaVersion: PROJECT_VERSION,
  }))
}

export function spectrumFile(
  series: SpectrumSeries, source: string, pipeline: ProcessingPipeline | null = null,
): SpectrumFile {
  const { kind, axis, values, unit, saturated, runId } = series
  return SpectrumFileSchema.parse({
    format: 'rapid-optics-spectrum', schemaVersion: PROJECT_VERSION, axisUnit: 'cm^-1',
    kind, axis, values, unit, saturated, runId: runId || null, pipeline, source,
  })
}

export function spectrumCsv(spectrum: SpectrumFile) {
  const { axis, values, ...metadata } = SpectrumFileSchema.parse(spectrum)
  const unit = spectrum.unit === 'counts/bin' ? 'counts_per_bin' : 'dimensionless'
  const csvField = (value: string) => '"' + value.replaceAll('"', '""') + '"'
  const header = 'raman_shift_cm-1,intensity_' + unit + ',rapid_optics_metadata'
  return [header, ...axis.map((shift, i) =>
    shift + ',' + values[i] + ',' + (i === 0 ? csvField(JSON.stringify(metadata)) : ''))].join('\r\n') + '\r\n'
}

const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
function parseNumber(value: string | undefined, row: number) {
  const trimmed = value?.trim() ?? ''
  const number = Number(trimmed)
  if (!numeric.test(trimmed) || !Number.isFinite(number)) throw new Error('CSV row ' + row + ': expected a finite decimal number.')
  return number
}

export function parseSpectrumCsv(text: string): SpectrumFile {
  const [header, ...rows] = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/)
  const unit = /^raman_shift_cm-1,intensity_(counts_per_bin|dimensionless),rapid_optics_metadata$/.exec(header!)
  if (!unit || rows.length > 1_000_000) throw new Error('Unsupported Rapid Optics Spectrum CSV header or size.')
  const axis: number[] = []
  const values: number[] = []
  let metadata: unknown
  for (const [i, row] of rows.entries()) {
    const match = /^([^,]*),([^,]*),(.*)$/.exec(row)
    if (!match) throw new Error('Invalid spectrum CSV row ' + (i + 2))
    axis.push(parseNumber(match[1], i + 2))
    values.push(parseNumber(match[2], i + 2))
    const field = match[3]!
    if (i === 0 && /^"(?:[^"]|"")*"$/.test(field)) metadata = parseJson(field.slice(1, -1).replaceAll('""', '"'))
    else if (i === 0 || field) throw new Error('Expected spectrum metadata only on the first data row.')
  }
  if (!metadata || typeof metadata !== 'object' || 'axis' in metadata || 'values' in metadata) throw new Error('Invalid spectrum metadata.')
  checkPlainData(metadata)
  const parsed = SpectrumFileSchema.parse({ ...metadata, axis, values })
  if ((parsed.unit === 'dimensionless') !== (unit[1] === 'dimensionless')) throw new Error('CSV intensity unit disagrees with its metadata.')
  return parsed
}

export function parseMaterialCsv(text: string, name: string, fluorescence_level: number, id: string) {
  const [header, ...rows] = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/)
  const columns = header?.split(',').map((value) => value.trim()).join(',')
  if (columns !== 'shift_cm-1,relative_intensity,fwhm_cm-1') {
    throw new Error('Required CSV header: shift_cm-1,relative_intensity,fwhm_cm-1')
  }
  if (rows.length > 10_000) throw new Error('Material exceeds the 10,000 peak limit.')
  const peaks = rows.map((line, i) => {
    const row = i + 2
    const cells = line.split(',')
    if (cells.length !== 3) throw new Error('CSV row ' + row + ': expected three columns.')
    const [shift, intensity, fwhm] = cells.map((cell) => parseNumber(cell, row))
    if (Math.abs(shift!) > 1e8 || intensity! < 0 || fwhm! / 2 <= 0) {
      throw new Error('CSV row ' + row + ': shift must be within ±10⁸ cm⁻¹, intensity nonnegative and FWHM positive.')
    }
    return { shift_cm_1: shift!, relative_intensity: intensity!, width_cm_1: fwhm! / 2 }
  })
  return RamanMaterialSchema.parse({ id, name, fluorescence_level, peaks })
}
