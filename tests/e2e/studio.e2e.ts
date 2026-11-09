import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { serializeOpticalConfiguration } from '../../src/project/dataFiles'
import { PHASE8_STRESS_DESIGN, PHASE8_TYPICAL_DESIGN } from '../fixtures/phase8StressScene'

const workspace = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Studio workspaces' }).getByRole('button', { name, exact: true }).click()
const marker = (page: Page, name: string) => page.locator('[data-component-id="component:' + name + '"]')
const edit = async (page: Page, component: string, key: string, value: string) => {
  await marker(page, component).locator('[data-component-hit-target]').click()
  const field = page.getByRole('complementary', { name: 'Property Inspector' }).locator('[data-field-key="' + key + '"]')
  await field.fill(value)
  await field.press('Enter')
}
const acquire = async (page: Page, count: string) => {
  await workspace(page, 'Acquisition')
  await page.getByLabel('Number of exposures').fill(count)
  await page.getByRole('button', { name: 'Acquire', exact: true }).click()
}
const completedSnr = async (page: Page) => {
  const snr = page.locator('[data-metric="peak-snr"]')
  await expect(page.locator('[data-acquisition-status]')).toHaveAttribute('data-acquisition-status', 'completed')
  await expect(snr).toContainText(' ratio')
  return parseFloat(await snr.innerText())
}
const expectedSpectrum = async (page: Page): Promise<{ axis: number[]; values: number[] }> => {
  await workspace(page, 'Spectrum')
  await page.getByLabel('Spectrum to export').filter({ visible: true }).selectOption({ label: 'Expected · current design' })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Spectrum', exact: true }).click()
  return JSON.parse(await readFile(await (await download).path(), 'utf8'))
}
const peakCounts = ({ axis, values }: Awaited<ReturnType<typeof expectedSpectrum>>) =>
  Math.max(...values.filter((_, index) => Math.abs(axis[index]! - 520.7) < 10))
const downloadProject = async (page: Page) => {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save As', exact: true }).click()
  const file = await event
  return { path: await file.path(), data: JSON.parse(await readFile(await file.path(), 'utf8')) }
}
const selectCompatibilityFiles = (page: Page) => page.addInitScript(() => {
  // Exercise the shipped download and file-input path rather than the OS picker.
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined })
})

test('A · default design and offline assets', async ({ page }) => {
  const external: string[] = []
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      external.push(route.request().url())
      return route.abort()
    }
    return route.continue()
  })
  await page.goto('/')
  await expect(marker(page, 'laser')).toBeVisible()
  await workspace(page, 'Spectrum')
  await expect(page.getByRole('region', { name: 'Raman telemetry' }).or(page.locator('[aria-label="Raman telemetry"]'))).toContainText('Silicon')
  await expect(page.locator('[data-raman-path-state]')).toHaveAttribute('data-raman-path-state', 'valid-signal-path')
  const spectrum = await expectedSpectrum(page)
  expect(peakCounts(spectrum)).toBeGreaterThan(10 * Math.max(...spectrum.values.filter((_, index) => spectrum.axis[index]! > 580)))
  await page.screenshot({ path: 'artifacts/phase8/after-1440-spectrum.png' })
  await workspace(page, '3D')
  await page.getByRole('button', { name: 'Open 3D' }).click()
  await expect(page.locator('.presentation-canvas canvas')).toBeVisible()
  await page.screenshot({ path: 'artifacts/phase8/after-1440-3d.png' })
  expect(external).toEqual([])
})

test('B · broken path, locate and undo', async ({ page }) => {
  await page.goto('/')
  await edit(page, 'mirror', 'rotation_deg', '15')
  await workspace(page, 'Diagnostics')
  await expect(page.getByRole('region', { name: 'Engineering diagnostics' }).locator('[data-path-state]')).toHaveText('NO PATH')
  await expect(page.getByText('OPT_PATH_001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Locate Sample' }).click()
  await expect(marker(page, 'sample')).toHaveAttribute('data-selected', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await workspace(page, 'Diagnostics')
  await expect(page.getByRole('region', { name: 'Engineering diagnostics' }).locator('[data-path-state]')).toHaveText('SIGNAL')
})

test('C · axial defocus emits a lineage warning', async ({ page }) => {
  await page.goto('/')
  await edit(page, 'laser', 'power_mw', '0.1')
  const focused = peakCounts(await expectedSpectrum(page))
  await acquire(page, '2')
  const focusedSnr = await completedSnr(page)
  await workspace(page, 'Bench')
  await edit(page, 'sample', 'x_mm', '450')
  expect(peakCounts(await expectedSpectrum(page))).toBeLessThan(focused)
  await acquire(page, '2')
  expect(await completedSnr(page)).toBeLessThan(focusedSnr)
  await workspace(page, 'Diagnostics')
  await expect(page.getByText('FOCUS_001', { exact: true })).toBeVisible()
})

test('D · filter angle changes model OD', async ({ page }) => {
  await page.goto('/')
  await edit(page, 'laser', 'power_mw', '0.001')
  const background = (await expectedSpectrum(page)).values[0]!
  await acquire(page, '2')
  const suppressedSnr = await completedSnr(page)
  await workspace(page, 'Diagnostics')
  const od = page.locator('.engineering-telemetry > div').filter({ hasText: 'Rayleigh path OD' }).locator('dd')
  const previous = await od.textContent()
  await workspace(page, 'Bench')
  await edit(page, 'filter', 'rotation_deg', '120')
  await workspace(page, 'Diagnostics')
  await expect(od).not.toHaveText(previous!)
  await expect(page.getByText('RAMAN_001', { exact: true })).toBeVisible()
  expect((await expectedSpectrum(page)).values[0]!).toBeGreaterThan(background)
  await acquire(page, '2')
  expect(await completedSnr(page)).not.toBe(suppressedSnr)
})

test('E · splitter branches continue through the bench renderer', async ({ page }) => {
  await page.goto('/')
  const before = await page.locator('[data-ray-id]').count()
  await page.getByRole('button', { name: /beam splitter/i }).click()
  const splitter = page.locator('[data-component-type="beam-splitter"]')
  await splitter.locator('[data-component-hit-target]').click()
  const inspector = page.getByRole('complementary', { name: 'Property Inspector' })
  for (const [key, value] of [['x_mm', '125'], ['y_mm', '-75'], ['rotation_deg', '-45']]) {
    const field = inspector.locator('[data-field-key="' + key + '"]')
    await field.fill(value)
    await field.press('Enter')
  }
  await expect.poll(() => page.locator('[data-ray-id]').count()).toBeGreaterThan(before)
})

test('F · 1 s ×20 frozen acquisition', async ({ page }) => {
  await page.goto('/')
  await edit(page, 'laser', 'power_mw', '0.1')
  await acquire(page, '20')
  await expect(page.locator('[data-acquisition-status]')).toHaveAttribute('data-acquisition-status', 'completed')
  await expect(page.locator('[data-acquisition-data-shape]')).toContainText('20 retained frames')
  await expect(page.locator('[data-metric="peak-snr"]')).not.toContainText('Undefined')
})

test('G · a design change cancels the active acquisition', async ({ page }) => {
  await page.goto('/')
  await acquire(page, '20')
  await expect(page.locator('[data-acquisition-status]')).toHaveAttribute('data-acquisition-status', 'running')
  await workspace(page, 'Bench')
  await edit(page, 'mirror', 'rotation_deg', '16')
  await workspace(page, 'Acquisition')
  await expect(page.locator('[data-acquisition-status]')).toHaveAttribute('data-acquisition-status', 'cancelled')
  await expect(page.locator('[data-acquisition-status]')).toContainText('configuration changed')
})

test('H and I · processing preserves Raw and project round trips', async ({ page }) => {
  await selectCompatibilityFiles(page)
  await page.goto('/')
  await acquire(page, '2')
  await expect(page.locator('[data-acquisition-status]')).toHaveAttribute('data-acquisition-status', 'completed')
  const raw = (await downloadProject(page)).data
  await workspace(page, 'Analysis')
  for (const name of ['Baseline Correction', 'Smoothing', 'Normalize']) {
    await page.getByRole('button', { name: 'Add ' + name, exact: true }).click()
  }
  await expect(page.getByRole('checkbox', { name: 'Normalize', exact: true })).toBeChecked()
  const normalize = page.getByRole('checkbox', { name: 'Normalize', exact: true })
  await normalize.uncheck()
  await expect(normalize).not.toBeChecked()
  await normalize.check()
  const processed = await downloadProject(page)
  expect(raw.acquisitionRuns).toHaveLength(1)
  expect(processed.data.acquisitionRuns).toEqual(raw.acquisitionRuns)
  expect(processed.data.analysisState.pipelines).toHaveLength(1)
  await page.getByRole('button', { name: 'Reset Pipeline' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  const event = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open Project' }).click()
  await (await event).setFiles(processed.path)
  await expect(page.getByRole('checkbox', { name: 'Normalize', exact: true })).toBeChecked()
  expect((await downloadProject(page)).data.acquisitionRuns).toEqual(raw.acquisitionRuns)
})

test('J · derived 3D follows the 2D focus change', async ({ page }) => {
  await page.goto('/')
  await edit(page, 'mirror', 'rotation_deg', '-44.99')
  await edit(page, 'sample', 'x_mm', '450')
  await workspace(page, '3D')
  await page.getByRole('button', { name: 'Open 3D' }).click()
  await expect(page.locator('.presentation-canvas canvas')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Sample focus states' })).toContainText(/defocus 50\.[0-9]{2} mm/)
  await expect(page.locator('.presentation-labels [data-component-id="component:mirror"]')).toHaveText('Mirror')
  await page.getByRole('button', { name: 'Close 3D' }).click()
  await expect(page.locator('.presentation-canvas canvas')).toHaveCount(0)
  await workspace(page, 'Bench')
  await expect(marker(page, 'sample')).toHaveAttribute('data-world-x-mm', '450')
})

test('expected spectrum exports CSV, SVG and PNG through the product controls', async ({ page }) => {
  await page.goto('/')
  await workspace(page, 'Spectrum')
  await page.getByLabel('Spectrum to export').filter({ visible: true }).selectOption({ label: 'Expected · current design' })
  for (const format of ['csv', 'svg', 'png']) {
    await page.getByLabel('Export format').filter({ visible: true }).selectOption(format)
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export Spectrum', exact: true }).click()
    const file = await event
    expect(file.suggestedFilename()).toBe('rapid-optics-expected.' + format)
    const data = await readFile(await file.path())
    if (format === 'png') expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    if (format === 'svg') expect(data.toString()).toContain('<svg')
    if (format === 'csv') expect(data.toString().trim().split('\n')).toHaveLength(1401)
  }
})

test('invalid project leaves the active scene and project intact', async ({ page }) => {
  await selectCompatibilityFiles(page)
  await page.goto('/')
  await page.getByLabel('Project name').fill('Active project')
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open Project' }).click()
  await (await picker).setFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Project name')).toHaveValue('Active project')
  await expect(marker(page, 'mirror')).toHaveAttribute('data-world-rotation-deg', '-45')
})

test('WebGL failure leaves the editor and acquisition available', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, name: string, options?: unknown) {
      return name === 'webgl2' ? null : Reflect.apply(getContext, this, [name, options])
    } as typeof getContext
  })
  await page.goto('/')
  await workspace(page, '3D')
  await page.getByRole('button', { name: 'Open 3D' }).click()
  await expect(page.getByRole('alert')).toContainText('WebGL 2 is unavailable')
  await workspace(page, 'Bench')
  await expect(marker(page, 'mirror')).toBeVisible()
  await acquire(page, '2')
  await expect(page.locator('[data-acquisition-status]')).toHaveAttribute('data-acquisition-status', 'completed')
})

for (const [workload, design] of [['typical', PHASE8_TYPICAL_DESIGN], ['stress', PHASE8_STRESS_DESIGN]] as const) {
test(`performance · ${workload} branching Raman fixture, edits, spectra and 3D`, async ({ page, browser }) => {
  await page.goto('/')
  await page.getByText('Import, export & settings', { exact: true }).click()
  const ioStarted = performance.now()
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import Optical Configuration', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await (await picker).setFiles({ name: 'phase8-stress.json', mimeType: 'application/json',
    buffer: Buffer.from(serializeOpticalConfiguration(design)) })
  await expect(page.locator('[data-component-id]')).toHaveCount(design.opticalScene.components.length)
  const importMs = performance.now() - ioStarted
  await page.getByText('Import, export & settings', { exact: true }).click()
  const segments = await page.locator('[data-ray-id]').count()
  expect(segments).toBeGreaterThan(30)
  const target = marker(page, 'mirror').locator('[data-component-hit-target]')
  await target.click()
  const box = await target.boundingBox()
  expect(box).not.toBeNull()
  await page.getByRole('button', { name: /snap on/i }).click()
  await page.evaluate(() => {
    const state = window as Window & { phase8Frames?: { times: number[]; active: boolean } }
    const capture = { times: [] as number[], active: true }
    state.phase8Frames = capture
    const frame = (time: number) => {
      if (!capture.active) return
      capture.times.push(time)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  try {
    for (let index = 0; index < 45; index++) {
      await page.mouse.move(box!.x + box!.width / 2 + Math.sin(index / 5) * 12, box!.y + box!.height / 2)
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    }
  } finally { await page.mouse.up() }
  const intervals = await page.evaluate(() => {
    const state = window as Window & { phase8Frames?: { times: number[]; active: boolean } }
    const capture = state.phase8Frames!
    capture.active = false
    delete state.phase8Frames
    return capture.times.slice(1).map((value, index) => value - capture.times[index]!)
  })
  const editTimes: number[] = []
  const angle = page.locator('[data-field-key="rotation_deg"]')
  for (let index = 0; index < 12; index++) {
    const value = (-45 + index / 100).toFixed(2)
    await angle.fill(value)
    const started = performance.now()
    await angle.press('Enter')
    await expect.poll(async () => Number(await marker(page, 'mirror').getAttribute('data-world-rotation-deg'))).toBeCloseTo(Number(value), 8)
    editTimes.push(performance.now() - started)
  }
  const spectrumStarted = performance.now()
  await workspace(page, 'Spectrum')
  await expect(page.locator('[data-spectrum-source="preview"]')).toBeVisible()
  const spectrumMs = performance.now() - spectrumStarted
  const viewerStarted = performance.now()
  await workspace(page, '3D')
  await page.getByRole('button', { name: 'Open 3D' }).click()
  await expect(page.locator('.presentation-canvas canvas')).toBeVisible()
  const viewerMs = performance.now() - viewerStarted
  await page.getByRole('button', { name: 'Close 3D' }).click()
  const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]!
  console.info('[Phase 8 Chrome benchmark]', JSON.stringify({
    mode: process.env.ROS_E2E_DEV === '1' ? 'development' : 'production',
    workload, chrome: browser.version(), renderer: 'SwiftShader allowed', components: design.opticalScene.components.length,
    segments, frames: intervals.length, editRepeats: editTimes.length, importMs, spectrumMs, viewerMs,
    frameMedianMs: percentile(intervals, .5), frameP95Ms: percentile(intervals, .95),
    meanFps: 1000 * intervals.length / intervals.reduce((total, elapsed) => total + elapsed, 0),
    editMedianMs: percentile(editTimes, .5), editP95Ms: percentile(editTimes, .95),
  }))
})
}

for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [390, 844]] as const) {
  test(`layout · ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Optical Bench', exact: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/phase8/after-${width}-bench.png` })
    await workspace(page, 'Diagnostics')
    await expect(page.getByRole('region', { name: 'Engineering diagnostics' })).toBeVisible()
    await page.screenshot({ path: `artifacts/phase8/after-${width}-diagnostics.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
