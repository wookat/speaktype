import {
  BookOpen,
  Briefcase,
  Code,
  Crown,
  Heart,
  Languages,
  Leaf,
  Mic,
  PenLine,
  Sparkles,
  SquareTerminal,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** 人设图标：存名字不存图形，渲染时映射到 lucide 图标组件 */
const PERSONA_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  languages: Languages,
  briefcase: Briefcase,
  users: Users,
  heart: Heart,
  terminal: SquareTerminal,
  code: Code,
  book: BookOpen,
  mic: Mic,
  zap: Zap,
  crown: Crown,
  pen: PenLine,
  leaf: Leaf,
};

function PersonaIcon(props: { name: string; className?: string }) {
  const Icon = PERSONA_ICONS[props.name] ?? Sparkles;
  return <Icon className={props.className ?? "h-5 w-5 text-indigo-500"} />;
}
export { PERSONA_ICONS, PersonaIcon };
