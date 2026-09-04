// Central definition of the app's "modules" (one per sidebar page) and the
// logic for deciding whether a given user can access a given module.
//
// Two layers of access, in priority order:
//   1. Admin-level roles (Admin, General Manager) — always full access,
//      exactly like the rest of the app (see ADMIN_LEVEL_ROLES in auth.js).
//   2. Everyone else:
//        - If the user has `customPermissions` set (an object saved from the
//          Settings > Employees > Permissions screen), that object is the
//          single source of truth: { [moduleKey]: true|false }.
//        - Otherwise, fall back to the module's `defaultRoles` list, which
//          mirrors the original hard-coded role -> page mapping.
//
// `settings` is intentionally left out of what admins can hand out via
// custom permissions (see PERMISSION_MODULES below / settings page) — it
// stays Admin-only since it includes employee management, 2FA, and license
// info.

export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard", href: "/", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "crm", label: "CRM", href: "/crm", defaultRoles: ["Manager", "Accountant"] },
  { key: "invoices", label: "Invoices", href: "/invoices", defaultRoles: ["Manager", "Accountant"] },
  { key: "flights", label: "Flights", href: "/flights", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "hotels", label: "Hotels", href: "/hotels", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "visa", label: "Visa", href: "/visa", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "transportation", label: "Transportation", href: "/transportation", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "files", label: "Files", href: "/files", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "accounts", label: "Accounts", href: "/accounts", defaultRoles: ["Manager", "Accountant"] },
  { key: "fiscalYear", label: "Fiscal Year", href: "/fiscal-year", defaultRoles: ["Accountant"] },
  { key: "analysis", label: "Analysis", href: "/analysis", defaultRoles: ["Manager", "Accountant"] },
  // Not included in the customizable list shown in Settings > Permissions —
  // stays tied to Admin-level roles only.
  { key: "settings", label: "Settings", href: "/settings", defaultRoles: [] },
];

// Modules an admin is actually allowed to hand out per-employee (excludes
// Settings, which always stays Admin-level-only for safety).
export const CUSTOMIZABLE_MODULES = PERMISSION_MODULES.filter((m) => m.key !== "settings");

// Modules a true Admin (not General Manager) can globally switch on/off for
// the whole company via Settings > App Features. Dashboard and Settings are
// excluded so nobody — including the Admin who flipped the switch — can
// ever get locked out of the app.
export const TOGGLEABLE_MODULES = PERMISSION_MODULES.filter((m) => m.key !== "settings" && m.key !== "dashboard");

export function moduleKeyForPath(pathname) {
  if (!pathname) return null;
  const exact = PERMISSION_MODULES.find((m) => m.href === pathname);
  if (exact) return exact.key;
  const candidates = PERMISSION_MODULES.filter((m) => m.href !== "/" && pathname.startsWith(m.href));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.href.length - a.href.length);
  return candidates[0].key;
}

// userData: the Firestore user doc (role, customPermissions, ...)
// moduleKey: one of PERMISSION_MODULES[].key
// isAdminLevel: whether this user's role is in ADMIN_LEVEL_ROLES
// appFeatures: the global { [moduleKey]: true|false } doc set by a true
// Admin in Settings > App Features. A module explicitly set to false here
// is off for EVERYONE — including Admin and General Manager — until a true
// Admin turns it back on. Undefined/missing means "on" (default).
export function canAccessModule(userData, moduleKey, isAdminLevel, appFeatures) {
  if (!userData) return false;
  if (appFeatures && appFeatures[moduleKey] === false) return false;
  if (isAdminLevel) return true;
  const mod = PERMISSION_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return true; // unknown module key -> don't block navigation
  const custom = userData.customPermissions;
  if (custom && typeof custom === "object" && Object.prototype.hasOwnProperty.call(custom, moduleKey)) {
    return !!custom[moduleKey];
  }
  return mod.defaultRoles.includes(userData.role);
}

// Read vs. write access. A user can be given "view only" access to a page
// (canAccessModule = true) without being able to add, edit, or delete
// anything in it. Stored separately from customPermissions so it's fully
// backward-compatible: users without a customWritePermissions entry for a
// module they can already access keep full read/write, exactly like
// before this was introduced. No read access always means no write access,
// regardless of what's stored here.
export function canWriteModule(userData, moduleKey, isAdminLevel) {
  if (!userData) return false;
  if (isAdminLevel) return true;
  if (!canAccessModule(userData, moduleKey, isAdminLevel)) return false;
  const customWrite = userData.customWritePermissions;
  if (customWrite && typeof customWrite === "object" && Object.prototype.hasOwnProperty.call(customWrite, moduleKey)) {
    return !!customWrite[moduleKey];
  }
  return true;
}

// Build a starter permissions map for a role, used to prefill the
// Permissions modal the first time it's opened for a user who doesn't have
// customPermissions saved yet.
export function defaultModulesForRole(role) {
  const out = {};
  CUSTOMIZABLE_MODULES.forEach((m) => {
    out[m.key] = m.defaultRoles.includes(role);
  });
  return out;
}
