# Rapid Optics Studio V1 — Phase 1 Data Model + Optical Core Plan

> **Phase:** 1 — Data Model + Optical Core  
> **Status:** Completed — historical execution plan  
> **Depends on:** Phase 0 — Bootstrap  
> **Document role:** Preserves the detailed Phase 1 plan extracted from the former mixed-role `IMPLEMENTATION_PLAN.md`. This move does not revalidate historical completion evidence.

---

## 1. Detailed Plan

### 1.1 目标

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

### 1.2 增量数据模型

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

### 1.3 Zod schema 范围

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

### 1.4 Demo 数据提取为 fixtures

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

### 1.5 数学与几何基础

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

### 1.6 Tracer

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

### 1.7 10 类 Component Interaction

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

### 1.8 Sample secondary emission contract

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

### 1.9 Focus contract

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

### 1.10 Regression Tests

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

### 1.11 性能基线

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

### 1.12 Phase 1 Exit Gate

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

