import { useEffect, useState } from "react";
import { AuthProvider, useOptionalAuthSession } from "./auth/AuthProvider";
import { HomePage } from "./HomePage";
import { NotificationsPage } from "./notifications/NotificationsPage";
import { OperationsPage } from "./operations/OperationsPage";
import { RuntimeFleetPage } from "./runtime/RuntimeFleetPage";
import { RuntimeWorkBoardPage } from "./runtime/RuntimeWorkBoardPage";
import { OrganizationSettingsPage } from "./settings/OrganizationSettingsPage";
import { SkillRegistryPage } from "./skills/SkillRegistryPage";
import { PixelDecorations } from "./ui/PixelDecorations";
import { PixelIcon, type PixelIconName } from "./ui/PixelIcon";
import { PixelLogo } from "./ui/PixelLogo";

type PageKey = "runtime" | "runs" | "skills" | "operations" | "notifications" | "settings";

const navItems: Array<{ label: string; icon: PixelIconName; page: PageKey }> = [
  { label: "Runtime Fleet", icon: "server", page: "runtime" },
  { label: "Skill 管理", icon: "tool", page: "skills" },
  { label: "Runs", icon: "play", page: "runs" },
  { label: "任务中心", icon: "activity", page: "operations" },
  { label: "通知中心", icon: "mail", page: "notifications" },
  { label: "组织设置", icon: "settings", page: "settings" },
] as const;

const pagePathByKey: Record<PageKey, string> = {
  runtime: "/runtime",
  runs: "/runs",
  skills: "/skills",
  operations: "/operations",
  notifications: "/notifications",
  settings: "/settings",
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
  const auth = useOptionalAuthSession();
  const [activePage, setActivePage] = useState<PageKey>(() => pageFromPath(getCurrentPath()) ?? "runtime");
  const organizationId = auth?.session.organizations[0]?.organizationId;

  useEffect(() => {
    const syncPageFromUrl = () => {
      setActivePage(pageFromPath(getCurrentPath()) ?? "runtime");
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

  const navigateToSkillTarget = (target: { type: "agent"; id: string }) => {
    const searchParams = new URLSearchParams({
      targetId: target.id,
      targetType: target.type,
    });
    const nextPath = `${pagePathByKey.skills}?${searchParams.toString()}`;
    if (`${getCurrentPath()}${window.location.search}` !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setActivePage("skills");
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

      {activePage === "runtime" ? (
        <RuntimeFleetPage onOpenSkillTarget={navigateToSkillTarget} />
      ) : activePage === "runs" ? (
        <RuntimeWorkBoardPage />
      ) : activePage === "skills" ? (
        <SkillRegistryPage organizationId={organizationId} />
      ) : activePage === "operations" ? (
        <OperationsPage organizationId={organizationId} />
      ) : activePage === "notifications" ? (
        <NotificationsPage organizationId={organizationId} />
      ) : (
        <OrganizationSettingsPage session={auth?.session} />
      )}
    </main>
  );
}

function getCurrentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function pageFromPath(path: string): PageKey | null {
  if (path === "/runtime") return "runtime";
  if (path === "/runs") return "runs";
  if (path === "/skills") return "skills";
  if (path === "/operations") return "operations";
  if (path === "/notifications") return "notifications";
  if (path === "/settings") return "settings";
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
