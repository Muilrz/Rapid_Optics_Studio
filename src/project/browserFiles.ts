import { MAX_PROJECT_BYTES } from './projectSchema'

export interface ProjectFileHandle {
  readonly name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: Blob): Promise<void>
    close(): Promise<void>
    abort(): Promise<void>
  }>
}

interface FilePickers {
  showOpenFilePicker?: (options: object) => Promise<ProjectFileHandle[]>
  showSaveFilePicker?: (options: object) => Promise<ProjectFileHandle>
}

const projectTypes = [{ description: 'Rapid Optics Project', accept: { 'application/json': ['.json'] } }]
export const isFileCancellation = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

export function chooseFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0]), { once: true })
    input.addEventListener('cancel', () => resolve(undefined), { once: true })
    input.click()
  })
}

export async function openProjectFile(): Promise<{ file: File; handle?: ProjectFileHandle } | undefined> {
  const browser = window as Window & FilePickers
  if (browser.showOpenFilePicker) {
    try {
      const [handle] = await browser.showOpenFilePicker({ types: projectTypes, multiple: false })
      return handle ? { file: await handle.getFile(), handle } : undefined
    } catch (error) {
      if (isFileCancellation(error)) return undefined
      if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error
    }
  }
  const file = await chooseFile('.json,application/json')
  return file ? { file } : undefined
}

export async function readProjectFile(file: File, limit = MAX_PROJECT_BYTES): Promise<string> {
  if (file.size > limit) throw new Error('File exceeds the ' + Math.round(limit / 1024 / 1024) + ' MiB safety limit.')
  return file.text()
}

export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

export async function saveProjectFile(
  makeBlob: () => Blob, suggestedName: string, target?: ProjectFileHandle,
): Promise<{ handle: ProjectFileHandle } | 'download' | undefined> {
  const browser = window as Window & FilePickers
  let handle = target
  if (!handle && browser.showSaveFilePicker) {
    try { handle = await browser.showSaveFilePicker({ suggestedName, types: projectTypes }) } catch (error) {
      if (isFileCancellation(error)) return undefined
      if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error
    }
  }
  const blob = makeBlob()
  if (!handle) {
    downloadFile(blob, suggestedName)
    return 'download'
  }
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
  return { handle }
}
