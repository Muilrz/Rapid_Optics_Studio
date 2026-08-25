# Rapid Optics Studio V1
## Product Requirements Document

**Document Status:** V1 Development Baseline  
**Product:** Rapid Optics Studio  
**Parent Project:** MetaInstrumentStudio  
**Product Type:** Scientific Engineering Studio / Virtual Optical Instrument  
**Primary Domain:** Raman Instrument Design & Simulation  
**Version Scope:** V1

---

# 1. Product Definition

Rapid Optics Studio 是面向科研仪器研发场景的光学设计、仿真与虚拟实验工作台。

V1 的核心定位不是替代 Zemax、Code V 等专业精密光学设计软件，而是提供一个：

> **面向 Raman 仪器研发的快速、交互式、可视化、可追溯的虚拟光学仪器工作环境。**

用户可以在二维光学台中搭建系统，修改光学元件位置与参数，并实时观察：

```text
Optical Layout
      ↓
Simplified Ray Tracing
      ↓
Optical Power / Path State
      ↓
Raman Signal Model
      ↓
Virtual CCD
      ↓
Spectrum Acquisition
      ↓
Spectrum Analysis
      ↓
Diagnostics
      ↓
3D Visualization
```

V1 应形成一条完整闭环：

> **搭建 → 仿真 → 采集 → 分析 → 诊断 → 保存 / 导出**

现有 Raman Sandbox Demo 已经验证了这条产品链路的基本可行性；V1 不重新发明产品逻辑，而是在其基础上进行正式工程化重构、补齐专业编辑能力、建立稳定数据模型并修正已知缺陷。

---

# 2. Product Positioning

## 2.1 Raman-first, not Raman-only

V1 的用户体验以 Raman 光谱仪器为核心。

但软件底层必须采用：

```text
Generic Optical Core
        +
Raman Simulation Module
```

而不是：

```text
Raman-specific monolithic application
```

即：

- 光学场景；
- 光学元件；
- Ray；
- Transform；
- Scene；
- Simulation Engine；

应保持通用。

Raman：

- Sample interaction；
- Raman signal；
- Rayleigh leakage；
- CCD spectrum；

作为当前第一个完整 Instrument Simulation Workflow。

未来可以在不重写 Optical Core 的情况下增加：

- Fluorescence；
- Absorption；
- Imaging；
- Confocal；
- Other spectroscopy workflows。

---

# 3. V1 Product Goal

V1 成功时，科研人员应可以在一个完整软件中完成：

1. 创建 Rapid Optics Project；
2. 在二维光学台中添加光学元件；
3. 拖动、旋转、复制和编辑元件；
4. 配置基本元件参数；
5. 实时计算简化光线路径；
6. 判断 excitation 是否到达 Sample；
7. 模拟 Sample 产生 Raman / Rayleigh 信号；
8. 模拟回程光路；
9. 模拟 Spectrometer + CCD；
10. 实时查看理论与模拟光谱；
11. 执行模拟 CCD Acquisition；
12. 保存 Acquisition Run；
13. 对光谱进行基础 Raman Analysis；
14. 获得确定性工程诊断；
15. 查看同步 3D 光学台；
16. 保存完整 Project；
17. 导入 / 导出设计和实验数据。

---

# 4. Non-goals of V1

以下能力明确不作为 V1 完成条件。

## 4.1 不做精密光学设计软件

V1 不实现：

- 完整 Sequential Ray Tracing；
- Optical Surface Prescription；
- 复杂 Lens Stack；
- Aberration Analysis；
- MTF；
- PSF；
- Wavefront；
- Zemax-compatible optical prescription；
- Tolerance Analysis。

## 4.2 不做高级物理光学

V1 不实现：

- Diffraction propagation；
- Fourier optics；
- Polarization；
- Interference；
- Coherence；
- Full Gaussian Beam propagation；
- ABCD matrix system；
- Non-sequential Monte Carlo；
- Stray light simulation。

## 4.3 不连接真实硬件

V1 CCD 为：

> **Virtual / Simulated CCD**

不连接：

- 真实 CCD；
- Camera；
- Spectrometer；
- Laser；
- Stage；
- Motor；
- DAQ。

真实仪器控制属于未来与 UpperPC / Device Layer 的进一步集成方向。

## 4.4 不实现 AI Copilot

V1 不包含：

- LLM Optical Copilot；
- AI 自动搭建光路；
- AI 自动修改元件；
- 自动调镜；
- 自动 SNR Optimization。

但必须提供 deterministic diagnostics，为未来 Optical Copilot 提供机器可读输入。

---

# 5. Simulation Fidelity

V1 的仿真定位为：

> **First-order / Semi-quantitative Engineering Simulation**

目标不是提供最终生产级精密光学结果。

V1 的结果应适合回答：

- 光路是否成立？
- 某元件移动后光往哪里走？
- 回光是否能够到达光谱仪？
- 聚焦偏差对 Raman 信号有什么影响？
- Filter 调整后 Rayleigh leakage 如何变化？
- 积分时间变化如何影响 CCD counts？
- 为什么当前 SNR 很低？
- 当前参数是否导致 CCD Saturation？

但不应宣称：

> 仿真结果能够代替专业精密光学设计与公差分析。

UI 中应适当标识当前模型为：

**Simplified / First-order Model**

---

# 6. Product Architecture

```text
Rapid Optics Studio
│
├── Project System
│
├── 2D Optical Studio
│
├── Optical Core
│   ├── Scene
│   ├── Components
│   ├── Rays
│   ├── Intersection
│   └── Ray Propagation
│
├── Raman Simulation
│   ├── Material
│   ├── Raman Peaks
│   ├── Fluorescence
│   └── Rayleigh
│
├── Virtual Spectrometer / CCD
│
├── Acquisition
│
├── Spectrum Analysis
│
├── Diagnostics
│
├── 3D Visualization
│
└── Import / Export
```

所有 View 必须读取同一份 Project / Simulation State。

禁止形成：

```text
2D 一套状态
3D 一套状态
Spectrum 一套状态
```

---

# 7. Technical Stack

## 7.1 Primary Stack

V1 正式采用：

```text
Frontend
React
TypeScript
Vite

Backend / Service
Node.js
TypeScript

3D
Three.js

Shared Simulation Core
Pure TypeScript
```

建议开发基线：

- React 19.x
- Node.js 24 LTS
- Vite 8.x

截至本 PRD 制定阶段，React 官方最新主版本为 19.2；Node.js 24.x 为当前 LTS；Vite 8 已发布稳定版本。

---

# 8. Engineering Architecture

建议采用 Monorepo：

```text
rapid-optics-studio/
│
├── apps/
│   ├── web/
│   └── server/
│
├── packages/
│   ├── optics-core/
│   ├── raman-core/
│   ├── acquisition-core/
│   ├── spectrum-core/
│   ├── diagnostics-core/
│   ├── project-schema/
│   └── shared/
│
└── tests/
```

---

# 9. Frontend Responsibilities

React Frontend 负责：

- Studio UI；
- 2D Canvas；
- 元件编辑；
- Property Inspector；
- Spectrum View；
- Acquisition UI；
- Diagnostics；
- 3D Viewer；
- Project interaction；
- User command history；
- Undo / Redo。

## 9.1 Real-time Simulation

实时 Optical Simulation 不通过 HTTP 请求 Node Server。

推荐：

```text
React UI
    ↓
State Update
    ↓
Simulation Worker
    ↓
Optical Core
    ↓
Raman Core
    ↓
Spectrum Result
    ↓
React UI
```

计算量增加后可使用：

> Web Worker

避免仿真阻塞 UI Thread。

---

# 10. Node.js Responsibilities

Node.js 不承担每次拖动产生的实时 ray tracing。

Node Service 主要负责：

- Project persistence；
- Import / Export；
- File management；
- Schema migration；
- Future user/project management；
- MetaInstrumentStudio integration；
- Future external data source access；
- Future collaboration capability。

V1 可以保持较薄的 Service Layer。

推荐：

```text
Node.js
+
TypeScript
+
Fastify
```

V1 不强制引入大型数据库。

Project 可以首先使用：

```text
Structured Project JSON
+
External Assets
```

以后接入 MetaInstrumentStudio 时再决定统一数据库方案。

---

# 11. Shared Core Principle

Optical physics 和 Raman simulation 不应写在 React Component 中。

例如禁止：

```text
MirrorComponent.tsx
  → calculateReflection()
```

应采用：

```text
optics-core/
  mirror.ts
  ray.ts
  intersect.ts
  tracer.ts
```

UI 只负责：

```text
Render
Edit
Dispatch Command
Display Result
```

---

# 12. Coordinate System

内部物理坐标统一使用：

```text
millimeter (mm)
```

Screen Pixel 与 World Coordinate 必须分离。

例如：

```text
World:
x = 125 mm
y = 75 mm

Camera:
zoom = 1.6

Screen:
x = ...
y = ...
```

不得继续沿用 Demo 中：

> Canvas Pixel ≈ Physical Coordinate

的临时设计。

---

# 13. Optical Bench Model

V1 使用：

> Infinite 2D Workspace + Configurable Breadboard

Breadboard 默认：

```text
Hole Pitch = 25 mm
```

Schema 应允许未来存在多个 Breadboard。

V1 UI 可以只提供一个默认 Breadboard。

---

# 14. Grid & Snapping

支持：

- Grid 显示；
- Grid 隐藏；
- Snap On / Off；
- Grid Size；
- 25 mm standard pitch；
- 连续坐标。

Snap 只影响编辑体验。

物理坐标不得被限定只能出现在孔位。

---

# 15. Component Transform

所有 Optical Component 统一具有：

```text
Transform2D

x_mm
y_mm
rotation_deg
```

V1 仅参与二维平面光学计算。

3D 中的：

```text
beamHeight
postHeight
holder
visualDepth
```

属于 Visualization Metadata。

不参与 V1 optical physics。

---

# 16. 2D Studio

2D Studio 是 V1 的主要设计入口，也是系统的 Authoritative Editing View。

主界面建议：

```text
┌───────────────────────────────────────────────────────┐
│ Project / Toolbar / Simulation Status                │
├───────────┬───────────────────────────┬───────────────┤
│ Component │                           │ Properties    │
│ Library   │      Optical Bench        │ Inspector     │
│           │                           │               │
│ Laser     │                           │ Transform     │
│ Mirror    │                           │ Optical       │
│ Lens      │                           │ Simulation    │
│ ...       │                           │               │
├───────────┴───────────────────────────┴───────────────┤
│ Spectrum / Acquisition / Diagnostics                 │
└───────────────────────────────────────────────────────┘
```

---

# 17. Editor Operations

V1 必须支持：

- Add Component；
- Select；
- Drag；
- Rotate；
- Delete；
- Multi-select；
- Box Select；
- Copy；
- Paste；
- Duplicate；
- Undo；
- Redo；
- Lock；
- Unlock；
- Zoom；
- Pan；
- Grid；
- Snap；
- Reset View；
- Basic Align。

优先级：

### Must Have

- Select
- Drag
- Rotate
- Delete
- Copy/Paste
- Multi-select
- Undo/Redo
- Zoom/Pan
- Property Inspector
- Save/Load

### Should Have

- Box Select
- Lock
- Align
- Distribution

---

# 18. Real-time Simulation Behavior

当用户：

- 移动元件；
- 旋转元件；
- 修改参数；
- 添加元件；
- 删除元件；

系统应触发：

```text
Scene Change
    ↓
Ray Trace
    ↓
Optical Result
    ↓
Raman Simulation
    ↓
Expected CCD Spectrum
    ↓
Diagnostics
    ↓
2D / Spectrum / Telemetry Update
    ↓
3D Sync
```

默认无需点击：

> Run Simulation

仿真实时进行。

允许未来提供：

> Pause Simulation

用于复杂场景。

---

# 19. Component Library

V1 保留 Demo 当前 10 类元件：

1. Laser
2. Mirror
3. Dichroic
4. Objective
5. Sample
6. Edge Filter
7. Spectrograph / Spectrometer
8. Prism
9. Beam Splitter
10. Pinhole

现有 Demo 已验证这些元件均进入当前 2D/3D/光追工作流。

---

# 20. Common Component Schema

所有 Component 至少包含：

```text
id
type
name
enabled

transform:
  x_mm
  y_mm
  rotation_deg

geometry:
  aperture_mm

parameters

visualization

metadata
```

必须允许未来添加：

```text
manufacturer
model
partNumber
datasheet
source
inventoryId
```

用于 Procurement Agent 与 Lab Component Library 集成。

---

# 21. Laser

V1 主要参数：

```text
Wavelength
Power
Position
Direction
Aperture / Beam visualization
```

Built-in wavelengths：

- 532 nm
- 633 nm
- 785 nm

Demo 的三种波长应完整保留。

未来 Schema 允许 custom wavelength。

---

# 22. Mirror

V1 参数：

```text
Position
Rotation
Aperture
Reflectivity
```

行为：

> 根据光学表面法线执行二维 specular reflection。

---

# 23. Dichroic

V1 继续采用简化模型。

参数至少包含：

```text
Rotation
Aperture

Excitation Reflectivity
Excitation Transmission / Leakage

Raman Transmission
```

V1 不要求导入真实：

```text
T(λ, θ)
R(λ, θ)
```

曲线。

但 Schema 应允许未来扩展。

---

# 24. Edge Filter

V1 参数：

```text
Rotation / AOI
Aperture
Raman Transmission
Rayleigh Suppression
Leakage Model
```

当前模型可以继续根据入射角改变 Rayleigh leakage。

但该逻辑应从 UI / monolithic code 中拆出成为独立 Model。

---

# 25. Objective

V1 继续使用简化 Objective Model。

参数：

```text
Focal Length
Aperture
NA
```

V1 不进行真实 lens surface tracing。

光线经过 Objective 后仍允许采用简化传播。

Focus efficiency 根据：

```text
Actual Objective-Sample Distance
vs.
Target Focal Distance
```

计算。

当前 Demo 的 focus behavior 应保留。

---

# 26. Sample

Sample 是 Raman Simulation 的 interaction point。

参数：

```text
Material
Position
Optional Label
```

Excitation 命中 Sample 后产生：

```text
Raman
+
Rayleigh
```

V1 可继续采用简化回向传播模型。

具体 angular scattering distribution 不进入 V1。

---

# 27. Beam Splitter

参数：

```text
Transmission Ratio
Reflection Ratio
Rotation
Aperture
```

不再硬编码：

```text
50 / 50
```

默认仍为：

```text
50 / 50
```

Ray tracing 必须天然支持 branching。

---

# 28. Prism

V1 不实现完整 Snell Law。

采用简化 Deflection Model。

参数：

```text
Rotation
Deflection Angle
Aperture
```

默认值可继承 Demo 约：

```text
40°
```

UI 必须明确：

> Simplified Prism Model

---

# 29. Pinhole

V1 为简化空间光阑模型。

参数：

```text
Aperture Diameter
Position
Rotation
```

用于：

- geometrical aperture；
- clipping；
- vignetting。

V1 不模拟：

- Airy disk；
- Airy Unit；
- full confocal rejection。

---

# 30. Spectrometer

V1 将：

```text
Spectrograph
+
CCD
```

视为一个复合虚拟设备。

画布中仍显示一个：

> Spectrometer / Spectrograph

内部包含：

```text
Optical Input
Slit
Grating / Throughput
Spectral Broadening
Detector
CCD
```

V1 不绘制和计算 Spectrometer 内部真实光路。

---

# 31. Virtual CCD Parameters

Virtual CCD 至少包含：

```text
Gain
QE Model
Full Well
Read Noise
Dark Current
Integration Time
```

这些参数进入 Signal Pipeline。

当前 Demo 已经包含 QE、Grating throughput、Integration Time、Dark Current、Read Noise、Full Well 和 SNR 等信号因素，应保留其总体信号链。

---

# 32. Ray Model

V1 Ray 至少：

```text
origin
direction
kind
power
wavelength
generation
sourceComponentId
```

Ray kind：

```text
excitation
raman
rayleigh
```

---

# 33. Ray Tracing

核心流程：

```text
Emit Ray
   ↓
Find Nearest Intersection
   ↓
Component Interaction
   ↓
Generate 0..N Output Rays
   ↓
Continue Until
   ├── Detector
   ├── Absorption
   ├── Leaves Scene
   └── Max Generation
```

必须天然支持：

> One input ray → multiple output rays

用于 Beam Splitter / Dichroic 等器件。

---

# 34. Power Propagation

每条 Ray 保留：

```text
power
```

经过元件后可以：

```text
Pout = Pin × transmission
```

或：

```text
Preflected = Pin × reflection
```

边缘入射可继续具有 vignetting / aperture attenuation。

---

# 35. Raman Material Model

V1 内置：

- Silicon
- Polystyrene
- Calcite / CaCO₃

作为示例与 regression benchmark。

同时必须支持：

> Custom Raman Material

---

# 36. Custom Material

用户可以：

### 手动创建

```text
Material Name
Fluorescence Level

Peak:
  Shift
  Relative Intensity
  Width
```

### CSV 导入

建议：

```text
shift_cm-1,relative_intensity,fwhm_cm-1
520.7,1.0,3
963,0.05,12
```

V1 Material Model 属于：

> Phenomenological Raman Reference Model

不尝试建立真实绝对 Raman scattering cross-section database。

---

# 37. Raman Signal Pipeline

V1 保留并重构现有总体模型：

```text
Ray reaches Sample
      ↓
Excitation Power
      ×
Focus Efficiency
      ↓
Raman Generation
      ↓
Raman Peaks
      +
Fluorescence
      +
Rayleigh Leakage
      ↓
Optical Throughput
      ↓
Spectrometer
      ↓
CCD QE
      ↓
Integration
      ↓
Expected Counts
```

可继续使用：

- Lorentzian peak；
- peak width；
- slit broadening；
- wavelength conversion；
- wavelength-dependent intensity；
- fluorescence；
- Rayleigh leakage；
- detector response。

---

# 38. Expected Spectrum

系统应始终维护：

> Expected Spectrum

定义：

- deterministic；
- 无随机 shot/read noise；
- 表示当前光路和参数下 CCD 的数学期望。

---

# 39. Live Preview

Live Preview：

```text
Expected Spectrum
        ↓
Simulated Noise
        ↓
Single Exposure Preview
```

特点：

- 自动刷新；
- 包含随机噪声；
- 不保存为正式科研数据；
- Scene 修改后立即更新。

---

# 40. Acquisition

V1 正式 Acquisition 采用两种模式。

## Single

```text
N = 1
```

## Average

```text
N > 1
```

参数：

```text
Integration Time
Number of Exposures
```

用户点击：

```text
Acquire
```

后系统运行：

```text
Snapshot Instrument State
        ↓
Simulate N Exposures
        ↓
Average
        ↓
Calculate Metrics
        ↓
Create AcquisitionRun
```

达到 N 后自动结束。

不将 Demo 的：

> 无限累积直到用户手动 Stop

作为正式主要 Acquisition 模式。

---

# 41. Acquisition State Integrity

Acquire 开始后必须冻结对应实验状态。

如果用户修改：

- optical component；
- component parameter；
- sample；
- wavelength；
- detector setting；

当前 Acquisition 必须：

> Cancel / Stop

并明确提示：

```text
Optical configuration changed.
Current acquisition was stopped.
```

不得把两个不同 Instrument State 下的数据混入同一 Acquisition。

---

# 42. Acquisition Snapshot

每个 AcquisitionRun 保存：

```text
id
timestamp

integrationTime
numberOfExposures

opticalSceneSnapshot
simulationSettingsSnapshot
materialSnapshot
spectrometerSnapshot

expectedSpectrum
acquiredSpectrum

focusEfficiency
ramanPower
rayleighLeakage
rayleighOD
snr
saturation

simulationModelVersion
```

这保证用户以后修改光路后，旧 Spectrum 仍然能够追溯其生成条件。

---

# 43. Spectrum View

必须支持：

- Expected Spectrum；
- Acquired Spectrum；
- Overlay；
- Zoom；
- Pan；
- Auto Scale；
- Cursor；
- Shift；
- Counts；
- Peak Marker；
- Saturation Indicator；
- Legend；
- Show / Hide Spectrum。

Raman Shift 默认单位：

```text
cm⁻¹
```

---

# 44. Dynamic Raman Window

不得继续把主 Spectrum 永久锁死为：

```text
-100 ~ 1900 cm⁻¹
```

Demo 中 PS 的 2852、2904、3054 cm⁻¹ 等峰会因此无法在主窗口显示，该问题必须修复。

V1 支持：

```text
Auto Window
Custom Window
```

---

# 45. Spectrum Analysis

V1 必须支持基础 Raman Analysis：

- Baseline Correction；
- Smoothing；
- Normalize；
- Automatic Peak Detection；
- Manual Peak；
- Peak Delete / Ignore；
- Peak Position；
- Intensity；
- FWHM；
- Multi-spectrum Overlay。

---

# 46. Non-destructive Processing

所有 Spectrum Processing 必须：

> Non-destructive

内部：

```text
Raw Spectrum
      ↓
Processing Pipeline
      ↓
Processed Spectrum
```

例如：

```text
processing:
  - baseline
  - smoothing
  - normalize
```

每一个 Processing Step：

- 可开关；
- 可编辑参数；
- 可删除；
- 可重置。

Raw Data 永远保持不变。

---

# 47. Peak Data

Peak 至少保存：

```text
position_cm-1
intensity
fwhm
assignment
source
```

source：

```text
auto
manual
reference
```

---

# 48. Peak Assignment

V1 保留 built-in material 的 Reference Peak Assignment。

Demo 已经包含 Si、PS 和 CaCO₃ 的部分 Raman peak assignment，可作为内置 reference dataset 的初始来源。

V1 不进行 AI chemical assignment。

---

# 49. Diagnostics Engine

Diagnostics 必须从 UI 独立成确定性规则系统。

Severity：

```text
ERROR
WARNING
INFO
```

---

# 50. Diagnostic Examples

### ERROR

```text
OPT_PATH_001
Excitation does not reach Sample.
```

```text
OPT_PATH_002
Raman return path does not reach Spectrometer.
```

### WARNING

```text
RAMAN_001
Rayleigh suppression below configured threshold.
```

```text
CCD_001
CCD saturation detected.
```

```text
FOCUS_001
Sample is significantly outside focal region.
```

### INFO

```text
SNR_001
Peak SNR is low.
```

---

# 51. Main Telemetry

UI 至少持续显示：

```text
Focus η
Path State
Rayleigh OD
Peak SNR
Saturation
```

保留 Demo 当前：

```text
SIGNAL
LEAK
NO PATH
```

的直观状态反馈思想。

---

# 52. 3D Optical Bench

V1 采用：

> **2D Authoring + 3D Visualization**

2D 是唯一 authoritative design state。

3D 不维护独立 optical scene。

```text
2D Project State
       ↓
3D Scene Builder
       ↓
Three.js Scene
```

---

# 53. 3D Features

必须保留 / 实现：

- Breadboard；
- Components；
- Posts / Holders；
- Excitation Beam；
- Raman Beam；
- Rayleigh Beam；
- Objective-Sample Focus Cone；
- Labels；
- Sample Spot。

Camera：

- Orbit；
- Pan；
- Zoom；
- Top；
- Front；
- Isometric；
- Reset。

Display toggles：

- Beam；
- Cone；
- Label。

现有 Demo 的 3D Presentation 能力可作为 V1 行为参考。

---

# 54. 3D Non-goals

V1 3D 不支持：

- 在 3D 中拖动 optical component；
- 3D freeform rotation；
- 3D ray tracing；
- full optical CAD；
- mechanical collision simulation。

---

# 55. Project Model

顶层对象：

```text
RapidOpticsProject
```

建议：

```text
RapidOpticsProject

metadata

opticalScene
  breadboards
  components

simulationConfiguration

materials

acquisitionRuns

spectrumLibrary

analysisState

diagnostics

viewState
```

---

# 56. Project Save / Load

必须支持：

```text
New Project
Open Project
Save
Save As
```

项目应包含：

- Optical Layout；
- Component Parameters；
- Simulation Settings；
- Materials；
- Acquisitions；
- Spectra；
- Processing；
- Metadata。

---

# 57. Schema Version

所有 Project 必须具有：

```text
schemaVersion
```

例如：

```text
"schemaVersion": "1.0"
```

未来数据结构变更必须通过：

> Migration

而不是直接破坏旧 Project。

---

# 58. Data Import / Export

V1 支持：

## Project

```text
Rapid Optics Project
```

## Optical Configuration

```text
JSON
```

## Spectrum

```text
JSON
CSV
```

## Figure

```text
PNG
SVG
```

---

# 59. Spectrum Export Semantics

必须明确区分：

```text
Expected
Raw Acquisition
Processed
```

不得继续出现 Demo 中：

> 用户看到 accumulated spectrum，但 Export 实际导出 expected spectrum

这种语义错误。

Export UI 必须让用户明确选择：

```text
Export Raw
Export Processed
Export Expected
```

---

# 60. Import Validation

所有 JSON Import 必须经过 Schema Validation。

不得：

```text
JSON.parse()
→ 直接信任数据
```

至少验证：

- file type；
- schema version；
- required fields；
- number range；
- component types；
- spectrum array length。

错误应返回可读错误信息。

---

# 61. Editor Command System

所有用户编辑动作建议抽象为 Command：

```text
AddComponentCommand
MoveComponentCommand
RotateComponentCommand
DeleteComponentCommand
UpdateParameterCommand
```

从而天然支持：

```text
Undo
Redo
History
Future AI operation
```

未来 AI Assistant 也可以生成同样的 Commands：

```text
AI Proposal
   ↓
Command[]
   ↓
User Confirm
   ↓
Execute
```

无需建立另一套修改路径。

---

# 62. Standalone Mode

Rapid Optics Studio 必须能够独立于 MetaInstrumentStudio 运行。

用户可以：

```text
Open Rapid Optics Studio
→ New Project
→ Design
→ Simulate
→ Acquire
→ Save
```

V1 不依赖 `InstrumentProject` 存在才能工作。

---

# 63. MetaInstrumentStudio Integration

Rapid Optics Studio 同时预留 Project Mode。

未来：

```text
InstrumentProject
       ↓
InstrumentPlan
       ↓
Optical Subsystem
       ↓
Create / Open Rapid Optics Project
```

Studio 输出可以作为：

```text
Optical Design Artifact
```

回写 InstrumentProject。

Rapid Optics Studio 作为独立 Engineering Tool，而不是 Project Copilot 的永久子 Agent，这与 MetaInstrumentStudio 总体架构保持一致。

---

# 64. V1 Integration Scope

V1：

> 定义 integration contract，但不要求 MetaInstrumentStudio 主平台已经完成。

因此 Rapid Optics Studio 的开发不会被主平台进度阻塞。

---

# 65. Performance Requirements

典型项目中：

- 30+ optical components；
- branching rays；
- 900–2000+ spectrum samples；

拖动元件时应保持明显实时反馈。

目标：

```text
Typical simulation update < 100 ms
```

交互目标：

```text
30–60 FPS editor interaction
```

若 calculation 超过预算，应移动到 Web Worker。

---

# 66. Reliability Requirements

必须保证：

- Simulation exception 不导致整个 Editor 崩溃；
- Invalid component 显示 warning；
- Invalid import 不污染当前 Project；
- Acquisition 不覆盖 Raw Data；
- Project Save 可恢复；
- Undo / Redo 不破坏 simulation state；
- 3D Failure 不影响 2D Studio。

3D 必须本地依赖构建。

禁止正式版继续依赖外部 Three.js CDN 才能工作。

---

# 67. Testing Strategy

## Unit Tests

重点测试：

- Ray intersection；
- reflection；
- branching；
- aperture；
- focus efficiency；
- Raman conversion；
- noise；
- spectrum processing；
- diagnostics；
- schema validation。

## Regression Tests

现有 Demo 默认 Raman Layout 应转化为 regression fixture。

包括：

```text
532 nm + Si default setup
```

作为 V1 第一套 benchmark。

## UI Tests

测试：

- Add；
- Move；
- Rotate；
- Delete；
- Undo；
- Save；
- Load；
- Acquire；
- Spectrum processing；
- 3D open。

## End-to-End

建议使用：

```text
Playwright
```

---

# 68. V1 Acceptance Scenario A — Default Raman System

用户新建 Raman Project。

系统创建默认：

```text
Laser
Mirror
Dichroic
Objective
Sample
Filter
Spectrometer
```

Expected：

- excitation 到达 Sample；
- Raman 返回 Spectrometer；
- Path = SIGNAL；
- Spectrum 显示 Si characteristic peak；
- 3D 显示对应系统。

---

# 69. Acceptance Scenario B — Broken Optical Path

用户旋转 Mirror。

Expected：

```text
Ray changes direction
↓
Sample no longer reached
↓
Spectrum signal drops
↓
Diagnostic appears
↓
Path = NO PATH
```

全部实时完成。

---

# 70. Acceptance Scenario C — Defocus

用户移动 Sample。

Objective-Sample distance 偏离 focal distance。

Expected：

```text
Focus η ↓
Raman Power ↓
Peak Counts ↓
SNR ↓
```

---

# 71. Acceptance Scenario D — Rayleigh Leakage

用户旋转 Edge Filter。

Expected：

```text
AOI changes
↓
Leakage changes
↓
Rayleigh background changes
↓
OD changes
↓
SNR changes
```

---

# 72. Acceptance Scenario E — Beam Splitter

用户增加 Beam Splitter。

Expected：

```text
Input Ray
  ↓
Branch A
+
Branch B
```

两条 ray 均继续独立参与 nearest intersection tracing。

---

# 73. Acceptance Scenario F — Virtual Acquisition

设置：

```text
Integration = 1 s
N = 20
```

点击：

```text
Acquire
```

Expected：

- 创建 snapshot；
- 生成 20 次 noisy exposure；
- 自动平均；
- acquisition 自动结束；
- 保存 mean spectrum；
- 保存 N；
- 保存 integration；
- 保存 SNR；
- 保存完整 instrument snapshot。

---

# 74. Acceptance Scenario G — State Protection

Acquire 过程中移动 Mirror。

Expected：

```text
Current acquisition stops
```

并明确告诉用户：

> Instrument configuration changed.

不得继续把新旧光路数据累积到同一个 AcquisitionRun。

---

# 75. Acceptance Scenario H — Spectrum Processing

用户：

```text
Baseline Correction
→ Smoothing
→ Normalize
```

Expected：

- Raw Spectrum 不变化；
- Processed Spectrum 更新；
- Processing Pipeline 可见；
- 任一步骤可关闭；
- Reset 后恢复 Raw display。

---

# 76. Acceptance Scenario I — Save / Reload

用户保存 Project。

关闭并重新打开。

必须恢复：

- component positions；
- rotations；
- parameters；
- materials；
- spectra；
- acquisition history；
- processing；
- project metadata。

仿真结果重新计算后应与保存状态一致。

---

# 77. Acceptance Scenario J — 3D Synchronization

用户在 2D 移动 Mirror。

打开 / 查看 3D。

Expected：

- Mirror 3D position 同步；
- rotation 同步；
- ray path 同步；
- labels 同步；
- Sample spot / focus state 同步。

---

# 78. Known Demo Issues to Fix

V1 不得继承以下已发现问题：

1. Prism / Beam Splitter / Pinhole 名称缺失；
2. PS 高 Raman Shift 峰无法在主窗口正常显示；
3. Acquisition Export 导出 expected 而非实际 acquisition；
4. Three.js 依赖 CDN；
5. JSON Import validation 不充分。

这些问题均已在当前产品梳理中识别。

---

# 79. Development Priorities

V1 不再采用：

```text
V1 = Demo
V1.5 = Editor
```

的划分。

正式 V1 应直接达到：

> **Usable Raman Virtual Instrument Studio**

---

# 80. Suggested Development Phases

## Phase 0 — Project Skeleton

建立：

- Monorepo；
- React；
- Node；
- Shared Types；
- Project Schema；
- test infrastructure。

## Phase 1 — Optical Core

重构：

- Scene；
- Component；
- Transform；
- Ray；
- Intersection；
- Trace；
- Branching；
- Power。

同时完成 Demo regression tests。

## Phase 2 — 2D Studio

实现：

- Canvas；
- component rendering；
- selection；
- drag；
- rotate；
- zoom；
- pan；
- undo / redo；
- property inspector。

## Phase 3 — Raman Pipeline

迁移并重构：

- material；
- Raman peaks；
- Rayleigh；
- focus；
- expected spectrum；
- CCD noise。

## Phase 4 — Acquisition

实现：

- Preview；
- Single；
- Average；
- AcquisitionRun；
- Snapshot。

## Phase 5 — Spectrum Analysis

实现：

- charts；
- zoom/pan；
- cursor；
- overlay；
- baseline；
- smoothing；
- normalize；
- peak detection；
- FWHM。

## Phase 6 — 3D

迁移 Three.js Presentation Layer。

## Phase 7 — Project & I/O

完成：

- Save；
- Load；
- Import；
- Export；
- Schema migration。

## Phase 8 — Diagnostics & Polish

完成：

- deterministic diagnostics；
- warnings；
- editor polish；
- performance；
- E2E。

---

# 81. Recommended Frontend Libraries

建议：

```text
React
TypeScript
Vite

State:
Zustand

2D:
Konva / react-konva

3D:
Three.js

Charts:
ECharts

Validation:
Zod

Testing:
Vitest
React Testing Library
Playwright
```

是否最终使用某一个 UI Component Library 不属于产品核心决策，可以在实现时调整。

---

# 82. Recommended Backend Stack

```text
Node.js 24 LTS
TypeScript
Fastify
Zod / JSON Schema
```

V1 不需要为了“看起来像完整后端”而引入过重架构。

Node Server 应保持：

> Thin, modular and integration-ready.

---

# 83. Packaging Direction

V1 优先：

> Web Application

同一代码库提供：

```text
Standalone Web Mode
+
MetaInstrumentStudio Embedded Mode
```

如果后续确实需要真正桌面应用，可以再使用 desktop shell 包装现有 Web Studio。

核心 simulation packages 不应依赖具体 shell。

---

# 84. Definition of V1 Done

只有在以下全部成立后，才能认为 Rapid Optics Studio V1 完成：

- 可创建正式 Project；
- 可完成专业基础 2D 编辑；
- 10 类 Demo 元件完整迁移；
- 实时 simplified ray tracing；
- branching；
- Raman signal simulation；
- Virtual CCD；
- deterministic expected spectrum；
- simulated acquisition；
- Acquisition snapshot；
- Raman spectrum analysis；
- diagnostics；
- synchronized 3D viewer；
- Project Save / Load；
- JSON / CSV / PNG / SVG I/O；
- Undo / Redo；
- Demo 关键行为 regression tests 通过；
- 无外部 CDN 运行依赖；
- 核心代码已模块化，不再是单 HTML monolith。

---

# 85. V1 Product Statement

Rapid Optics Studio V1 最终应能够被描述为：

> **一个面向 Raman 科研仪器研发的交互式虚拟光学工作台。用户可以在二维光学台中搭建和调整光路，软件实时执行简化光线追迹和 Raman 信号计算，通过虚拟 Spectrometer/CCD 完成模拟采集，并对所得 Raman 光谱进行基础分析和工程诊断，同时提供同步三维光学台以及完整项目数据管理能力。**

它不是：

> 一个画光路的网页 Demo。

也不是：

> 一个简化版 Zemax。

而是：

> **连接 Optical Design、Virtual Experiment 与 Raman Data Analysis 的科研仪器工程 Studio。**

---

# 86. Post-V1 Direction

V1 完成之后，优先升级顺序建议为：

```text
V1
Usable Raman Virtual Instrument Studio

↓ V2

Higher-fidelity Optical Physics
- Snell
- Lens
- NA
- Gaussian Beam
- Aperture
- wavelength-dependent coatings

↓ V3

Advanced Raman Analysis
- Cosmic Ray Removal
- Peak Fitting
- Library Search
- Material Identification

↓ V4

Optical Copilot
- Diagnostics Explanation
- Modification Proposal
- Auto Alignment
- SNR Optimization

↓ Future

Real Instrument Integration
```

原则仍然是：

> **先建立稳定、可维护的工程工作台和数据模型，再逐步提高物理精度和 AI 能力。**