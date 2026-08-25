# Rapid Optics Studio V1 Implementation Plan

> **Revision:** Simplified V1 engineering baseline — single React/Vite project, npm, browser-only, incremental architecture.

## 0. 文档定位

本文基于以下文件的完整审阅形成：

- `PRD.md`：产品目标、V1 范围和验收要求的权威基线；
- `reference/raman_sandbox.html`：现有交互 Demo、算法原型、默认数据和行为参考。

本文只给出工程分析与实施计划，不修改 PRD 的产品需求，也不开始后续功能实现。

当前实施约束：

- Node.js 24.18.0；
- React + TypeScript + Vite；
- Three.js；
- Zustand；
- Zod；
- V1 暂不建设 Node.js 后端、数据库或服务器；
- optics / Raman / CCD 实时仿真运行于前端可复用的纯 TypeScript core；V1 初始采用主线程同步调用，仅在性能测试证明有必要时再引入 Web Worker。

---

## 1. 现有 Demo 代码结构与功能分析

### 1.1 物理结构

Demo 是一个 1013 行的单 HTML 文件，包含四层内容：

1. CSS（约 160 行）
   - 暗色工程工作台样式；
   - 主面板、工具栏、光谱、遥测、弹窗和 3D 控件；
   - 响应式布局和 reduced-motion 处理。
2. HTML（约 120 行）
   - 激光波长切换；
   - 2D bench；
   - 元件添加、配置导入导出；
   - 光谱、采集、材料选择和遥测；
   - 3D 与放大光谱弹窗。
3. 业务与仿真 JavaScript（约 490 行）
   - 材料、峰表、仪器常量；
   - 元件与全局状态；
   - 2D 几何、光线追迹；
   - Raman / Rayleigh / fluorescence / CCD 信号计算；
   - 2D 与光谱 Canvas 渲染；
   - 拖动、旋转、添加、删除和采集；
   - JSON 导入导出。
4. Three.js 展示 JavaScript（约 240 行）
   - 由当前 `comps` 和 `TRACE` 重建 3D scene；
   - 面包板、元件、支杆、标签、光束和焦锥；
   - Orbit/Pan/Zoom、预设视角和显示开关。

Demo 虽然使用注释分出了“数据、数学、光追、信号、渲染、交互、I/O、3D”等区域，但它们共享同一脚本作用域和可变全局状态，并不具备模块边界。

### 1.2 当前状态模型

Demo 的权威状态由以下全局变量构成：

- `state`：波长、材料、积分时间、单选项；
- `comps` / `uid`：元件数组和递增数字 ID；
- `TRACE` / `SIG`：最近一次光追和光谱结果；
- `acquiring` / `accSum` / `accN`：采集运行态；
- `overlays`：导入光谱叠加；
- `R3` / `orbit` / `VIEW`：3D renderer、相机和显示状态。

所有写操作直接修改这些对象，并调用 `retrace()` 串行执行：

```text
修改全局状态
  → traceSystem()
  → computeSpectrum()
  → updateUI()
  → drawBench()
  → clearAcc()
  → sync3D()
```

优点是原型链路短、反馈直接；缺点是项目数据、编辑状态、派生仿真结果、采集状态和视图状态没有明确区分，也无法可靠支持 undo/redo、快照、迁移、并发计算或错误隔离。

### 1.3 元件与 2D 编辑

Demo 定义并能参与渲染/光追/3D 的 10 类元件：

- Laser；
- Mirror；
- Dichroic；
- Objective；
- Sample；
- Edge Filter；
- Spectrograph；
- Prism；
- Beam Splitter；
- Pinhole。

默认布局包含前 7 类；Prism、Beam Splitter、Pinhole 可通过工具栏加入。Laser、Sample、Spectrograph 不能从组件库新增，也不能删除。

现有编辑能力：

- 点击单选；
- 网格吸附拖动；
- 通过外圈手柄旋转大部分元件；
- 添加 7 类可选元件；
- 删除非关键元件；
- Objective 焦距滑块；
- Reset 默认布局。

主要限制：

- Canvas pixel 与物理坐标混用；
- 固定 28 px 网格，通过 3D 映射时才换算成 25 mm；
- 无 camera、world/screen transform、无限画布、缩放和平移；
- 无多选、框选、复制粘贴、duplicate、锁定、对齐、undo/redo；
- inspector 参数很少，大量元件参数硬编码；
- `L` 同时承担画法尺寸、交点半孔径和部分 3D 尺寸，语义混杂；
- 数字 ID 在导入时重建，不能作为稳定引用；
- inspector 的 `NAMES` 缺少 Prism、Beam Splitter、Pinhole，选中时会显示 `undefined`。

### 1.4 光线追迹

光追采用 2D 几何光线 + 队列传播：

```text
Laser 发出 excitation ray
  → 搜索最近交点
  → 记录 segment
  → 元件 interaction 产生 0..N 条 output rays
  → 入队继续传播
```

已有机制：

- 平面元件线段求交；
- Laser / Sample 圆形体求交；
- nearest-hit；
- specular reflection；
- 基于离轴交点的连续 vignetting；
- 通过 ray `kind` 区分 excitation / Raman / Rayleigh；
- ray power 传播；
- Beam Splitter 和 Dichroic 分支；
- 按最小功率、最大 generation、总处理数终止。

各元件当前行为：

- Mirror：镜面反射；
- Dichroic：Raman 直透；其余 kind 99% 反射、1% 直透；
- Edge Filter：Raman 全透；其余 kind 按 AOI sigmoid 模型泄漏；
- Prism：固定约 40° 偏转；
- Beam Splitter：固定 50/50 透射和反射；
- Pinhole：直透，空间滤波仅由通用有限口径/渐晕近似；
- Objective：直透，焦点只在 Sample 命中后按距离计算；
- Sample：命中 excitation 后产生严格反向传播、等功率起点的 Raman 和 Rayleigh；
- Spectrograph：累计到达的 Raman power 与 Rayleigh leakage。

光追是可用的概念验证，但数据结构没有显式 ray ID、source component、termination reason、interaction record 或稳定的 branch graph；`last` / 临时 `_cid` 也依赖可变对象，需正式建模。

### 1.5 Focus、Raman 与 CCD 信号链

Demo 的总体信号链与 PRD 目标一致：

```text
到达 Sample 的 excitation power
  × focus efficiency
  → Raman + fluorescence + Rayleigh leakage
  × grating throughput
  × wavelength-dependent QE
  × integration time / gain scale
  → expected counts
  → shot noise + read noise
  → preview / accumulated mean
```

具体已有算法和数据：

- Raman shift 到 wavelength 的转换；
- Lorentzian peak；
- intrinsic peak width 与 slit broadening 的平方和；
- 近似 `ν⁴` 波长依赖；
- 激光线附近 edge response；
- wavelength-dependent QE 高斯近似；
- 激光相关 fluorescence factor；
- 宽 fluorescence background；
- Rayleigh Lorentzian；
- dark current、read noise、full-well clipping；
- peak SNR 估算；
- Box-Muller 高斯随机数；
- shot noise 的高斯近似和独立 read noise。

Focus 使用：

```text
dz = Objective-Sample distance - focal distance
eta = 1 / (1 + (dz / zR)^2)
```

其中 `zR` 目前是 42 canvas pixels，而不是物理单位。

内置材料数据：

- Silicon：302、520.7、963 cm⁻¹；
- Polystyrene：620、1001、1031、1155、1450、1583、1602、2852、2904、3054 cm⁻¹；
- Calcite：155、282、712、1086、1436 cm⁻¹；
- 三种材料的相对峰强、宽度、fluorescence level 和中文峰归属；
- 532 / 633 / 785 nm 三种激发波长。

当前 expected spectrum 固定为 `-100..1900 cm⁻¹`、900 点。放大“参考谱”会根据材料峰自动扩窗，但它重新计算的是归一化参考峰形，不是当前 expected/acquired CCD spectrum，因此没有真正修复主谱窗口问题。

### 1.6 Acquisition

Demo 支持：

- 自动更新的 noisy single-exposure preview；
- Acquire/Stop；
- 约每 140 ms 生成一次 exposure；
- 无限累积并显示均值；
- SNR 按 `sqrt(N)` 显示增长。

它没有固定 N、自动结束、AcquisitionRun、仪器快照、运行历史或 immutable raw data。场景变化会清空累积数组，但 `acquiring` 仍保持 true，会直接从新状态继续采集，没有按 PRD 停止并告知用户。导出始终写 `SIG.exp`（expected spectrum），即使界面正在显示 accumulated acquisition。

### 1.7 Spectrum、遥测与诊断

已有：

- expected curve 与 noisy/accumulated curve；
- JSON 光谱 overlay；
- material reference peak markers；
- 自动 Y scale；
- saturation line；
- Focus、Path、Rayleigh OD、Peak SNR 遥测；
- SIGNAL / LEAK / NO PATH 状态；
- 激发未到样品、回光未进光谱仪的简短原因；
- 放大参考谱和 built-in peak assignments。

缺少真正的 spectrum zoom/pan/cursor、动态当前谱窗口、expected/raw/processed 类型语义、处理 pipeline、peak detection/FWHM/manual peak、多谱管理和独立 diagnostics rule engine。

### 1.8 3D 展示

Demo 使用 Three.js r128 CDN，并由 2D `comps` / `TRACE` 即时构建：

- 自适应尺寸 breadboard 与纹理孔阵；
- 10 类元件的简化几何；
- posts/holders；
- labels；
- excitation/Raman/Rayleigh 光束管；
- Objective-Sample focus cones；
- sample spot；
- top/front/isometric/reset；
- orbit、shift-pan、wheel zoom；
- auto-rotate 与 beam/cone/label toggle。

方向是正确的：3D 是 2D 权威状态的 presentation layer。但当前每次同步会整组销毁并重建对象，未 dispose geometry/material/texture，可能产生 GPU 资源泄漏；3D renderer 与错误恢复也仍在全局 UI 脚本中。

### 1.9 导入导出

已有两类 JSON：

- spectrum 包：标签、波长、材料、积分时间、窗口、遥测、峰和 expected counts；
- optics config：波长、材料、积分时间、grid 和 components。

导入只做少量结构检查和数值强转：未知元件被静默跳过，缺失/越界值被默认化，数组长度和有限数没有验证，且导入过程会直接覆盖当前状态。没有 schemaVersion migration、事务式 load、Project save/load、CSV/PNG/SVG 或错误明细。

---

## 2. Demo 与 PRD 能力对照

### 2.1 Demo 已有能力

| 领域 | 已验证能力 | V1 可利用方式 |
|---|---|---|
| 完整链路 | Layout → trace → signal → CCD preview → telemetry → 3D | 作为产品闭环和回归行为参考 |
| 元件 | 10 类元件均有 2D、interaction 和 3D 表达 | 建立 component fixture 与最低行为测试 |
| 光追 | nearest intersection、反射、分支、power、终止 | 提炼成纯函数 contract 和 regression cases |
| Raman | 3 材料、Lorentzian 峰、fluorescence、Rayleigh | 迁移数据与经确认的公式常量 |
| CCD | QE、grating、integration、dark、read noise、full well、SNR | 保留信号链，拆成 deterministic/stochastic 两层 |
| 预览/采集 | noisy preview、连续 exposure、均值、SNR√N | 保留体验思想，重做正式 acquisition state machine |
| 遥测 | Focus、Path、OD、SNR、SIGNAL/LEAK/NO PATH | 作为 diagnostics 输入与 UI 语义参考 |
| 光谱 | expected/noisy 曲线、overlay、peak marker、saturation | 作为 chart 和数据类型设计参考 |
| I/O | optics config 和 spectrum JSON 原型 | 用于 legacy importer fixture，不作为正式 schema |
| 3D | 由 2D 状态构建 presentation scene | 保留单向同步原则和视觉风格 |

### 2.2 Demo 缺失能力

按 PRD 的 V1 Definition of Done，主要缺口如下：

#### Project 与 schema

- 正式 `RapidOpticsProject`；
- schemaVersion、Zod validation、migration；
- metadata、materials、acquisitionRuns、spectrumLibrary、analysisState；
- New/Open/Save/Save As；
- 完整 project JSON 和可靠恢复；
- transactional import；
- CSV/PNG/SVG 导入导出语义。

#### 编辑器

- mm world coordinate 与 camera/screen coordinate 分离；
- infinite workspace、configurable breadboard；
- zoom、pan、reset view；
- grid show/hide、snap on/off、grid size、连续坐标；
- multi-select、box select、copy/paste、duplicate；
- undo/redo、command history；
- lock/unlock、align/distribute；
- 完整 property inspector；
- 稳定 ID、enabled、name、metadata、visualization schema。

#### 元件参数与物理模型

- Mirror reflectivity；
- Dichroic excitation R/T 和 Raman T 参数化；
- Edge Filter transmission/suppression/leakage 参数化；
- Objective focal length/aperture/NA 的物理单位；
- Beam Splitter 可配置 R/T；
- Prism 可配置 deflection；
- Pinhole aperture diameter 和真正 clipping 结果；
- Spectrometer/CCD 参数对象；
- component enabled/disabled；
- 通用 interaction contract、明确 termination 与 branch trace。

#### Raman、CCD 与 Acquisition

- custom material editor/CSV import；
- deterministic expected spectrum 的独立数据实体；
- dynamic/custom Raman window；
- Preview/Single/Average 的明确区分；
- 有限 N、自动结束；
- AcquisitionRun 和完整 instrument snapshot；
- 场景变更停止采集；
- expected/raw/processed 不可混淆的导出。

#### Spectrum Analysis

- chart zoom/pan/cursor/show-hide；
- baseline correction、smoothing、normalize；
- 非破坏 processing pipeline；
- automatic/manual peak；
- delete/ignore、position、intensity、FWHM；
- multi-spectrum overlay 的正式数据模型。

#### Diagnostics、3D、质量

- 独立 deterministic diagnostics engine；
- 标准 code/severity/message/context；
- local Three.js dependency；
- 3D 资源生命周期和失败隔离；
- unit/regression/UI/E2E 测试；
- 性能预算、Worker 协议与异常隔离；
- 30+ 元件和 900–2000+ samples 的基准。

### 2.3 Demo 中应保留的算法与数据

“保留”表示先固化为 golden fixtures/tests，再以 typed pure functions 重写；不表示复制原函数。

1. 默认 532 nm + Silicon Raman layout
   - 默认元件位置、角度、焦距和连通关系；
   - 作为 PRD 指定的第一套 regression benchmark；
   - 坐标需从 28 px 网格无损换算成 25 mm world grid。
2. 内置波长和材料参考数据
   - 532/633/785 nm；
   - Si、PS、CaCO3 的 peak shift、relative intensity、width、fluorescence；
   - peak assignment 文本；
   - 数据迁移后需注明 provenance/model version。
3. 2D 几何基础
   - vector、normal、reflection；
   - ray 与有限平面 aperture 的交点；
   - nearest-hit；
   - one input → 0..N output rays；
   - generation/power threshold 防护。
4. 简化元件行为的产品意图
   - Mirror specular reflection；
   - Dichroic routing；
   - Edge Filter AOI 影响 Rayleigh leakage；
   - Prism fixed-deflection model；
   - Beam Splitter branching；
   - Pinhole finite aperture；
   - Objective-Sample defocus；
   - Sample 的 simplified backward Raman/Rayleigh emission。
5. Raman/CCD 信号链
   - shift/wavelength conversion；
   - Lorentzian peaks；
   - slit broadening；
   - wavelength-dependent intensity、QE 和 fluorescence；
   - Raman + fluorescence + Rayleigh 合成；
   - throughput、integration、dark、read noise、full-well；
   - deterministic expected counts 与 stochastic exposure 分离；
   - peak SNR 和 Rayleigh OD 的计算思想。
6. 表现与反馈
   - excitation/Raman/Rayleigh 的颜色和功率可视化；
   - Focus/Path/OD/SNR telemetry；
   - SIGNAL/LEAK/NO PATH；
   - 2D-authoritative → 3D presentation 的单向派生；
   - 3D breadboard、holders、labels、focus cone、sample spot 和相机预设。

以下常量不能无审查地成为“物理真值”：`GAIN=340`、`I_RAY=1e6`、`PL=50`、`FLB=2`、`ZRpx=42`、固定 sigmoid 参数等。Phase 1/3 应把它们登记为 versioned simplified-model parameters，注明单位或无量纲语义，并用 golden tests 锁住当前行为。

### 2.4 应重构而不是直接复制的部分

| Demo 实现 | 问题 | 正式实现方向 |
|---|---|---|
| 单 HTML + 全局变量 | 无模块边界、难测试 | `src/core` / `src/features` 分层 + typed public API |
| `comps` 可变数组 | 项目态/编辑态混合 | Zod project schema + Zustand slices |
| `retrace()` 操纵 DOM | physics 与 UI 耦合 | pure simulation pipeline + selectors/effects |
| pixel coordinate | 与 PRD 冲突 | mm world + explicit viewport transform |
| `L` 通用尺寸 | 几何/画法/3D 语义混合 | aperture、visual size、mechanical metadata 分离 |
| type `if/else` 巨链 | 扩展性和测试性差 | registry + typed interaction handlers |
| 临时 ray `_cid` / `last` | 可变、难追溯 | immutable ray/segment/interaction records |
| 全局 `find(objective)` | 多 Objective 场景不可靠 | 基于实际 trace lineage / interaction context |
| 固定 `SMIN/SMAX/N` | PS 高位峰丢失 | SpectrumAxis + auto/custom window |
| expected 与 acquired 混用 | 导出语义错误 | discriminated spectrum kinds |
| `Math.random()` | 回归不可重复 | injectable seeded RNG |
| 无限 acquisition loop | 不满足有限 N 和快照 | explicit state machine + immutable snapshot |
| 直接 `JSON.parse` 覆盖状态 | 可能污染项目 | parse → validate → migrate → commit |
| Canvas immediate rendering | 交互/物理混杂 | component render registry + camera abstraction |
| 3D 每次全量重建 | 性能/GPU 泄漏 | scene adapter + keyed diff/disposal |
| Three.js CDN r128 | 离线和版本风险 | local package lock + code splitting |
| `alert` / DOM string templates | 错误不可组合、XSS 风险 | typed errors + React components |

---

## 3. 正式项目目录结构

V1 采用**单一 React + TypeScript + Vite 项目**，不在第一阶段引入 monorepo/workspace，也不创建 `apps/`、`packages/` 或占位 Node.js server。

这样做的目标是：

- 尽快建立可运行、可验证的正式 Studio；
- 保持光学/Raman/CCD 核心代码与 React UI 解耦；
- 避免为尚未出现的多应用共享场景提前支付 workspace、package exports、跨包构建和版本管理成本；
- 未来若 MetaInstrumentStudio、Node backend 或其他应用确实需要共享 core，再将稳定的 `src/core/*` 平移为独立 packages。

正式目录建议如下：

```text
RapidOpticsStudio/
├─ PRD.md
├─ IMPLEMENTATION_PLAN.md
├─ README.md
│
├─ reference/
│  └─ raman_sandbox.html          # 只读行为参考，不进入正式 bundle
│
├─ src/
│  ├─ app/                        # 应用启动、全局 provider、error boundary
│  ├─ features/
│  │  ├─ optical-bench/           # 2D 工作台 UI
│  │  ├─ component-library/       # 元件库 UI
│  │  ├─ inspector/               # 属性面板
│  │  ├─ spectrum/                # 光谱显示与分析 UI
│  │  ├─ acquisition/             # 模拟采集 UI
│  │  ├─ diagnostics/             # 诊断 UI
│  │  └─ viewer-3d/               # Three.js 3D presentation
│  │
│  ├─ core/
│  │  ├─ optics/                  # 纯 TypeScript 光学几何与 ray tracing
│  │  ├─ raman/                   # Raman / focus / fluorescence / Rayleigh
│  │  ├─ acquisition/             # Virtual CCD、noise、acquisition logic
│  │  ├─ spectrum/                # Spectrum axis、processing、peaks、metrics
│  │  └─ diagnostics/             # deterministic diagnostic rules
│  │
│  ├─ project/
│  │  ├─ schema/                  # Zod schema
│  │  ├─ defaults/                # 默认项目/默认元件/内置材料
│  │  ├─ serialization/           # JSON/CSV 等序列化
│  │  └─ migration/               # schema migration，按需增量建立
│  │
│  ├─ store/                      # Zustand state
│  ├─ types/                      # 跨模块但稳定的 app-level types
│  ├─ utils/                      # 真正通用 utilities
│  ├─ App.tsx
│  └─ main.tsx
│
├─ public/
├─ tests/
│  ├─ fixtures/                   # 从 Demo 提取的默认布局、材料与 legacy 数据
│  ├─ regression/                 # default path / broken path / branching 等
│  └─ e2e/                        # Phase 8 再启用 Playwright
│
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ eslint.config.js
└─ .gitignore
```

### 3.1 模块依赖方向

核心规则：**科学计算层不依赖 React、Zustand、Three.js 或 DOM。**

```text
project/schema + shared app types
              ↓
         core/optics
              ↓
         core/raman
              ↓
      core/acquisition
              ↓
        core/spectrum
              ↓
      core/diagnostics

features/* + store/* 组合和消费上述模块
viewer-3d 只消费 Project/Trace 派生结果
```

允许模块之间通过明确的 typed API 传递数据，但禁止出现：

- physics function 直接读 Zustand store；
- React component 内写核心物理公式；
- Three.js scene 反向修改权威 Project State；
- core 直接访问浏览器文件 API 或弹窗。

### 3.2 状态边界

Zustand 中应逐步明确以下状态边界：

- **Persisted Project State**：需要保存的权威设计与实验数据；
- **Editor State**：selection、clipboard、active tool、undo/redo history；
- **View State**：2D camera、grid、panel visibility、3D toggles；
- **Derived Simulation State**：trace、expected spectrum、telemetry、diagnostics；
- **Acquisition Runtime State**：idle/running/completed/cancelled/error；
- **Acquisition History**：完成后的 immutable AcquisitionRun，归入 Project。

Simulation Result 不是第二份 Project State。用户编辑的是 Project；trace、expected spectrum、diagnostics、3D 都是派生结果。

### 3.3 Package Manager 与后端决策

V1 固定：

```text
Package Manager: npm
Runtime/Tooling: Node.js 24.18.0
Frontend: React + TypeScript + Vite
3D: Three.js
State: Zustand
Validation: Zod
```

V1 不建设：

- Node.js backend；
- Fastify；
- 数据库；
- Docker；
- 云服务器；
- monorepo/workspace；
- 独立 npm internal packages。

Node.js 在 V1 主要作为 npm / Vite / TypeScript / test/build 工具链运行环境。

---

## 4. V1 开发阶段与依赖关系

### 4.1 阶段总览

| Phase | 目标 | 关键输出 | Exit Gate |
|---|---|---|---|
| 0. Bootstrap | 建立最小可持续开发环境 | React/Vite 项目、目录、基础依赖、Vitest smoke、README | `dev/build/test/lint` 可运行 |
| 1. Data Model + Optical Core | 建立核心数据模型与 2D 光追 | mm world、10 类 component contract、Ray/Intersection/Trace、Demo regression fixtures | 默认/断路/分束等 core tests 通过 |
| 2. 2D Studio | 建立权威 2D 编辑器 | camera、grid/snap、select/move/rotate、inspector、zoom/pan、undo/redo、多选等 | 用户可搭建并实时看到 trace |
| 3. Raman + Virtual CCD | 重建科学信号闭环 | material、focus、Raman/Rayleigh/fluorescence、expected spectrum、Virtual CCD preview | Demo Raman 核心行为恢复并参数化 |
| 4. Acquisition | 建立正式模拟采集记录 | Single/Average N、snapshot、AcquisitionRun、状态完整性 | PRD F/G 场景通过 |
| 5. Spectrum Analysis | 建立非破坏光谱处理 | zoom/pan/cursor、overlay、baseline、smoothing、normalize、peak/FWHM | Raw 不变，processing 可重放 |
| 6. 3D Presentation | 重建同步 3D 光学台 | local Three.js、breadboard、components、rays、cone、camera | PRD J 通过，3D failure 不影响 2D |
| 7. Project & I/O | 收口正式项目持久化 | Project schema v1、Save/Open/Save As、JSON/CSV/PNG/SVG、legacy import | PRD I 与 import validation 通过 |
| 8. Diagnostics + Hardening | 完成工程诊断和 V1 发布质量 | ERROR/WARNING/INFO、E2E、性能、error boundary、offline regression | 全部 V1 acceptance scenarios 通过 |

### 4.2 依赖关系

```text
Phase 0 Bootstrap
      ↓
Phase 1 Data Model + Optical Core
      ↓
Phase 2 2D Studio
      ↓
Phase 3 Raman + Virtual CCD
      ↓
Phase 4 Acquisition
      ↓
Phase 5 Spectrum Analysis
      ↓
Phase 6 3D Presentation
      ↓
Phase 7 Project & I/O
      ↓
Phase 8 Diagnostics + Hardening
```

这是默认实施顺序，不要求所有工作机械串行。例如 Diagnostics core 可以在 Phase 3 后提前开始，Project serialization 也会在早期出现最小实现。但**每次给 Codex 的施工任务应只覆盖当前明确 Phase，不自动推进下一阶段。**

### 4.3 为什么这样调整

相对原计划，本次调整只改变工程复杂度和实施顺序，不改变 PRD：

1. 不提前拆成多个 workspace packages；
2. 不为了未来 backend 创建空架构；
3. Phase 0 只解决“项目能可靠开发”，不一次建完整产品 Schema；
4. Schema 采用增量演进：Phase 1 先覆盖 Optical Core，Phase 3/4/5 随领域需求扩展，Phase 7 收口正式 Project v1；
5. Web Worker 不作为先决条件，先测真实性能；
6. Playwright 和完整 E2E 放到 Phase 8，避免初始化阶段投入过多测试基础设施；
7. 仍然坚持 Demo regression-first、typed core、2D authoritative、immutable acquisition 等关键架构原则。

---

## 5. Phase 0 详细实施计划：Bootstrap

### 5.1 目标

Phase 0 只负责把当前目录变成一个**可运行、可构建、可测试、可持续开发的正式 React 项目**。

Phase 0 不实现：

- Ray tracing；
- Raman；
- CCD；
- 2D Studio 功能；
- 3D 功能；
- 完整 Project schema；
- Web Worker；
- Backend；
- Playwright E2E。

### 5.2 工作项

#### P0.1 环境确认

检查并记录：

```text
node -v   → v24.18.0
npm -v
git --version
```

若 Node/npm/Git 已可用，不重复安装。

#### P0.2 初始化 React + TypeScript + Vite

在当前 `RapidOpticsStudio/` 根目录内初始化单一 Vite React TypeScript 项目。

要求：

- 保留 `PRD.md`；
- 保留 `IMPLEMENTATION_PLAN.md`；
- 保留 `reference/raman_sandbox.html`；
- 不覆盖 reference Demo；
- 使用 npm 并生成 `package-lock.json`。

#### P0.3 安装最小基础依赖

正式运行依赖：

```text
three
zustand
zod
```

开发依赖按 Vite/React TypeScript 默认配置补齐，并加入：

```text
vitest
```

ESLint 使用 Vite/React 适配的基础配置即可。

Phase 0 不强制安装：

- Konva/react-konva；
- ECharts；
- Playwright；
- Fastify；
- pnpm；
- formatter 大型工具链；
- Worker library。

这些在进入对应 Phase、确认实际需要时再安装。

#### P0.4 建立基础目录

创建本计划第 3 节中的 `src/app`、`src/features`、`src/core`、`src/project`、`src/store`、`src/types`、`src/utils` 和基础 `tests/fixtures`、`tests/regression` 目录。

不要为了“填满目录”提前创建大量空文件或抽象类。

允许只创建必要的 `index.ts` / placeholder README（若确有帮助），但避免 boilerplate 泛滥。

#### P0.5 最小 App Shell

将 Vite 默认示例页面替换为最小 Rapid Optics Studio shell，用于确认：

- React 正常启动；
- CSS 正常；
- 页面明确显示 `Rapid Optics Studio` 和当前开发阶段；
- 不实现正式产品 UI。

#### P0.6 最小测试基线

建立 Vitest，并至少有：

- 一个纯 TypeScript smoke test；
- 一个基础模块 import test（可选）。

Phase 0 不设置高 coverage 门槛。

#### P0.7 README

创建/更新根目录 `README.md`，至少写明：

- 产品一句话说明；
- 当前状态：V1 under development；
- 技术栈；
- Node.js 版本基线；
- `npm install`；
- `npm run dev`；
- `npm run build`；
- `npm run test`；
- 目录结构简述；
- `PRD.md` 是产品权威基线；
- `IMPLEMENTATION_PLAN.md` 是实施计划；
- `reference/raman_sandbox.html` 是只读行为参考。

### 5.3 Phase 0 验收

必须通过：

```text
npm install
npm run dev
npm run build
npm run test
npm run lint
```

并确认：

- TypeScript 无错误；
- production build 成功；
- 浏览器能打开最小 App shell；
- `reference/raman_sandbox.html` 未被修改；
- 没有新增 backend/database/server；
- 没有引入 monorepo/pnpm；
- 没有开始 Phase 1 光学代码。

### 5.4 Phase 0 Exit Gate

Phase 0 完成后，仓库应“干净但很薄”：

```text
项目能跑
项目能 build
项目能 test/lint
目录边界已建立
核心依赖已安装
文档说明清楚
```

此时停止。下一步才进入 Phase 1。

---

## 6. Phase 1 详细实施计划：Data Model + Optical Core

### 6.1 目标

Phase 1 建立 V1 最重要的底层基础：

> **使用 mm 世界坐标的、与 React/DOM/Three.js 无关的纯 TypeScript 2D Optical Core。**

完成后，即使还没有正式 2D UI，也应该能够通过自动测试证明：

- 默认 Raman 光路能够从 Laser 到 Sample；
- secondary Raman/Rayleigh test emission 能沿返回路径到达 Spectrometer；
- Mirror 旋转会断路；
- Beam Splitter 会产生稳定分支；
- 元件 aperture / power / termination 有清晰语义。

Phase 1 不实现：

- 正式 2D Editor；
- Raman 峰/CCD counts；
- Acquisition；
- Spectrum Analysis；
- Three.js；
- 完整项目文件 UI。

### 6.2 增量数据模型

Phase 1 只建立 Optical Core 当前真正需要的数据模型，不一次把未来所有 Project 字段设计完。

至少包括：

```text
Transform2D
  x_mm
  y_mm
  rotation_deg

OpticalComponent
  id
  type
  name
  enabled
  transform
  geometry/aperture
  type-specific parameters

Ray2D
  id
  parentRayId?
  origin
  direction
  kind
  wavelength_nm
  power
  generation
  sourceComponentId
```

以及：

- `Intersection`；
- `RaySegment`；
- `InteractionEvent`；
- `TerminationReason`；
- `OpticalTraceResult`；
- `TraceOptions`。

关键原则：

- 世界坐标一律 mm；
- screen pixel 不进入 core；
- angle schema 对外 degree，内部数学可转 radian；
- ID 使用稳定 string ID；
- Ray/Trace records 尽量 immutable；
- result 不包含 class instance/function，保持未来可序列化。

### 6.3 Zod schema 范围

Phase 1 使用 Zod 覆盖：

- Transform；
- 10 类 component 的基础 schema；
- 当前 Optical Scene；
- 当前 trace configuration；
- Demo default fixture 所需数据。

暂不要求 Phase 1 建完：

- AcquisitionRun 完整 schema；
- processing pipeline 完整 schema；
- 完整 view state；
- 全部 Project I/O migration。

这些在后续 Phase 增量扩展，Phase 7 收口正式 `RapidOpticsProject schema v1`。

### 6.4 Demo 数据提取为 fixtures

从 `reference/raman_sandbox.html` 提取但不直接运行/复制其全局代码：

- 默认 532 nm + Silicon 光路；
- 10 类元件默认参数基线；
- 532 / 633 / 785 nm presets；
- Si / PS / CaCO3 峰数据可先作为 fixture/reference data 存放，但 Raman 计算到 Phase 3 才实现；
- legacy optics/spectrum JSON 示例；
- Demo 经验常量清单及 provisional 注释。

默认布局坐标转换原则：

```text
Demo 一格 = 25 mm
```

保留相对布局和连通行为，不保留 `P=28 px` 作为物理量。

`ZRpx=42` 等以 pixel 为单位的常量不得直接进入正式模型；若后续需要复现 focus 行为，Phase 3 再定义有单位的 provisional model parameter。

### 6.5 数学与几何基础

实现并测试：

- Vec2 operations；
- normalize / dot / cross；
- rotate；
- reflect；
- angle normalization；
- ray 与有限平面 aperture intersection；
- ray 与圆形 target intersection（若仍用于 Sample/特定器件）；
- nearest positive intersection；
- epsilon / self-hit avoidance。

测试覆盖：

- parallel；
- reverse；
- endpoint；
- aperture miss；
- very small distance；
- finite/NaN 防护。

### 6.6 Tracer

采用与 Demo 验证过的 queue-based 思路，但重写为纯函数：

```text
emit ray
  ↓
nearest hit
  ↓
component interaction
  ↓
0..N outgoing rays
  ↓
queue
```

提供：

- branching；
- minPower；
- maxGenerations；
- maxRays；
- escaped / absorbed / detected / threshold / limit 等 termination；
- ray lineage；
- segment/event records；
- handler error → typed warning/error，不让整个 trace 崩溃。

### 6.7 10 类 Component Interaction

建议按以下顺序小步实现并单独测试：

1. Laser emitter；
2. Mirror：specular reflection + reflectivity；
3. Sample：excitation target/hit event；
4. Spectrometer：detector hit；
5. Objective：V1 simplified pass-through + interaction metadata；
6. Dichroic：kind-aware simplified R/T branching；
7. Edge Filter：Raman transmission + simplified leakage behavior；
8. Beam Splitter：configurable R/T branching；
9. Prism：configurable simplified deflection；
10. Pinhole：finite aperture pass/block。

不要把所有行为继续写成一个巨大 `if/else`。采用明确的 component registry / interaction handler 映射即可，但不需要为了它建立复杂 plugin framework。

### 6.8 Sample secondary emission contract

为了保持 Generic Optical Core + Raman Module 的边界：

Optical Core 本身只需要能记录：

```text
excitation hit sample
入射方向
入射功率
ray lineage
```

Phase 1 regression 可以提供一个测试用的 `backwardEmission` strategy，生成严格反向 Raman/Rayleigh secondary rays，以验证返回路径。

真正的材料峰、Raman intensity、fluorescence、CCD counts 在 Phase 3 实现，不写入 `core/optics`。

### 6.9 Focus contract

Phase 1 只建立光学几何层所需的 focus metadata，例如：

```text
actualDistance_mm
targetFocalDistance_mm
defocus_mm
objectiveComponentId
sampleComponentId
```

关联 Objective 必须基于实际 ray lineage / interaction history，而不是：

```text
find(first objective)
```

`focusEfficiency` 的经验公式放到 Phase 3 Raman/focus model。

### 6.10 Regression Tests

至少建立：

1. **Default Raman fixture**
   - excitation 到 Sample；
   - test backward Raman 能到 Spectrometer。
2. **Broken path**
   - 旋转关键 Mirror 后 Sample 不再命中。
3. **Beam Splitter**
   - 生成两条 branch；
   - power 按配置分配；
   - lineage 正确。
4. **Dichroic**
   - excitation 与 Raman 走不同默认 interaction。
5. **Filter**
   - AOI 改变时 leakage model 行为方向符合预期。
6. **Prism**
   - simplified deflection 方向稳定。
7. **Pinhole**
   - aperture 内通过、外部阻断。
8. **Termination**
   - escaped / max generation / max rays / below threshold 不会无限循环。
9. **Component order independence**
   - 改变数组顺序不改变 nearest-hit 结果。

### 6.11 性能基线

Phase 1 建一个 30+ 元件与 branching fixture，记录真实 trace 时间。

原则：

- 先线性 nearest-hit；
- 不提前实现 spatial index；
- 不提前实现 Web Worker；
- 若真实交互阶段显示 core calculation 已成为 UI 性能瓶颈，再优化。

建议记录：

```text
P50
P95
ray count
termination count
```

但 Phase 1 不把 20–30 ms 这种尚未验证的数字设成硬性失败条件；PRD 的总体 `<100 ms` 仍作为 V1 性能方向。

### 6.12 Phase 1 Exit Gate

必须满足：

- Optical Core 不依赖 React/DOM/Zustand/Three.js；
- mm world coordinate 已建立；
- 10 类元件均有 typed data contract；
- 10 类 interaction 的 V1 simplified behavior 有测试；
- nearest-hit、reflection、branching、aperture、power、termination 测试通过；
- Demo 默认布局 regression 通过；
- broken path / beam splitter regression 通过；
- ray lineage 可追溯；
- 无 NaN / 无界 ray growth；
- 尚未提前进入 Phase 2 UI 或 Phase 3 Raman/CCD。

---

## 7. PRD 与 Demo 的冲突、歧义及实现风险

### 7.1 明确冲突

#### C1. Node Service 范围

- PRD 技术/工程章节建议 `apps/server`、Node/Fastify，并说 V1 可保持较薄 service；
- 当前开发约束明确 V1 暂不做 Node.js 后端、数据库或服务器。

计划处理：不修改 PRD；V1 当前工程采用根目录下的单一 React/Vite 应用，通过浏览器文件 API 完成 Save/Open/Import/Export。`src/core/*` 保持纯 TypeScript 和清晰 API，使未来需要 Node service 或 MetaInstrumentStudio consumer 时可以再抽取共享 package，但 V1 不创建占位 server。

#### C2. Acquisition 模式

- Demo：无限累计直到手动 Stop；
- PRD：Single N=1、Average N>1，达到 N 自动结束，并保存 AcquisitionRun。

计划处理：正式实现遵循 PRD；Demo 模式只作为 preview/averaging 原型参考，不保留为主要 acquisition。

#### C3. 坐标系统

- Demo：Canvas pixel 直接参与物理计算；
- PRD：内部 mm，screen/world 严格分离，infinite workspace。

计划处理：只迁移相对默认布局并换算成 mm，不能复制 `P=28`、`ZRpx=42` 到正式物理模型。

#### C4. Spectrum window

- Demo 主图：固定 -100..1900 cm⁻¹；放大图仅扩展 reference spectrum；
- PRD：当前 expected/acquired 主谱必须支持 Auto/Custom window，PS 高位峰可见。

计划处理：SpectrumAxis 为数据对象；自动窗口根据材料峰、激光/CCD 可达范围和配置生成，view window 与 sampled data range 分开。

#### C5. Export semantics

- Demo：界面可显示 accumulated mean，但导出 expected；
- PRD：Expected/Raw/Processed 必须明确选择。

计划处理：schema 使用 discriminated `kind`，导出 UI 不从“当前看起来像什么”推断数据源。

#### C6. Three.js 依赖

- Demo：CDN r128；
- PRD：正式版必须本地依赖、3D failure 不影响 2D。

计划处理：Three.js 通过 npm 作为本地项目依赖安装；Phase 6 再处理 lazy loading、3D error boundary 和 geometry/material/texture dispose。

### 7.2 需要在实现前固化的歧义

这些不是要求修改 PRD，而是 实施过程中必须在本 `IMPLEMENTATION_PLAN.md` / schema 中明确的工程解释：

1. Laser direction 与 rotation
   - PRD common transform 给所有 component `rotation_deg`，Laser 又有 Direction；
   - Demo Laser 固定 +x、不可旋转，但 3D 仍读取 angle。
   - 建议以 transform rotation 表示方向；UI 可通过 lock/edit policy 限制，但 schema 保留完整方向。
2. Spectrometer orientation
   - Demo 不允许旋转，intersection 却使用 angle，入口在 3D 中也依赖 angle；
   - 正式模型应允许方向，并定义 entrance aperture/acceptance side。
3. Dichroic 对 Rayleigh 的处理
   - Demo 将只有 `raman` 视为透射，其余（包含 rayleigh）按 excitation 路由；
   - PRD 列出 excitation R/T 与 Raman T，但未明确 Rayleigh 是按 wavelength、kind 还是专有通道。
   - Phase 1 必须定义 wavelength/kind-aware contract并以默认参数复现目标链路。
4. Aperture vs vignetting
   - PRD 同时要求 geometrical aperture、clipping、vignetting；
   - Demo 对平面元件先 hard miss，再统一高斯衰减。
   - 应拆成可解释的 hard clipping 与 optional attenuation，不让所有元件共享隐藏规则。
5. Power 单位和绝对标定
   - Demo excitation power 起点为 1，Raman power 是相对量，CCD counts 由经验常量放大；
   - PRD Laser 有 Power，simulation 定位 semi-quantitative，但未规定 absolute Raman cross-section。
   - 建议明确 V1 使用相对/phenomenological model，输出 UI 标识 Simplified Model，所有 scale 常量 versioned。
6. Save/Open in browser-only V1
   - PRD 要 New/Open/Save/Save As；无 server 时浏览器能力存在兼容差异。
   - Phase 7 需定义 File System Access API 的 progressive enhancement 与 download/upload fallback。
7. View state persistence
   - PRD 顶层建议包含 viewState，但 Save/Load 必须恢复列表没有明确 camera/selection。
   - Schema 应区分可选持久化 view preferences 与绝不持久化的 transient selection/pointer state。

### 7.3 高风险实现点

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 先做 UI 后定核心数据模型 | 2D/3D/acquisition 各自状态 | Phase 1 先建立当前 Optical Core 所需的最小 schema/contracts；后续增量扩展 |
| Demo 经验常量被误当物理定律 | 结果不可解释、难升级 | model version、单位登记、Simplified 标识 |
| Branching ray explosion/cycles | UI 卡死 | max rays/generation、min power、termination/timing；性能确有瓶颈时再考虑 Worker |
| 拖动每事件全管线重算 | 低 FPS | 先做 rAF/节流与最小重算；性能测试证明必要时再引入 Worker |
| 未来 Worker 结果乱序 | 若后续启用 Worker 可能旧状态覆盖新结果 | 启用 Worker 时再加入 requestId + projectRevision + latest-only commit |
| Acquisition 状态混入 | 科研记录失真 | immutable snapshot、scene revision change → cancel |
| Random noise 无法回归 | flaky tests | injected seeded RNG；生产可用 crypto seed |
| Project schema 过早锁死 | migration 成本 | discriminated unions、extensions metadata、migration tests |
| 3D 全量重建泄漏 | 长时运行性能下降 | keyed object lifecycle + dispose tests/inspection |
| 多 Objective/Sample | focus 关联错误 | trace lineage，不用 `find(first)` |
| Rayleigh/Dichroic 语义不清 | OD/SNR 与 Demo 不一致 | Phase 1 contract test + Phase 3 model validation |
| Dynamic window 与 detector range 混淆 | 显示不存在的数据 | sampled axis、instrument range、view range 三者分离 |
| Browser save API 差异 | Save/Save As 不一致 | capability adapter + download/upload fallback |
| 过早拆 monorepo/workspace | 初始化成本高、开发摩擦 | V1 先采用单项目 `src/core` / `src/features` 分层，确有多 consumer 后再拆包 |

### 7.4 已知 Demo 缺陷的追踪落点

| PRD 已知缺陷 | 负责阶段 | 防回归方式 |
|---|---|---|
| Prism/Beam Splitter/Pinhole 名称缺失 | Phase 1 component registry + Phase 2 inspector | 10 类型 registry/UI test |
| PS 高 shift 峰主窗口不可见 | Phase 3/5 | 3054 cm⁻¹ visible regression |
| Acquisition export 错数据 | Phase 4 data semantics + Phase 7 export | kind-specific export test |
| Three.js CDN | Phase 6 | local npm dependency + offline production build |
| JSON validation 不充分 | Phase 1 incremental schema + Phase 7 I/O | invalid import transaction tests |

---

## 8. 实施原则与停止点

后续实施应遵循：

- PRD 继续作为产品和验收权威基线；
- Demo 作为行为、数据和视觉参考，不作为生产源文件；
- 先固化当前 Phase 所需的最小 schema/contracts/fixtures，再实现算法和 UI；避免一次性过度设计完整未来 Schema；
- physics core 始终为纯 TypeScript；V1 初始在主线程运行，性能测试证明有必要时再无侵入迁移到 Worker；
- 2D Project State 唯一权威，3D 和 spectrum/diagnostics 都是派生 consumer；
- raw acquisition 和 instrument snapshot 不可变；
- 每一阶段以可自动验证的 exit gate 结束；
- 模型近似、单位和 version 必须显式，不暗示精密 Zemax 级结果。

本文修订后作为 V1 当前工程实施基线。下一步可在明确指令下执行 **Phase 0 — Bootstrap**；执行时只完成 Phase 0，不自动进入 Phase 1，不修改 PRD，不修改 `reference/raman_sandbox.html`。
