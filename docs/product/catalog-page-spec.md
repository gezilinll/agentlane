# Catalog Page TinySpec

版本：Draft 2026-05-08

## Goal

实现 Lorume 第一版 Catalog / Registry 页面，让团队可以浏览第一批正式对象，理解对象类型、owner 槽位、生命周期、输入输出、触发方式、权限摘要、评测摘要、依赖关系和被使用关系。

页面第一版使用中文界面文案，并为后续中英文双语保留集中化文案和标签映射。

## Non-Goals

- 不实现对象创建、编辑、删除。
- 不接入后端服务或数据库。
- 不实现真实权限判断、治理规则执行或运行时调度。
- 不引入完整设计系统。
- 不把 Personal Work Agent、Semantic Coordinator、Runtime、Eval、Role Profile、Responsibility Tag 做成第一版 Catalog 列表对象。

## Data Contract

第一版页面使用 `src/catalog/catalog-object.ts` 中的 `CatalogObject` 作为对象模型，使用 `src/catalog/catalog-seed.ts` 提供 seed data。

当前核心对象类型：

- Workflow
- Domain Agent
- Skill
- Worker
- Tool
- Data Source
- Memory
- Policy

## Interactions

- 用户可以按关键词搜索对象。关键词匹配 name、purpose、tags。
- 用户可以按对象类型筛选。
- 用户可以按生命周期筛选。
- 用户可以按 owner 状态筛选：全部、待定、已分配。
- 搜索、类型、生命周期、Owner 状态四个筛选项都必须有可见标题，且控件本体在同一行对齐。
- 用户点击对象行后，右侧详情面板展示对象详情。
- 筛选无结果时，页面显示中文空状态。

## Acceptance Criteria

- 页面默认展示 seed data 中的 Catalog 对象。
- 页面主要 UI 文案为中文。
- 顶部展示对象总数、待定 owner 数、Production 对象数、Review 对象数。
- 筛选和搜索可以组合使用。
- 筛选工具栏的搜索、类型、生命周期、Owner 状态标题清晰可见，控件对齐。
- 点击对象后详情面板展示 purpose、owner、inputs、outputs、trigger、permission、eval、dependencies、usedBy。
- 页面在桌面宽度下不出现明显文本重叠。
- 页面在宽屏桌面下主内容区域应吃满可用工作区，顶部筛选、概览卡片和内容区右边缘保持对齐，不留下大块空白。
- 页面在移动宽度下不出现页面级横向溢出。
- `./scripts/verify.sh` 能运行类型检查、自动化测试、构建、浏览器响应式布局检查和文档链接检查。

## Test Plan

- Unit：Catalog 查询函数覆盖关键词、类型、生命周期、owner 状态和组合筛选。
- Component：Catalog 页面渲染中文标题、seed objects、筛选结果、详情面板和空状态。
- Browser E2E：Playwright 覆盖首屏、搜索、组合筛选、详情面板、空状态、2048px 宽屏主内容填充、关键区域右边缘对齐、筛选控件顶部对齐，以及 390px 移动宽度无页面级横向溢出。
- Build：Vite production build 成功。
- Manual：启动本地服务后，在浏览器中完成搜索、筛选、打开详情面板和空状态检查。
