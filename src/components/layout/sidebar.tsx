"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  Users,
  UsersRound,
  FileBarChart,
  Settings,
  LogOut,
  UserCog,
} from "lucide-react";
import { useLang } from "@/lib/i18n";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { lang, setLang, t } = useLang();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const navItems = [
    { href: "/dashboard", label: t.common.dashboard, icon: LayoutDashboard },
    { href: "/schedule", label: t.common.schedule, icon: Calendar },
    { href: "/tasks", label: t.common.tasks, icon: ListTodo },
    { href: "/employees", label: t.common.employees, icon: Users },
    { href: "/teams", label: t.common.teams, icon: UsersRound },
    { href: "/reports/annual", label: t.common.reports, icon: FileBarChart },
    ...(role === "ADMIN"
      ? [{ href: "/accounts", label: t.common.accounts, icon: UserCog }]
      : []),
    { href: "/settings", label: t.common.settings, icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-gray-900 text-white flex flex-col">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-700">
        <div className="flex h-9 w-[76px] shrink-0 items-center justify-center rounded-lg bg-white px-1.5 shadow-sm">
          <Image src="/logo-qualitia.svg" alt="Qualitia" width={101} height={48} priority unoptimized className="h-auto w-full" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">Task Manager</h1>
          <p className="text-xs text-gray-400">Active</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700 space-y-2">
        {/* Language toggle */}
        <div className="flex items-center gap-1 px-3">
          <button
            onClick={() => setLang("vi")}
            className={`px-2 py-1 rounded text-xs ${lang === "vi" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >🇻🇳 VI</button>
          <button
            onClick={() => setLang("ja")}
            className={`px-2 py-1 rounded text-xs ${lang === "ja" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >🇯🇵 JA</button>
        </div>
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-white truncate">
            {session?.user?.name || "User"}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {session?.user?.email || ""}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t.common.logout}
        </button>
      </div>
    </aside>
  );
}
