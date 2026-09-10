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
  // CRM used to be one combined permission. It's now split into three so an
  // employee can be given e.g. Suppliers without also seeing Clients data.
  // All three still live on the single /crm route (as tabs) — there's no
  // one-to-one URL per key, so moduleKeyForPath() intentionally does NOT
  // resolve "/crm" to any of these; layout.js's route guard special-cases
  // "/crm" directly against CRM_ROUTE_KEYS instead. See crm/page.js, which
  // shows only the tabs the signed-in user can access.
  { key: "clients", label: "Clients (CRM)", href: "/crm", defaultRoles: ["Manager", "Accountant"] },
  { key: "corporates", label: "Corporates (CRM)", href: "/crm", defaultRoles: ["Manager", "Accountant"] },
  { key: "suppliers", label: "Suppliers (CRM)", href: "/crm", defaultRoles: ["Manager", "Accountant"] },
  { key: "invoices", label: "Invoices", href: "/invoices", defaultRoles: ["Manager", "Accountant"] },
  { key: "flights", label: "Flights", href: "/flights", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "hotels", label: "Hotels", href: "/hotels", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "visa", label: "Visa", href: "/visa", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "transportation", label: "Transportation", href: "/transportation", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "files", label: "Files", href: "/files", defaultRoles: ["Manager", "Accountant", "Employee"] },
  { key: "accounts", label: "Accounts", href: "/accounts", defaultRoles: ["Manager", "Accountant"] },
  { key: "fiscalYear", label: "Fiscal Year", href: "/fiscal-year", defaultRoles: ["Accountant"] },
  { key: "analysis", label: "Analysis", href: "/analysis", defaultRoles: ["Manager", "Accountant"] },
  // Two Settings sub-tabs an Admin can now hand out individually. Like CRM
  // above, these share the single /settings route (as tabs) rather than
  // having their own URL — layout.js's route guard special-cases
  // "/settings" against SETTINGS_ROUTE_KEYS. Every OTHER Settings tab
  // (Employees, Permissions, Branches, App Features, License, History)
  // stays hard-locked to Admin-level roles: those control who has access to
  // what, or the company's data/license itself, so handing them out is a
  // much bigger risk than letting someone view reports or trigger a backup.
  { key: "reports", label: "Reports (Settings)", href: "/settings", defaultRoles: [] },
  { key: "backup", label: "Backup (Settings)", href: "/settings", defaultRoles: [] },
  // Not included in the customizable list shown in Settings > Permissions —
  // stays tied to Admin-level roles only.
  { key: "settings", label: "Settings", href: "/settings", defaultRoles: [] },
];

// Every CRM sub-permission. The /crm route is accessible if the signed-in
// user can access AT LEAST ONE of these — used by the layout route guard
// and the Sidebar link, since neither can key off a single "crm" module
// anymore now that it's split three ways.
export const CRM_ROUTE_KEYS = ["clients", "corporates", "suppliers"];

// Settings sub-permissions a non-Admin can be granted. Mirrors CRM_ROUTE_KEYS
// above: the /settings route is reachable for a non-Admin if they can access
// at least one of these (on top of Admin-level roles always getting in).
export const SETTINGS_ROUTE_KEYS = ["reports", "backup"];

// Modules an admin is actually allowed to hand out per-employee (excludes
// Settings, which always stays Admin-level-only for safety).
export const CUSTOMIZABLE_MODULES = PERMISSION_MODULES.filter((m) => m.key !== "settings");

// Modules a true Admin (not General Manager) can globally switch on/off for
// the whole company via Settings > App Features. Dashboard and Settings are
// excluded so nobody — including the Admin who flipped the switch — can
// ever get locked out of the app.
export const TOGGLEABLE_MODULES = PERMISSION_MODULES.filter((m) => m.key !== "settings" && m.key !== "dashboard");

// Routes that map to more than one permission key (see CRM_ROUTE_KEYS /
// SETTINGS_ROUTE_KEYS above) — deliberately excluded here since there's no
// single correct answer for them. Callers must special-case these paths.
const MULTI_KEY_ROUTES = ["/crm", "/settings"];

export function moduleKeyForPath(pathname) {
  if (!pathname) return null;
  if (MULTI_KEY_ROUTES.includes(pathname)) return null;
  const exact = PERMISSION_MODULES.find((m) => m.href === pathname);
  if (exact) return exact.key;
  const candidates = PERMISSION_MODULES.filter(
    (m) => m.href !== "/" && !MULTI_KEY_ROUTES.includes(m.href) && pathname.startsWith(m.href)
  );
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

// Same as canAccessModule but true if the user can access ANY of the given
// keys. Used for routes owned by more than one permission — /crm (see
// CRM_ROUTE_KEYS) and /settings (see SETTINGS_ROUTE_KEYS) — where the route
// itself has no single owning key to check.
export function canAccessAnyModule(userData, moduleKeys, isAdminLevel, appFeatures) {
  return moduleKeys.some((key) => canAccessModule(userData, key, isAdminLevel, appFeatures));
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
