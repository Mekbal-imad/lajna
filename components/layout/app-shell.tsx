"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, LogOut } from "lucide-react";
import { Sidebar } from "./sidebar";
import { signOut } from "@/app/login/actions";

export function AppShell({
  userName, permissions, children,
}: { userName: string; permissions: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <Sidebar open={open} onClose={() => setOpen(false)} permissions={permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="فتح القائمة"
            className="-ms-1 p-1 text-forest lg:hidden"
          >
            <Menu size={22} />
          </button>
          <div className="flex-1" />
          <Link href="/account" className="text-sm text-muted hover:text-forest">{userName}</Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm text-forest hover:bg-ivory"
            >
              <LogOut size={16} />
              تسجيل الخروج
            </button>
          </form>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
