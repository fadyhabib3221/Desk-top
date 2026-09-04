"use client";

import React, { useState, useEffect, useMemo } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isBranchVisible } from "@/lib/helpers";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Printer, Calendar, Users } from "lucide-react";

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function palette(i) {
  // Evenly spaced hues so any number of salesmen gets visually distinct slices.
  const hue = (i * 137.508) % 360; // golden-angle spacing
  return `hsl(${hue.toFixed(0)}, 62%, 50%)`;
}

function normalizeForAnalysis(row, section) {
  const isVoid =
    String(row.status || "").toLowerCase().includes("void") ||
    String(row.ticketType || "").startsWith("V");
  const isRefund = !!row.isRefundRow;

  let sell = Math.abs(parseNum(row.totalSell ?? row.sellPrice));
  let buy = Math.abs(parseNum(row.totalBuy ?? row.buyPrice));
  if (section === "Visa" && row.embassyFee !== undefined) {
    buy = Math.abs(parseNum(row.totalBuy ?? parseNum(row.buyPrice) + parseNum(row.embassyFee)));
  }
  if (isVoid) {
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
    salesman: row.salesmanName || row.salesman || "",
    sell,
    buy,
    profit: sell - buy,
  };
}

const inputCls = "px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm";

function fmt(v) {
  return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AnalysisPage() {
  const { userData, hasPermission, activeBranch, myBranches } = useAuth();
  const isAdmin = hasPermission ? hasPermission(["Admin"]) : userData?.role === "Admin";

  const [flights, setFlights] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [visaList, setVisaList] = useState([]);
  const [transportation, setTransportation] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [costCard, setCostCard] = useState(false); // False = rank by Sales, True = rank by Gross Profit (cost basis)
  const [printedAt, setPrintedAt] = useState(null);

  useEffect(() => {
    setPrintedAt(new Date());
    const subs = [
      onSnapshot(collection(db, "flights"), (s) => setFlights(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "hotels"), (s) => setHotels(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "visa"), (s) => setVisaList(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "transportation"), (s) => setTransportation(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    setLoading(false);
    return () => subs.forEach((u) => u && u());
  }, []);

  const rows = useMemo(() => {
    const ctx = { isAdmin, activeBranch, myBranches };
    const all = [
      ...flights.map((r) => normalizeForAnalysis(r, "Flight")),
      ...hotels.map((r) => normalizeForAnalysis(r, "Hotel")),
      ...visaList.map((r) => normalizeForAnalysis(r, "Visa")),
      ...transportation.map((r) => normalizeForAnalysis(r, "Transport")),
    ]
      .filter((r) => isBranchVisible(r.branch, ctx))
      .filter((r) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo));
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, hotels, visaList, transportation, isAdmin, activeBranch, myBranches, dateFrom, dateTo]);

  const bySalesman = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const key = r.salesman || "Unassigned";
      if (!map[key]) map[key] = { name: key, count: 0, sell: 0, buy: 0, profit: 0 };
      map[key].count += 1;
      map[key].sell += r.sell;
      map[key].buy += r.buy;
      map[key].profit += r.profit;
    }
    const metric = costCard ? "profit" : "sell";
    const list = Object.values(map)
      .filter((s) => Math.abs(s[metric]) > 0.004)
      .sort((a, b) => b[metric] - a[metric]);
    const total = list.reduce((sum, s) => sum + s[metric], 0);
    return list.map((s, i) => ({
      ...s,
      value: s[metric],
      pct: total !== 0 ? (s[metric] / total) * 100 : 0,
      color: palette(i),
    }));
  }, [rows, costCard]);

  const total = bySalesman.reduce((sum, s) => sum + s.value, 0);
  const metricLabel = costCard ? "Gross Profit" : "Sales";

  const handlePrint = () => window.print();

  return (
    <div>
      <Navbar title={"Data Analysis" || "Analysis"} />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-4 print:hidden">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Period From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Period To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
            <input type="checkbox" checked={costCard} onChange={(e) => setCostCard(e.target.checked)} />
            Cost Card (rank by Gross Profit instead of Sales)
          </label>
          <div className="ml-auto">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        </div>

        {/* Report */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 pt-5">
            <h2 className="font-bold text-gray-800">{"Travel Agency Management" || "Travel Agency"}</h2>
            <div className="text-right text-xs text-gray-500">
              {printedAt && (
                <>
                  <div>{printedAt.toLocaleDateString()} {printedAt.toLocaleTimeString()}</div>
                  <div>Page 1</div>
                </>
              )}
            </div>
          </div>

          <div className="mx-6 mt-3 bg-slate-100 border border-slate-300 rounded text-center py-2">
            <span className="font-bold text-slate-800 text-base">Best Salesman</span>
          </div>

          <div className="text-center text-sm text-gray-600 mt-2">
            Period From : {dateFrom || "…"} To : {dateTo || "…"}
          </div>

          <div className="px-6 mt-3 flex items-center justify-between text-sm">
            <span className="text-gray-500">Cost Card : {costCard ? "True" : "False"}</span>
            <span className="font-bold text-gray-800">
              Total ({metricLabel}) : {fmt(total)}
            </span>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
          ) : bySalesman.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm flex flex-col items-center gap-2">
              <Users size={28} className="text-gray-300" />
              No data in this period.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-6 px-6 py-6">
              <div className="w-full lg:w-[440px] h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bySalesman}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={140}
                      label={({ name, pct }) => (pct >= 1.5 ? `${name} ${pct.toFixed(2)}%` : "")}
                      labelLine={{ stroke: "#94a3b8" }}
                      isAnimationActive={false}
                    >
                      {bySalesman.map((s, i) => (
                        <Cell key={s.name} fill={s.color} stroke="#fff" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => [`${fmt(v)} (${p.payload.pct.toFixed(2)}%)`, p.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 min-w-[260px] border border-gray-200 rounded-lg max-h-[380px] overflow-y-auto">
                {bySalesman.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-100 last:border-0">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="tabular-nums text-gray-500 w-24 text-right flex-shrink-0">{fmt(s.value)}</span>
                    <span className="text-gray-800 truncate">{s.name}</span>
                    <span className="ml-auto text-gray-400 flex-shrink-0">{s.pct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
