import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { MONTH_NAMES_AR, WEEK_ORDINALS_AR } from './dateUtils';

const SHEET_TO_DEPT = {
  'قسم البناء التربوي': { id: 'dept_tarbawi', name: 'قسم البناء التربوي' },
  'الدعم العلمي': { id: 'dept_elmi', name: 'قسم الدعم العلمي' },
  'المساندة والتحفيز': { id: 'dept_musanadah', name: 'قسم المساندة والتحفيز' },
  'تنمية المواهب': { id: 'dept_mawahib', name: 'قسم تنمية المواهب' },
};

function isSalaryOrAllowance(initiativeStr, programName) {
  const init = (initiativeStr || '').trim();
  const prog = (programName || '').trim();
  if (init.includes('الرواتب والمزايا')) return true;
  if (prog.includes('رواتب موظفي') || prog.includes('بدلات موظفي')) return true;
  return false;
}

function cellValToStr(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((rt) => rt.text).join('').trim();
    if (v.result !== undefined) return String(v.result ?? '').trim();
    if (v.text !== undefined) return String(v.text ?? '').trim();
  }
  return String(v).trim();
}

function isGreenCell(cell) {
  if (!cell || !cell.fill || cell.fill.type !== 'pattern') return false;
  const argb = (cell.fill.fgColor?.argb || '').toUpperCase();
  // Source Excel green is FFDFF0D8; also support common light-green fills just in case future updates use another shade of green
  if (argb === 'FFDFF0D8' || argb.endsWith('DFF0D8') || argb.endsWith('C6EFCE') || argb.endsWith('E2EFDA') || argb.endsWith('A9D08E')) {
    return true;
  }
  return false;
}

/**
 * Parse an uploaded Activities Excel (.xlsx) file in the browser (Req #56),
 * excluding all financial fields and salary/allowance initiatives,
 * reading Green week cells as Planned Execution Weeks, and comparing with current catalog!
 */
export async function parseAndCompareActivitiesExcel(file, currentPrograms, departments) {
  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const parsedPrograms = [];
  const excludedItems = [];
  let progSeq = 1;

  wb.eachSheet((ws) => {
    const sClean = ws.name.trim();
    let dept = SHEET_TO_DEPT[sClean];
    if (!dept) {
      const matched = (departments || []).find(
        (d) => d.name.includes(sClean) || sClean.includes(d.shortName || d.name)
      );
      dept = matched ? { id: matched.id, name: matched.name } : { id: `dept_${sClean}`, name: sClean };
    }

    let currentGoal = '';
    let currentIndicator = '';
    let currentInitiative = '';
    const maxR = ws.rowCount;
    let r = 1;

    while (r <= maxR) {
      const v1Raw = ws.getRow(r).getCell(1).value;
      const v1Str = cellValToStr(v1Raw);

      if (v1Str.startsWith('الهدف الاستراتيجي')) {
        currentGoal = v1Str.includes(':') ? v1Str.split(':').slice(1).join(':').trim() : v1Str;
        r++;
        continue;
      }
      if (v1Str.startsWith('المؤشر الاستراتيجي')) {
        currentIndicator = v1Str.includes(':') ? v1Str.split(':').slice(1).join(':').trim() : v1Str;
        r++;
        continue;
      }
      if (v1Str.startsWith('المبادرة')) {
        currentInitiative = v1Str.includes(':') ? v1Str.split(':').slice(1).join(':').trim() : v1Str;
        r++;
        continue;
      }
      if (v1Str === 'م') {
        r++;
        continue;
      }

      const numIdx = Number(v1Str);
      const progName = cellValToStr(ws.getRow(r).getCell(46).value);
      if (!Number.isNaN(numIdx) && numIdx > 0 && progName) {
        const roles = [];
        const r1Role = cellValToStr(ws.getRow(r).getCell(50).value);
        if (r1Role) roles.push(r1Role);

        let nextR = r + 1;
        while (nextR <= maxR && cellValToStr(ws.getRow(nextR).getCell(1).value) !== 'الشهر') {
          const vn = cellValToStr(ws.getRow(nextR).getCell(1).value);
          if ((!Number.isNaN(Number(vn)) && Number(vn) > 0) || vn.startsWith('الهدف') || vn.startsWith('المؤشر') || vn.startsWith('المبادرة')) {
            break;
          }
          const exRole = cellValToStr(ws.getRow(nextR).getCell(50).value);
          if (exRole && !roles.includes(exRole)) roles.push(exRole);
          nextR++;
        }

        let monthRow = null;
        let weekRow = null;
        if (nextR <= maxR && cellValToStr(ws.getRow(nextR).getCell(1).value) === 'الشهر') {
          monthRow = nextR;
          if (nextR + 1 <= maxR && cellValToStr(ws.getRow(nextR + 1).getCell(1).value) === 'الاسبوع') {
            weekRow = nextR + 1;
          }
        }

        if (isSalaryOrAllowance(currentInitiative, progName)) {
          excludedItems.push({
            department: dept.name,
            initiative: currentInitiative,
            program: progName,
          });
          r = weekRow ? weekRow + 2 : nextR + 1;
          continue;
        }

        const plannedWeeks = [];
        if (monthRow && weekRow) {
          let curM = null;
          const mWeekCounter = {};
          for (let c = 2; c <= 53; c++) {
            const mv = Number(cellValToStr(ws.getRow(monthRow).getCell(c).value));
            if (!Number.isNaN(mv) && mv >= 1 && mv <= 12) {
              curM = mv;
            }
            if (curM) {
              mWeekCounter[curM] = (mWeekCounter[curM] || 0) + 1;
              const wInM = mWeekCounter[curM];
              const wCell = ws.getRow(weekRow).getCell(c);
              const gWeek = Number(cellValToStr(wCell.value)) || c - 1;
              if (isGreenCell(wCell)) {
                plannedWeeks.push({
                  month: curM,
                  monthName: MONTH_NAMES_AR[curM] || `الشهر ${curM}`,
                  weekInMonth: wInM,
                  weekInMonthLabel: WEEK_ORDINALS_AR[wInM] || `الأسبوع ${wInM}`,
                  globalWeek: gWeek,
                });
              }
            }
          }
        }

        parsedPrograms.push({
          tempId: `IMP-PRG-${progSeq++}`,
          name: progName,
          departmentId: dept.id,
          departmentName: dept.name,
          strategicGoal: currentGoal,
          strategicIndicator: currentIndicator,
          initiative: currentInitiative,
          jobRoles: roles,
          plannedWeeksCount: plannedWeeks.length,
          plannedWeeks,
          sourceFile: file.name,
          sourceSheet: sClean,
        });

        r = weekRow ? weekRow + 2 : nextR + 1;
        continue;
      }
      r++;
    }
  });

  // Compare parsedPrograms vs currentPrograms by composite key (departmentId + initiative + name)
  const makeKey = (p) => `${p.departmentId}||${(p.initiative || '').trim()}||${(p.name || '').trim()}`;
  const currentByKey = new Map();
  (currentPrograms || []).forEach((cp) => {
    currentByKey.set(makeKey(cp), cp);
  });

  const seenKeys = new Set();
  const newPrograms = [];
  const changedPrograms = [];
  const unchangedCountHolder = { count: 0 };

  parsedPrograms.forEach((pp) => {
    const key = makeKey(pp);
    seenKeys.add(key);
    const existing = currentByKey.get(key);
    if (!existing) {
      newPrograms.push(pp);
    } else {
      const oldWeeksSig = (existing.plannedWeeks || [])
        .map((w) => `${w.month}-${w.weekInMonth}-${w.globalWeek}`)
        .sort()
        .join(',');
      const newWeeksSig = (pp.plannedWeeks || [])
        .map((w) => `${w.month}-${w.weekInMonth}-${w.globalWeek}`)
        .sort()
        .join(',');
      const oldRoles = (existing.jobRoles || []).join('|');
      const newRoles = (pp.jobRoles || []).join('|');
      if (oldWeeksSig !== newWeeksSig || oldRoles !== newRoles || existing.strategicIndicator !== pp.strategicIndicator) {
        changedPrograms.push({
          existing,
          incoming: pp,
          oldWeeksSig,
          newWeeksSig,
        });
      } else {
        unchangedCountHolder.count += 1;
      }
    }
  });

  const disappearedPrograms = [];
  (currentPrograms || []).forEach((cp) => {
    if (!seenKeys.has(makeKey(cp))) {
      disappearedPrograms.push(cp);
    }
  });

  return {
    fileName: file.name,
    parsedCount: parsedPrograms.length,
    parsedPrograms,
    newPrograms,
    changedPrograms,
    disappearedPrograms,
    unchangedCount: unchangedCountHolder.count,
    excludedItems,
  };
}

/**
 * Export non-financial operational records to Excel (.xlsx) — Strictly excludes any financial fields (Req #6)
 */
export function exportOperationalExcel(rows, sheetTitle = 'التقرير التشغيلي', fileName = 'تقرير_منصة_منافذ_التشغيلية.xlsx') {
  const sanitized = rows.map((row) => {
    const clean = { ...row };
    // Strictly guard against any financial keys ever leaking into exports
    delete clean.amount;
    delete clean.budget;
    delete clean.spent;
    delete clean.remaining;
    delete clean['المبلغ'];
    delete clean['الموازنة'];
    delete clean['المصروف'];
    delete clean['المتبقي'];
    return clean;
  });
  const ws = XLSX.utils.json_to_sheet(sanitized);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

