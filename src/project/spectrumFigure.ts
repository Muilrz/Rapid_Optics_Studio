import type { SpectrumFile } from './projectSchema'

const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export function spectrumSvg(spectrum: SpectrumFile) {
  const width = 960
  const height = 500
  const left = 100
  const top = 72
  const right = 920
  const bottom = 405
  const first = spectrum.axis[0]!
  const last = spectrum.axis.at(-1)!
  let low = 0
  let high = 0
  for (const value of spectrum.values) {
    low = Math.min(low, value)
    high = Math.max(high, value)
  }
  if (low === high) high = 1
  const scale = Math.max(Math.abs(low), Math.abs(high))
  const path = spectrum.values.map((value, i) => {
    const x = left + (spectrum.axis[i]! - first) / (last - first) * (right - left)
    const y = bottom - (value / scale - low / scale) / (high / scale - low / scale) * (bottom - top)
    return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2)
  }).join(' ')
  const label = { expected: 'Expected', raw: 'Raw Acquisition', processed: 'Processed' }[spectrum.kind]
  const ticks = Array.from({ length: 6 }, (_, i) => {
    const t = i / 5
    const x = left + t * (right - left)
    const y = bottom - t * (bottom - top)
    const intensity = ((1 - t) * (low / scale) + t * (high / scale)) * scale
    return '<path d="M' + left + ',' + y + 'H' + right + '" stroke="#dce5ed"/>' +
      '<text x="' + (left - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + intensity.toPrecision(4) + '</text>' +
      '<text x="' + x + '" y="430" text-anchor="middle">' + ((1 - t) * first + t * last).toPrecision(5) + '</text>'
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <title>${label} Raman spectrum</title>
  <desc>${xml(spectrum.source)}</desc>
  <rect width="100%" height="100%" fill="white"/>
  <g font-family="sans-serif" font-size="13" fill="#203040">
    <text x="100" y="31" font-size="22">${label} Raman spectrum</text>
    <path d="M100,52h26" stroke="#146989" stroke-width="3"/>
    <text x="136" y="57">${label}${spectrum.runId ? ' · Run ' + xml(spectrum.runId) : ''}${spectrum.saturated ? ' · saturation evidence' : ''}</text>
    ${ticks}
    <path d="M${left},${top}V${bottom}H${right}" fill="none" stroke="#314455"/>
    <path d="${path}" fill="none" stroke="#146989" stroke-width="1.5"/>
    <text x="510" y="464" text-anchor="middle">Raman shift (cm⁻¹)</text>
    <text transform="translate(22 238) rotate(-90)" text-anchor="middle">Intensity (${spectrum.unit})</text>
  </g>
</svg>`
}

export async function spectrumPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width * 2
    canvas.height = image.height * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('PNG export requires a 2D canvas.')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG encoding failed.'))
    }, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
