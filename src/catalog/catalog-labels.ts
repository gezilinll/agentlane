import type { CatalogLifecycle, CatalogObjectType } from "./catalog-object";

export const catalogTypeLabels: Record<CatalogObjectType, string> = {
  workflow: "Workflow",
  domain_agent: "Domain Agent",
  skill: "Skill",
  worker: "Worker",
  tool: "Tool",
  data_source: "Data Source",
  memory: "Memory",
  policy: "Policy",
};

export const catalogTypeZhLabels: Record<CatalogObjectType, string> = {
  workflow: "工作流",
  domain_agent: "领域 Agent",
  skill: "Skill",
  worker: "Worker",
  tool: "工具",
  data_source: "数据源",
  memory: "记忆",
  policy: "策略",
};

export const catalogLifecycleZhLabels: Record<CatalogLifecycle, string> = {
  draft: "草稿",
  review: "评审",
  pilot: "试点",
  production: "生产",
  monitor: "监控",
  retired: "下线",
  replaced: "替换",
};

