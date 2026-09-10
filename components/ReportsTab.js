"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isBranchVisible } from "@/lib/helpers";
import { useAuth } from "@/lib/auth";
import ExportButtons from "@/components/ExportButtons";
import { FileBarChart, ListFilter } from "lucide-react";

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmt(v) {
  return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalize(row, section) {
  const isVoid =
    String(row.status || "").toLowerCase().includes("void") ||
    String(row.ticketType || "").startsWith("V");
  const isCancelled = String(row.status || "").toLowerCase() === "cancelled";
  const isRefund = !!row.isRefundRow;

  let sell = Math.abs(parseNum(row.totalSell ?? row.sellPrice));
  let buy = Math.abs(parseNum(row.totalBuy ?? row.buyPrice));
  if (section === "Visa" && row.embassyFee !== undefined) {
    buy = Math.abs(parseNum(row.totalBuy ?? parseNum(row.buyPrice) + parseNum(row.embassyFee)));
  }
  if (isVoid || isCancelled) {
    // Cancelled (and Void) bookings are excluded entirely from reports —
    // as if they never existed.
    sell = 0;
    buy = 0;
  } else if (isRefund) {
    sell = -sell;
    buy = -buy;
  }

  const date =
    row.issueDate || row.applicationDate || row.pickupDate || row.checkIn || row.refundDate || "";

  // FValue and Taxes only really exist on Flights (fareValue / taxes+CHD+INF
  // fields) — every other section reports 0 for these two, which is honest
  // given they don't track a separate face-value/tax split.
  const fareValue = section === "Flight" ? parseNum(row.fareValue) : 0;
  const taxes =
    section === "Flight"
      ? parseNum(row.taxes) + parseNum(row.taxesCHD) + parseNum(row.taxesINF)
      : 0;
  const pax = parseNum(row.pax) || 1;

  return {
    section,
    date,
    branch: row.branch || "1",
    salesman: row.salesmanName || row.salesman || "Unassigned",
    clientName: row.clientName || "—",
    ref: row.invoiceNumber || row.confirmationNr || row.referenceNr || "",
    sell,
    buy,
    profit: sell - buy,
    fareValue,
    taxes,
    pax,
  };
}

// "Type" — which sections to include. Mirrors the reference screen's
// Air Tickets / Services / Boat Tickets checkboxes, mapped onto this app's
// actual modules (there's no Boat Tickets module here, so it's left out
// rather than shown as a dead checkbox).
const SECTION_TYPES = [
  { key: "Flight", label: "Flights" },
  { key: "Hotel", label: "Hotels" },
  { key: "Visa", label: "Visa" },
  { key: "Transport", label: "Transportation" },
];

// "Best" / group-by dimension for the Collective view.
const GROUP_BY_OPTIONS = [
  { id: "salesman", label: "Salesman" },
  { id: "section", label: "Section" },
  { id: "client", label: "Client" },
  { id: "branch", label: "Branch" },
];

// Sort By — mirrors the reference screen's Name / Turnover / Buy / Profit /
// Profit % radio list, using the columns this report actually computes.
const SORT_OPTIONS = [
  { id: "name", label: "Name" },
  { id: "sales", label: "Turnover (Sales)" },
  { id: "buy", label: "Buy" },
  { id: "profit", label: "Profit" },
  { id: "margin", label: "Profit %" },
];

const inputCls = "px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm";
const checkboxRowCls = "flex items-center gap-2 text-sm text-gray-700";

export default function ReportsTab() {
  const { userData, hasPermission, activeBranch, myBranches, branchesList } = useAuth();
  const isAdmin = hasPermission ? hasPermission(["Admin"]) : userData?.role === "Admin";

  const [flights, setFlights] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [visaList, setVisaList] = useState([]);
  const [transportation, setTransportation] = useState([]);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  // Collective (grouped/summarized) vs Detailed (one row per booking) —
  // mirrors the reference screen's "Collective / Detailed" tabs.
  const [mode, setMode] = useState("collective");
  const [groupBy, setGroupBy] = useState("salesman");
  const [sortBy, setSortBy] = useState("sales");
  const [sortDir, setSortDir] = useState("desc");

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [branch, setBranch] = useState("all");

  // Type — which sections to include, all on by default.
  const [sectionsOn, setSectionsOn] = useState(() =>
    SECTION_TYPES.reduce((acc, s) => ({ ...acc, [s.key]: true }), {})
  );

  // General options
  const [salesmanFilter, setSalesmanFilter] = useState("all");
  const [clientSearch, setClientSearch] = useState("");
  const [refFrom, setRefFrom] = useState("");
  const [refTo, setRefTo] = useState("");
  const [showProfitCols, setShowProfitCols] = useState(true);

  const tableRef = useRef(null);

  useEffect(() => {
    const subs = [
      onSnapshot(collection(db, "flights"), (s) => setFlights(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "hotels"), (s) => setHotels(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "visa"), (s) => setVisaList(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "transportation"), (s) => setTransportation(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => subs.forEach((u) => u && u());
  }, []);

  const branchName = (code) => branchesList?.find((b) => b.code === code)?.name || code;

  // Every row before the Type / Salesman / Client / Ref filters — used to
  // populate the Salesman dropdown with only names that actually appear.
  const allRows = useMemo(() => {
    const ctx = { isAdmin, activeBranch, myBranches };
    return [
      ...flights.map((r) => normalize(r, "Flight")),
      ...hotels.map((r) => normalize(r, "Hotel")),
      ...visaList.map((r) => normalize(r, "Visa")),
      ...transportation.map((r) => normalize(r, "Transport")),
    ]
      .filter((r) => isBranchVisible(r.branch, ctx))
      .filter((r) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo))
      .filter((r) => branch === "all" || r.branch === branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, hotels, visaList, transportation, isAdmin, activeBranch, myBranches, dateFrom, dateTo, branch]);

  const salesmenAvailable = useMemo(() => {
    const set = new Set(allRows.map((r) => r.salesman).filter(Boolean));
    return Array.from(set).sort();
  }, [allRows]);

  const rows = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    return allRows
      .filter((r) => sectionsOn[r.section])
      .filter((r) => salesmanFilter === "all" || r.salesman === salesmanFilter)
      .filter((r) => !search || r.clientName.toLowerCase().includes(search))
      .filter((r) => !refFrom || (r.ref || "") >= refFrom)
      .filter((r) => !refTo || (r.ref || "") <= refTo);
  }, [allRows, sectionsOn, salesmanFilter, clientSearch, refFrom, refTo]);

  const detailedRows = useMemo(() => {
    return rows
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map((r) => ({
        Date: r.date,
        Section: r.section,
        Client: r.clientName,
        Salesman: r.salesman,
        Ref: r.ref,
        FValue: r.fareValue,
        Taxes: r.taxes,
        Sell: r.sell,
        Buy: r.buy,
        Profit: r.profit,
        Pax: r.pax,
      }));
  }, [rows]);

  const collectiveRows = useMemo(() => {
    const keyFn =
      groupBy === "salesman"
        ? (r) => r.salesman
        : groupBy === "section"
        ? (r) => r.section
        : groupBy === "branch"
        ? (r) => branchName(r.branch)
        : (r) => r.clientName;

    const map = {};
    for (const r of rows) {
      const k = keyFn(r) || "—";
      if (!map[k]) map[k] = { key: k, count: 0, sell: 0, buy: 0, profit: 0, fareValue: 0, taxes: 0, pax: 0 };
      map[k].count += 1;
      map[k].sell += r.sell;
      map[k].buy += r.buy;
      map[k].profit += r.profit;
      map[k].fareValue += r.fareValue;
      map[k].taxes += r.taxes;
      map[k].pax += r.pax;
    }
    const label = GROUP_BY_OPTIONS.find((g) => g.id === groupBy)?.label || "Group";

    const sortKey = {
      name: (s) => s.key,
      sales: (s) => s.sell,
      buy: (s) => s.buy,
      profit: (s) => s.profit,
      margin: (s) => (s.sell !== 0 ? s.profit / Math.abs(s.sell) : 0),
    }[sortBy];

    const list = Object.values(map).sort((a, b) => {
      const av = sortKey(a);
      const bv = sortKey(b);
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return list.map((s) => {
      const out = {
        [label]: s.key,
        Docs: s.count,
        FValue: s.fareValue,
        Taxes: s.taxes,
        Sales: s.sell,
        Cost: s.buy,
      };
      if (showProfitCols) {
        out["Gross Profit"] = s.profit;
        out["Margin %"] = s.sell !== 0 ? ((s.profit / Math.abs(s.sell)) * 100).toFixed(1) : "0.0";
      }
      out.Pax = s.pax;
      return out;
    });
  }, [rows, groupBy, sortBy, sortDir, showProfitCols]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = mode === "detailed" ? detailedRows : collectiveRows;
  const columns = grouped.length > 0 ? Object.keys(grouped[0]) : [];
  const isMoneyCol = (c) => ["FValue", "Taxes", "Sell", "Buy", "Profit", "Sales", "Cost", "Gross Profit"].includes(c);
  const isCountCol = (c) => ["Pax", "Docs"].includes(c);

  // Grand Total footer row — sums every money/count column. "Margin %" is
  // recomputed from the summed totals rather than summed itself (summing
  // percentages across groups would be meaningless).
  const grandTotal = useMemo(() => {
    if (grouped.length === 0) return null;
    const totals = {};
    for (const c of columns) {
      if (isMoneyCol(c) || isCountCol(c)) {
        totals[c] = grouped.reduce((sum, r) => sum + (parseFloat(r[c]) || 0), 0);
      }
    }
    if (columns.includes("Margin %")) {
      const sales = totals["Sales"] ?? totals["Sell"] ?? 0;
      const profit = totals["Gross Profit"] ?? totals["Profit"] ?? 0;
      totals["Margin %"] = sales !== 0 ? ((profit / Math.abs(sales)) * 100).toFixed(1) : "0.0";
    }
    // Label goes in the first column — the group-by dimension in Collective
    // mode, or "Date" in Detailed mode (its value is just replaced by the
    // "Grand Total" label, a standard accounting-report convention).
    totals[columns[0]] = "Grand Total";
    return totals;
  }, [grouped, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupLabel = GROUP_BY_OPTIONS.find((g) => g.id === groupBy)?.label || "";
  const reportLabel = mode === "detailed" ? "Detailed Transactions" : `Sales by ${groupLabel}`;
  const filename = `${reportLabel.replace(/\s+/g, "_")}_${dateFrom}_to_${dateTo}`;

  const branchLabel = branch === "all" ? "All Branches" : branchName(branch);
  const exportMeta = {
    companyName: "Travel Agency Management",
    periodLabel: `Period From: ${dateFrom}   To: ${dateTo}`,
    branchLabel: `Branch: ${branchLabel}`,
    generatedAt: new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  };

  return (
    <div className="space-y-4">
      {/* ── Filter panel ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {/* Branch + Date period */}
        <div className="flex flex-wrap items-end gap-4">
          {isAdmin && branchesList?.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                <option value="all">All Branches</option>
                {branchesList.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </div>

          {/* Collective / Detailed tabs */}
          <div className="ml-2 flex rounded-lg border border-gray-200 overflow-hidden">
            {["collective", "detailed"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-sm font-medium capitalize transition ${
                  mode === m ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <ExportButtons
              targetRef={tableRef}
              filename={filename}
              title={`${reportLabel}  (${dateFrom} to ${dateTo})`}
              meta={exportMeta}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-gray-100">
          {/* Type — which sections to include */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <ListFilter size={13} /> Type
            </p>
            <div className="space-y-1.5">
              {SECTION_TYPES.map((s) => (
                <label key={s.key} className={checkboxRowCls}>
                  <input
                    type="checkbox"
                    checked={!!sectionsOn[s.key]}
                    onChange={(e) => setSectionsOn({ ...sectionsOn, [s.key]: e.target.checked })}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Collective-only: Group By + Sort By */}
          {mode === "collective" ? (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Group By ("Best")</p>
                <div className="space-y-1.5">
                  {GROUP_BY_OPTIONS.map((g) => (
                    <label key={g.id} className={checkboxRowCls}>
                      <input
                        type="radio"
                        name="groupBy"
                        checked={groupBy === g.id}
                        onChange={() => setGroupBy(g.id)}
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Sort By</p>
                <div className="space-y-1.5">
                  {SORT_OPTIONS.map((s) => (
                    <label key={s.id} className={checkboxRowCls}>
                      <input
                        type="radio"
                        name="sortBy"
                        checked={sortBy === s.id}
                        onChange={() => setSortBy(s.id)}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input type="radio" name="sortDir" checked={sortDir === "desc"} onChange={() => setSortDir("desc")} />
                    High → Low
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input type="radio" name="sortDir" checked={sortDir === "asc"} onChange={() => setSortDir("asc")} />
                    Low → High
                  </label>
                </div>
              </div>
            </>
          ) : (
            <div className="md:col-span-2 text-xs text-gray-400 flex items-center">
              Detailed view lists every booking individually — grouping and sorting don't apply here.
            </div>
          )}

          {/* General options */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">General Options</p>
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Salesman</label>
                <select value={salesmanFilter} onChange={(e) => setSalesmanFilter(e.target.value)} className={`${inputCls} w-full`}>
                  <option value="all">All Salesmen</option>
                  {salesmenAvailable.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Client's Name</label>
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search..."
                  className={`${inputCls} w-full`}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-500 mb-0.5">Ref/Code From</label>
                  <input value={refFrom} onChange={(e) => setRefFrom(e.target.value)} className={`${inputCls} w-full`} />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-500 mb-0.5">Ref/Code To</label>
                  <input value={refTo} onChange={(e) => setRefTo(e.target.value)} className={`${inputCls} w-full`} />
                </div>
              </div>
              {mode === "collective" && (
                <label className={checkboxRowCls}>
                  <input type="checkbox" checked={showProfitCols} onChange={(e) => setShowProfitCols(e.target.checked)} />
                  Include Gross Profit / Margin %
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <div className="flex items-center gap-2">
            <FileBarChart size={16} className="text-blue-600" />
            <span className="font-semibold text-sm text-gray-800">{reportLabel}</span>
            <span className="text-xs text-gray-400">· {grouped.length} rows</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {exportMeta.periodLabel} · {exportMeta.branchLabel}
          </p>
        </div>

        <div ref={tableRef} className="overflow-auto max-h-[calc(100vh-460px)]">
          {grouped.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-12">No data for this selection.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className={`px-3 py-2 ${isMoneyCol(c) || isCountCol(c) ? "text-right" : "text-left"}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-slate-50">
                    {columns.map((c) => (
                      <td key={c} className={`px-3 py-1.5 ${isMoneyCol(c) ? "text-right tabular-nums" : isCountCol(c) ? "text-right" : ""}`}>
                        {isMoneyCol(c) ? fmt(row[c]) : row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
                {grandTotal && (
                  <tr data-grand-total="true" className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                    {columns.map((c) => (
                      <td key={c} className={`px-3 py-2 ${isMoneyCol(c) ? "text-right tabular-nums" : isCountCol(c) ? "text-right" : ""}`}>
                        {isMoneyCol(c) ? fmt(grandTotal[c]) : grandTotal[c]}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
