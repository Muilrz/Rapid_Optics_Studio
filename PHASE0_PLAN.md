# Rapid Optics Studio V1 — Phase 0 Bootstrap Plan

> **Phase:** 0 — Bootstrap  
> **Status:** Completed — historical execution plan  
> **Document role:** Preserves the detailed Phase 0 plan extracted from the former mixed-role `IMPLEMENTATION_PLAN.md`. This move does not revalidate historical completion evidence.

---

## 1. Detailed Plan

### 1.1 目标

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

### 1.2 工作项

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

创建 [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) 第 3 节所定义的 `src/app`、`src/features`、`src/core`、`src/project`、`src/store`、`src/types`、`src/utils` 和基础 `tests/fixtures`、`tests/regression` 目录。

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

### 1.3 Phase 0 验收

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

### 1.4 Phase 0 Exit Gate

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

