import { useEffect, useState } from "react";
import { AuthProvider, useOptionalAuthSession } from "./auth/AuthProvider";
import {
  ConsoleUtilityBar,
  ConsoleUtilityDrawer,
  type ConsoleUtilityView,
} from "./console/ConsoleUtilityDrawer";
import { HomePage } from "./HomePage";
import { RuntimeFleetPage } from "./runtime/RuntimeFleetPage";
import { RuntimeWorkBoardPage } from "./runtime/RuntimeWorkBoardPage";
import { OrganizationSettingsPage } from "./settings/OrganizationSettingsPage";
import { PixelIcon, type PixelIconName } from "./ui/PixelIcon";
import { PixelLogo } from "./ui/PixelLogo";

type PageKey = "runtime" | "runs" | "settings";

const navItems: Array<{ label: string; icon: PixelIconName; page: PageKey }> = [
  { label: "Runtime Fleet", icon: "server", page: "runtime" },
  { label: "Runs", icon: "play", page: "runs" },
  { label: "组织设置", icon: "settings", page: "settings" },
] as const;

const pagePathByKey: Record<PageKey, string> = {
  runtime: "/runtime",
  runs: "/runs",
  settings: "/settings",
};

const utilityPathByView: Record<ConsoleUtilityView, string> = {
  notifications: "/notifications",
  operations: "/operations",
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
  const [utilityView, setUtilityView] = useState<ConsoleUtilityView | null>(() => utilityViewFromPath(getCurrentPath()));
  const [utilityReturnPath, setUtilityReturnPath] = useState(() => pagePathByKey[pageFromPath(getCurrentPath()) ?? "runtime"]);
  const organizationId = auth?.session.organizations[0]?.organizationId;

  useEffect(() => {
    const syncPageFromUrl = () => {
      const path = getCurrentPath();
      const nextPage = pageFromPath(path);
      const nextUtilityView = utilityViewFromPath(path);
      if (nextPage) {
        setActivePage(nextPage);
        setUtilityView(null);
        setUtilityReturnPath(pagePathByKey[nextPage]);
        return;
      }
      if (nextUtilityView) {
        setUtilityView(nextUtilityView);
        return;
      }
      setActivePage("runtime");
      setUtilityView(null);
      setUtilityReturnPath(pagePathByKey.runtime);
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
    setUtilityView(null);
    setUtilityReturnPath(nextPath);
  };

  const openUtility = (view: ConsoleUtilityView) => {
    const nextPath = utilityPathByView[view];
    const currentRoute = `${getCurrentPath()}${window.location.search}`;
    const currentPage = pageFromPath(getCurrentPath());
    setUtilityReturnPath(currentPage ? currentRoute : pagePathByKey[activePage]);
    if (getCurrentPath() !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setUtilityView(view);
  };

  const closeUtility = () => {
    const nextPath = utilityReturnPath || pagePathByKey[activePage];
    if (getCurrentPath() !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setUtilityView(null);
  };

  return (
    <main className="appShell">
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
      <ConsoleUtilityBar activeView={utilityView} organizationId={organizationId} onOpen={openUtility} />

      {activePage === "runtime" ? (
        <RuntimeFleetPage />
      ) : activePage === "runs" ? (
        <RuntimeWorkBoardPage />
      ) : (
        <OrganizationSettingsPage session={auth?.session} />
      )}
      <ConsoleUtilityDrawer
        organizationId={organizationId}
        view={utilityView}
        onClose={closeUtility}
        onViewChange={openUtility}
      />
    </main>
  );
}

function getCurrentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function pageFromPath(path: string): PageKey | null {
  if (path === "/runtime") return "runtime";
  if (path === "/runs") return "runs";
  if (path === "/settings") return "settings";
  return null;
}

function utilityViewFromPath(path: string): ConsoleUtilityView | null {
  if (path === "/operations") return "operations";
  if (path === "/notifications") return "notifications";
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
