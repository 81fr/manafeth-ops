import * as XLSX from 'xlsx';

/**
 * Export evaluation and performance records to Excel (.xlsx)
 */
export function exportEvaluationsToExcel(rows, sheetTitle = 'سجل_التقييمات', fileName = 'تقرير_التقييمات_نادي_تراؤف.xlsx') {
  if (!Array.isArray(rows) || rows.length === 0) {
    alert('لا توجد بيانات متاحة للتصدير.');
    return;
  }
  const cleanRows = rows.map((r) => {
    const copy = { ...r };
    // Remove any internal or circular keys
    delete copy.id;
    delete copy.scores;
    delete copy.evalLevel;
    delete copy.targetId;
    delete copy.employeeId;
    delete copy.leadEmployeeId;
    delete copy.departmentId;
    delete copy.evaluatedEmployeeId;
    delete copy.evaluatedDepartmentId;
    return copy;
  });

  const ws = XLSX.utils.json_to_sheet(cleanRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

/**
 * Open a beautifully formatted Arabic printable report / PDF for Evaluations
 */
export function printEvaluationsReport({
  title = 'تقرير التقييم والأداء',
  subtitle = 'نادي تراؤف للبنين — جمعية رعاية الأيتام بمحافظة حفر الباطن',
  dateRangeText = '',
  stats = [],
  columns = [],
  rows = [],
  notes = '',
}) {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة وإصدار ملف PDF.');
    return;
  }

  const dateNow = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const statsHtml = stats.length > 0 ? `
    <div class="stats-grid">
      ${stats
        .map(
          (s) => `
        <div class="stat-card">
          <div class="stat-num" style="color: ${s.color || '#183b50'}">${s.value}</div>
          <div class="stat-label">${s.label}</div>
        </div>
      `
        )
        .join('')}
    </div>
  ` : '';

  const theadHtml = `
    <tr>
      ${columns.map((c) => `<th style="${c.width ? `width: ${c.width};` : ''}">${c.label}</th>`).join('')}
    </tr>
  `;

  const tbodyHtml = rows.length > 0
    ? rows
        .map(
          (r, idx) => `
      <tr>
        ${columns
          .map((c) => {
            let val = r[c.key];
            if (c.key === '#') val = idx + 1;
            if (val == null || val === '') val = '—';
            if (c.isScore) {
              const num = Number(val);
              let color = '#1f754d';
              let bg = '#e7f4ed';
              if (num < 70) {
                color = '#b42318';
                bg = '#fce7e6';
              } else if (num < 90) {
                color = '#956700';
                bg = '#fff3d8';
              }
              val = `<span class="score-badge" style="color:${color}; background:${bg};">${val}%</span>`;
            }
            return `<td style="${c.align ? `text-align: ${c.align};` : ''}">${val}</td>`;
          })
          .join('')}
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="${columns.length}" style="text-align:center; padding: 20px;">لا توجد بيانات</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${title} | نادي تراؤف للبنين</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Changa:wght@400;600;700;800&display=swap');
    :root {
      --navy: #183b50;
      --teal: #00A59B;
      --gold: #bba04c;
      --bg: #f8fafc;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: 'Changa', Tahoma, Arial, sans-serif;
      background: white;
      color: #1e293b;
      line-height: 1.5;
    }
    .no-print {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 10px 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .btn {
      font-family: inherit;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      border: none;
    }
    .btn-primary { background: #00A59B; color: white; }
    .btn-secondary { background: #64748b; color: white; }
    .hero {
      text-align: center;
      padding: 15px 0 20px;
      border-bottom: 2px solid var(--border);
      margin-bottom: 20px;
    }
    .hero h1 { margin: 0; font-size: 24px; color: var(--navy); font-weight: 800; }
    .hero p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
    .gold-line {
      width: 80px;
      height: 4px;
      background: var(--gold);
      border-radius: 99px;
      margin: 10px auto 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .stat-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      text-align: center;
      background: #f8fafc;
    }
    .stat-num { font-size: 24px; font-weight: 800; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 2px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13px;
    }
    th {
      background: var(--navy);
      color: white;
      padding: 10px 8px;
      text-align: center;
      font-weight: 700;
      border: 1px solid var(--navy);
    }
    td {
      padding: 8px;
      border: 1px solid var(--border);
      text-align: center;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .score-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 12px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div><strong>جاهز للطباعة أو الحفظ كـ PDF</strong> (حدد الوجهة: Save as PDF)</div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary" onclick="window.print()">🖨️ طباعة / حفظ كـ PDF</button>
      <button class="btn btn-secondary" onclick="window.close()">إغلاق</button>
    </div>
  </div>

  <div class="hero">
    <h1>${title}</h1>
    <p>${subtitle}</p>
    ${dateRangeText ? `<p><strong>الفترة:</strong> ${dateRangeText}</p>` : ''}
    <div class="gold-line"></div>
  </div>

  ${statsHtml}

  <table>
    <thead>${theadHtml}</thead>
    <tbody>${tbodyHtml}</tbody>
  </table>

  ${notes ? `<div style="font-size:12px; color:#475569; margin-bottom:15px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

  <div class="footer">
    <span>نظام إدارة العمليات والتقييم — نادي تراؤف للبنين</span>
    <span>تاريخ التقرير: ${dateNow}</span>
  </div>

  <script>
    setTimeout(() => {
      window.print();
    }, 600);
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
