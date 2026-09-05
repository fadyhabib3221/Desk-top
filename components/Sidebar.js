"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import CurrencyConverter from "@/components/CurrencyConverter";
import { version as appVersion } from "@/package.json";
import {
  LayoutDashboard,
  Users,
  FileText,
  Plane,
  Hotel,
  FileCheck,
  Car,
  FolderOpen,
  Calculator,
  BarChart3,
  Settings,
  LogOut,
  CalendarClock,
} from "lucide-react";
const menuItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/crm", label: "CRM", icon: Users, key: "crm" },
  { href: "/invoices", label: "Invoices", icon: FileText, key: "invoices" },
  { href: "/flights", label: "Air Ticket", icon: Plane, key: "flights" },
  { href: "/hotels", label: "Hotels", icon: Hotel, key: "hotels" },
  { href: "/visa", label: "Visa", icon: FileCheck, key: "visa" },
  { href: "/transportation", label: "Transportation", icon: Car, key: "transportation" },
  { href: "/files", label: "Files", icon: FolderOpen, key: "files" },
  { href: "/accounts", label: "Accounts", icon: Calculator, key: "accounts" },
  { href: "/fiscal-year", label: "Fiscal Year", icon: CalendarClock, key: "fiscalYear" },
  { href: "/analysis", label: "Data Analysis", icon: BarChart3, key: "analysis" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { userData, logout, canAccessModule } = useAuth();

  return (
    <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-slate-800 text-white flex flex-col">
      {/* Brand logo */}
      <div className="flex justify-center pt-5 pb-1 px-6">
        <Image
          src="/athena-logo.png"
          alt="Athena Tech"
          width={480}
          height={292}
          className="w-full max-w-[170px] h-auto"
          priority
        />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg">
          TA
        </div>
        <div>
          <h1 className="font-semibold text-sm leading-tight">Travel Agency Management</h1>
          {userData?.role && userData.role !== "Employee" ? (
            <p className="text-xs text-slate-400">{userData.role}</p>
          ) : null}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            if (!canAccessModule(item.key)) return null;

            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Currency Converter + Logout */}
      <div className="p-4 border-t border-slate-700 space-y-1">
        <CurrencyConverter variant="sidebar" />
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
        <p className="text-center text-xs text-slate-500 pt-2">v{appVersion}</p>
      </div>
    </aside>
  );
}
