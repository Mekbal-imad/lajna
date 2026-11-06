import {
  Archive, Bell, CalendarDays, FileBarChart, FolderKanban, Gavel, LayoutDashboard,
  ListChecks, MessageSquareText, ShieldCheck, Users, UsersRound, Wrench,
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
      { href: "/decisions", label: "القرارات", icon: Gavel, ready: false },
      { href: "/committees", label: "اللجان الفرعية", icon: UsersRound, ready: false },
      { href: "/tasks", label: "المهام", icon: ListChecks, ready: false },
      { href: "/projects", label: "المشاريع السنوية", icon: FolderKanban, ready: false },
    ],
  },
  {
    title: "الخدمات",
    items: [
      { href: "/maintenance", label: "الصيانة والبلاغات", icon: Wrench, ready: false },
      { href: "/submissions", label: "الاقتراحات والشكاوى", icon: MessageSquareText, ready: false },
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
    ],
  },
];
