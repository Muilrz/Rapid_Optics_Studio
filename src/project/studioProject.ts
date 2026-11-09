import { DEFAULT_VIRTUAL_CCD_CONFIGURATION } from '../core/acquisition'
import { DEFAULT_RAMAN_SCENE, DEFAULT_SIMULATION_CONFIGURATION } from './defaults/defaultRamanScene'
import { PROJECT_FORMAT, PROJECT_VERSION, type ProjectMetadata, type RapidOpticsProject } from './projectSchema'
import type { StudioState } from '../store/studioStore'

export function newProjectMetadata(): ProjectMetadata {
  const now = new Date().toISOString()
  return Object.freeze({ id: crypto.randomUUID(), name: 'Untitled Project', createdAt: now, updatedAt: now })
}

export function captureProject(state: StudioState): RapidOpticsProject {
  return {
    format: PROJECT_FORMAT, schemaVersion: PROJECT_VERSION, metadata: state.projectMetadata,
    opticalScene: state.authoritative.scene, materials: state.authoritative.materials,
    simulationConfiguration: state.authoritative.simulationConfiguration,
    detectorConfiguration: state.authoritative.detectorConfiguration,
    acquisitionRuns: state.acquisition.completedRuns, spectrumLibrary: state.spectrumLibrary,
    analysisState: {
      pipelines: [...state.analysis.pipelines.values()],
      visible: [...state.analysis.visible], peakEdits: [...state.analysis.peakEdits],
    },
    viewState: { camera: state.view.camera, gridVisible: state.view.gridVisible, snapEnabled: state.editor.snapEnabled },
  }
}

export function newProject(state: StudioState): RapidOpticsProject {
  return {
    format: PROJECT_FORMAT, schemaVersion: PROJECT_VERSION,
    metadata: newProjectMetadata(),
    opticalScene: DEFAULT_RAMAN_SCENE, simulationConfiguration: DEFAULT_SIMULATION_CONFIGURATION,
    detectorConfiguration: DEFAULT_VIRTUAL_CCD_CONFIGURATION,
    materials: [], acquisitionRuns: [], spectrumLibrary: [],
    analysisState: { pipelines: [], visible: [], peakEdits: [] },
    viewState: { camera: state.view.camera, gridVisible: true, snapEnabled: true },
  }
}
