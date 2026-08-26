import type { OpticalScene } from '../../core/optics'
import type { WorldBounds } from './camera'

/**
 * Breadboard origin is rendered as its upper-left world corner so the formal
 * +Y-up world conversion places the Demo-derived layout inside the board.
 */
export const getSceneWorldBounds = (scene: OpticalScene): WorldBounds => {
  const xValues: number[] = []
  const yValues: number[] = []

  for (const breadboard of scene.breadboards) {
    xValues.push(breadboard.origin_mm.x, breadboard.origin_mm.x + breadboard.width_mm)
    yValues.push(
      breadboard.origin_mm.y,
      breadboard.origin_mm.y - breadboard.height_mm,
    )
  }
  for (const component of scene.components) {
    const radius = component.geometry.aperture_mm / 2
    xValues.push(component.transform.x_mm - radius, component.transform.x_mm + radius)
    yValues.push(component.transform.y_mm - radius, component.transform.y_mm + radius)
  }

  if (xValues.length === 0 || yValues.length === 0) {
    return Object.freeze({
      min_x_mm: -250,
      max_x_mm: 250,
      min_y_mm: -150,
      max_y_mm: 150,
    })
  }

  return Object.freeze({
    min_x_mm: Math.min(...xValues),
    max_x_mm: Math.max(...xValues),
    min_y_mm: Math.min(...yValues),
    max_y_mm: Math.max(...yValues),
  })
}
