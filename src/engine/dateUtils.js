// Date, Week, Month, Multi-Period Range, Live Clock & Server Window Helpers (v2.0)

export const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WORK_DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

export const MONTH_NAMES_AR = {
  1: 'يناير (الشهر 1)',
  2: 'فبراير (الشهر 2)',
  3: 'مارس (الشهر 3)',
  4: 'أبريل (الشهر 4)',
  5: 'مايو (الشهر 5)',
  6: 'يونيو (الشهر 6)',
  7: 'يوليو (الشهر 7)',
  8: 'أغسطس (الشهر 8)',
  9: 'سبتمبر (الشهر 9)',
  10: 'أكتوبر (الشهر 10)',
  11: 'نوفمبر (الشهر 11)',
  12: 'ديسمبر (الشهر 12)',
};

export const WEEK_ORDINALS_AR = {
  1: 'الأسبوع الأول',
  2: 'الأسبوع الثاني',
  3: 'الأسبوع الثالث',
  4: 'الأسبوع الرابع',
  5: 'الأسبوع الخامس',
};

// Exact 52-week-to-month mapping matching الانشطة للاقسام مع المؤشرات.xlsx
export const MONTH_WEEKS_MAP = {
  1: [1, 2, 3, 4, 5],
  2: [6, 7, 8, 9],
  3: [10, 11, 12, 13],
  4: [14, 15, 16, 17, 18],
  5: [19, 20, 21, 22],
  6: [23, 24, 25, 26],
  7: [27, 28, 29, 30, 31],
  8: [32, 33, 34, 35],
  9: [36, 37, 38, 39],
  10: [40, 41, 42, 43, 44],
  11: [45, 46, 47, 48],
  12: [49, 50, 51, 52],
};

export function globalWeekToMonthInfo(globalWeek) {
  const gw = Number(globalWeek);
  for (let m = 1; m <= 12; m++) {
    const arr = MONTH_WEEKS_MAP[m];
    const idx = arr.indexOf(gw);
    if (idx !== -1) {
      return {
        month: m,
        monthName: MONTH_NAMES_AR[m],
        weekInMonth: idx + 1,
        weekLabel: WEEK_ORDINALS_AR[idx + 1],
        globalWeek: gw,
      };
    }
  }
  return {
    month: 11,
    monthName: MONTH_NAMES_AR[11],
    weekInMonth: 1,
    weekLabel: WEEK_ORDINALS_AR[1],
    globalWeek: 45,
  };
}

export function dateToArabicDay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return '';
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return DAYS_AR[d.getDay()] || '';
}

export function dateToPlanWeekInfo(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [, month, day] = parts;
  const weeksInM = MONTH_WEEKS_MAP[month] || [45, 46, 47, 48];
  const rawWeekIdx = Math.min(weeksInM.length - 1, Math.floor((day - 1) / 7));
  const globalWeek = weeksInM[rawWeekIdx];
  return {
    month,
    monthName: MONTH_NAMES_AR[month],
    weekInMonth: rawWeekIdx + 1,
    weekLabel: WEEK_ORDINALS_AR[rawWeekIdx + 1],
    globalWeek,
    dayName: dateToArabicDay(dateStr),
  };
}

// Get Sunday..Thursday ISO dates for any globalWeek in 2026
export function getDatesForGlobalWeek(globalWeek, year = 2026) {
  const anchor = new Date(year, 10, 1); // Nov 1, 2026 (Sunday)
  const diffDays = (Number(globalWeek) - 45) * 7;
  const sun = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffDays);
  const map = {};
  WORK_DAYS_AR.forEach((dayAr, idx) => {
    const dt = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + idx);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    map[dayAr] = `${yyyy}-${mm}-${dd}`;
  });
  return map;
}

export function timeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function timesOverlap(startA, endA, startB, endB) {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  if (sA == null || eA == null || sB == null || eB == null) return false;
  return sA < eB && sB < eA;
}

export function formatTime12Ar(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '';
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  const suffix = hRaw >= 12 ? 'م' : 'ص';
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h12}:${String(mRaw).padStart(2, '0')} ${suffix}`;
}

export function formatDateTimeAr(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function getTodayISO() {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date());
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

/**
 * Multi-Period Range Calculator (Req #20 & #21)
 * Supports selecting من الفترة -> إلى الفترة (e.g. P1 to P3 -> ✓ الأولى ✓ الثانية ✓ الثالثة)
 */
export function computeCoveredPeriods(periods = [], fromPeriodId, toPeriodId) {
  const progPeriods = (periods || [])
    .filter((p) => p.category === 'program_period')
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const startId = fromPeriodId || 'P1';
  const endId = toPeriodId || startId;

  const idxA = progPeriods.findIndex((p) => p.id === startId);
  const idxB = progPeriods.findIndex((p) => p.id === endId);

  if (idxA !== -1 && idxB !== -1) {
    const lo = Math.min(idxA, idxB);
    const hi = Math.max(idxA, idxB);
    const slice = progPeriods.slice(lo, hi + 1);
    const coveredPeriodIds = slice.map((p) => p.id);
    const coveredPeriodNames = slice.map((p) => p.name);
    const shortNames = slice.map((p) => p.name.replace('الفترة ', ''));
    return {
      fromPeriodId: slice[0].id,
      toPeriodId: slice[slice.length - 1].id,
      coveredPeriodIds,
      coveredPeriodNames,
      combinedLabel:
        slice.length === 1
          ? slice[0].name
          : `من ${slice[0].name} إلى ${slice[slice.length - 1].name}`,
      checksText: shortNames.map((n) => `✓ ${n}`).join('   '),
      startTime: slice[0].approvedStart || slice[0].startTime || '15:50',
      endTime: slice[slice.length - 1].approvedEnd || slice[slice.length - 1].endTime || '16:40',
    };
  }

  // Fallback for fixed_event or single custom period
  const single = (periods || []).find((p) => p.id === startId);
  return {
    fromPeriodId: startId,
    toPeriodId: startId,
    coveredPeriodIds: [startId],
    coveredPeriodNames: [single?.name || startId],
    combinedLabel: single?.name || startId,
    checksText: `✓ ${(single?.name || startId).replace('الفترة ', '')}`,
    startTime: single?.approvedStart || single?.startTime || '15:50',
    endTime: single?.approvedEnd || single?.endTime || '16:40',
  };
}

/**
 * Live Operational Period Resolver for "الآن" and "التالي" blocks (Req #5, #10, #11)
 */
export function getCurrentAndNextOperationalPeriod(periods = [], nowDate = new Date()) {
  const visible = (periods || [])
    .filter((p) => p.showInSchedule !== false && p.visibleInSchedule !== false)
    .sort(
      (a, b) =>
        (timeToMinutes(a.approvedStart || a.startTime) || 0) -
        (timeToMinutes(b.approvedStart || b.startTime) || 0)
    );

  const progPeriods = visible.filter((p) => p.category === 'program_period');
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  let current = null;
  let next = null;

  for (let i = 0; i < visible.length; i++) {
    const p = visible[i];
    const s = timeToMinutes(p.approvedStart || p.startTime);
    const e = timeToMinutes(p.approvedEnd || p.endTime);
    if (s != null && e != null && nowMin >= s && nowMin < e) {
      current = p;
      next = visible[i + 1] || null;
      break;
    }
    if (s != null && nowMin < s && !next) {
      next = p;
    }
  }

  const firstStart = visible[0] ? timeToMinutes(visible[0].approvedStart || visible[0].startTime) : 915;
  const lastEnd = visible[visible.length - 1]
    ? timeToMinutes(visible[visible.length - 1].approvedEnd || visible[visible.length - 1].endTime)
    : 1185;

  let liveState = 'active';
  if (!current && nowMin < firstStart) liveState = 'before_hours';
  else if (!current && nowMin >= lastEnd) liveState = 'after_hours';
  else if (!current) liveState = 'between_periods';

  const fallbackNowPeriod = current || progPeriods[0] || visible[0] || null;
  const fallbackNextPeriod =
    next ||
    (fallbackNowPeriod
      ? progPeriods[progPeriods.findIndex((x) => x.id === fallbackNowPeriod.id) + 1] || progPeriods[1] || null
      : null);

  return {
    liveState,
    currentPeriod: current,
    nextPeriod: next,
    effectiveNowPeriod: fallbackNowPeriod,
    effectiveNextPeriod: fallbackNextPeriod,
  };
}

export const CLOSED_SUBMISSION_WINDOW_MESSAGE =
  'انتهت الفترة المسموح بها لرفع البرامج الجديدة لهذا الشهر. يمكن رفع البرامج الجديدة خلال الفترة من 1 إلى 15 من كل شهر.';

/**
 * Checks Day 1..15 Monthly Submission Window in Asia/Riyadh (Req #31-#35)
 */
export function checkNewProgramSubmissionWindow(dateInput = new Date()) {
  const iso = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)
    ? dateInput.slice(0, 10)
    : (() => {
        try {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Riyadh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(dateInput);
        } catch {
          return getTodayISO();
        }
      })();

  const dayOfMonth = Number(iso.split('-')[2] || 1);
  const isOpen = dayOfMonth >= 1 && dayOfMonth <= 15;
  return {
    serverDate: iso,
    dayOfMonth,
    isOpen,
    allowedRange: '1 - 15',
    message: isOpen
      ? `نافذة رفع البرامج الجديدة مفتوحة حاليًا (اليوم ${dayOfMonth} من الشهر — متاح من 1 إلى 15 من كل شهر).`
      : CLOSED_SUBMISSION_WINDOW_MESSAGE,
  };
}

// ---------------------------------------------------------------------------
// Real-calendar week helpers (v4.0). The plan's 52 global weeks are anchored so that
// global week 45 starts on Sunday 2026-11-01 (same anchor as getDatesForGlobalWeek).
// ---------------------------------------------------------------------------
const PLAN_ANCHOR_UTC = Date.UTC(2026, 10, 1);
const DAY_MS = 86400000;

function isoToUtc(iso) {
  const p = String(iso || '').slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return null;
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

export function addDaysISO(iso, days) {
  const t = isoToUtc(iso);
  if (t == null) return iso;
  const d = new Date(t + Number(days) * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function daysBetweenISO(fromIso, toIso) {
  const a = isoToUtc(fromIso);
  const b = isoToUtc(toIso);
  if (a == null || b == null) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** Global plan week (1..52) that contains the given ISO date (Sun–Sat blocks; Fri/Sat belong to the week that just ended). */
export function dateToGlobalWeek(iso) {
  const t = isoToUtc(iso);
  if (t == null) return null;
  const w = 45 + Math.floor((t - PLAN_ANCHOR_UTC) / (7 * DAY_MS));
  return Math.max(1, Math.min(52, w));
}

/** Current plan week according to the real calendar (Asia/Riyadh), never a frozen seed value. */
export function getCurrentGlobalWeek(todayIso = getTodayISO()) {
  return dateToGlobalWeek(todayIso) || 45;
}

/** Sunday ISO date of a global week. */
export function getWeekStartISO(globalWeek) {
  return addDaysISO('2026-11-01', (Number(globalWeek) - 45) * 7);
}

/** Last working day (Thursday) ISO date of a global week. */
export function getWeekWorkEndISO(globalWeek) {
  return addDaysISO(getWeekStartISO(globalWeek), 4);
}

// ---------------------------------------------------------------------------
// Multi-Day Date Range Helpers (من تاريخ -> إلى تاريخ للبرامج الرئيسية والفرعية)
// ---------------------------------------------------------------------------
export function expandDatesRange(fromIso, toIso, { workDaysOnly = true, maxDays = 60 } = {}) {
  const startIso = String(fromIso || '').slice(0, 10);
  if (!startIso) return [];
  const rawEndIso = String(toIso || startIso).slice(0, 10);
  const endIso = rawEndIso >= startIso ? rawEndIso : startIso;

  const totalDiff = Math.min(maxDays, Math.max(0, daysBetweenISO(startIso, endIso)));
  const all = [];
  for (let i = 0; i <= totalDiff; i++) {
    const dt = addDaysISO(startIso, i);
    const dayAr = dateToArabicDay(dt);
    all.push({ date: dt, day: dayAr });
  }

  if (!workDaysOnly || all.length <= 1) return all;
  const workOnly = all.filter((x) => WORK_DAYS_AR.includes(x.day));
  return workOnly.length > 0 ? workOnly : all;
}

export function dateRangesOverlap(fromA, toA, fromB, toB) {
  const sA = String(fromA || '').slice(0, 10);
  const eA = String(toA || sA).slice(0, 10) >= sA ? String(toA || sA).slice(0, 10) : sA;
  const sB = String(fromB || '').slice(0, 10);
  const eB = String(toB || sB).slice(0, 10) >= sB ? String(toB || sB).slice(0, 10) : sB;
  if (!sA || !sB) return false;
  return sA <= eB && sB <= eA;
}

export function isDateInExecutionRange(targetDateIso, targetDayAr, item) {
  if (!item) return false;
  const startIso = String(item.executionDate || '').slice(0, 10);
  const rawEndIso = String(item.executionEndDate || startIso).slice(0, 10);
  const endIso = rawEndIso >= startIso ? rawEndIso : startIso;

  if (targetDateIso && startIso) {
    if (targetDateIso < startIso || targetDateIso > endIso) return false;
    if (endIso > startIso && targetDayAr && !WORK_DAYS_AR.includes(targetDayAr)) return false;
    return true;
  }
  return Boolean(targetDayAr && item.day === targetDayAr);
}

export function formatDateRangeAr(fromIso, toIso, { compact = false, includeDay = true } = {}) {
  const s = String(fromIso || '').slice(0, 10);
  if (!s) return '—';
  const eRaw = String(toIso || s).slice(0, 10);
  const e = eRaw >= s ? eRaw : s;
  const sDay = dateToArabicDay(s);
  const eDay = dateToArabicDay(e);

  if (s === e) {
    return includeDay && sDay ? `${sDay} (${s})` : s;
  }
  if (compact) {
    return includeDay && sDay && eDay
      ? `${sDay} (${s.slice(5)}) ← ${eDay} (${e.slice(5)})`
      : `${s} ← ${e}`;
  }
  return includeDay && sDay && eDay
    ? `من ${sDay} (${s}) إلى ${eDay} (${e})`
    : `من ${s} إلى ${e}`;
}

