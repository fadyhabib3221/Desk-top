// Generic report export helpers.
//
// Both functions work directly off a rendered <table> DOM node, so they
// export EXACTLY what the user currently sees on screen — same filters,
// same date range, same columns — no separate data-mapping to maintain
// per report.

export function findReportTable(container) {
  if (!container) return null;
  return container.querySelector("table");
}

export async function exportTableToExcel(container, filename = "report", sheetName = "Report") {
  const table = findReportTable(container);
  if (!table) return false;
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.table_to_book(table, { sheet: sheetName.slice(0, 31) || "Report" });
  XLSX.writeFile(wb, `${filename}.xlsx`);
  return true;
}

export async function exportTableToPDF(container, filename = "report", title = "") {
  const table = findReportTable(container);
  if (!table) return false;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // Landscape usually fits accounting-style tables (lots of columns) better.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  if (title) {
    doc.setFontSize(12);
    doc.text(title, 24, 28);
  }

  autoTable(doc, {
    html: table,
    startY: title ? 40 : 20,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235] }, // brand blue-600
    margin: { left: 20, right: 20 },
  });

  doc.save(`${filename}.pdf`);
  return true;
}
