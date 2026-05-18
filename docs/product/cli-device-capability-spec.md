# CLI Device Capability Spec

状态：当前规则

本规格定义 `lorume` CLI 的设备侧确定性能力边界。CLI 是 Agent 和设备连接层可以调用的本地 atom 集合，不具备推理能力，也不负责分析、编辑、安装或迁移 Skill。

## 目标

- 提供一个本地 `lorume` CLI 入口，用于暴露设备侧确定性能力。
- 输出稳定 JSON，方便 Agent、collector、connector 和 harness 消费。
- 允许读取本机设备身份。
- 允许从 collector-compatible runtime inventory snapshot 列出已知 Runtime 和 Agent。
- 允许在后端下发的授权 context 中查询 connector / device 在线状态。
- 允许复制明确传入的本地文件或目录，并拒绝路径穿越和未授权目标路径。

## 非目标

- 不让 CLI 推理、规划或决定 Skill 安装策略。
- 不实现 Agent 迁移。
- 不实现 centralized Skill storage、Skill 编辑、发布、分配或同步。
- 不绕过 Lorume backend 的组织、设备 token、Operation 或 Notification 边界。
- 不开放任意命令执行。

## 命令契约

所有支持 `--json` 的命令都必须输出 JSON object。错误也输出 JSON object 到 stderr，并使用非零退出码。

### `lorume device identify --json`

返回当前设备事实：

- `device.id`
- `device.name`
- `device.hostname`
- `device.os`
- `device.architecture`
- `device.connectionMode`
- `observedAt`

测试和安装脚本可以通过 `--device-id`、`--device-name` 覆盖展示身份。

### `lorume runtime list --json --snapshot <path>`

读取 collector-compatible `RuntimeInventorySnapshot`，返回：

- `device`
- `runtimes`
- `agents`
- `observedAt`

该命令不解释平台原始字段，只消费已归一化 snapshot。

### `lorume connector status --json --context <path> --target <id>`

读取后端或测试提供的授权 context。CLI 只能查询 context 中显式出现的 target。缺失 target 返回 `not_found`，不能扫描网络或猜测设备状态。

### `lorume files copy --json --from <path> --to <path> --allow-root <path>`

复制明确指定的本地文件或目录。`from` 和 `to` 都必须落在至少一个 `--allow-root` 目录内。CLI 必须拒绝：

- `..` 路径穿越后落到 allow root 外的路径。
- 未传 `--allow-root` 的复制请求。
- 不存在的来源路径。

## Harness

- `src/cli/lorume-cli.test.ts` 覆盖命令 shape、JSON 输出、路径安全和 unsupported command。
- `npm run check:cli` 运行 CLI harness。
- `npm run check:runtime`、`npm run check:backend`、`npm run check:quick` 继续覆盖 collector、backend 和 TypeScript 边界。
