import type { AcquisitionServices } from '../../src/store/acquisitionRuntime'

export const manualAcquisitionScheduler = () => {
  let id = 0
  const tasks: { callback: () => void; cancelled: boolean }[] = []
  const services: AcquisitionServices = {
    clock: { now: () => '2026-11-08T00:00:00.000Z' }, seed: () => 0,
    id: () => `run:test:${++id}`,
    schedule: (callback) => {
      const task = { callback, cancelled: false }
      tasks.push(task)
      return () => { task.cancelled = true }
    },
  }
  const step = () => {
    const task = tasks.shift()
    if (!task) throw new Error('No scheduled task.')
    if (!task.cancelled) task.callback()
    return task.callback
  }
  const flush = () => {
    let steps = 0
    while (tasks.length) {
      if (++steps > 10_000) throw new Error('Scheduler did not finish.')
      step()
    }
  }
  return { services, tasks, step, flush }
}
