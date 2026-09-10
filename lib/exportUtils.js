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

export async function exportTableToPDF(container, filename = "report", title = "", meta = null) {
  const table = findReportTable(container);
  if (!table) return false;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // Landscape usually fits accounting-style tables (lots of columns) better.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 24;

  if (meta?.companyName) {
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(meta.companyName, 24, cursorY);
    cursorY += 20;
  }

  if (title) {
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(title, pageWidth / 2, cursorY, { align: "center" });
    cursorY += 4;
    // Underline bar under the title, matching the reference report's
    // shaded title band.
    doc.setDrawColor(180);
    doc.line(24, cursorY + 6, pageWidth - 24, cursorY + 6);
    cursorY += 20;
  }

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  if (meta?.periodLabel) {
    doc.text(meta.periodLabel, 24, cursorY);
  }
  if (meta?.generatedAt) {
    doc.text(meta.generatedAt, pageWidth - 24, cursorY, { align: "right" });
  }
  if (meta?.periodLabel || meta?.generatedAt) cursorY += 14;

  if (meta?.branchLabel) {
    doc.text(meta.branchLabel, 24, cursorY);
    cursorY += 14;
  }

  cursorY += 6;

  autoTable(doc, {
    html: table,
    startY: cursorY,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235] }, // brand blue-600
    margin: { left: 20, right: 20 },
    // The Grand Total row is tagged with data-grand-total="true" on its
    // <tr> in the source table — bold it and give it a light fill so it
    // stands out the same way the reference report's footer row does.
    didParseCell: (data) => {
      const rowEl = data.row.raw;
      if (rowEl?.dataset?.grandTotal === "true") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [226, 232, 240]; // slate-200
      }
    },
    didDrawPage: (data) => {
      const pageStr = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text(pageStr, pageWidth - 24, doc.internal.pageSize.getHeight() - 10, { align: "right" });
    },
  });

  doc.save(`${filename}.pdf`);
  return true;
}
