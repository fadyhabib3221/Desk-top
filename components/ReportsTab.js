"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isBranchVisible } from "@/lib/helpers";
import { useAuth } from "@/lib/auth";
import ExportButtons from "@/components/ExportButtons";
import { FileBarChart } from "lucide-react";

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
  };
}

const REPORT_TYPES = [
  { id: "salesman", label: "Sales by Salesman" },
  { id: "section", label: "Sales by Section" },
  { id: "client", label: "Sales by Client" },
  { id: "branch", label: "Sales by Branch" },
  { id: "transactions", label: "Detailed Transactions" },
];

const SECTIONS = ["Flight", "Hotel", "Visa", "Transport"];

const inputCls = "px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm";

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

  const [reportType, setReportType] = useState("salesman");
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [section, setSection] = useState("all");
  const [branch, setBranch] = useState("all");

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

  const rows = useMemo(() => {
    const ctx = { isAdmin, activeBranch, myBranches };
    return [
      ...flights.map((r) => normalize(r, "Flight")),
      ...hotels.map((r) => normalize(r, "Hotel")),
      ...visaList.map((r) => normalize(r, "Visa")),
      ...transportation.map((r) => normalize(r, "Transport")),
    ]
      .filter((r) => isBranchVisible(r.branch, ctx))
      .filter((r) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo))
      .filter((r) => section === "all" || r.section === section)
      .filter((r) => branch === "all" || r.branch === branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, hotels, visaList, transportation, isAdmin, activeBranch, myBranches, dateFrom, dateTo, section, branch]);

  const grouped = useMemo(() => {
    if (reportType === "transactions") {
      return rows
        .slice()
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .map((r) => ({
          Date: r.date,
          Section: r.section,
          Client: r.clientName,
          Salesman: r.salesman,
          Ref: r.ref,
          Sell: r.sell,
          Buy: r.buy,
          Profit: r.profit,
        }));
    }

    const keyFn =
      reportType === "salesman"
        ? (r) => r.salesman
        : reportType === "section"
        ? (r) => r.section
        : reportType === "branch"
        ? (r) => branchName(r.branch)
        : (r) => r.clientName;

    const map = {};
    for (const r of rows) {
      const k = keyFn(r) || "—";
      if (!map[k]) map[k] = { key: k, count: 0, sell: 0, buy: 0, profit: 0 };
      map[k].count += 1;
      map[k].sell += r.sell;
      map[k].buy += r.buy;
      map[k].profit += r.profit;
    }
    const label = reportType === "salesman" ? "Salesman" : reportType === "section" ? "Section" : reportType === "branch" ? "Branch" : "Client";
    return Object.values(map)
      .sort((a, b) => b.sell - a.sell)
      .map((s) => ({
        [label]: s.key,
        Docs: s.count,
        Sales: s.sell,
        Cost: s.buy,
        "Gross Profit": s.profit,
        "Margin %": s.sell !== 0 ? ((s.profit / Math.abs(s.sell)) * 100).toFixed(1) : "0.0",
      }));
  }, [rows, reportType]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = grouped.length > 0 ? Object.keys(grouped[0]) : [];
  const isMoneyCol = (c) => ["Sell", "Buy", "Profit", "Sales", "Cost", "Gross Profit"].includes(c);

  const reportLabel = REPORT_TYPES.find((r) => r.id === reportType)?.label || "Report";
  const filename = `${reportLabel.replace(/\s+/g, "_")}_${dateFrom}_to_${dateTo}`;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Report</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={inputCls}>
            {REPORT_TYPES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Section</label>
          <select value={section} onChange={(e) => setSection(e.target.value)} className={inputCls}>
            <option value="all">All Sections</option>
            {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isAdmin && branchesList?.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              <option value="all">All Branches</option>
              {branchesList.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div className="ml-auto">
          <ExportButtons targetRef={tableRef} filename={filename} title={`${reportLabel}  (${dateFrom} to ${dateTo})`} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
          <FileBarChart size={16} className="text-blue-600" />
          <span className="font-semibold text-sm text-gray-800">{reportLabel}</span>
          <span className="text-xs text-gray-400">· {dateFrom} → {dateTo} · {grouped.length} rows</span>
        </div>

        <div ref={tableRef} className="overflow-auto max-h-[calc(100vh-360px)]">
          {grouped.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-12">No data for this selection.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className={`px-3 py-2 ${isMoneyCol(c) ? "text-right" : "text-left"}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-slate-50">
                    {columns.map((c) => (
                      <td key={c} className={`px-3 py-1.5 ${isMoneyCol(c) ? "text-right tabular-nums" : ""}`}>
                        {isMoneyCol(c) ? fmt(row[c]) : row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
