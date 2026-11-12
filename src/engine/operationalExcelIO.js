import * as XLSX from 'xlsx';

const DAYS_ORDER = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

function normalizeArabic(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function parseDisplayTimeRange(displayTime, fallbackStart = '15:15', fallbackEnd = '15:30') {
  if (!displayTime) return { startTime: fallbackStart, endTime: fallbackEnd };
  const cleaned = String(displayTime)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[–—]/g, '-');
  const matches = cleaned.match(/(\d{1,2}):(\d{2})/g);
  if (!matches || matches.length === 0) {
    return { startTime: fallbackStart, endTime: fallbackEnd };
  }
  const to24 = (t) => {
    const [hStr, mStr] = t.split(':');
    let h = parseInt(hStr, 10);
    // Club hours are afternoon/evening (1:00 PM - 11:00 PM) if h <= 11
    if (h >= 1 && h <= 11) h += 12;
    return `${String(h).padStart(2, '0')}:${mStr}`;
  };
  const startTime = to24(matches[0]);
  const endTime = matches[1] ? to24(matches[1]) : startTime;
  return { startTime, endTime };
}

// ============================================================================
// 1. الجدول الزمني للفترات (Periods Import / Export / Preview Template)
// ============================================================================

export function buildPeriodsWorkbook(periods = [], isTemplate = false) {
  const wb = XLSX.utils.book_new();

  const sorted = [...periods].sort((a, b) => (a.order || 0) - (b.order || 0));
  const rows = sorted.map((p, idx) => ({
    'الترتيب': p.order || idx + 1,
    'المعرف البرمجي': p.id || `PER_${idx + 1}`,
    'الفترة': p.name || '',
    'الوقت': p.displayTime || `${p.startTime || ''} - ${p.endTime || ''}`,
    'من (24 ساعة)': p.startTime || '',
    'إلى (24 ساعة)': p.endTime || '',
    'التصنيف': p.category === 'program_period' ? 'فترة برامج (تشغيلية)' : 'حدث ثابت (إشراف/صلاة/وجبة/انصراف)',
    'نوع الحدث': p.eventType || (p.category === 'program_period' ? 'فترة تشغيلية' : 'حدث ثابت'),
    'إظهار في الجدول': p.visibleInSchedule !== false ? 'نعم' : 'لا',
    'السماح بجدولة البرامج': p.allowProgramScheduling ? 'نعم' : 'لا',
    'سلوك التعارض': p.conflictBehavior || (p.allowProgramScheduling ? 'strict_check' : 'block_all'),
    'المرجع': p.sourceDoc || 'الجدول الزمني للفترات 1447هـ (تحديث 8-11-2026م)'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 30 },
    { wch: 16 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 36 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'الجدول الزمني للفترات');

  // Simple 2-column sheet matching the exact Word/PDF layout
  const simpleRows = sorted.map(p => ({
    'الفترة': p.name || '',
    'الوقت': p.displayTime || ''
  }));
  const wsSimple = XLSX.utils.json_to_sheet(simpleRows);
  wsSimple['!cols'] = [{ wch: 28 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSimple, 'نموذج مبسط (الفترة والوقت)');

  if (isTemplate) {
    const guideRows = [
      { 'البند': 'طريقة الاستخدام', 'الشرح': 'يمكنك تعديل أوقات أو مسميات الفترات في ورقة (الجدول الزمني للفترات) أو ورقة (نموذج مبسط) ثم حفظ الملف ورفعه مباشرة للمنصة.' },
      { 'البند': 'صيغة الوقت', 'الشرح': 'يمكن كتابة الوقت بصيغة العرض المعتادة مثل (3:50 – 4:40) أو (3:15 - 3:30) وسيقوم النظام تلقائياً بتحويلها إلى توقيت 24 ساعة.' },
      { 'البند': 'التصنيف', 'الشرح': 'اكتب (فترة برامج) للفترات التي تُجدول فيها البرامج والأنشطة (مثل الفترة الأولى والثانية والثالثة)، أو (حدث ثابت) للصلاة والوجبة والاستقبال والانصراف.' }
    ];
    const wsGuide = XLSX.utils.json_to_sheet(guideRows);
    wsGuide['!cols'] = [{ wch: 22 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, 'تعليمات التعبئة');
  }

  return wb;
}

export function downloadPeriodsTemplateExcel(periods = []) {
  const wb = buildPeriodsWorkbook(periods, true);
  XLSX.writeFile(wb, 'معاينة_وتعبئة_الجدول_الزمني_للفترات.xlsx');
}

export function exportCurrentPeriodsExcel(periods = []) {
  const wb = buildPeriodsWorkbook(periods, false);
  XLSX.writeFile(wb, 'الجدول_الزمني_للفترات_المعتمد.xlsx');
}

export async function parsePeriodsExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => !n.includes('تعليمات')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('الملف المرفوع فارغ أو لا يحتوي على صفوف صالحة للفترات.');
  }

  let pCounter = 1;
  const periods = rawRows
    .map((r, idx) => {
      const name = String(r['الفترة'] || r['اسم الفترة'] || r['الحدث'] || '').trim();
      const displayTime = String(r['الوقت'] || r['الوقت (للعرض)'] || '').trim();
      if (!name && !displayTime) return null;

      const parsedRange = parseDisplayTimeRange(displayTime);
      const startTime = String(r['من (24 ساعة)'] || r['من'] || '').trim() || parsedRange.startTime;
      const endTime = String(r['إلى (24 ساعة)'] || r['إلى'] || '').trim() || parsedRange.endTime;

      const catRaw = String(r['التصنيف'] || '').trim();
      const isProgramPeriod =
        catRaw.includes('برامج') ||
        catRaw.includes('تشغيل') ||
        catRaw === 'program_period' ||
        name.includes('الفترة الأولى') ||
        name.includes('الفترة الثانية') ||
        name.includes('الفترة الثالثة');

      let id = String(r['المعرف البرمجي'] || r['المعرف'] || '').trim();
      if (!id) {
        if (name.includes('الفترة الأولى')) id = 'P1';
        else if (name.includes('الفترة الثانية')) id = 'P2';
        else if (name.includes('الفترة الثالثة')) id = 'P3';
        else if (name.includes('بداية الإشراف')) id = 'PER_SUP_START';
        else if (name.includes('الحافلات') || name.includes('استقبال')) id = 'PER_RECEPTION';
        else if (name.includes('العصر')) id = 'PER_ASR';
        else if (name.includes('الوجبة') || name.includes('العشاء الخفيف')) id = 'PER_MEAL';
        else if (name.includes('المغرب')) id = 'PER_MAGHRIB';
        else if (name.includes('العشاء')) id = 'PER_ISHA';
        else if (name.includes('صرف') || name.includes('انصراف')) id = 'PER_DISMISSAL';
        else id = isProgramPeriod ? `P${pCounter++}` : `PER_CUSTOM_${idx + 1}`;
      }

      const allowSchedRaw = String(r['السماح بجدولة البرامج'] || '').trim();
      const allowProgramScheduling = allowSchedRaw
        ? allowSchedRaw === 'نعم' || allowSchedRaw === 'true'
        : isProgramPeriod;

      const visibleRaw = String(r['إظهار في الجدول'] || '').trim();
      const visibleInSchedule = visibleRaw ? visibleRaw !== 'لا' && visibleRaw !== 'false' : true;

      let eventType = String(r['نوع الحدث'] || '').trim();
      if (!eventType) {
        if (isProgramPeriod) eventType = 'فترة تشغيلية';
        else if (name.includes('صلاة')) eventType = 'صلاة';
        else if (name.includes('وجبة')) eventType = 'وجبة';
        else if (name.includes('الحافلات') || name.includes('استقبال')) eventType = 'استقبال';
        else if (name.includes('صرف') || name.includes('انصراف')) eventType = 'انصراف';
        else eventType = 'إشراف';
      }

      return {
        id,
        name,
        order: Number(r['الترتيب']) || idx + 1,
        startTime,
        endTime,
        approvedStart: startTime,
        approvedEnd: endTime,
        displayTime: displayTime || `${startTime} - ${endTime}`,
        category: isProgramPeriod ? 'program_period' : 'fixed_event',
        eventType,
        visibleInSchedule,
        showInSchedule: visibleInSchedule,
        allowProgramScheduling,
        conflictBehavior: String(r['سلوك التعارض'] || 'actual_conflict').trim(),
        hasDiscrepancy: false,
        discrepancyNote: '',
        sourceDoc: String(r['المرجع'] || file.name || 'ملف مستورد').trim(),
        reviewStatus: 'approved'
      };
    })
    .filter(Boolean);

  if (periods.length === 0) {
    throw new Error('لم يتم العثور على فترات صالحة داخل الملف.');
  }

  return {
    periods,
    summary: {
      fileName: file.name,
      sheetName,
      totalPeriods: periods.length,
      programPeriodsCount: periods.filter(p => p.category === 'program_period').length,
      fixedEventsCount: periods.filter(p => p.category !== 'program_period').length
    }
  };
}

// ============================================================================
// 2. جدول المعلمين والقاعات والفئات الأسبوعي (Weekly Schedule Import / Export / Preview)
// ============================================================================

export function buildScheduleWorkbook(state, isTemplate = false) {
  const wb = XLSX.utils.book_new();
  const commitments = state?.weeklyCommitments || [];
  const employees = (state?.employees || []).filter(e =>
    commitments.some(c => c.employeeId === e.id) || (e.id && /^EMP-(0[1-9]|1\d|2[0-8])$/.test(e.id))
  );

  // Sheet 1: Grid layout matching PDF #2 (جدول المعلمين فـ1 1448هـ)
  const gridRows = [];
  employees.forEach(emp => {
    DAYS_ORDER.forEach(day => {
      const p1 = commitments.find(c => c.employeeId === emp.id && c.day === day && c.periodId === 'P1');
      const p2 = commitments.find(c => c.employeeId === emp.id && c.day === day && c.periodId === 'P2');
      const p3 = commitments.find(c => c.employeeId === emp.id && c.day === day && c.periodId === 'P3');

      gridRows.push({
        'رقم الموظف': emp.id,
        'اسم المعلم / الموظف': emp.name,
        'اليوم': day,
        'الفترة الأولى - النشاط': p1?.activityTitle || '',
        'الفترة الأولى - الفئة / النطاق': (p1?.scopeNames || []).join(' ، ') || p1?.rawClassText || '',
        'الفترة الأولى - الموقع / القاعة': p1?.venueName === 'غير محدد في جدول القاعات' ? '' : (p1?.venueName || ''),
        'الفترة الثانية - النشاط': p2?.activityTitle || '',
        'الفترة الثانية - الفئة / النطاق': (p2?.scopeNames || []).join(' ، ') || p2?.rawClassText || '',
        'الفترة الثانية - الموقع / القاعة': p2?.venueName === 'غير محدد في جدول القاعات' ? '' : (p2?.venueName || ''),
        'الفترة الثالثة - النشاط': p3?.activityTitle || '',
        'الفترة الثالثة - الفئة / النطاق': (p3?.scopeNames || []).join(' ، ') || p3?.rawClassText || '',
        'الفترة الثالثة - الموقع / القاعة': p3?.venueName === 'غير محدد في جدول القاعات' ? '' : (p3?.venueName || '')
      });
    });
  });

  const wsGrid = XLSX.utils.json_to_sheet(gridRows);
  wsGrid['!cols'] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 10 },
    { wch: 22 },
    { wch: 32 },
    { wch: 20 },
    { wch: 22 },
    { wch: 32 },
    { wch: 20 },
    { wch: 22 },
    { wch: 32 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, wsGrid, 'جدول المعلمين (الشبكي)');

  // Sheet 2: Detailed slot-per-row layout
  const detailedRows = commitments.map((c, idx) => ({
    'م': idx + 1,
    'رقم الموظف': c.employeeId || '',
    'اسم المعلم / الموظف': c.employeeName || '',
    'اليوم': c.day || '',
    'رمز الفترة': c.periodId || '',
    'الفترة': c.periodName || (c.periodId === 'P1' ? 'الفترة الأولى' : c.periodId === 'P2' ? 'الفترة الثانية' : 'الفترة الثالثة'),
    'النشاط / المادة': c.activityTitle || '',
    'الفئة / النطاق': (c.scopeNames || []).join(' ، ') || c.rawClassText || '',
    'الموقع / القاعة': c.venueName === 'غير محدد في جدول القاعات' ? '' : (c.venueName || '')
  }));
  const wsDetailed = XLSX.utils.json_to_sheet(detailedRows);
  wsDetailed['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 26 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 24 },
    { wch: 38 },
    { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsDetailed, 'جدول الحصص التفصيلي');

  if (isTemplate) {
    const refRows = (state?.employees || []).map(e => ({
      'رقم الموظف': e.id,
      'اسم الموظف': e.name,
      'المسمى الوظيفي': e.jobTitle || ''
    }));
    const wsRef = XLSX.utils.json_to_sheet(refRows);
    wsRef['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'دليل الموظفين');
  }

  return wb;
}

export function downloadScheduleTemplateExcel(state) {
  const wb = buildScheduleWorkbook(state, true);
  XLSX.writeFile(wb, 'معاينة_وتعبئة_جدول_المعلمين_الأسبوعي.xlsx');
}

export function exportCurrentScheduleExcel(state) {
  const wb = buildScheduleWorkbook(state, false);
  XLSX.writeFile(wb, 'جدول_المعلمين_الأسبوعي_المعتمد.xlsx');
}

export async function parseScheduleExcelFile(file, state) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const employees = state?.employees || [];
  const scopes = state?.scopes || [];
  const venues = state?.venues || [];

  const findEmployee = (idRaw, nameRaw) => {
    const idTrim = String(idRaw || '').trim();
    if (idTrim) {
      const byId = employees.find(e => e.id === idTrim);
      if (byId) return byId;
    }
    const normName = normalizeArabic(nameRaw);
    if (!normName) return null;
    return (
      employees.find(e => normalizeArabic(e.name) === normName || normalizeArabic(e.fullName) === normName) ||
      employees.find(e => normalizeArabic(e.name).includes(normName) || normName.includes(normalizeArabic(e.name))) ||
      null
    );
  };

  const resolveScopes = (scopeText) => {
    if (!scopeText) return { scopeIds: [], scopeNames: [] };
    const parts = String(scopeText)
      .split(/[،,/|]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const scopeIds = [];
    const scopeNames = [];
    parts.forEach(part => {
      const normPart = normalizeArabic(part);
      const found = scopes.find(
        sc =>
          normalizeArabic(sc.name) === normPart ||
          normalizeArabic(sc.rawName) === normPart ||
          normalizeArabic(sc.name).includes(normPart) ||
          normPart.includes(normalizeArabic(sc.name))
      );
      if (found) {
        if (!scopeIds.includes(found.id)) scopeIds.push(found.id);
        if (!scopeNames.includes(found.name)) scopeNames.push(found.name);
      } else {
        scopeNames.push(part);
      }
    });
    return { scopeIds, scopeNames };
  };

  const resolveVenue = (venueText) => {
    const clean = String(venueText || '')
      .replace(/^الموقع\s*:\s*/i, '')
      .trim();
    if (!clean || clean === 'غير محدد في جدول القاعات' || clean === '-') {
      return {
        venueId: null,
        venueName: 'غير محدد في جدول القاعات',
        rawVenueText: null,
        hasVenueDiscrepancy: true
      };
    }
    const normV = normalizeArabic(clean);
    const found = venues.find(
      v =>
        normalizeArabic(v.name) === normV ||
        normalizeArabic(v.shortName) === normV ||
        normalizeArabic(v.name).includes(normV) ||
        normV.includes(normalizeArabic(v.name))
    );
    return {
      venueId: found ? found.id : null,
      venueName: found ? (found.shortName || found.name) : clean,
      rawVenueText: `الموقع: ${clean}`,
      hasVenueDiscrepancy: false
    };
  };

  const commitments = [];
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rows || rows.length === 0) {
    throw new Error('الملف المرفوع فارغ ولا يحتوي على بيانات جدول.');
  }

  const sampleRow = rows[0];
  const isGridFormat =
    'الفترة الأولى - النشاط' in sampleRow ||
    'الفترة الثانية - النشاط' in sampleRow ||
    'الفترة الثالثة - النشاط' in sampleRow;

  if (isGridFormat) {
    const periodDefs = [
      {
        id: 'P1',
        name: 'الفترة الأولى',
        actKey: 'الفترة الأولى - النشاط',
        scpKey: 'الفترة الأولى - الفئة / النطاق',
        venKey: 'الفترة الأولى - الموقع / القاعة'
      },
      {
        id: 'P2',
        name: 'الفترة الثانية',
        actKey: 'الفترة الثانية - النشاط',
        scpKey: 'الفترة الثانية - الفئة / النطاق',
        venKey: 'الفترة الثانية - الموقع / القاعة'
      },
      {
        id: 'P3',
        name: 'الفترة الثالثة',
        actKey: 'الفترة الثالثة - النشاط',
        scpKey: 'الفترة الثالثة - الفئة / النطاق',
        venKey: 'الفترة الثالثة - الموقع / القاعة'
      }
    ];

    rows.forEach((r, idx) => {
      const empNameRaw = String(r['اسم المعلم / الموظف'] || r['اسم الموظف'] || r['المعلم'] || '').trim();
      const empIdRaw = String(r['رقم الموظف'] || '').trim();
      const day = String(r['اليوم'] || '').trim();
      if (!day || (!empNameRaw && !empIdRaw)) return;

      const emp = findEmployee(empIdRaw, empNameRaw);
      const employeeId = emp ? emp.id : (empIdRaw || `EMP-IMP-${idx + 1}`);
      const employeeName = emp ? emp.name : empNameRaw;

      periodDefs.forEach(pDef => {
        const activityTitle = String(r[pDef.actKey] || '').trim();
        if (!activityTitle) return;
        const scopeText = String(r[pDef.scpKey] || '').trim();
        const venueText = String(r[pDef.venKey] || '').trim();

        const { scopeIds, scopeNames } = resolveScopes(scopeText);
        const venueInfo = resolveVenue(venueText);

        commitments.push({
          id: `WC-${employeeId}-${day}-${pDef.id}-${commitments.length + 1}`,
          employeeId,
          leadEmployeeId: employeeId,
          employeeName,
          day,
          periodId: pDef.id,
          periodName: pDef.name,
          activityTitle,
          title: activityTitle,
          rawClassText: scopeText,
          scopeIds,
          scopeNames,
          ...venueInfo,
          type: 'fixed_teaching',
          blocksScheduling: true
        });
      });
    });
  } else {
    // Detailed row-per-slot format
    rows.forEach((r, idx) => {
      const empNameRaw = String(r['اسم المعلم / الموظف'] || r['اسم الموظف'] || r['المعلم'] || '').trim();
      const empIdRaw = String(r['رقم الموظف'] || '').trim();
      const day = String(r['اليوم'] || '').trim();
      const activityTitle = String(r['النشاط / المادة'] || r['النشاط'] || r['المادة'] || '').trim();
      if (!day || !activityTitle) return;

      const emp = findEmployee(empIdRaw, empNameRaw);
      const employeeId = emp ? emp.id : (empIdRaw || `EMP-IMP-${idx + 1}`);
      const employeeName = emp ? emp.name : empNameRaw;

      let periodId = String(r['رمز الفترة'] || '').trim();
      const periodNameRaw = String(r['الفترة'] || r['اسم الفترة'] || '').trim();
      if (!periodId) {
        if (periodNameRaw.includes('الأولى') || periodNameRaw === '1') periodId = 'P1';
        else if (periodNameRaw.includes('الثانية') || periodNameRaw === '2') periodId = 'P2';
        else if (periodNameRaw.includes('الثالثة') || periodNameRaw === '3') periodId = 'P3';
        else periodId = 'P1';
      }
      const periodName =
        periodNameRaw ||
        (periodId === 'P1' ? 'الفترة الأولى' : periodId === 'P2' ? 'الفترة الثانية' : 'الفترة الثالثة');

      const scopeText = String(r['الفئة / النطاق'] || r['الفئة'] || r['النطاق'] || '').trim();
      const venueText = String(r['الموقع / القاعة'] || r['الموقع'] || r['القاعة'] || '').trim();
      const { scopeIds, scopeNames } = resolveScopes(scopeText);
      const venueInfo = resolveVenue(venueText);

      commitments.push({
        id: `WC-${employeeId}-${day}-${periodId}-${idx + 1}`,
        employeeId,
        leadEmployeeId: employeeId,
        employeeName,
        day,
        periodId,
        periodName,
        activityTitle,
        title: activityTitle,
        rawClassText: scopeText,
        scopeIds,
        scopeNames,
        ...venueInfo,
        type: 'fixed_teaching',
        blocksScheduling: true
      });
    });
  }

  if (commitments.length === 0) {
    throw new Error('لم يتم العثور على حصص أو التزامات صالحة داخل الملف المرفوع.');
  }

  const uniqueTeachers = new Set(commitments.map(c => c.employeeId)).size;
  return {
    commitments,
    summary: {
      fileName: file.name,
      sheetName: firstSheetName,
      format: isGridFormat ? 'شبكي (مطابق لجدول المعلمين)' : 'تفصيلي (صف لكل فترة)',
      totalSlots: commitments.length,
      teachersCount: uniqueTeachers
    }
  };
}

// ============================================================================
// 3. جدول الإشراف اليومي والتعليمات والمعايير (Supervision Import / Export / Preview)
// ============================================================================

export function buildSupervisionWorkbook(state, isTemplate = false) {
  const wb = XLSX.utils.book_new();
  const duties = state?.supervisionDuties || [];
  const instructions = state?.supervisionInstructions || [];
  const criteria = state?.supervisionCriteria || [];

  // Sheet 1: Exact columns of PDF #3 (جدول الإشراف اليومي المعتمد)
  const dutyRows = duties.map((d, idx) => ({
    'م': d.seq || idx + 1,
    'الدور': d.floor || '',
    'الإشراف العام': String(d.generalSup || '').replace(/صالح جديع العنزي/g, 'فيصل كساب العتيبي'),
    'مشرف النظام': d.systemSupervisorName || '',
    'المشرف': d.supervisorName || '',
    'استقبال الطلاب': d.receptionLocation || '',
    'صلاة العصر - مكان الصلاة': d.asrPrayer?.location || '',
    'صلاة العصر - الصف': d.asrPrayer?.row || '',
    'صلاة المغرب - قبل الصلاة بـ 5 دقائق': d.maghribPrayer?.prePrayerLocation || '',
    'صلاة المغرب - مكان الصلاة': d.maghribPrayer?.location || '',
    'صلاة المغرب - الصف': d.maghribPrayer?.row || '',
    'صلاة العشاء - قبل الصلاة بـ 5 دقائق': d.ishaPrayer?.prePrayerLocation || '',
    'صلاة العشاء - مكان الصلاة': d.ishaPrayer?.location || '',
    'صلاة العشاء - الصف': d.ishaPrayer?.row || '',
    'مكان الإشراف أثناء صرف الطلاب': d.dismissalLocation || '',
    'أرقام الحافلات': d.busNumbers || '',
    'ملاحظات': d.notes || ''
  }));

  const wsDuties = XLSX.utils.json_to_sheet(dutyRows);
  wsDuties['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 22 },
    { wch: 20 },
    { wch: 28 },
    { wch: 34 },
    { wch: 30 },
    { wch: 10 },
    { wch: 32 },
    { wch: 30 },
    { wch: 10 },
    { wch: 32 },
    { wch: 30 },
    { wch: 10 },
    { wch: 32 },
    { wch: 16 },
    { wch: 36 }
  ];
  XLSX.utils.book_append_sheet(wb, wsDuties, 'جدول الإشراف اليومي');

  // Sheet 2: Instructions (التعليمات والتنبيهات)
  const instRows = instructions.map((inst, idx) => ({
    'م': inst.order || idx + 1,
    'الفئة': inst.category || 'عام',
    'نص التعليمات والتنبيهات': inst.text || ''
  }));
  const wsInst = XLSX.utils.json_to_sheet(instRows);
  wsInst['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'التعليمات والتنبيهات');

  // Sheet 3: Evaluation Criteria (آلية ومعايير الإشراف اليومي)
  const critRows = criteria.map((c, idx) => ({
    'م': idx + 1,
    'المعرف': c.id || `SUP-CRIT-${idx + 1}`,
    'المعيار': c.title || '',
    'الوزن النسبي (%)': c.weight || 0,
    'وصف المعيار': c.description || '',
    'طريقة التحقق': c.verificationMethod || ''
  }));
  const wsCrit = XLSX.utils.json_to_sheet(critRows);
  wsCrit['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 65 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsCrit, 'آلية ومعايير الإشراف');

  return wb;
}

export function downloadSupervisionTemplateExcel(state) {
  const wb = buildSupervisionWorkbook(state, true);
  XLSX.writeFile(wb, 'معاينة_وتعبئة_جدول_الإشراف_اليومي.xlsx');
}

export function exportCurrentSupervisionExcel(state) {
  const wb = buildSupervisionWorkbook(state, false);
  XLSX.writeFile(wb, 'جدول_الإشراف_اليومي_المعتمد.xlsx');
}

export async function parseSupervisionExcelFile(file, state) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const employees = state?.employees || [];

  const findEmpId = (nameRaw) => {
    if (!nameRaw) return null;
    const replaced = String(nameRaw).replace(/صالح جديع العنزي/g, 'فيصل كساب العتيبي').trim();
    const norm = normalizeArabic(replaced);
    const emp =
      employees.find(e => normalizeArabic(e.name) === norm || normalizeArabic(e.fullName) === norm) ||
      employees.find(e => normalizeArabic(e.name).includes(norm) || norm.includes(normalizeArabic(e.name)));
    return emp ? emp.id : null;
  };

  // Sheet 1: Duties
  const dutiesSheetName = wb.SheetNames.find(n => n.includes('الإشراف') || n.includes('جدول')) || wb.SheetNames[0];
  const rawDuties = XLSX.utils.sheet_to_json(wb.Sheets[dutiesSheetName], { defval: '' });

  const supervisionDuties = rawDuties
    .map((r, idx) => {
      const supNameRaw = String(r['المشرف'] || r['اسم المشرف'] || '').trim();
      const floor = String(r['الدور'] || '').trim();
      if (!supNameRaw && !floor) return null;

      const supervisorName = supNameRaw.replace(/صالح جديع العنزي/g, 'فيصل كساب العتيبي');
      const generalSupRaw = String(r['الإشراف العام'] || '').trim();
      const generalSup = generalSupRaw.replace(/صالح جديع العنزي/g, 'فيصل كساب العتيبي').replace(/صالح جديع/g, 'فيصل كساب العتيبي');
      const systemSupervisorName = String(r['مشرف النظام'] || '').trim();
      const seq = String(r['م'] || idx + 1).trim();

      const dismissalLocation = String(r['مكان الإشراف أثناء صرف الطلاب'] || r['صرف الطلاب'] || '').trim();
      let busNumbers = String(r['أرقام الحافلات'] || '').trim();
      if (!busNumbers && dismissalLocation.includes('حافلة')) {
        const m = dismissalLocation.match(/:\s*(.+)$/);
        if (m) busNumbers = m[1].trim();
      }

      const asrLoc = String(r['صلاة العصر - مكان الصلاة'] || r['صلاة العصر'] || '').trim();
      const asrRow = String(r['صلاة العصر - الصف'] || '').trim();
      const magPre = String(r['صلاة المغرب - قبل الصلاة بـ 5 دقائق'] || '').trim();
      const magLoc = String(r['صلاة المغرب - مكان الصلاة'] || r['صلاة المغرب'] || '').trim();
      const magRow = String(r['صلاة المغرب - الصف'] || '').trim();
      const ishaPre = String(r['صلاة العشاء - قبل الصلاة بـ 5 دقائق'] || '').trim();
      const ishaLoc = String(r['صلاة العشاء - مكان الصلاة'] || r['صلاة العشاء'] || '').trim();
      const ishaRow = String(r['صلاة العشاء - الصف'] || '').trim();

      const receptionLocation = String(r['استقبال الطلاب'] || '').trim();
      return {
        id: `SUP-${seq}`,
        seq,
        floor: floor || 'الدور الأرضي',
        generalSup,
        generalSupervisorId: findEmpId(generalSup) || (generalSup.includes('فيصل كساب') ? 'EMP-38' : null),
        systemSupervisorName,
        systemSup: systemSupervisorName,
        systemSupervisorId: findEmpId(systemSupervisorName),
        supervisorName,
        supervisor: supervisorName,
        employeeId: findEmpId(supervisorName),
        receptionLocation,
        reception: receptionLocation,
        asrHall: asrLoc,
        asrRow,
        maghribPre: magPre || asrLoc,
        maghribHall: magLoc || asrLoc,
        maghribRow: magRow || asrRow,
        ishaPre: ishaPre || magPre || asrLoc,
        ishaHall: ishaLoc || magLoc || asrLoc,
        ishaRow: ishaRow || magRow || asrRow,
        asrPrayer: {
          location: asrLoc,
          row: asrRow
        },
        maghribPrayer: {
          prePrayerLocation: magPre || asrLoc,
          location: magLoc || asrLoc,
          row: magRow || asrRow
        },
        ishaPrayer: {
          prePrayerLocation: ishaPre || magPre || asrLoc,
          location: ishaLoc || magLoc || asrLoc,
          row: ishaRow || magRow || asrRow
        },
        dismissalLocation,
        dismissal: dismissalLocation,
        busNumbers: busNumbers || null,
        buses: busNumbers || null,
        notes: String(r['ملاحظات'] || 'التواجد في الموقع قبل الأذان بـ5 دقائق وعند دخول الطلاب للمصلى').trim(),
        activeDays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']
      };
    })
    .filter(Boolean);

  if (supervisionDuties.length === 0) {
    throw new Error('لم يتم العثور على صفوف إشراف صالحة داخل الملف المرفوع.');
  }

  // Optional Sheet 2: Instructions
  let supervisionInstructions = state?.supervisionInstructions || [];
  const instSheetName = wb.SheetNames.find(n => n.includes('تعليمات') || n.includes('تنبيهات'));
  if (instSheetName) {
    const rawInst = XLSX.utils.sheet_to_json(wb.Sheets[instSheetName], { defval: '' });
    const parsedInst = rawInst
      .map((r, idx) => {
        const text = String(r['نص التعليمات والتنبيهات'] || r['النص'] || r['التعليمات'] || '').trim();
        if (!text) return null;
        return {
          id: `SUP-INST-${idx + 1}`,
          order: Number(r['م']) || idx + 1,
          text,
          category: String(r['الفئة'] || 'عام').trim()
        };
      })
      .filter(Boolean);
    if (parsedInst.length > 0) supervisionInstructions = parsedInst;
  }

  // Optional Sheet 3: Criteria
  let supervisionCriteria = state?.supervisionCriteria || [];
  const critSheetName = wb.SheetNames.find(n => n.includes('معايير') || n.includes('آلية'));
  if (critSheetName) {
    const rawCrit = XLSX.utils.sheet_to_json(wb.Sheets[critSheetName], { defval: '' });
    const parsedCrit = rawCrit
      .map((r, idx) => {
        const title = String(r['المعيار'] || '').trim();
        if (!title) return null;
        return {
          id: String(r['المعرف'] || `SUP-CRIT-${idx + 1}`).trim(),
          title,
          weight: Number(r['الوزن النسبي (%)'] || r['الوزن'] || 0),
          description: String(r['وصف المعيار'] || r['الوصف'] || '').trim(),
          verificationMethod: String(r['طريقة التحقق'] || '').trim()
        };
      })
      .filter(Boolean);
    if (parsedCrit.length > 0) supervisionCriteria = parsedCrit;
  }

  return {
    supervisionDuties,
    supervisionInstructions,
    supervisionCriteria,
    summary: {
      fileName: file.name,
      dutiesCount: supervisionDuties.length,
      instructionsCount: supervisionInstructions.length,
      criteriaCount: supervisionCriteria.length
    }
  };
}
