import {
  Archive, Bell, CalendarDays, ClipboardCheck, FileBarChart, FolderKanban, LayoutDashboard,
  ListChecks, MessageSquareText, Settings, ShieldCheck, Users, UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false = page not built yet; shown disabled so the structure is visible. */
  ready: boolean;
  /** Convenience only: hides the link. Real enforcement is RLS + server checks. */
  permission?: string;
  /** Paths that keep this item highlighted (defaults to `href`). */
  match?: string[];
  /** One item, several entry pages: visible if the user may open any of them; links to the first allowed. */
  anyOf?: { href: string; permission: string }[];
};

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "الرئيسية",
    items: [{ href: "/dashboard", label: "لوحة القيادة", icon: LayoutDashboard, ready: true }],
  },
  {
    title: "أعمال اللجنة",
    items: [
      { href: "/meetings", label: "الاجتماعات", icon: CalendarDays, ready: true, permission: "meetings.view" },
      { href: "/committees", label: "اللجان الفرعية", icon: UsersRound, ready: true, permission: "committees.view" },
      {
        href: "/tasks", label: "المهام والقرارات", icon: ListChecks, ready: true,
        match: ["/tasks", "/decisions"],
        anyOf: [{ href: "/tasks", permission: "tasks.view" }, { href: "/decisions", permission: "decisions.view" }],
      },
      { href: "/projects", label: "المشاريع السنوية", icon: FolderKanban, ready: true, permission: "projects.view" },
    ],
  },
  {
    title: "الخدمات",
    items: [
      // Phase 2: maintenance reports and suggestions/complaints are one section.
      { href: "/submissions", label: "الاقتراحات والبلاغات", icon: MessageSquareText, ready: true, permission: "submissions.view" },
      { href: "/duty", label: "المداومة", icon: ClipboardCheck, ready: false },
    ],
  },
  {
    title: "التوثيق",
    items: [
      { href: "/reports", label: "التقارير", icon: FileBarChart, ready: false },
      { href: "/archive", label: "الأرشيف", icon: Archive, ready: false },
      { href: "/notifications", label: "الإشعارات", icon: Bell, ready: false },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { href: "/users", label: "المستخدمون", icon: Users, ready: true, permission: "users.view" },
      { href: "/audit", label: "سجل النشاطات", icon: ShieldCheck, ready: false, permission: "audit.view" },
      { href: "/settings/lookups/task_priorities", label: "قوائم الإعدادات", icon: Settings, ready: true, permission: "settings.manage" },
    ],
  },
];
