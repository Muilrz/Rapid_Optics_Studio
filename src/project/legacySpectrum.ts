import { z } from 'zod'
import { DemoSpectrumMetadataSchema, SpectrumFileSchema, PROJECT_VERSION } from './projectSchema'
import { checkPlainData, parseJson } from './projectSerialization'

// The Demo exporter wrote SIG.exp, rounded to one decimal, even during acquisition.
const DemoSpectrumSchema = DemoSpectrumMetadataSchema.extend({
  spectrum: z.strictObject({ shift: z.array(z.number()), counts: z.array(z.number().nonnegative()) }),
})

export function parseSpectrumJson(text: string) {
  const input = parseJson(text)
  checkPlainData(input)
  if (typeof input !== 'object' || input === null || !('type' in input) || input.type !== 'raman-spectrum') {
    return SpectrumFileSchema.parse(input)
  }
  const legacy = DemoSpectrumSchema.parse(input)
  const { spectrum: { shift, counts }, ...legacyMetadata } = legacy
  const { n, smin, smax } = legacy.window
  if (shift.length !== n || counts.length !== n || smin !== shift[0] || smax !== shift.at(-1)) {
    throw new Error('Demo spectrum samples disagree with its declared window.')
  }
  return SpectrumFileSchema.parse({
    format: 'rapid-optics-spectrum', schemaVersion: PROJECT_VERSION,
    kind: 'expected', axisUnit: 'cm^-1', unit: 'counts/bin', saturated: null,
    axis: shift, values: counts, runId: null, pipeline: null, legacyMetadata,
    source: 'Demo v1 rounded Expected · ' + legacy.label + ' · ' + legacy.exportedAt,
  })
}
