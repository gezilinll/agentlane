import { useEffect, useMemo, useState } from "react";
import { AuthProvider, useOptionalAuthSession } from "./auth/AuthProvider";
import {
  CATALOG_LIFECYCLES,
  CATALOG_OBJECT_TYPES,
  catalogLifecycleZhLabels,
  catalogSeedObjects,
  catalogTypeZhLabels,
  filterCatalogObjects,
  type CatalogLifecycle,
  type CatalogObject,
  type CatalogObjectType,
  type CatalogOwnerFilter,
} from "./catalog";
import { HomePage } from "./HomePage";
import { RuntimeFleetPage } from "./runtime/RuntimeFleetPage";
import { RuntimeWorkBoardPage } from "./runtime/RuntimeWorkBoardPage";
import { PixelDecorations } from "./ui/PixelDecorations";
import { PixelIcon, type PixelIconName } from "./ui/PixelIcon";
import { PixelLogo } from "./ui/PixelLogo";

type PageKey = "catalog" | "runtime" | "runs";

const navItems: Array<{ label: string; icon: PixelIconName; page: PageKey }> = [
  { label: "对象目录", icon: "catalog", page: "catalog" },
  { label: "Runtime Fleet", icon: "server", page: "runtime" },
  { label: "Runs", icon: "play", page: "runs" },
] as const;

const pagePathByKey: Record<PageKey, string> = {
  catalog: "/catalog",
  runtime: "/runtime",
  runs: "/runs",
};

export type AppAuthMode = "disabled" | "required";

export function App({ authMode = "disabled" }: { authMode?: AppAuthMode }) {
  if (authMode === "required" && getCurrentPath() === "/") {
    return <HomePage />;
  }

  const consoleApp = <ConsoleApp />;
  return authMode === "required" ? <AuthProvider>{consoleApp}</AuthProvider> : consoleApp;
}

function ConsoleApp() {
  const [activePage, setActivePage] = useState<PageKey>(() => pageFromPath(getCurrentPath()) ?? "catalog");

  useEffect(() => {
    const syncPageFromUrl = () => {
      setActivePage(pageFromPath(getCurrentPath()) ?? "catalog");
    };
    window.addEventListener("popstate", syncPageFromUrl);
    return () => window.removeEventListener("popstate", syncPageFromUrl);
  }, []);

  const navigateToPage = (page: PageKey) => {
    const nextPath = pagePathByKey[page];
    if (getCurrentPath() !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setActivePage(page);
  };

  return (
    <main className="appShell">
      <PixelDecorations variant="console" />
      <aside className="sideNav" aria-label="主导航">
        <div className="brandMark">
          <PixelLogo />
        </div>
        <nav className="navList" aria-label="主导航">
          {navItems.map((item) => {
            const isActive = item.page === activePage;
            return (
              <button
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "navItem navItemActive" : "navItem"}
                key={item.label}
                type="button"
                onClick={() => navigateToPage(item.page)}
              >
                <span className="navIconFrame">
                  <PixelIcon name={item.icon} size={16} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <AuthSessionActions />
      </aside>

      {activePage === "runtime" ? <RuntimeFleetPage /> : activePage === "runs" ? <RuntimeWorkBoardPage /> : <CatalogPage />}
    </main>
  );
}

function getCurrentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function pageFromPath(path: string): PageKey | null {
  if (path === "/runtime") return "runtime";
  if (path === "/runs") return "runs";
  if (path === "/catalog") return "catalog";
  return null;
}

function AuthSessionActions() {
  const auth = useOptionalAuthSession();
  if (!auth) return null;

  return (
    <div className="navFooter">
      <span>{auth.session.user.email}</span>
      <button type="button" className="navItem navItemCompact" onClick={() => void auth.logout()}>
        退出登录
      </button>
    </div>
  );
}

function CatalogPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CatalogObjectType | "all">("all");
  const [lifecycle, setLifecycle] = useState<CatalogLifecycle | "all">("all");
  const [owner, setOwner] = useState<CatalogOwnerFilter>("all");
  const [selectedId, setSelectedId] = useState(catalogSeedObjects[1]?.id ?? catalogSeedObjects[0]?.id);

  const filteredObjects = useMemo(
    () => filterCatalogObjects(catalogSeedObjects, { query, type, lifecycle, owner }),
    [query, type, lifecycle, owner],
  );

  const selectedObject =
    filteredObjects.find((object) => object.id === selectedId) ?? filteredObjects[0] ?? null;

  const metrics = useMemo(
    () => ({
      total: catalogSeedObjects.length,
      tbdOwners: catalogSeedObjects.filter((object) => object.ownerSlot.status === "tbd").length,
      production: catalogSeedObjects.filter((object) => object.lifecycle === "production").length,
      review: catalogSeedObjects.filter((object) => object.lifecycle === "review").length,
    }),
    [],
  );

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Registry / Catalog</p>
          <h1>对象目录</h1>
          <p className="pageSubtitle">集中查看正式对象、owner 槽位、生命周期与依赖关系。</p>
        </div>
        <button className="primaryButton" type="button" aria-label="新建对象">
          <PixelIcon name="blocks" size={16} />
          新建对象
        </button>
      </header>

      <section className="toolbar" aria-label="对象筛选">
        <label className="toolbarField toolbarSearch">
          <span className="controlLabel">搜索</span>
          <span className="searchBox">
            <PixelIcon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、用途或标签"
            />
          </span>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">类型</span>
          <select
            data-testid="type-filter"
            value={type}
            onChange={(event) => setType(event.target.value as CatalogObjectType | "all")}
          >
            <option value="all">全部类型</option>
            {CATALOG_OBJECT_TYPES.map((objectType) => (
              <option key={objectType} value={objectType}>
                {catalogTypeZhLabels[objectType]}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">生命周期</span>
          <select
            data-testid="lifecycle-filter"
            value={lifecycle}
            onChange={(event) => setLifecycle(event.target.value as CatalogLifecycle | "all")}
          >
            <option value="all">全部状态</option>
            {CATALOG_LIFECYCLES.map((state) => (
              <option key={state} value={state}>
                {catalogLifecycleZhLabels[state]}
              </option>
            ))}
          </select>
        </label>

        <div className="toolbarField ownerFilter">
          <span className="controlLabel" id="owner-filter-label">
            Owner 状态
          </span>
          <div className="segmentedControl" aria-labelledby="owner-filter-label">
            {[
              ["all", "全部"],
              ["tbd", "待定"],
              ["assigned", "已分配"],
            ].map(([value, label]) => (
              <button
                className={owner === value ? "segmentActive" : ""}
                key={value}
                type="button"
                onClick={() => setOwner(value as CatalogOwnerFilter)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="metricGrid" aria-label="目录概览">
        <Metric label="对象总数" value={metrics.total} tone="blue" />
        <Metric label="Owner 待定" value={metrics.tbdOwners} tone="orange" />
        <Metric label="生产对象" value={metrics.production} tone="green" />
        <Metric label="评审中" value={metrics.review} tone="purple" />
      </section>

      <section className="contentGrid">
        <CatalogTable
          objects={filteredObjects}
          selectedId={selectedObject?.id}
          onSelect={(object) => setSelectedId(object.id)}
        />
        <CatalogDetail object={selectedObject} />
      </section>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`metricCard metric${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CatalogTable({
  objects,
  selectedId,
  onSelect,
}: {
  objects: CatalogObject[];
  selectedId?: string;
  onSelect: (object: CatalogObject) => void;
}) {
  if (objects.length === 0) {
    return (
      <section className="tablePanel emptyState">
        <h2>没有匹配的对象</h2>
        <p>请调整搜索关键词、对象类型、生命周期或 owner 状态。</p>
      </section>
    );
  }

  return (
    <section className="tablePanel" aria-label="Catalog 对象列表">
      <div className="tableSummary">{objects.length} 个对象匹配当前筛选</div>
      <div className="objectTable" role="table" aria-label="Catalog 对象">
        <div className="tableRow tableHeader" role="row">
          <span role="columnheader">名称</span>
          <span role="columnheader">类型</span>
          <span role="columnheader">Owner</span>
          <span role="columnheader">生命周期</span>
          <span role="columnheader">输入 / 输出</span>
          <span role="columnheader">依赖</span>
        </div>
        {objects.map((object) => (
          <button
            className={object.id === selectedId ? "tableRow tableRowActive" : "tableRow"}
            key={object.id}
            type="button"
            role="row"
            onClick={() => onSelect(object)}
          >
            <span className="nameCell" role="cell">
              <strong>{object.name}</strong>
              <small>{object.purpose}</small>
            </span>
            <span role="cell">
              <Badge>{catalogTypeZhLabels[object.type]}</Badge>
            </span>
            <span role="cell">{formatOwner(object)}</span>
            <span role="cell">
              <LifecycleBadge lifecycle={object.lifecycle} />
            </span>
            <span role="cell">
              {object.inputs.length} / {object.outputs.length}
            </span>
            <span role="cell">
              {object.dependencies.length} / {object.usedBy.length}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CatalogDetail({ object }: { object: CatalogObject | null }) {
  if (!object) {
    return (
      <aside className="detailPanel">
        <h2>对象详情</h2>
        <p>选择一个对象查看完整元数据。</p>
      </aside>
    );
  }

  return (
    <aside className="detailPanel" aria-label="对象详情">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">{catalogTypeZhLabels[object.type]}</p>
          <h2>{object.name}</h2>
        </div>
        <LifecycleBadge lifecycle={object.lifecycle} />
      </div>

      <DetailBlock title="用途">{object.purpose}</DetailBlock>
      <DetailBlock title="Owner">{formatOwner(object)}</DetailBlock>
      <DetailList title="输入" items={object.inputs} />
      <DetailList title="输出" items={object.outputs} />
      <DetailBlock title="触发">{object.trigger}</DetailBlock>
      <DetailBlock title="权限">{object.permission}</DetailBlock>
      <DetailBlock title="评测">{object.eval}</DetailBlock>
      <DetailRefs title="依赖对象" refs={object.dependencies} />
      <DetailRefs title="被使用方" refs={object.usedBy} />
      {object.description ? <DetailBlock title="说明">{object.description}</DetailBlock> : null}
    </aside>
  );
}

function DetailBlock({ title, children }: { title: string; children: string }) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function DetailRefs({ title, refs }: { title: string; refs: CatalogObject["dependencies"] }) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      {refs.length ? (
        <div className="refList">
          {refs.map((ref) => (
            <span className="refPill" key={ref.id}>
              {ref.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="mutedText">暂无</p>
      )}
    </section>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="badge">{children}</span>;
}

function LifecycleBadge({ lifecycle }: { lifecycle: CatalogLifecycle }) {
  return <span className={`lifecycleBadge lifecycle-${lifecycle}`}>{catalogLifecycleZhLabels[lifecycle]}</span>;
}

function formatOwner(object: CatalogObject): string {
  if (object.ownerSlot.status === "tbd") {
    return object.ownerSlot.label ?? "TBD";
  }

  return object.ownerSlot.team ? `${object.ownerSlot.name} · ${object.ownerSlot.team}` : object.ownerSlot.name;
}
