"use client";

import { useState, useEffect, useMemo } from "react";
import Table from "@/components/Table";
import SectionStats from "@/components/SectionStats";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateCode } from "@/lib/helpers";
import toast from "react-hot-toast";
import { Plus, ArrowLeft, Building2, CheckCircle, Globe2, MapPin, Plane, Trash2 } from "lucide-react";

const EMPTY_DEAL = { airlineSupplierId: "", airlineName: "", dealCode: "", notes: "" };

export default function CorporatesSection({ canWrite = true }) {
  const [corporates, setCorporates] = useState([]);
  const [airlines, setAirlines] = useState([]); // suppliers with category === "Airline"
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    city: "",
    country: "",
    notes: "",
    deals: [],
  });

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, "corporates"),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
        setCorporates(data);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error("Failed to load corporates");
        setLoading(false);
      }
    );
    const unsubSuppliers = onSnapshot(collection(db, "suppliers"), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAirlines(all.filter((s) => (s.category || "Airline") === "Airline"));
    });
    return () => { unsub(); unsubSuppliers(); };
  }, []);

  const openAdd = () => {
    if (!canWrite) return;
    setEditing(null);
    setForm({ name: "", contactPerson: "", phone: "", email: "", city: "", country: "", notes: "", deals: [] });
    setShowModal(true);
  };

  const openEdit = (row) => {
    if (!canWrite) return;
    setEditing(row);
    setForm({
      name: row.name || "",
      contactPerson: row.contactPerson || "",
      phone: row.phone || "",
      email: row.email || "",
      city: row.city || "",
      country: row.country || "",
      notes: row.notes || "",
      deals: Array.isArray(row.deals) ? row.deals : [],
    });
    setShowModal(true);
  };

  const addDealRow = () => setForm((f) => ({ ...f, deals: [...f.deals, { ...EMPTY_DEAL }] }));
  const removeDealRow = (idx) => setForm((f) => ({ ...f, deals: f.deals.filter((_, i) => i !== idx) }));
  const updateDealRow = (idx, patch) =>
    setForm((f) => ({
      ...f,
      deals: f.deals.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canWrite) return;
    // Drop any deal row where no airline was picked — an empty row left
    // over from clicking "+ Add Deal" without filling it in.
    const cleanDeals = form.deals.filter((d) => d.airlineSupplierId);
    try {
      if (editing) {
        await updateDoc(doc(db, "corporates", editing.id), {
          ...form,
          deals: cleanDeals,
          updatedAt: serverTimestamp(),
        });
        toast.success("Corporate updated");
      } else {
        // Corporates share the Client code family (30.xx.00.XXXX) but live
        // under their own 30.01.00.XXXX sub-range, so they're clearly
        // distinguishable from plain Clients (30.00.00.XXXX) while still
        // being selectable from the same "Client" fields across bookings.
        const code = await generateCode("corporates");
        await addDoc(collection(db, "corporates"), {
          ...form,
          deals: cleanDeals,
          code,
          status: "Active",
          createdAt: serverTimestamp(),
        });
        toast.success("Corporate added");
      }
      setShowModal(false);
      // onSnapshot will auto-update the list — no manual refetch needed
    } catch (error) {
      console.error(error);
      toast.error("Operation failed");
    }
  };

  const handleDelete = async (row) => {
    if (!canWrite) return;
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteDoc(doc(db, "corporates", row.id));
      toast.success("Corporate deleted");
    } catch (error) {
      console.error(error);
      toast.error("Delete failed");
    }
  };

  const columns = [
    { key: "code", label: "Corporate Code" },
    { key: "name", label: "Company Name" },
    { key: "contactPerson", label: "Contact Person" },
    { key: "phone", label: "Phone" },
    {
      key: "deals",
      label: "Airline Deals",
      render: (val) => {
        const deals = Array.isArray(val) ? val : [];
        if (!deals.length) return <span className="text-gray-300 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {deals.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                <Plane size={10} /> {d.airlineName || "?"}
              </span>
            ))}
          </div>
        );
      },
    },
    { key: "city", label: "City" },
    { key: "country", label: "Country" },
    {
      key: "status",
      label: "Status",
      render: (val) => (
        <span className={`badge ${val === "Active" ? "badge-green" : "badge-gray"}`}>
          {val || "Active"}
        </span>
      ),
    },
  ];

  // Section header dashboard — Total / Active / Countries / Cities covered
  // across every corporate account currently loaded.
  const sectionStats = useMemo(() => {
    const total = corporates.length;
    const active = corporates.filter((c) => (c.status || "Active") === "Active").length;
    const countries = new Set(corporates.map((c) => (c.country || "").trim()).filter(Boolean)).size;
    const cities = new Set(corporates.map((c) => (c.city || "").trim()).filter(Boolean)).size;
    return [
      { label: "Total Corporates", value: total.toLocaleString("en-US"), icon: Building2, color: "bg-purple-500" },
      { label: "Active", value: active.toLocaleString("en-US"), icon: CheckCircle, color: "bg-emerald-600" },
      { label: "Countries", value: countries.toLocaleString("en-US"), icon: Globe2, color: "bg-blue-500" },
      { label: "Cities", value: cities.toLocaleString("en-US"), icon: MapPin, color: "bg-indigo-500" },
    ];
  }, [corporates]);

  if (showModal && canWrite) {
    return (
      <div>
        <div className="px-6 pt-4 pb-3 flex items-center gap-3 border-b border-gray-200">
          <button
            onClick={() => setShowModal(false)}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Back to list"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="font-semibold text-lg">{editing ? "Edit Corporate" : "Add Corporate"}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-w-2xl space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{"Company Name"}</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{"Contact Person"}</label>
            <input
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{"Phone"}</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{"Email"}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{"City"}</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{"Country"}</label>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Airline Deals — a corporate can have more than one, each
              tied to an airline supplier (category === "Airline"). */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">{"Airline Deals"}</label>
              <button
                type="button"
                onClick={addDealRow}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> Add Deal
              </button>
            </div>
            {form.deals.length === 0 ? (
              <p className="text-xs text-gray-400 border border-dashed rounded-lg py-3 text-center">
                No airline deals yet.
              </p>
            ) : (
              <div className="space-y-2 pr-0.5">
                {form.deals.map((deal, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <select
                        value={deal.airlineSupplierId}
                        onChange={(e) => {
                          const airline = airlines.find((a) => a.id === e.target.value);
                          updateDealRow(idx, {
                            airlineSupplierId: e.target.value,
                            airlineName: airline?.name || "",
                          });
                        }}
                        className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Select airline...</option>
                        {airlines.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.symbol ? `${a.symbol} — ${a.name}` : a.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={deal.dealCode}
                        onChange={(e) => updateDealRow(idx, { dealCode: e.target.value })}
                        placeholder="Deal code / rate ref (optional)"
                        className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <input
                        value={deal.notes}
                        onChange={(e) => updateDealRow(idx, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        className="px-2 py-1.5 border rounded-lg text-sm col-span-2 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDealRow(idx)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0"
                      title="Remove deal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{"Notes"}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              {"Cancel"}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              {"Save"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <SectionStats stats={sectionStats} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">
            {corporates.length} corporates
          </p>
          {canWrite && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus size={18} />
              {"Add Corporate"}
            </button>
          )}
        </div>

        <Table
          columns={columns}
          data={corporates}
          loading={loading}
          onEdit={canWrite ? openEdit : undefined}
          onDelete={canWrite ? handleDelete : undefined}
        />
      </div>
    </div>
  );
}
