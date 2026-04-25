> **历史文档** — 本文写于早期重构阶段，部分内容已被 [roadmap.md](roadmap.md) 取代。保留供参考，不作为当前开发指导。

# Papyro 架构重构计划

## 目的

这份文档替代旧的 TODO 式重构清单。

旧计划的问题不是“任务不够多”，而是视角错了：它把重构当成一组局部修补任务，而不是一次架构治理工作。结果就是很多条目已经勾完，但项目整体依然存在边界混乱、依赖错误、职责漂移和可读性差的问题。

从现在开始，重构的目标不再是“继续把 checklist 做完”，而是让项目具备一个专业项目应有的结构稳定性：

- 依赖方向清晰
- 应用组装位置唯一
- UI、应用流程、领域模型、平台适配各司其职
- 跨端共享通过正式边界完成，而不是源码路径复用
- 文档描述和代码现实保持一致

## 进度标记约定

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成

## 当前进度总览

- `[x]` Phase 0: 已完成计划切换，并冻结旧方向
- `[~]` Phase 1: 已建立 `crates/app` 并接管共享运行时，desktop 首帧装配也已收进 app 层
- `[x]` desktop 宿主已迁入 `apps/desktop`，根目录 `src/` 已移除
- `[~]` Phase 2: 已将 workspace 应用编排从 `core` 迁出，仍需继续拆分剩余边界
- `[~]` Phase 3: 已建立统一 `AppContext`，仍需继续迁移 UI 流程编排
- `[ ]` Phase 4: 平台适配与基础设施解耦
- `[~]` Phase 5: 文档与目录真实化
- `[ ]` Phase 6: 架构验收与测试补强

## 当前诊断

以下诊断用于说明这轮重构开始时的结构问题。随着 Phase 1 落地，其中一部分问题已经开始被修复，例如共享运行时已抽入 `crates/app`，`apps/mobile` 对 desktop handler 的源码路径复用也已经移除。

下面这些不是风格问题，而是当前架构不成立的根因。

### 1. 文档与代码现实严重脱节

当前 `docs/architecture.md` 和 `docs/directory-structure.md` 描述的结构，和 workspace 现状已经明显不一致。

- 文档里还在描述 `search`、`sync`、旧的 editor 结构、旧的状态拆分
- 实际 workspace 只有 `core`、`ui`、`editor`、`storage`、`platform`、`apps/desktop`、`apps/mobile`
- 旧的 `refactoring-plan.md` 还在用“阶段任务完成度”暗示架构接近完成，这个判断是失真的

结论：当前最大的问题之一不是代码本身，而是团队已经失去了对“系统实际长什么样”的统一认知。

### 2. 应用组装重复，系统没有唯一 Composition Root

重构开始时，桌面端和移动端都在各自入口手工组装整套运行时。

当时的典型位置包括旧版 desktop 入口模块和旧版 `apps/mobile/src/main.rs`。

两端都在重复做这些事情：

- bootstrap
- storage / platform 初始化
- signals 创建
- commands 组装
- watcher 生命周期管理
- context 注入

这说明当时项目还没有真正的“应用层”或“运行时层”。  
现在共享运行时已经进入 `crates/app`，但还需要继续降低它对具体平台实现的耦合。

### 3. Mobile 通过源码路径复用 Desktop handler，是严重边界错误

- [apps/mobile/src/handlers/mod.rs](/e:/papyro/apps/mobile/src/handlers/mod.rs:1)

重构开始时，移动端直接通过 `#[path = "..."]` 复用桌面端 handler。

这在专业项目里属于必须立刻消除的结构问题，因为它意味着：

- app crate 在依赖另一个 app crate 的源码实现
- 共享逻辑没有正式归属
- 模块边界是假的
- 后续任何平台差异都会继续腐蚀结构

这条问题优先级非常高。它不是“暂时凑合”，而是架构红线之一。当前已经通过 `crates/app/src/handlers/*` 完成归位。

### 4. Root crate 曾承担桌面应用真实运行时

当时的典型文件是根 crate 的 `lib.rs` 和 desktop 入口模块。

`papyro` 根 crate 当时本质上仍然是桌面运行时宿主，而不是一个干净的 workspace 根或共享库边界。

结果是：

- `apps/desktop` 只是薄包装
- `apps/mobile` 反而成了独立入口
- 共享运行时没有正式归属

这会让平台入口层和共享逻辑层纠缠不清，也会让后续 crate 边界始终摇摆。

这条问题现已完成修正：

- desktop 宿主已迁入 `apps/desktop`
- 根目录 `src/` 已移除
- workspace 根不再承载 app 入口源码

### 5. Core 里混入了过多应用编排责任

重构开始时，`crates/core/src/workspace_service.rs` 把很多不同层次的责任揉在一起：

- 工作空间流程
- 编辑器 tab 协作
- bootstrap fallback 逻辑
- UI 近侧状态变更约定
- 大量测试替身和庞大测试模块

这说明当时的 `core` 还是“所有非 UI 的东西都往里放”的容器，而不是边界清晰的核心层。当前该文件已删除，workspace flow 已迁入 `crates/app/src/workspace_flow.rs`。

### 6. UI 仍在承担流程控制和行为编排

- [crates/ui/src/layouts/mobile_layout.rs](/e:/papyro/crates/ui/src/layouts/mobile_layout.rs:15)

`MobileLayout` 里既有展示，也有：

- 主题切换策略
- sidebar 持久化触发
- create / rename / delete 流程协调
- reveal / refresh / workspace 操作触发策略
- 多个局部 UI 状态的手工编排

这意味着 UI crate 还不是“展示层”，而是“展示 + 交互编排 + 一部分应用决策”的混合体。

### 7. Context 注入过多，依赖关系隐式化

当前通过 context 散布了多套全局依赖：

- `file_state`
- `editor_tabs`
- `tab_contents`
- `ui_state`
- `platform`
- `commands`

问题不只是“多”，而是这些依赖没有被收束成少量正式接口。组件读取什么、依赖什么、修改什么，很多时候只能靠全文追踪。

这直接损害：

- 可读性
- 可测试性
- 新成员理解成本
- 后续重构成本

### 8. 平台、运行时、UI 启动细节混在入口文件

以重构前的桌面端为例，旧版 desktop 入口模块同时处理：

- window 启动参数
- 主题首帧策略
- storage 初始化
- platform 注入
- command 装配
- watcher 生命周期
- UI 挂载

这说明当时的入口文件已经不是入口，而是一个超大总控模块。当前 desktop 宿主已收敛到 `apps/desktop/src/main.rs`，且首帧 settings / chrome 装配已进入 `crates/app`。

## 重构结论

当前项目不是“继续整理一下就行”，而是需要重新建立正式架构边界。

更准确地说，项目现在的问题不是功能不可运行，而是：

- 可以继续开发
- 但继续在当前结构上叠加功能，技术债会指数增长
- 现有计划已经不足以指导下一阶段工作

所以这次重构必须从“任务推进”切换到“架构收敛”。

## 目标架构

### 总体分层

新的目标不是增加更多 crate，而是先把职责边界立住。

建议的目标结构如下：

```text
apps/
  desktop/         # 桌面端入口，只负责平台启动与窗口配置
  mobile/          # 移动端入口，只负责平台启动与壳层配置

crates/
  app/             # 应用层 / 运行时组装 / 用例编排 / 共享 commands
  core/            # 纯核心模型、状态结构、领域规则、抽象 trait
  ui/              # 纯展示组件和布局，不直接承担流程编排
  storage/         # NoteStorage 的具体实现、数据库、文件系统、watcher
  platform/        # PlatformApi 的具体实现
  editor/          # 编辑器文档处理、统计、桥接逻辑
```

## 框架与平台优势的使用原则

这份计划确实考虑了“借助框架平台优势”，但原则不是把框架能力铺进所有层，而是要把优势用在最该用的地方。

### Dioxus 0.7 的优势，应该用在这些位置

- UI 渲染与跨端组件复用
- desktop / mobile 共用视图层
- 事件绑定、生命周期、资源管理
- 平台壳层中的启动与挂载

### Dioxus 0.7 的能力，不应该侵入这些位置

- 纯核心模型
- 工作空间和文档领域规则
- 存储抽象
- 平台能力抽象
- 将来希望独立发布的跨端包

换句话说，这份计划不是要弱化框架价值，而是要避免把框架耦合误当成复用能力。  
真正能长期服务各平台的，不是“到处都能跑的 Dioxus 代码”，而是“框架无关的核心能力 + 很薄的 Dioxus 适配层”。

## 面向独立包的拆分目标

如果后续希望把核心模块独立出去，作为跨端包服务 desktop、mobile 甚至未来其他前端壳层，这次重构必须提前满足“可独立发布”的约束，而不是只满足 workspace 内部可编译。

### 目标不是只做 crate 拆分

单纯把代码拆成多个 crate 还不够。  
真正要达到的是下面这几个目标：

- 核心包不依赖 Dioxus
- 核心包不依赖具体平台实现
- 核心包 API 稳定，语义清晰
- 平台差异通过 adapter 接入，而不是写死在核心流程里
- UI 框架只作为上层接线层，而不是业务逻辑宿主

### 未来可独立发布的包形态

更合理的方向不是把整个 app 打成一个“通用跨端包”，而是把真正稳定的核心能力抽成可复用包。

建议按下面这个方向约束：

```text
publishable packages
  papyro-core        # 领域模型、状态结构、抽象边界、纯规则
  papyro-editor      # 文档统计、Markdown 处理、编辑器引擎能力
  papyro-app         # 应用用例、运行时编排、平台无关 action

adapter packages
  papyro-platform    # desktop / mobile 平台能力实现
  papyro-ui          # Dioxus 组件与布局

shell apps
  apps/desktop
  apps/mobile
```

这里最关键的点是：

- `papyro-core` / `papyro-editor` / `papyro-app` 应该朝“未来可独立发布”设计
- `papyro-ui` 是 Dioxus 适配层，不是未来最核心的复用资产
- `apps/*` 只是宿主，不应该成为共享逻辑来源

### 独立发布前必须满足的条件

如果后续要把某个核心模块独立成跨端包，至少要满足：

- 不依赖 `apps/*`
- 不依赖具体平台类型
- 不要求 Dioxus signal / context 才能工作
- 有清晰的 public API
- 有独立测试，而不是只能靠整应用验证
- feature 和依赖关系可控，不把所有平台能力强行打包进来

## 包化导向下的依赖原则

为了支撑未来独立出去，这次计划里的依赖规则还需要多加一条：

- 核心包优先按“可发布边界”设计，而不是只按“当前调用方便”设计

这意味着：

- `core` 内不能继续混入 Dioxus 运行时细节
- `app` 内不能默认依赖 desktop 或 mobile 壳层
- `ui` 不能反向定义核心语义
- `platform` 只能提供能力，不能成为业务真相来源

## 对当前计划的补充结论

从“未来独立成跨端包”的角度看，当前计划方向是对的，但还不够显式。

原计划已经隐含了三件关键事：

- 把共享逻辑从 app 入口抽离
- 把 UI 和平台从核心能力中剥开
- 建立正式的 `app` 层承接共享用例

但现在还需要把下面这件事明确写出来：

- 重构目标不仅是让项目内部更整洁，还要让核心模块具备未来独立发布的可能性

### 每层职责

#### `apps/desktop`

只负责：

- 桌面窗口配置
- 桌面启动方式
- 注入桌面平台实现
- 调用共享 `app` 层启动

不负责：

- 业务命令组装
- 文件 watcher 规则
- 状态初始化细节
- handler 实现

#### `apps/mobile`

只负责：

- 移动端启动方式
- 注入移动平台实现
- 调用共享 `app` 层启动

不负责：

- 复用 desktop 源码
- 定义与 desktop 不一致的共享流程

#### `crates/app`

这是目前最缺失的一层，也是后续重构的核心。

负责：

- 唯一 Composition Root
- 应用初始化与 bootstrap 协调
- 共享 commands / actions / use cases
- watcher 生命周期协调
- UI 所需的正式 app context 暴露
- 把 `storage`、`platform`、`editor`、`core` 组装成可运行应用

不负责：

- 具体平台实现
- 具体数据库实现
- 纯 UI 展示

#### `crates/core`

负责：

- 领域模型
- 与 UI 框架无关的状态结构
- 关键 trait 边界，例如 `NoteStorage`
- 纯规则、纯变更逻辑

不负责：

- Dioxus context 注入
- watcher 生命周期
- 启动流程编排
- 平台初始化

原则上，`core` 应该是“最稳定、最小依赖、最容易测试”的那一层。

#### `crates/ui`

负责：

- 组件
- 布局
- 展示状态
- 纯交互事件上抛

不负责：

- 直接编排业务流程
- 自己拼装多套底层 context
- 持久化策略
- 平台能力决策

目标是让 UI 看到的是更小、更稳定的 app-facing 接口，而不是一大把原始信号。

#### `crates/storage`

负责：

- `NoteStorage` 的具体实现
- SQLite
- 文件系统
- workspace 扫描
- watcher 封装

不负责：

- 直接改 UI 状态
- 直接决定页面行为

#### `crates/platform`

负责：

- `PlatformApi` 的具体实现
- 各平台目录、文件选择、系统操作等能力

不负责：

- 业务流程
- 组件状态

#### `crates/editor`

负责：

- 文档统计
- 编辑器桥接
- Markdown 相关能力

不负责：

- 工作空间、文件树、平台行为

## 依赖规则

### 允许的依赖方向

```text
apps/* -> app
app -> core
app -> ui
app -> storage
app -> platform
app -> editor
storage -> core
platform -> core
editor -> core
ui -> core
```

### 明确禁止的依赖方向

以下情况视为架构违规：

- `apps/mobile` 依赖 `apps/desktop` 的源码
- `apps/desktop` 承担共享业务逻辑
- `ui` 直接依赖 `storage`
- `ui` 直接依赖具体平台实现
- `core` 依赖 Dioxus 运行时装配细节
- `platform` 依赖 `ui`
- `storage` 直接修改 Dioxus signal

## 核心设计原则

### 1. 共享逻辑必须有正式归属

如果 desktop 和 mobile 都要用，就必须进入共享 crate。

禁止再出现：

- `#[path = "..."]`
- copy 一份相同 handler
- 入口各自手工拼一遍同样流程

### 2. 一个应用只能有一个正式组装点

无论最终内部如何实现，运行时组装必须收敛到共享 `app` 层。

桌面和移动端可以有不同壳层，但不能有两套共享业务运行时。

### 3. UI 只表达交互，不拥有业务编排

UI 可以触发 action，但不应该自己决定整个流程如何协同，也不应该顺手持久化设置、刷新文件树、拼接状态同步规则。

### 4. Core 不是“杂物间”

凡是进入 `core` 的内容，都必须满足至少一条：

- 是稳定领域模型
- 是抽象边界
- 是纯逻辑规则
- 是与具体 UI / 平台无关的状态协作

### 5. 文档必须跟代码同时收敛

任何阶段完成后，如果目标结构变化了，对应文档必须一起修正。

从这次开始，架构文档不允许长期落后于代码现实。

## 立即停止的做法

在进入后续开发前，下面这些做法应视为停止事项。

- 不再给旧 `refactoring-plan.md` 追加 checklist
- 不再通过 `#[path]` 复用跨 app 源码
- 不再把共享运行时逻辑继续放进平台宿主入口
- 不再让页面布局组件继续吸收更多流程编排
- 不再新增“临时 context”去绕过正式接口设计
- 不再让文档描述不存在的 crate 和模块

## 推进阶段

下面的阶段不是“建议顺序”，而是正式的架构推进路线。

### Phase 0: 冻结错误方向

目标：先阻止架构继续恶化。

TODO：

- `[x]` 明确旧计划废弃，统一以本文件为准
- `[x]` 在本计划中将 `apps/mobile/src/handlers/mod.rs` 的路径复用标记为待移除红线
- `[x]` 停止新增入口层业务逻辑
- `[ ]` 停止新增 UI 内部流程编排

验收标准：

- 后续提交不再新增跨 app 源码路径复用
- 新功能不再直接塞进 `apps/desktop/src/main.rs` 或 `apps/mobile/src/main.rs`

### Phase 1: 建立共享应用层

目标：新增正式的 `crates/app`，把共享运行时从入口文件中抽出来。

TODO：

- `[x]` 新建 `crates/app`
- `[x]` 提取统一的 bootstrap 流程
- `[x]` 提取统一的 commands / actions 组装
- `[x]` 提取 watcher 生命周期协调
- `[x]` 提取统一 app context 暴露方式
- `[~]` 让 `crates/app` 保持对 Dioxus 壳层和具体平台实现的最小耦合

验收标准：

- desktop 和 mobile 不再各自定义完整 runtime 组装逻辑
- `apps/desktop/src/main.rs` 与 `apps/mobile/src/main.rs` 只剩平台壳层职责
- mobile 不再依赖 desktop handler 源码
- `crates/app` 具备未来独立发布为跨端运行时包的基本边界

### Phase 2: 收紧 Core 边界

目标：把 `core` 从“应用杂糅层”收缩为稳定核心层。

TODO：

- `[~]` 把应用流程编排逻辑从 `core` 迁移到 `app`
- `[ ]` 识别 `core` 中真正属于领域模型、状态结构、纯规则的部分
- `[~]` 拆分过宽的 service 文件
- `[x]` 缩小 `workspace_service.rs` 的职责范围
- `[ ]` 清除 `core` 中对 UI 框架语义和宿主层约定的隐式耦合

验收标准：

- `core` 中不再出现启动装配语义
- `core` 中不再承载平台生命周期协同
- `core` 的公开 API 明显更小、更稳定
- `core` 满足未来独立发布为纯 Rust 核心包的边界要求

### Phase 3: 重做 UI 与应用层接口

目标：让 UI 从“读取一堆原始 context”改为“消费少量正式 app 接口”。

TODO：

- `[x]` 设计统一 `AppContext` 或等价的正式 UI 接口
- `[~]` 收敛 `file_state`、`editor_tabs`、`tab_contents`、`ui_state`、`commands` 的暴露方式
- `[ ]` 把布局组件里的流程控制迁回 `app`
- `[ ]` 让 UI 主要负责渲染和事件转发
- `[ ]` 明确 `ui` 只是 Dioxus 适配层，而不是核心能力承载层

验收标准：

- 页面布局组件中不再大规模直接操作多套 signal
- `MobileLayout` / `DesktopLayout` 的职责明显缩小
- UI 可读性显著提升，单组件逻辑长度下降
- 更换 UI 壳层时，不需要重写核心规则和主要用例

### Phase 4: 平台适配与基础设施解耦

目标：让平台差异成为 adapter，不再污染主流程。

TODO：

- `[ ]` 明确 `PlatformApi` 的最小接口面
- `[ ]` 把平台差异保留在 `platform` crate 和 app 入口壳层
- `[ ]` 把 watcher、存储初始化、app data dir 访问边界理顺
- `[ ]` 用 feature 或 adapter 边界控制平台能力暴露，避免核心包被宿主依赖拖重

验收标准：

- 应用主流程不依赖具体平台类型
- 平台特有逻辑不会回流到 `ui` 或 `core`
- 平台层可以替换，而不破坏核心包对外 API

### Phase 5: 文档与目录真实化

目标：恢复代码和文档的一致性。

TODO：

- `[x]` 重写 `docs/architecture.md`
- `[x]` 重写 `docs/directory-structure.md`
- `[~]` 删除对不存在模块的描述
- `[x]` 将 crate 边界、依赖规则、启动方式同步到文档

验收标准：

- 新人只看文档就能理解真实结构
- 文档里不再出现已经被删除或并不存在的层次

### Phase 6: 架构验收与测试补强

目标：让架构边界不仅靠共识，也靠验证。

TODO：

- `[ ]` 为 `app` 层核心流程建立测试
- `[ ]` 为跨层接口建立契约测试
- `[ ]` 补充关键重构后的 smoke test
- `[ ]` 如有必要，增加 workspace 依赖方向检查脚本
- `[ ]` 为未来独立发布的核心包补齐单包级测试与最小集成验证

验收标准：

- 核心流程测试覆盖共享运行时
- 关键架构红线可被自动验证
- 核心包可以脱离 app 壳层单独验证其稳定性

## 每阶段的通用完成定义

任何阶段只有同时满足下面条件，才算真正完成：

- 代码边界已经落地
- 旧路径已经删除，而不是继续兼容堆着
- 文档已经同步
- 至少有基本验证手段
- 没有留下新的“先这样吧”的跨层快捷方式

## 非目标

这次重构不追求以下事情：

- 不追求一次性把所有命名和文件布局都打磨到完美
- 不追求为了“纯架构”而制造无意义 crate 爆炸
- 不追求先做视觉或交互优化
- 不追求在边界未稳之前继续叠加大功能

## 成功标准

当这轮重构真正完成时，项目应该达到下面的状态：

- desktop 和 mobile 只是壳层，不再各自拼系统
- 共享逻辑有正式归属，不再跨 app 借源码
- `app` 成为唯一应用组装点
- `core` 稳定、收敛、可测试
- `ui` 可读、轻量、少隐式依赖
- 文档能够真实反映代码
- 核心模块具备未来独立成跨端复用包的结构条件

## 下一步执行顺序

接下来不建议再沿着旧 TODO 往下做。

应该按这个顺序推进：

1. 建立 `crates/app`，抽出共享运行时
2. 移除 mobile 对 desktop handler 的源码路径复用
3. 收紧 `core`，把应用编排迁出
4. 收敛 UI 依赖面，减少 context 爆炸
5. 更新 `architecture.md` 和 `directory-structure.md`
6. 用测试和检查把新边界固化下来

## 当前状态判断

截至这次评估，项目的判断不应该再写成“重构已接近完成”。

更准确的结论是：

- 功能性重构做了一部分
- 若干局部技术债已经清理
- 但正式架构仍未收敛
- 当前阶段应定义为“进入架构重建期”，而不是“收尾期”
