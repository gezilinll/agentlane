import { PixelDecorations } from "./ui/PixelDecorations";
import { PixelIcon } from "./ui/PixelIcon";
import { PixelLogo } from "./ui/PixelLogo";

const platformTags = ["OpenClaw", "Multica", "Slock", "Codex", "DingTalk"];

export function HomePage() {
  return (
    <main className="homePage">
      <PixelDecorations variant="home" testId="home-pixel-decorations" />
      <header className="homeHeader">
        <PixelLogo />
        <nav aria-label="首页导航" className="homeNav">
          <a href="/login">登录</a>
          <a href="/runs">查看看板</a>
        </nav>
      </header>

      <section className="homeHero" aria-labelledby="home-title">
        <div className="homeHero__copy">
          <p className="homeEyebrow">
            <span aria-hidden="true" />
            Agent Network Control Plane
          </p>
          <h1 className="homeTitle" id="home-title">
            把分散的 Agent 变成可运营的工作网络。
          </h1>
          <p className="homeLead">
            Agentlane 统一管理组织里的 Device、Runtime、Agent、Channel 与工作项状态，让 OpenClaw、Multica、Slock、Codex 等运行资产进入同一个可观测、可治理、可复用的控制面。
          </p>
          <div className="homeActions">
            <a className="homeButton homeButton--primary" href="/login">
              开始使用
              <span aria-hidden="true">-&gt;</span>
            </a>
            <a className="homeButton homeButton--secondary" href="/runs">
              查看看板
            </a>
          </div>
          <div className="homePlatformTags" aria-label="当前接入对象">
            {platformTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>

        <div className="homeConsole" aria-label="Agentlane 控制台预览">
          <div className="homeConsole__bar">
            <span># Agentlane / Work Board</span>
            <span aria-hidden="true">•••</span>
          </div>
          <div className="homeConsole__body">
            <nav className="homeConsole__menu" aria-label="预览导航">
              <span>对象目录</span>
              <strong>Runtime</strong>
              <span>Runs</span>
            </nav>
            <div className="homeConsole__content">
              <div className="homeConsole__stats">
                <MetricCard value="5" label="在线 Runtime" />
                <MetricCard value="17" label="可用 Agent" />
                <MetricCard value="883" label="工作项快照" />
              </div>
              <div className="homeConsole__lanes">
                <LanePreview title="待处理" count="42" cards={["同步成本数据", "新增日报口径"]} />
                <LanePreview title="处理中" count="6" cards={["修复记录异常", "反馈聚类"]} />
                <LanePreview title="需关注" count="3" cards={["心跳延迟", "状态待确认"]} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="homeMetric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function LanePreview({ cards, count, title }: { cards: string[]; count: string; title: string }) {
  return (
    <section className="homeLane" aria-label={title}>
      <header>
        <span>{title}</span>
        <strong>{count}</strong>
      </header>
      {cards.map((card) => (
        <article key={card}>
          <PixelIcon name="bot" size={16} />
          <span>{card}</span>
        </article>
      ))}
    </section>
  );
}
