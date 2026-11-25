import {
  ExternalLink,
  Minus,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Info,
  Check,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Ellipsis,
  Search,
  Users,
  PanelLeftOpen,
  PanelLeftClose,
  FunctionSquare,
  FileText,
  Component,
  Bot,
} from 'lucide-react';

const icons = {
  ExternalLink,
  Minus,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Info,
  Check,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Ellipsis,
  Search,
  Users,
  PanelLeftOpen,
  PanelLeftClose,
  FunctionSquare,
  FileText,
  Component,
  Bot,
};
export type IconName = keyof typeof icons;

/** The enclosing control or accompanying text supplies the accessible name. */
export function Icon({ name }: { name: IconName }) {
  const Glyph = icons[name];
  return <Glyph size="1em" aria-hidden="true" focusable="false" className="studio-icon" />;
}
