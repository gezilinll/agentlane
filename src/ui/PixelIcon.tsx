import type { ComponentType, SVGProps } from "react";
import { Analytics } from "pixelarticons/react/Analytics.js";
import { Blocks } from "pixelarticons/react/Blocks.js";
import { Calendar } from "pixelarticons/react/Calendar.js";
import { ChevronDown } from "pixelarticons/react/ChevronDown.js";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft.js";
import { ChevronUp } from "pixelarticons/react/ChevronUp.js";
import { Cpu } from "pixelarticons/react/Cpu.js";
import { GitBranch } from "pixelarticons/react/GitBranch.js";
import { Heart } from "pixelarticons/react/Heart.js";
import { InfoBox } from "pixelarticons/react/InfoBox.js";
import { Library } from "pixelarticons/react/Library.js";
import { Mail } from "pixelarticons/react/Mail.js";
import { Monitor } from "pixelarticons/react/Monitor.js";
import { Play } from "pixelarticons/react/Play.js";
import { Reload } from "pixelarticons/react/Reload.js";
import { RobotFaceHappy } from "pixelarticons/react/RobotFaceHappy.js";
import { Search } from "pixelarticons/react/Search.js";
import { Send } from "pixelarticons/react/Send.js";
import { SettingsCog } from "pixelarticons/react/SettingsCog.js";
import { Terminal } from "pixelarticons/react/Terminal.js";
import { ToolCase } from "pixelarticons/react/ToolCase.js";
import { Users } from "pixelarticons/react/Users.js";

export type PixelIconName =
  | "activity"
  | "blocks"
  | "bot"
  | "branch"
  | "calendar"
  | "catalog"
  | "chart"
  | "chevron-down"
  | "chevron-left"
  | "chevron-up"
  | "cpu"
  | "health"
  | "heart"
  | "info"
  | "mail"
  | "monitor"
  | "play"
  | "reload"
  | "search"
  | "send"
  | "server"
  | "settings"
  | "shield"
  | "terminal"
  | "tool"
  | "users";

const pixelIconComponents: Record<PixelIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  activity: Analytics,
  blocks: Blocks,
  bot: RobotFaceHappy,
  branch: GitBranch,
  calendar: Calendar,
  catalog: Library,
  chart: PixelChartIcon,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-up": ChevronUp,
  cpu: Cpu,
  health: PixelShieldIcon,
  heart: Heart,
  info: InfoBox,
  mail: Mail,
  monitor: Monitor,
  play: Play,
  reload: Reload,
  search: Search,
  send: Send,
  server: PixelDocumentIcon,
  settings: SettingsCog,
  shield: PixelShieldIcon,
  terminal: Terminal,
  tool: ToolCase,
  users: Users,
};

interface PixelIconProps extends SVGProps<SVGSVGElement> {
  name: PixelIconName;
  size?: number;
}

/** Shared pixel icon wrapper so product surfaces do not mix icon styles. */
export function PixelIcon({ className = "", name, size = 20, ...props }: PixelIconProps) {
  const Icon = pixelIconComponents[name];
  return (
    <Icon
      aria-hidden={props["aria-label"] ? undefined : true}
      className={`pixel-icon${className ? ` ${className}` : ""}`}
      data-pixel-icon={name}
      focusable="false"
      height={size}
      shapeRendering="crispEdges"
      width={size}
      {...props}
    />
  );
}

function PixelDocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" {...props}>
      <g shapeRendering="crispEdges">
        <rect x="6" y="3" width="18" height="3" fill="currentColor" />
        <rect x="6" y="26" width="20" height="3" fill="currentColor" />
        <rect x="3" y="6" width="3" height="20" fill="currentColor" />
        <rect x="26" y="10" width="3" height="16" fill="currentColor" />
        <rect x="21" y="6" width="3" height="3" fill="currentColor" />
        <rect x="24" y="8" width="3" height="3" fill="currentColor" />
        <rect x="9" y="10" width="12" height="3" fill="currentColor" />
        <rect x="9" y="15" width="14" height="3" fill="currentColor" />
        <rect x="9" y="20" width="10" height="3" fill="currentColor" />
      </g>
    </svg>
  );
}

function PixelChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" {...props}>
      <g shapeRendering="crispEdges">
        <rect x="4" y="23" width="24" height="3" fill="currentColor" />
        <rect x="4" y="6" width="3" height="20" fill="currentColor" />
        <rect x="9" y="17" width="3" height="6" fill="currentColor" />
        <rect x="12" y="14" width="3" height="3" fill="currentColor" />
        <rect x="15" y="11" width="3" height="3" fill="currentColor" />
        <rect x="18" y="14" width="3" height="3" fill="currentColor" />
        <rect x="21" y="17" width="3" height="3" fill="currentColor" />
        <rect x="24" y="12" width="3" height="8" fill="currentColor" />
      </g>
    </svg>
  );
}

function PixelShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" {...props}>
      <g shapeRendering="crispEdges">
        <rect x="10" y="4" width="12" height="3" fill="currentColor" />
        <rect x="7" y="7" width="3" height="12" fill="currentColor" />
        <rect x="22" y="7" width="3" height="12" fill="currentColor" />
        <rect x="10" y="19" width="3" height="4" fill="currentColor" />
        <rect x="13" y="23" width="3" height="3" fill="currentColor" />
        <rect x="16" y="26" width="3" height="3" fill="currentColor" />
        <rect x="19" y="23" width="3" height="3" fill="currentColor" />
        <rect x="22" y="19" width="3" height="4" fill="currentColor" />
        <rect x="14" y="11" width="4" height="12" fill="currentColor" />
        <rect x="10" y="15" width="12" height="4" fill="currentColor" />
      </g>
    </svg>
  );
}
