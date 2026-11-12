// ============================================================================
// Manafeth Unified Operational Analytics, Program Readiness, Early Warning,
// Crowding Forecast & "What Changed Since Last Login" Engine (v4.0)
// ============================================================================
import {
  WORK_DAYS_AR,
  MONTH_NAMES_AR,
  MONTH_WEEKS_MAP,
  getTodayISO,
  getDatesForGlobalWeek,
  dateToArabicDay,
  isDateInExecutionRange,
} from './dateUtils';
import { detectProgramConflicts, getEmployeeSupervisionBlocks } from './conflictEngine';
import { hasPermission, canAccessDepartment } from './permissions';

// ----------------------------------------------------------------------------
// 1. EXPLICIT METRIC DEFINITIONS (Req #22 — تعريف المؤشرات قبل حسابها)
// ----------------------------------------------------------------------------
export const METRIC_DEFINITIONS_AR = {
  planned: {
    title: 'البرامج المخططة',
    definition: 'إجمالي المواعيد البرمجية المسجلة في الخطة المعتمدة خلال الفترة المحددة (الخلايا الخضراء في الخطة المعتمدة + البرامج المضافة).',
    formula: 'مجموع المواعيد المخططة غير المحذوفة ضمن نطاق الفترة.',
  },
  scheduled: {
    title: 'البرامج المجدولة',
    definition: 'البرامج التي تم استكمال جدولتها التنفيذية بتحديد التاريخ والفترة والمسؤول والقاعة.',
    formula: 'البرامج المرتبطة بسجل تنفيذي في الجدول التشغيلي.',
  },
  executed: {
    title: 'البرامج المنفذة',
    definition: 'البرامج التي تم توثيق تنفيذها فعليًا بحالة «منفذ» أو «مكتمل»، وليس مجرد انتهاء وقتها الزمني.',
    formula: 'عدد السجلات التنفيذية ذات الحالة (منفذ / مكتمل).',
  },
  overdue: {
    title: 'البرامج غير المنفذة والمستحقة (المتأخرة)',
    definition: 'البرامج المستحقة (أسبوعها المخطط <= الأسبوع الحالي أو تاريخ تنفيذها قد مضى) التي لم تسجل حالة تنفيذ فعلي ولا تأجيل معتمد ولا إلغاء معتمد.',
    formula: 'البرامج المستحقة - (المنفذة + المؤجلة باعتماد + الملغاة باعتماد).',
  },
  postponedOrCancelled: {
    title: 'البرامج المؤجلة والملغاة',
    definition: 'البرامج التي صدر بشأنها قرار تأجيل معتمد (مؤجل) أو إلغاء معتمد (ملغي) مع حفظ السبب في السجل.',
    formula: 'مجموع البرامج بحالة (مؤجل) + البرامج بحالة (ملغي).',
  },
  compliance: {
    title: 'نسبة الالتزام بالخطة',
    definition: 'تقيس مدى التزام القسم بالخطة المعتمدة استكمالًا وتنفيذًا، مع استبعاد البرامج الملغاة رسميًا من المقام وتوضيح المؤجلة باعتماد.',
    formula: 'في مرحلة التنفيذ: (المنفذ في موعده ÷ المستحق الفعال) × 100، مع إظهار نسبة استكمال الجدولة (المجدول ÷ المخطط).',
  },
  openConflicts: {
    title: 'التعارضات المفتوحة غير المعالجة',
    definition: 'التعارضات الفعلية القائمة في البرامج المجدولة التي لم تُعالج بعد، مع استبعاد أي عنصر مضبوط سلوكه على «لا يدخل في التعارضات».',
    formula: 'مجموع التعارضات الفعلية والهامة غير المحسومة في السجلات التنفيذية.',
  },
  pendingExceptions: {
    title: 'طلبات الاستثناء المعلقة',
    definition: 'طلبات الاستثناء التي لا تزال بانتظار إبداء الرأي أو بانتظار الاعتماد النهائي أو بانتظار معالجة البرامج المتأثرة.',
    formula: 'الطلبات بحالة (بانتظار إبداء الرأي / بانتظار الاعتماد / معتمد باستثناء مع عناصر متأثرة غير محسومة).',
  },
  pendingApprovals: {
    title: 'طلبات الاعتماد المنتظرة',
    definition: 'العمليات والطلبات التي تنتظر قرار صاحب الاعتماد (اعتماد استثناء، اعتماد برنامج، أو حسم اختلاف بيانات).',
    formula: 'مجموع طلبات الاستثناء بانتظار الاعتماد + البرامج بانتظار الاعتماد.',
  },
  overdueTasks: {
    title: 'المهام المتأخرة',
    definition: 'المهام الوظيفية والتكليفات المفتوحة التي تجاوز تاريخ استحقاقها المحدد دون إتمام.',
    formula: 'المهام غير المنجزة التي يكون تاريخ استحقاقها أقدم من تاريخ اليوم.',
  },
  unevaluatedExecuted: {
    title: 'البرامج المنفذة التي لم تُقيّم',
    definition: 'البرامج التي تم توثيق تنفيذها (منفذ) ولكن لم يُسجل لها أي تقييم في نظام التقييم الشامل حتى الآن.',
    formula: 'البرامج المنفذة ناقص البرامج التي تملك تقييمًا واحدًا على الأقل.',
  },
  evalCompletion: {
    title: 'نسبة استكمال التقييمات',
    definition: 'نسبة التقييمات المنجزة للبرامج المنفذة من إجمالي البرامج المنفذة المستحقة للتقييم.',
    formula: '(عدد البرامج المنفذة المقيّمة ÷ إجمالي البرامج المنفذة) × 100.',
  },
};

// ----------------------------------------------------------------------------
// 2. PROGRAM OPERATIONAL READINESS ENGINE (Req #13 — مؤشر «جاهزية البرنامج»)
// ----------------------------------------------------------------------------
export function computeProgramReadiness(item, state) {
  if (!item || !state) {
    return {
      status: 'يحتاج استكمال',
      statusCode: 'incomplete',
      passedCount: 0,
      totalCount: 6,
      percent: 0,
      checks: [],
      missingRequirements: ['بيانات البرنامج غير متوفرة'],
    };
  }

  // item can be a plannedOccurrence (with .linkedExecution) or a scheduledExecution directly
  const isOccurrence = Boolean(item.plannedGlobalWeek !== undefined && !item.executionDate && item.linkedExecution !== undefined);
  const exec = isOccurrence ? item.linkedExecution : item.executionDate || item.periodId || item.leadEmployeeId ? item : item.linkedExecution || null;

  const empMap = Object.fromEntries((state.employees || []).map((e) => [e.id, e.name]));
  const venueMap = Object.fromEntries((state.venues || []).map((v) => [v.id, v.name]));
  const scopeMap = Object.fromEntries((state.scopes || []).map((s) => [s.id, s.name]));

  // 1. وجود موعد معتمد
  const hasDateAndPeriod = Boolean(exec && exec.executionDate && (exec.periodId || exec.fromPeriodId || exec.startTime));

  // 2. وجود مسؤول
  const hasLeadEmployee = Boolean(exec && exec.leadEmployeeId && empMap[exec.leadEmployeeId]);

  // 3. تحديد الفئة المستهدفة
  const hasScope = Boolean(
    exec &&
      ((Array.isArray(exec.scopeIds) && exec.scopeIds.length > 0) ||
        (Array.isArray(exec.studentIds) && exec.studentIds.length > 0))
  );

  // 4. تحديد الموقع إذا كان مطلوبًا
  const venueNotRequired = exec?.programType === 'تكليف تشغيلي' || exec?.venueNotRequired === true;
  const hasVenue = Boolean(exec && (venueNotRequired || (exec.venueId && venueMap[exec.venueId])));

  // 5. معالجة التعارضات (مع احترام العناصر المضبوطة على لا يدخل في التعارضات)
  const ignoredRuleIds = new Set(
    (state.conflictRules || [])
      .filter((r) => r.conflictBehavior === 'ignore' || r.conflictBehavior === 'no_conflict' || r.isActive === false)
      .map((r) => r.id)
  );
  const rawConflicts = Array.isArray(exec?.conflictsSnapshot) ? exec.conflictsSnapshot : [];
  const activeBlockingConflicts = rawConflicts.filter(
    (c) =>
      !ignoredRuleIds.has(c.code) &&
      c.severity !== 'لا يدخل في التعارضات' &&
      c.severity !== 'تنبيه فقط' &&
      c.severity !== 'تنبيه'
  );
  const isExceptionApproved = exec?.status === 'معتمد باستثناء' || exec?.status === 'منفذ';
  const conflictsResolved = Boolean(
    exec &&
      exec.status !== 'يوجد تعارض' &&
      (activeBlockingConflicts.length === 0 || isExceptionApproved)
  );

  // 6. اكتمال الاعتمادات المطلوبة
  const linkedReq = exec?.exceptionRequestId
    ? (state.exceptionRequests || []).find((r) => r.id === exec.exceptionRequestId)
    : null;
  const pendingException =
    linkedReq &&
    (linkedReq.status === 'بانتظار إبداء الرأي' ||
      linkedReq.status === 'بانتظار الاعتماد' ||
      (linkedReq.status === 'معتمد باستثناء' && !linkedReq.allAffectedResolved));

  const approvalsCompleted = Boolean(
    exec &&
      ['معتمد', 'معتمد باستثناء', 'منفذ', 'مكتمل'].includes(exec.status) &&
      !pendingException
  );

  const checks = [
    {
      key: 'date_period',
      label: 'وجود موعد وفترة معتمدة',
      passed: hasDateAndPeriod,
      detail: hasDateAndPeriod
        ? `${exec.day || dateToArabicDay(exec.executionDate)} (${exec.executionDate}) — ${exec.periodName || exec.periodId}`
        : 'لم يتم تحديد تاريخ وفترة التنفيذ بعد',
    },
    {
      key: 'lead_employee',
      label: 'وجود موظف مسؤول',
      passed: hasLeadEmployee,
      detail: hasLeadEmployee ? empMap[exec.leadEmployeeId] : 'لم يُحدد الموظف المسؤول عن البرنامج',
    },
    {
      key: 'target_scope',
      label: 'تحديد الفئة المستهدفة',
      passed: hasScope,
      detail: hasScope
        ? (exec.scopeIds || [])
            .map((id) => scopeMap[id] || id)
            .slice(0, 3)
            .join('، ') || `${(exec.studentIds || []).length} طالب`
        : 'لم يتم تحديد الفئات أو الطلاب المستهدفين',
    },
    {
      key: 'venue',
      label: 'تحديد القاعة / الموقع',
      passed: hasVenue,
      detail: hasVenue
        ? venueNotRequired && !exec.venueId
          ? 'لا يتطلب قاعة مخصصة'
          : venueMap[exec.venueId] || exec.venueId
        : 'لم يتم تحديد القاعة أو الموقع التشغيلي',
    },
    {
      key: 'conflicts',
      label: 'معالجة التعارضات',
      passed: conflictsResolved,
      detail: conflictsResolved
        ? isExceptionApproved && activeBlockingConflicts.length > 0
          ? 'تمت معالجته باعتماد استثناء رسمي'
          : 'خلو البرنامج من التعارضات المانعة'
        : !exec
        ? 'ينتظر استكمال الجدولة لفحص التعارض'
        : `يوجد (${activeBlockingConflicts.length || 1}) تعارض غير معالج`,
    },
    {
      key: 'approvals',
      label: 'اكتمال الاعتمادات المطلوبة',
      passed: approvalsCompleted,
      detail: approvalsCompleted
        ? `معتمد (${exec.status})`
        : pendingException
        ? `طلب استثناء معلق (${linkedReq.status})`
        : exec?.status === 'مسودة'
        ? 'محفوظ كمسودة غير معتمدة'
        : 'لم يكتمل الاعتماد النهائي للتنفيذ',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const missingRequirements = checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`);

  let status = 'يحتاج استكمال';
  let statusCode = 'incomplete';

  if (passedCount === 6) {
    status = 'جاهز للتنفيذ';
    statusCode = 'ready';
  } else if (
    exec &&
    (!conflictsResolved || exec.status === 'يوجد تعارض' || exec.status === 'مرفوض' || pendingException)
  ) {
    status = 'يوجد عائق';
    statusCode = 'blocked';
  } else {
    status = 'يحتاج استكمال';
    statusCode = 'incomplete';
  }

  return {
    status,
    statusCode,
    passedCount,
    totalCount: 6,
    percent: Math.round((passedCount / 6) * 100),
    checks,
    missingRequirements,
    hasExecution: Boolean(exec),
    execution: exec || null,
  };
}

// ----------------------------------------------------------------------------
// 3. ACTIVE CONFLICTS HELPER (Respecting "لا يدخل في التعارضات")
// ----------------------------------------------------------------------------
export function getActiveOpenConflicts(state, deptFilter = 'ALL') {
  const ignoredRuleIds = new Set(
    (state.conflictRules || [])
      .filter((r) => r.conflictBehavior === 'ignore' || r.conflictBehavior === 'no_conflict' || r.isActive === false)
      .map((r) => r.id)
  );
  const ignoredPeriodIds = new Set(
    (state.periods || [])
      .filter((p) => p.conflictBehavior === 'ignore' || p.conflictBehavior === 'no_conflict' || p.enterConflictEngine === false)
      .map((p) => p.id)
  );

  const list = [];
  (state.scheduledExecutions || []).forEach((ex) => {
    if (deptFilter !== 'ALL' && ex.departmentId !== deptFilter) return;
    if (['ملغي', 'ملغى', 'منفذ', 'مكتمل'].includes(ex.status)) return;

    const req = ex.exceptionRequestId
      ? (state.exceptionRequests || []).find((r) => r.id === ex.exceptionRequestId)
      : null;
    const resolvedViaException =
      ex.status === 'معتمد باستثناء' && (!req || req.allAffectedResolved !== false);

    if (resolvedViaException) return;

    const snaps = Array.isArray(ex.conflictsSnapshot) ? ex.conflictsSnapshot : [];
    snaps.forEach((cnf) => {
      if (ignoredRuleIds.has(cnf.code)) return;
      if (cnf.existingProgramId && ignoredPeriodIds.has(cnf.existingProgramId)) return;
      if (cnf.severity === 'لا يدخل في التعارضات' || cnf.severity === 'تنبيه فقط') return;
      list.push({
        ...cnf,
        executionId: ex.id,
        programName: ex.programName,
        departmentId: ex.departmentId,
        departmentName: ex.departmentName,
        executionDate: ex.executionDate,
        periodName: ex.periodName,
        executionStatus: ex.status,
        execution: ex,
      });
    });
  });

  return list;
}

// ----------------------------------------------------------------------------
// 4. EXECUTIVE & DEPARTMENT ANALYTICS ENGINE (Req #6, #7, #8, #9, #10, #11, #12)
// ----------------------------------------------------------------------------
export function computePlatformAnalytics({
  state,
  evaluations = [],
  periodScope = 'current_month', // 'this_week' | 'two_weeks' | 'current_month' | 'all_year'
  deptFilter = 'ALL',
  todayIso = '2026-11-02',
}) {
  const curW = state.meta?.currentGlobalWeek || 45;
  const nextW = state.meta?.nextGlobalWeek || 46;
  const curM = state.meta?.currentMonth || 11;

  const isWeekInScope = (gw, monthNum) => {
    if (periodScope === 'this_week') return Number(gw) === Number(curW);
    if (periodScope === 'two_weeks') return Number(gw) === Number(curW) || Number(gw) === Number(nextW);
    if (periodScope === 'current_month') {
      return Number(monthNum) === Number(curM) || (MONTH_WEEKS_MAP[curM] || []).includes(Number(gw));
    }
    return true; // 'all_year'
  };

  // Filter occurrences in scope
  const scopedOccurrences = (state.plannedOccurrences || []).filter((o) => {
    if (deptFilter !== 'ALL' && o.departmentId !== deptFilter) return false;
    return isWeekInScope(o.plannedGlobalWeek, o.plannedMonth);
  });

  // Also include standalone new executions in scope that aren't linked to an occurrence
  const linkedOccIds = new Set(scopedOccurrences.map((o) => o.id));
  const standaloneExecutions = (state.scheduledExecutions || []).filter((ex) => {
    if (deptFilter !== 'ALL' && ex.departmentId !== deptFilter) return false;
    if (ex.occurrenceId && linkedOccIds.has(ex.occurrenceId)) return false;
    return isWeekInScope(ex.executionGlobalWeek || ex.plannedGlobalWeek, ex.executionMonth || ex.plannedMonth);
  });

  // Unified items list in scope
  const unifiedScopedItems = [
    ...scopedOccurrences.map((o) => ({
      kind: 'occurrence',
      id: o.id,
      programId: o.programId,
      programName: o.programName,
      departmentId: o.departmentId,
      departmentName: o.departmentName,
      plannedMonth: o.plannedMonth,
      plannedMonthName: o.plannedMonthName,
      plannedGlobalWeek: o.plannedGlobalWeek,
      plannedWeekLabel: o.plannedWeekLabel,
      effectiveStatus: o.effectiveStatus || o.status || 'مخطط',
      occurrence: o,
      execution: o.linkedExecution || null,
      readiness: computeProgramReadiness(o, state),
    })),
    ...standaloneExecutions.map((ex) => ({
      kind: 'execution',
      id: ex.id,
      programId: ex.programId,
      programName: ex.programName,
      departmentId: ex.departmentId,
      departmentName: ex.departmentName,
      plannedMonth: ex.plannedMonth || ex.executionMonth,
      plannedMonthName: ex.plannedMonthName,
      plannedGlobalWeek: ex.plannedGlobalWeek || ex.executionGlobalWeek,
      plannedWeekLabel: ex.plannedWeekLabel,
      effectiveStatus: ex.status || 'معتمد',
      occurrence: null,
      execution: ex,
      readiness: computeProgramReadiness(ex, state),
    })),
  ];

  // Scheduled items in scope
  const scheduledItems = unifiedScopedItems.filter((item) => Boolean(item.execution));

  // Executed items (both in scope and all club executions for accurate evaluation tracking)
  const executedItems = unifiedScopedItems.filter((item) =>
    ['منفذ', 'مكتمل'].includes(item.effectiveStatus)
  );

  // All executed executions in the department/club (regardless of week filter so executed programs are never missed)
  const allExecutedExecutions = (state.scheduledExecutions || []).filter(
    (ex) =>
      (deptFilter === 'ALL' || ex.departmentId === deptFilter) &&
      ['منفذ', 'مكتمل'].includes(ex.status)
  );

  // Postponed or Cancelled
  const postponedOrCancelledItems = unifiedScopedItems.filter((item) =>
    ['مؤجل', 'ملغي', 'ملغى'].includes(item.effectiveStatus)
  );
  const postponedItems = postponedOrCancelledItems.filter((i) => i.effectiveStatus === 'مؤجل');
  const cancelledItems = postponedOrCancelledItems.filter((i) => ['ملغي', 'ملغى'].includes(i.effectiveStatus));

  // Due & Overdue items:
  // Due = plannedGlobalWeek <= curW (or executionDate <= todayIso)
  const dueItems = unifiedScopedItems.filter((item) => {
    const gw = Number(item.plannedGlobalWeek || 0);
    const execDate = item.execution?.executionDate;
    if (execDate && execDate < todayIso) return true;
    return gw > 0 && gw <= curW;
  });

  const overdueItems = dueItems.filter(
    (item) =>
      !['منفذ', 'مكتمل', 'مؤجل', 'ملغي', 'ملغى', 'معتمد', 'معتمد باستثناء'].includes(item.effectiveStatus) ||
      (item.execution?.executionDate &&
        item.execution.executionDate < todayIso &&
        !['منفذ', 'مكتمل', 'مؤجل', 'ملغي', 'ملغى'].includes(item.effectiveStatus))
  );

  // Compliance Calculation (Req #22):
  // Effective due = dueItems excluding officially cancelled items
  const effectiveDueItems = dueItems.filter((i) => !['ملغي', 'ملغى'].includes(i.effectiveStatus));
  const compliantItems = effectiveDueItems.filter((i) =>
    ['منفذ', 'مكتمل', 'معتمد', 'معتمد باستثناء'].includes(i.effectiveStatus)
  );
  const executedDueItems = effectiveDueItems.filter((i) =>
    ['منفذ', 'مكتمل'].includes(i.effectiveStatus)
  );

  const planCompliancePercent =
    effectiveDueItems.length > 0
      ? Math.round((compliantItems.length / effectiveDueItems.length) * 100)
      : unifiedScopedItems.length > 0
      ? Math.round((scheduledItems.length / unifiedScopedItems.length) * 100)
      : 100;

  const executionCompliancePercent =
    effectiveDueItems.length > 0
      ? Math.round((executedDueItems.length / effectiveDueItems.length) * 100)
      : 0;

  // Open Conflicts (Req #6, #22)
  const openConflicts = getActiveOpenConflicts(state, deptFilter);

  // Pending Exception Requests
  const pendingExceptions = (state.exceptionRequests || []).filter((r) => {
    if (deptFilter !== 'ALL' && r.departmentId !== deptFilter) return false;
    return (
      r.status === 'بانتظار إبداء الرأي' ||
      r.status === 'بانتظار الاعتماد' ||
      (r.status === 'معتمد باستثناء' && !r.allAffectedResolved)
    );
  });

  // Pending Approvals
  const pendingApprovals = [
    ...(state.exceptionRequests || [])
      .filter(
        (r) =>
          (deptFilter === 'ALL' || r.departmentId === deptFilter) &&
          (r.status === 'بانتظار الاعتماد' || r.status === 'بانتظار إبداء الرأي')
      )
      .map((r) => ({
        kind: 'exception',
        id: r.id,
        title: `طلب استثناء: ${r.programSnapshot?.programName || r.executionId}`,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        status: r.status,
        createdAt: r.createdAt,
        raw: r,
      })),
    ...(state.scheduledExecutions || [])
      .filter(
        (ex) =>
          (deptFilter === 'ALL' || ex.departmentId === deptFilter) &&
          ['بانتظار الاعتماد', 'بانتظار إبداء الرأي', 'مسودة'].includes(ex.status)
      )
      .map((ex) => ({
        kind: 'execution',
        id: ex.id,
        title: `اعتماد برنامج: ${ex.programName}`,
        departmentId: ex.departmentId,
        departmentName: ex.departmentName,
        status: ex.status,
        createdAt: ex.createdAt,
        raw: ex,
      })),
  ];

  // Tasks & Overdue Tasks
  const scopedTasks = (state.tasks || []).filter((t) =>
    deptFilter === 'ALL' ? true : t.departmentId === deptFilter
  );
  const openTasks = scopedTasks.filter((t) => !['منجزة', 'مكتملة'].includes(t.status));
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < todayIso);

  // Evaluations & Unevaluated Executed Programs
  const evaluatedExecIds = new Set(
    (evaluations || [])
      .filter((ev) => !ev.isDeleted && ev.targetKind === 'program_execution')
      .map((ev) => ev.targetId)
  );
  const unevaluatedExecuted = allExecutedExecutions.filter((ex) => !evaluatedExecIds.has(ex.id));
  const evaluatedExecuted = allExecutedExecutions.filter((ex) => evaluatedExecIds.has(ex.id));

  const evaluationCompletionPercent =
    allExecutedExecutions.length > 0
      ? Math.round((evaluatedExecuted.length / allExecutedExecutions.length) * 100)
      : (evaluations || []).length > 0
      ? 100
      : 0;

  // Department Breakdown Cards (Req #7 — متابعة الأقسام الأربعة)
  const departmentCards = (state.departments || []).map((dept) => {
    const deptItems = unifiedScopedItems.filter((i) => i.departmentId === dept.id);
    const deptScheduled = deptItems.filter((i) => Boolean(i.execution));
    const deptExecuted = deptItems.filter((i) => ['منفذ', 'مكتمل'].includes(i.effectiveStatus));
    const deptAllExecuted = (state.scheduledExecutions || []).filter(
      (ex) => ex.departmentId === dept.id && ['منفذ', 'مكتمل'].includes(ex.status)
    );
    const deptDue = deptItems.filter((i) => Number(i.plannedGlobalWeek || 0) <= curW);
    const deptOverdue = overdueItems.filter((i) => i.departmentId === dept.id);
    const deptConflicts = openConflicts.filter((c) => c.departmentId === dept.id);
    const deptPendingReqs = pendingExceptions.filter((r) => r.departmentId === dept.id);
    const deptEvals = (evaluations || []).filter(
      (ev) => !ev.isDeleted && (ev.departmentId === dept.id || ev.evaluatedDepartmentId === dept.id)
    );
    const deptUnevalExecs = deptAllExecuted.filter((ex) => !evaluatedExecIds.has(ex.id));
    const deptEvalRate =
      deptAllExecuted.length > 0
        ? Math.round(((deptAllExecuted.length - deptUnevalExecs.length) / deptAllExecuted.length) * 100)
        : deptEvals.length > 0
        ? 100
        : 0;

    const deptAvgScore =
      deptEvals.length > 0
        ? Math.round(deptEvals.reduce((acc, ev) => acc + Number(ev.percent || 0), 0) / deptEvals.length)
        : null;

    const scheduleRate =
      deptItems.length > 0 ? Math.round((deptScheduled.length / deptItems.length) * 100) : 100;
    const execRate =
      deptItems.length > 0 ? Math.round((deptExecuted.length / deptItems.length) * 100) : 0;

    const effDue = deptDue.filter((i) => !['ملغي', 'ملغى'].includes(i.effectiveStatus));
    const compCount = effDue.filter((i) =>
      ['منفذ', 'مكتمل', 'معتمد', 'معتمد باستثناء'].includes(i.effectiveStatus)
    ).length;
    const complianceRate = effDue.length > 0 ? Math.round((compCount / effDue.length) * 100) : scheduleRate;

    let complianceStatus = 'ملتزم بالخطة';
    let complianceBadge = 'ready';
    if (deptConflicts.length > 0 || deptPendingReqs.length > 0) {
      complianceStatus = 'يوجد طلبات / تعارضات تنتظر الحسم';
      complianceBadge = 'blocked';
    } else if (deptOverdue.length > 0) {
      complianceStatus = `يحتاج استكمال جدولة (${deptOverdue.length})`;
      complianceBadge = 'incomplete';
    }

    return {
      department: dept,
      id: dept.id,
      name: dept.name,
      shortName: dept.shortName || dept.name,
      color: dept.color || '#00A59B',
      headName: dept.headName || '—',
      headEmployeeId: dept.headEmployeeId,
      totalPrograms: deptItems.length,
      scheduledCount: deptScheduled.length,
      executedCount: deptExecuted.length + deptAllExecuted.length,
      scheduleRate,
      execRate,
      complianceRate,
      overdueCount: deptOverdue.length,
      conflictsCount: deptConflicts.length,
      pendingActionsCount: deptPendingReqs.length + deptConflicts.length,
      evalCompletionRate: deptEvalRate,
      evalCount: deptEvals.length,
      evalAvgScore: deptAvgScore,
      complianceStatus,
      complianceBadge,
      records: {
        all: deptItems,
        scheduled: deptScheduled,
        executed: deptExecuted,
        overdue: deptOverdue,
        conflicts: deptConflicts,
        pendingReqs: deptPendingReqs,
      },
    };
  });

  // --------------------------------------------------------------------------
  // 5. DECISIONS REQUIRED BOARD ("يحتاج قرارك" — Req #8)
  // Ordered strictly by importance & time urgency, NOT creation date!
  // --------------------------------------------------------------------------
  const decisionsRequired = [];

  // A. Pending Exception Approvals / Opinions (Priority 100)
  (state.exceptionRequests || []).forEach((req) => {
    if (deptFilter !== 'ALL' && req.departmentId !== deptFilter) return;
    if (
      req.status === 'بانتظار الاعتماد' ||
      req.status === 'بانتظار إبداء الرأي' ||
      (req.status === 'معتمد باستثناء' && !req.allAffectedResolved)
    ) {
      const execDate = req.programSnapshot?.executionDate || '2026-11-05';
      decisionsRequired.push({
        id: `DEC-EX-${req.id}`,
        category: 'exception',
        categoryLabel: req.status === 'بانتظار الاعتماد' ? 'اعتماد طلب استثناء' : req.status === 'بانتظار إبداء الرأي' ? 'إبداء رأي على استثناء' : 'معالجة برامج متأثرة باستثناء',
        title: `${req.programSnapshot?.programName || 'برنامج باستثناء'} (${req.departmentName || ''})`,
        subtitle: `الحالة: ${req.status} — عدد التعارضات المرتبطة: ${(req.conflicts || []).length}`,
        departmentId: req.departmentId,
        departmentName: req.departmentName,
        dueDate: execDate,
        priorityScore: req.status === 'بانتظار الاعتماد' ? 100 : 95,
        urgencyLabel: 'عاجل — قرار اعتماد',
        actionLabel: 'فتح الطلب واتخاذ القرار',
        routeTarget: 'exceptions',
        entityId: req.id,
        raw: req,
      });
    }
  });

  // B. Unresolved Actual Conflicts (Priority 90)
  openConflicts.forEach((cnf, idx) => {
    decisionsRequired.push({
      id: `DEC-CNF-${cnf.executionId}-${idx}`,
      category: 'conflict',
      categoryLabel: 'تعارض فعلي لم يعالج',
      title: `${cnf.programName} — ${cnf.typeLabel || 'تعارض جدولة'}`,
      subtitle: cnf.reason,
      departmentId: cnf.departmentId,
      departmentName: cnf.departmentName,
      dueDate: cnf.executionDate || todayIso,
      priorityScore: 90,
      urgencyLabel: 'عاجل — تعارض تشغيلي',
      actionLabel: 'معالجة التعارض',
      routeTarget: 'detail_execution',
      entityId: cnf.executionId,
      raw: cnf.execution,
    });
  });

  // C. Returned for modification / Pending program approvals (Priority 85)
  (state.scheduledExecutions || []).forEach((ex) => {
    if (deptFilter !== 'ALL' && ex.departmentId !== deptFilter) return;
    if (['بانتظار الاعتماد', 'مسودة', 'يحتاج جدولة'].includes(ex.status)) {
      decisionsRequired.push({
        id: `DEC-PRG-${ex.id}`,
        category: 'program_approval',
        categoryLabel: ex.status === 'يحتاج جدولة' ? 'طلب أعيد للمراجعة والتعديل' : 'اعتماد برنامج مجدول',
        title: `${ex.programName} (${ex.departmentName || ''})`,
        subtitle: `التاريخ: ${ex.executionDate || 'غير محدد'} — الحالة: ${ex.status}`,
        departmentId: ex.departmentId,
        departmentName: ex.departmentName,
        dueDate: ex.executionDate || todayIso,
        priorityScore: 85,
        urgencyLabel: 'مرتفع — اعتماد',
        actionLabel: 'مراجعة البرنامج',
        routeTarget: 'detail_execution',
        entityId: ex.id,
        raw: ex,
      });
    }
  });

  // D. Overdue Tasks (Priority 80)
  overdueTasks.forEach((tsk) => {
    decisionsRequired.push({
      id: `DEC-TSK-${tsk.id}`,
      category: 'overdue_task',
      categoryLabel: 'مهمة متأخرة تحتاج متابعة',
      title: `${tsk.title} — المكلف: ${tsk.assignedEmployeeName || '—'}`,
      subtitle: `تاريخ الاستحقاق: ${tsk.dueDate} (${tsk.departmentName || 'النادي'})`,
      departmentId: tsk.departmentId,
      departmentName: tsk.departmentName,
      dueDate: tsk.dueDate || todayIso,
      priorityScore: 80,
      urgencyLabel: 'متابعة استحقاق',
      actionLabel: 'متابعة المهمة',
      routeTarget: 'task',
      entityId: tsk.id,
      raw: tsk,
    });
  });

  // E. Open Data Discrepancies (Priority 75 — for Club Director / Admin)
  if (deptFilter === 'ALL') {
    (state.dataDiscrepancies || [])
      .filter((d) => d.status === 'تعارض بيانات يحتاج مراجعة')
      .forEach((disc) => {
        decisionsRequired.push({
          id: `DEC-DSC-${disc.id}`,
          category: 'discrepancy',
          categoryLabel: 'اختلاف بيانات يحتاج قرارًا',
          title: disc.entityName,
          subtitle: `${disc.fieldLabel}: (${disc.sourceAValue}) مقابل (${disc.sourceBValue})`,
          departmentId: null,
          departmentName: 'الإدارة العامة',
          dueDate: todayIso,
          priorityScore: 75,
          urgencyLabel: 'حوكمة بيانات',
          actionLabel: 'حسم الاختلاف',
          routeTarget: 'discrepancies',
          entityId: disc.id,
          raw: disc,
        });
      });
  }

  // F. Programs delayed from their planned week (Priority 70)
  overdueItems.slice(0, 12).forEach((item) => {
    decisionsRequired.push({
      id: `DEC-OVD-${item.id}`,
      category: 'overdue_program',
      categoryLabel: 'برنامج مستحق لم تستكمل جدولته',
      title: `${item.programName} (${item.departmentName})`,
      subtitle: `${item.plannedMonthName || ''} — ${item.plannedWeekLabel || ''} (الأسبوع ${item.plannedGlobalWeek})`,
      departmentId: item.departmentId,
      departmentName: item.departmentName,
      dueDate: todayIso,
      priorityScore: 70,
      urgencyLabel: 'استحقاق أسبوعي',
      actionLabel: 'جدولة البرنامج الآن',
      routeTarget: 'schedule_occurrence',
      entityId: item.id,
      raw: item.occurrence || item.execution,
    });
  });

  decisionsRequired.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
  });

  // --------------------------------------------------------------------------
  // 6. INTERACTIVE CHARTS DATA (Req #9 — 7 Interactive Charts with Drill-Down Records)
  // --------------------------------------------------------------------------
  // Chart 1 & 3: Planned vs Scheduled vs Executed by Department
  const deptComparisonChart = departmentCards.map((dc) => ({
    deptId: dc.id,
    name: dc.shortName,
    fullName: dc.name,
    color: dc.color,
    planned: dc.totalPrograms,
    scheduled: dc.scheduledCount,
    executed: dc.executedCount,
    overdue: dc.overdueCount,
    scheduleRate: dc.scheduleRate,
    complianceRate: dc.complianceRate,
    records: dc.records.all,
  }));

  // Chart 2: Monthly Evolution across Months 1..12
  const monthlyEvolutionChart = Object.keys(MONTH_NAMES_AR).map((mKey) => {
    const mNum = Number(mKey);
    const mOccs = (state.plannedOccurrences || []).filter(
      (o) =>
        (deptFilter === 'ALL' || o.departmentId === deptFilter) &&
        Number(o.plannedMonth) === mNum
    );
    const mScheduled = mOccs.filter((o) => Boolean(o.linkedExecution));
    const mExec = mOccs.filter((o) => ['منفذ', 'مكتمل'].includes(o.effectiveStatus));
    return {
      month: mNum,
      label: MONTH_NAMES_AR[mNum].split(' ')[0],
      fullLabel: MONTH_NAMES_AR[mNum],
      planned: mOccs.length,
      scheduled: mScheduled.length,
      executed: mExec.length,
      isCurrent: mNum === curM,
      records: mOccs.map((o) => ({
        kind: 'occurrence',
        id: o.id,
        programName: o.programName,
        departmentId: o.departmentId,
        departmentName: o.departmentName,
        plannedMonthName: o.plannedMonthName,
        plannedWeekLabel: o.plannedWeekLabel,
        plannedGlobalWeek: o.plannedGlobalWeek,
        effectiveStatus: o.effectiveStatus || o.status,
        occurrence: o,
        execution: o.linkedExecution,
      })),
    };
  });

  // Chart 4: Programs Distribution by Status
  const statusBuckets = [
    { key: 'مخطط', label: 'مخطط (بانتظار الجدولة)', color: '#16a34a' },
    { key: 'معتمد', label: 'معتمد بالجدول', color: '#00A59B' },
    { key: 'معتمد باستثناء', label: 'معتمد باستثناء', color: '#7c3aed' },
    { key: 'منفذ', label: 'منفذ ومكتمل', color: '#2563eb' },
    { key: 'يوجد تعارض', label: 'يوجد تعارض / معلق', color: '#dc2626' },
    { key: 'مؤجل_ملغي', label: 'مؤجل أو ملغي', color: '#64748b' },
  ].map((b) => {
    const recs = unifiedScopedItems.filter((item) => {
      const st = item.effectiveStatus;
      if (b.key === 'مخطط') return st === 'مخطط' || st === 'يحتاج جدولة';
      if (b.key === 'معتمد') return st === 'معتمد' || st === 'تمت الجدولة';
      if (b.key === 'معتمد باستثناء') return st === 'معتمد باستثناء';
      if (b.key === 'منفذ') return st === 'منفذ' || st === 'مكتمل';
      if (b.key === 'يوجد تعارض') return ['يوجد تعارض', 'بانتظار إبداء الرأي', 'بانتظار الاعتماد', 'مرفوض'].includes(st);
      if (b.key === 'مؤجل_ملغي') return ['مؤجل', 'ملغي', 'ملغى'].includes(st);
      return false;
    });
    return {
      ...b,
      count: recs.length,
      percent: unifiedScopedItems.length > 0 ? Math.round((recs.length / unifiedScopedItems.length) * 100) : 0,
      records: recs,
    };
  });

  // Chart 5: Conflicts by Type & Department
  const conflictTypeGroups = {};
  openConflicts.forEach((c) => {
    const key = c.typeLabel || c.code || 'تعارض تشغيلي';
    if (!conflictTypeGroups[key]) {
      conflictTypeGroups[key] = { label: key, count: 0, records: [] };
    }
    conflictTypeGroups[key].count += 1;
    conflictTypeGroups[key].records.push(c);
  });
  const conflictsByTypeChart = Object.values(conflictTypeGroups);

  // Chart 6: Evaluations Completion & Quality by Department
  const evaluationsChart = departmentCards.map((dc) => ({
    deptId: dc.id,
    name: dc.shortName,
    color: dc.color,
    evalCount: dc.evalCount,
    completionRate: dc.evalCompletionRate,
    avgScore: dc.evalAvgScore ?? 0,
    records: dc.records.all,
  }));

  // Chart 7: Tasks Distribution by Status & Department
  const tasksDistributionChart = [
    {
      key: 'overdue',
      label: 'مهام متأخرة',
      color: '#dc2626',
      count: overdueTasks.length,
      records: overdueTasks,
    },
    {
      key: 'in_progress',
      label: 'قيد التنفيذ (في الموعد)',
      color: '#0284c7',
      count: openTasks.filter((t) => !t.dueDate || t.dueDate >= todayIso).length,
      records: openTasks.filter((t) => !t.dueDate || t.dueDate >= todayIso),
    },
    {
      key: 'completed',
      label: 'مهام منجزة',
      color: '#059669',
      count: scopedTasks.filter((t) => ['منجزة', 'مكتملة'].includes(t.status)).length,
      records: scopedTasks.filter((t) => ['منجزة', 'مكتملة'].includes(t.status)),
    },
  ];

  return {
    kpis: {
      planned: {
        value: unifiedScopedItems.length,
        records: unifiedScopedItems,
        meta: METRIC_DEFINITIONS_AR.planned,
      },
      scheduled: {
        value: scheduledItems.length,
        records: scheduledItems,
        meta: METRIC_DEFINITIONS_AR.scheduled,
      },
      executed: {
        value: Math.max(executedItems.length, allExecutedExecutions.length),
        records: executedItems.length >= allExecutedExecutions.length ? executedItems : allExecutedExecutions,
        meta: METRIC_DEFINITIONS_AR.executed,
      },
      overdue: {
        value: overdueItems.length,
        records: overdueItems,
        meta: METRIC_DEFINITIONS_AR.overdue,
      },
      postponedOrCancelled: {
        value: postponedOrCancelledItems.length,
        postponedCount: postponedItems.length,
        cancelledCount: cancelledItems.length,
        records: postponedOrCancelledItems,
        meta: METRIC_DEFINITIONS_AR.postponedOrCancelled,
      },
      compliance: {
        value: planCompliancePercent,
        executionCompliancePercent,
        compliantCount: compliantItems.length,
        effectiveDueCount: effectiveDueItems.length,
        records: effectiveDueItems,
        meta: METRIC_DEFINITIONS_AR.compliance,
      },
      openConflicts: {
        value: openConflicts.length,
        records: openConflicts,
        meta: METRIC_DEFINITIONS_AR.openConflicts,
      },
      pendingExceptions: {
        value: pendingExceptions.length,
        records: pendingExceptions,
        meta: METRIC_DEFINITIONS_AR.pendingExceptions,
      },
      pendingApprovals: {
        value: pendingApprovals.length,
        records: pendingApprovals,
        meta: METRIC_DEFINITIONS_AR.pendingApprovals,
      },
      overdueTasks: {
        value: overdueTasks.length,
        openCount: openTasks.length,
        totalCount: scopedTasks.length,
        records: overdueTasks.length > 0 ? overdueTasks : openTasks,
        meta: METRIC_DEFINITIONS_AR.overdueTasks,
      },
      unevaluatedExecuted: {
        value: unevaluatedExecuted.length,
        records: unevaluatedExecuted,
        meta: METRIC_DEFINITIONS_AR.unevaluatedExecuted,
      },
      evalCompletion: {
        value: evaluationCompletionPercent,
        evaluatedCount: evaluatedExecuted.length,
        totalExecutedCount: allExecutedExecutions.length,
        totalEvaluationsRecords: (evaluations || []).filter((e) => !e.isDeleted).length,
        records: allExecutedExecutions,
        meta: METRIC_DEFINITIONS_AR.evalCompletion,
      },
    },
    departmentCards,
    decisionsRequired,
    charts: {
      deptComparisonChart,
      monthlyEvolutionChart,
      statusBuckets,
      conflictsByTypeChart,
      evaluationsChart,
      tasksDistributionChart,
    },
  };
}

// ----------------------------------------------------------------------------
// 5. DEPARTMENT HEAD SPECIALIZED ANALYTICS (Req #10, #11, #12)
// ----------------------------------------------------------------------------
export function computeDepartmentHeadDashboard({
  state,
  evaluations = [],
  departmentId,
  selectedDateIso = '2026-11-02',
  selectedDayAr = 'الاثنين',
}) {
  const curW = state.meta?.currentGlobalWeek || 45;
  const nextW = state.meta?.nextGlobalWeek || 46;
  const dept = (state.departments || []).find((d) => d.id === departmentId) || (state.departments || [])[0];
  const deptId = dept?.id;

  const deptOccurrences = (state.plannedOccurrences || []).filter((o) => o.departmentId === deptId);
  const deptExecutions = (state.scheduledExecutions || []).filter((ex) => ex.departmentId === deptId);

  const todayPrograms = deptExecutions.filter((ex) =>
    isDateInExecutionRange(selectedDateIso, selectedDayAr, ex)
  );

  const thisWeekOccurrences = deptOccurrences.filter((o) => Number(o.plannedGlobalWeek) === Number(curW));
  const nextWeekOccurrences = deptOccurrences.filter((o) => Number(o.plannedGlobalWeek) === Number(nextW));

  const unscheduledThisAndNext = deptOccurrences.filter(
    (o) =>
      (Number(o.plannedGlobalWeek) === Number(curW) || Number(o.plannedGlobalWeek) === Number(nextW)) &&
      !o.linkedExecution
  );

  const executedPrograms = deptExecutions.filter((ex) => ['منفذ', 'مكتمل'].includes(ex.status));

  const overduePrograms = deptOccurrences.filter(
    (o) =>
      Number(o.plannedGlobalWeek) <= Number(curW) &&
      !o.linkedExecution &&
      !['منفذ', 'مكتمل', 'مؤجل', 'ملغي', 'ملغى'].includes(o.effectiveStatus)
  );

  const deptConflicts = getActiveOpenConflicts(state, deptId);
  const deptExceptions = (state.exceptionRequests || []).filter((r) => r.departmentId === deptId);
  const deptPendingApprovals = deptExceptions.filter(
    (r) => r.status === 'بانتظار الاعتماد' || r.status === 'بانتظار إبداء الرأي'
  );

  const deptEvals = (evaluations || []).filter(
    (ev) => !ev.isDeleted && (ev.departmentId === deptId || ev.evaluatedDepartmentId === deptId)
  );
  const evaluatedExecIds = new Set(
    deptEvals.filter((ev) => ev.targetKind === 'program_execution').map((ev) => ev.targetId)
  );

  const deptTasks = (state.tasks || []).filter((t) => t.departmentId === deptId);
  const deptOpenTasks = deptTasks.filter((t) => !['منجزة', 'مكتملة'].includes(t.status));
  const deptOverdueTasks = deptOpenTasks.filter((t) => t.dueDate && t.dueDate < selectedDateIso);

  // Readiness check across current month / current & next week programs + all scheduled executions of dept
  const curMonth = state.meta?.currentMonth || 11;
  const monthOccurrences = deptOccurrences.filter((o) => Number(o.plannedMonth) === Number(curMonth));
  const trackingOccurrences =
    monthOccurrences.length > 0
      ? monthOccurrences
      : [...thisWeekOccurrences, ...nextWeekOccurrences].length > 0
      ? [...thisWeekOccurrences, ...nextWeekOccurrences]
      : deptOccurrences;

  const trackedItemsMap = new Map();
  trackingOccurrences.forEach((occ) => {
    const r = computeProgramReadiness(occ, state);
    trackedItemsMap.set(occ.id, {
      id: occ.id,
      programName: occ.programName,
      plannedWeekLabel: occ.plannedWeekLabel,
      plannedMonthName: occ.plannedMonthName,
      plannedGlobalWeek: occ.plannedGlobalWeek,
      effectiveStatus: occ.effectiveStatus || occ.status,
      occurrence: occ,
      execution: occ.linkedExecution || null,
      readiness: r,
    });
  });
  deptExecutions.forEach((ex) => {
    const key = ex.occurrenceId || ex.id;
    const r = computeProgramReadiness(ex, state);
    trackedItemsMap.set(key, {
      id: ex.id,
      programName: ex.programName,
      plannedWeekLabel: ex.plannedWeekLabel || 'مجدول',
      plannedMonthName: ex.plannedMonthName || '',
      plannedGlobalWeek: ex.plannedGlobalWeek || ex.executionGlobalWeek || curW,
      effectiveStatus: ex.status,
      occurrence: ex.occurrenceId ? deptOccurrences.find((o) => o.id === ex.occurrenceId) || null : null,
      execution: ex,
      readiness: r,
    });
  });

  const trackedItems = Array.from(trackedItemsMap.values());
  const incompleteDataPrograms = trackedItems.filter((i) => i.readiness.statusCode !== 'ready');

  const dueThisWeek = thisWeekOccurrences.filter((o) => !['ملغي', 'ملغى'].includes(o.effectiveStatus));
  const scheduledThisWeek = dueThisWeek.filter((o) => Boolean(o.linkedExecution));
  const complianceRate =
    dueThisWeek.length > 0 ? Math.round((scheduledThisWeek.length / dueThisWeek.length) * 100) : 100;

  // 8 Program Tracking Buckets (Req #12 — متابعة تنفيذ البرامج)
  const programTrackingBuckets = [
    {
      key: 'scheduled_to_execute',
      label: 'البرامج المقرر تنفيذها',
      count: trackedItems.length,
      color: '#0284c7',
      items: trackedItems,
    },
    {
      key: 'ready_to_execute',
      label: 'البرامج الجاهزة للتنفيذ (6/6)',
      count: trackedItems.filter((i) => i.readiness.statusCode === 'ready').length,
      color: '#059669',
      items: trackedItems.filter((i) => i.readiness.statusCode === 'ready'),
    },
    {
      key: 'missing_lead',
      label: 'برامج لم يُحدد لها مسؤول',
      count: trackedItems.filter((i) => !i.execution?.leadEmployeeId).length,
      color: '#d97706',
      items: trackedItems.filter((i) => !i.execution?.leadEmployeeId),
    },
    {
      key: 'missing_date',
      label: 'برامج تحتاج تحديد موعد وفترة',
      count: trackedItems.filter((i) => !i.execution?.executionDate).length,
      color: '#ea580c',
      items: trackedItems.filter((i) => !i.execution?.executionDate),
    },
    {
      key: 'missing_venue',
      label: 'برامج تحتاج تحديد قاعة',
      count: trackedItems.filter((i) => !i.execution?.venueId).length,
      color: '#7c3aed',
      items: trackedItems.filter((i) => !i.execution?.venueId),
    },
    {
      key: 'conflicting',
      label: 'البرامج المتعارضة',
      count: trackedItems.filter((i) => i.readiness.statusCode === 'blocked').length,
      color: '#dc2626',
      items: trackedItems.filter((i) => i.readiness.statusCode === 'blocked'),
    },
    {
      key: 'past_due_unrecorded',
      label: 'انتهى موعدها دون تسجيل التنفيذ',
      count: trackedItems.filter(
        (i) =>
          i.execution?.executionDate &&
          i.execution.executionDate < selectedDateIso &&
          !['منفذ', 'مكتمل', 'مؤجل', 'ملغي', 'ملغى'].includes(i.effectiveStatus)
      ).length,
      color: '#b91c1c',
      items: trackedItems.filter(
        (i) =>
          i.execution?.executionDate &&
          i.execution.executionDate < selectedDateIso &&
          !['منفذ', 'مكتمل', 'مؤجل', 'ملغي', 'ملغى'].includes(i.effectiveStatus)
      ),
    },
    {
      key: 'unevaluated',
      label: 'منفذة لم تستكمل تقييماتها',
      count: executedPrograms.filter((ex) => !evaluatedExecIds.has(ex.id)).length,
      color: '#0f766e',
      items: executedPrograms
        .filter((ex) => !evaluatedExecIds.has(ex.id))
        .map((ex) => ({
          id: ex.id,
          programName: ex.programName,
          effectiveStatus: ex.status,
          execution: ex,
          readiness: computeProgramReadiness(ex, state),
        })),
    },
  ];

  // Department Team Follow-up (Req #11 — فريق القسم)
  const deptStaff = (state.employees || []).filter((e) => e.departmentId === deptId);
  const deptTeamRows = deptStaff.map((emp) => {
    const currentPrograms = (state.scheduledExecutions || []).filter(
      (ex) =>
        ex.leadEmployeeId === emp.id || (ex.participatingEmployeeIds || []).includes(emp.id)
    );
    const supervisedPrograms = (state.scheduledExecutions || []).filter(
      (ex) => ex.leadEmployeeId === emp.id
    );
    const empTasks = (state.tasks || []).filter((t) => t.assignedEmployeeId === emp.id);
    const empOpenTasks = empTasks.filter((t) => !['منجزة', 'مكتملة'].includes(t.status));
    const empOverdueTasks = empOpenTasks.filter((t) => t.dueDate && t.dueDate < selectedDateIso);
    const empSupervisionDuties = (state.supervisionDuties || []).filter(
      (sv) =>
        sv.employeeId === emp.id ||
        sv.systemSupervisorId === emp.id ||
        sv.generalSupervisorId === emp.id
    );
    const empTimetableLessons = (state.weeklyCommitments || []).filter(
      (wc) =>
        wc.leadEmployeeId === emp.id || (wc.participatingEmployeeIds || []).includes(emp.id)
    );
    const empEvals = (evaluations || []).filter(
      (ev) =>
        !ev.isDeleted &&
        (ev.evaluatedEmployeeId === emp.id ||
          (ev.evalLevel === 'program' && ev.leadEmployeeId === emp.id))
    );
    const avgEval =
      empEvals.length > 0
        ? Math.round(empEvals.reduce((acc, ev) => acc + Number(ev.percent || 0), 0) / empEvals.length)
        : null;

    return {
      employee: emp,
      id: emp.id,
      name: emp.name,
      username: emp.username,
      jobTitle: emp.jobTitle,
      roleLabel: emp.customRoleLabel || emp.jobTitle,
      currentPrograms,
      supervisedPrograms,
      openTasks: empOpenTasks,
      overdueTasks: empOverdueTasks,
      allTasks: empTasks,
      supervisionDuties: empSupervisionDuties,
      timetableLessons: empTimetableLessons,
      evaluations: empEvals,
      avgEval,
    };
  });

  return {
    department: dept,
    kpis: {
      todayPrograms: { label: 'برامج اليوم', value: todayPrograms.length, records: todayPrograms },
      thisWeekPrograms: { label: 'برامج هذا الأسبوع', value: thisWeekOccurrences.length, records: thisWeekOccurrences },
      nextWeekPrograms: { label: 'برامج الأسبوع القادم', value: nextWeekOccurrences.length, records: nextWeekOccurrences },
      unscheduledPrograms: { label: 'لم تتم جدولتها', value: unscheduledThisAndNext.length, records: unscheduledThisAndNext },
      executedPrograms: { label: 'البرامج المنفذة', value: executedPrograms.length, records: executedPrograms },
      overduePrograms: { label: 'البرامج المتأخرة', value: overduePrograms.length, records: overduePrograms },
      planCompliance: { label: 'نسبة الالتزام بالخطة', value: `${complianceRate}%`, rawValue: complianceRate, records: thisWeekOccurrences },
      deptConflicts: { label: 'التعارضات الخاصة بالقسم', value: deptConflicts.length, records: deptConflicts },
      deptExceptions: { label: 'طلبات الاستثناء', value: deptExceptions.length, records: deptExceptions },
      deptApprovals: { label: 'طلبات الاعتماد', value: deptPendingApprovals.length, records: deptPendingApprovals },
      deptEvaluations: { label: 'تقييمات القسم', value: deptEvals.length, records: deptEvals },
      deptOverdueTasks: { label: 'المهام المتأخرة', value: deptOverdueTasks.length, records: deptOverdueTasks },
      incompleteDataPrograms: { label: 'تحتاج استكمال بيانات', value: incompleteDataPrograms.length, records: incompleteDataPrograms },
    },
    programTrackingBuckets,
    deptTeamRows,
    trackedItems,
  };
}

// ----------------------------------------------------------------------------
// 6. PROACTIVE EARLY WARNING SYSTEM (Req #14 — الإنذار المبكر)
// Strictly scoped to the logged-in user's responsibility!
// ----------------------------------------------------------------------------
export function computeEarlyWarnings({ state, currentUser, evaluations = [], todayIso = '2026-11-02' }) {
  if (!state || !currentUser) return [];

  const curW = state.meta?.currentGlobalWeek || 45;
  const nextW = state.meta?.nextGlobalWeek || 46;
  const isClubWide =
    currentUser.isAdmin ||
    currentUser.role === 'full_admin' ||
    currentUser.role === 'club_director' ||
    currentUser.accessScope === 'system' ||
    currentUser.accessScope === 'club';
  const isDeptHead = currentUser.role === 'dept_head' || currentUser.accessScope === 'department';
  const myDeptId = currentUser.departmentId;
  const myEmpId = currentUser.employeeId;

  const warnings = [];

  // Scope helper
  const inMyScope = (deptId, leadEmpId, participantIds = []) => {
    if (isClubWide) return true;
    if (isDeptHead) return deptId === myDeptId;
    return leadEmpId === myEmpId || (participantIds || []).includes(myEmpId);
  };

  // 1. Unresolved Conflicts before execution
  const openConflicts = getActiveOpenConflicts(state, isClubWide ? 'ALL' : isDeptHead ? myDeptId : 'ALL').filter(
    (c) => inMyScope(c.departmentId, c.execution?.leadEmployeeId, c.execution?.participatingEmployeeIds)
  );
  if (openConflicts.length > 0) {
    warnings.push({
      id: 'WARN-CONFLICTS',
      severity: 'critical',
      title: `يوجد (${openConflicts.length}) تعارض تشغيلي لم يُعالج قبل التنفيذ`,
      description: `برامج مجدولة تحتوي على تعارضات مفتوحة تحتاج تعديل الوقت/القاعة أو رفع طلب استثناء.`,
      count: openConflicts.length,
      actionLabel: 'عرض ومعالجة التعارضات',
      records: openConflicts,
    });
  }

  // 2. Programs whose date passed without recording execution status
  const pastDueUnrecorded = (state.scheduledExecutions || []).filter(
    (ex) =>
      inMyScope(ex.departmentId, ex.leadEmployeeId, ex.participatingEmployeeIds) &&
      ex.executionDate &&
      ex.executionDate < todayIso &&
      !['منفذ', 'مكتمل', 'مؤجل', 'ملغي', 'ملغى'].includes(ex.status)
  );
  if (pastDueUnrecorded.length > 0) {
    warnings.push({
      id: 'WARN-PAST-UNRECORDED',
      severity: 'critical',
      title: `(${pastDueUnrecorded.length}) برنامج انتهى موعده ولم تُسجل حالته الفعلية`,
      description: 'يرجى توثيق حالة البرنامج (منفذ / مؤجل / ملغي) لضمان دقة مؤشرات الالتزام بالخطة.',
      count: pastDueUnrecorded.length,
      actionLabel: 'تحديث الحالة الآن',
      records: pastDueUnrecorded,
    });
  }

  // 3. Scheduled programs without an assigned lead employee or without a venue
  const missingLeadOrVenue = (state.scheduledExecutions || []).filter(
    (ex) =>
      inMyScope(ex.departmentId, ex.leadEmployeeId, ex.participatingEmployeeIds) &&
      !['ملغي', 'ملغى', 'منفذ'].includes(ex.status) &&
      (!ex.leadEmployeeId || !ex.venueId)
  );
  if (missingLeadOrVenue.length > 0) {
    warnings.push({
      id: 'WARN-MISSING-META',
      severity: 'high',
      title: `(${missingLeadOrVenue.length}) برنامج مجدول ينقصه تحديد المسؤول أو القاعة`,
      description: 'برامج في الجدول التشغيلي تحتاج استكمال تحديد الموظف المسؤول أو القاعة المعتمدة.',
      count: missingLeadOrVenue.length,
      actionLabel: 'استكمال البيانات',
      records: missingLeadOrVenue,
    });
  }

  // 4. Upcoming programs this week not yet scheduled (for Dept Head / Club Director / Admin)
  if (isClubWide || isDeptHead || hasPermission(currentUser, 'schedule_planned_program')) {
    const unscheduledNow = (state.plannedOccurrences || []).filter(
      (o) =>
        (isClubWide || o.departmentId === myDeptId) &&
        Number(o.plannedGlobalWeek) === Number(curW) &&
        !o.linkedExecution
    );
    if (unscheduledNow.length > 0) {
      warnings.push({
        id: 'WARN-THIS-WEEK-UNSCHED',
        severity: 'high',
        title: `(${unscheduledNow.length}) برنامج موعده هذا الأسبوع ولم تتم جدولته بعد`,
        description: `برامج مسجلة في الخطة المعتمدة للأسبوع الحالي (${curW}) بانتظار تحديد اليوم والفترة والمسؤول.`,
        count: unscheduledNow.length,
        actionLabel: 'فتح واستكمال الجدولة',
        records: unscheduledNow,
      });
    }
  }

  // 5. Overdue tasks
  const myScopedOverdueTasks = (state.tasks || []).filter(
    (t) =>
      !['منجزة', 'مكتملة'].includes(t.status) &&
      t.dueDate &&
      t.dueDate < todayIso &&
      (isClubWide || (isDeptHead && t.departmentId === myDeptId) || t.assignedEmployeeId === myEmpId)
  );
  if (myScopedOverdueTasks.length > 0) {
    warnings.push({
      id: 'WARN-OVERDUE-TASKS',
      severity: 'high',
      title: `(${myScopedOverdueTasks.length}) مهمة وظيفية تجاوزت موعد استحقاقها`,
      description: 'مهام مفتوحة تحتاج إنجازًا أو تحديثًا لحالة التنفيذ.',
      count: myScopedOverdueTasks.length,
      actionLabel: 'عرض المهام المتأخرة',
      records: myScopedOverdueTasks,
    });
  }

  // 6. Due evaluations not completed on executed programs
  const evaluatedIds = new Set(
    (evaluations || [])
      .filter((ev) => !ev.isDeleted && ev.targetKind === 'program_execution')
      .map((ev) => ev.targetId)
  );
  const unevaluatedExecs = (state.scheduledExecutions || []).filter(
    (ex) =>
      inMyScope(ex.departmentId, ex.leadEmployeeId, ex.participatingEmployeeIds) &&
      ex.status === 'منفذ' &&
      !evaluatedIds.has(ex.id)
  );
  if (unevaluatedExecs.length > 0) {
    warnings.push({
      id: 'WARN-UNEVALUATED',
      severity: 'medium',
      title: `(${unevaluatedExecs.length}) برنامج منفذ ينتظر استكمال التقييم`,
      description: 'برامج تم توثيق تنفيذها ولم يُسجل لها تقييم في نظام التقييم الشامل بعد.',
      count: unevaluatedExecs.length,
      actionLabel: 'تقييم البرامج المنفذة',
      records: unevaluatedExecs,
    });
  }

  return warnings;
}

// ----------------------------------------------------------------------------
// 7. WHAT CHANGED SINCE LAST LOGIN ("آخر المستجدات" — Req #15)
// ----------------------------------------------------------------------------
export function computeChangesSinceLastLogin({
  state,
  auditLogs = [],
  notifications = [],
  currentUser,
  lastLoginSeenAt = null,
}) {
  if (!currentUser) return [];

  const isClubWide =
    currentUser.isAdmin ||
    currentUser.role === 'full_admin' ||
    currentUser.role === 'club_director' ||
    currentUser.accessScope === 'system' ||
    currentUser.accessScope === 'club';
  const isDeptHead = currentUser.role === 'dept_head' || currentUser.accessScope === 'department';
  const myDeptId = currentUser.departmentId;
  const myEmpId = currentUser.employeeId;

  const items = [];

  // Relevant audit log entries (excluding login/logout noise)
  (auditLogs || [])
    .filter((log) => log.entityType !== 'auth_session')
    .slice(0, 40)
    .forEach((log) => {
      const isNewSinceVisit = lastLoginSeenAt ? log.timestamp > lastLoginSeenAt : true;

      // Determine relevance to user
      let relevant = isClubWide;
      if (!relevant && isDeptHead) {
        const exec = (state.scheduledExecutions || []).find((e) => e.id === log.entityId);
        const req = (state.exceptionRequests || []).find((r) => r.id === log.entityId);
        if (exec?.departmentId === myDeptId || req?.departmentId === myDeptId || log.entityType === 'approved_plan') {
          relevant = true;
        }
      }
      if (!relevant) {
        const exec = (state.scheduledExecutions || []).find((e) => e.id === log.entityId);
        const tsk = (state.tasks || []).find((t) => t.id === log.entityId);
        if (
          exec?.leadEmployeeId === myEmpId ||
          (exec?.participatingEmployeeIds || []).includes(myEmpId) ||
          tsk?.assignedEmployeeId === myEmpId ||
          log.entityType === 'approved_plan' ||
          log.entityType === 'period'
        ) {
          relevant = true;
        }
      }

      if (!relevant) return;

      let routeTarget = 'audit';
      if (log.entityType === 'program_execution') routeTarget = 'detail_execution';
      else if (log.entityType === 'exception_request') routeTarget = 'exceptions';
      else if (log.entityType === 'task') routeTarget = 'dashboard';
      else if (log.entityType === 'supervision') routeTarget = 'supervision';
      else if (log.entityType === 'period') routeTarget = 'master-schedule';
      else if (log.entityType === 'approved_plan') routeTarget = 'monthly-plan';

      items.push({
        id: log.id,
        timestamp: log.timestamp,
        isNewSinceVisit,
        badge: log.actionType || 'تحديث تشغيلي',
        title: log.entityTitle || log.actionType,
        summary: log.summary,
        actorName: log.actorName,
        entityType: log.entityType,
        entityId: log.entityId,
        routeTarget,
      });
    });

  return items.slice(0, 12);
}

// ----------------------------------------------------------------------------
// 8. OPERATIONAL CROWDING FORECAST (Req #16 — توقع الازدحام التشغيلي)
// ----------------------------------------------------------------------------
export function computeCrowdingForecast(state, targetGlobalWeek = null) {
  if (!state) return { slots: [], highDensitySlots: [], weekDates: {}, targetWeek: 46 };

  const targetWeek = Number(targetGlobalWeek || state.meta?.nextGlobalWeek || 46);
  const weekDates = getDatesForGlobalWeek(targetWeek);
  const progPeriods = (state.periods || [])
    .filter((p) => p.category === 'program_period')
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const totalVenues = Math.max(1, (state.venues || []).filter((v) => v.status !== 'غير نشط').length);
  const totalStaff = Math.max(1, (state.employees || []).filter((e) => e.accountStatus !== 'غير نشط').length);
  const scopeMap = Object.fromEntries((state.scopes || []).map((s) => [s.id, s.name]));

  const slots = [];
  const highDensitySlots = [];

  WORK_DAYS_AR.forEach((dayAr) => {
    const dateIso = weekDates[dayAr];
    progPeriods.forEach((period) => {
      const pId = period.id;

      // Weekly fixed lessons in this day/period
      const lessons = (state.weeklyCommitments || []).filter((wc) => {
        if (wc.day !== dayAr || wc.periodId !== pId) return false;
        const ov = state.commitmentOverrides?.[`${wc.id}__${dateIso}`];
        if (ov && (ov.action === 'إلغاء البرنامج لذلك اليوم' || ov.action === 'تعليق التنفيذ لذلك اليوم')) {
          return false;
        }
        return true;
      });

      // Scheduled executions in this day/period (including multi-day programs)
      const execs = (state.scheduledExecutions || []).filter((ex) => {
        if (['ملغي', 'ملغى', 'مرفوض', 'مسودة'].includes(ex.status)) return false;
        const matchDate = ex.executionDate
          ? isDateInExecutionRange(dateIso, dayAr, ex)
          : ex.day === dayAr && Number(ex.executionGlobalWeek || ex.plannedGlobalWeek) === targetWeek;
        if (!matchDate) return false;
        const cov = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
        return cov.includes(pId);
      });

      const venuesUsed = new Set();
      const staffBusy = new Set();
      const scopeCounts = {};

      lessons.forEach((l) => {
        if (l.venueId) venuesUsed.add(l.venueId);
        if (l.leadEmployeeId) staffBusy.add(l.leadEmployeeId);
        (l.participatingEmployeeIds || []).forEach((id) => staffBusy.add(id));
        (l.scopeIds || []).forEach((sid) => {
          scopeCounts[sid] = (scopeCounts[sid] || 0) + 1;
        });
      });

      execs.forEach((ex) => {
        if (ex.venueId) venuesUsed.add(ex.venueId);
        if (ex.leadEmployeeId) staffBusy.add(ex.leadEmployeeId);
        (ex.participatingEmployeeIds || []).forEach((id) => staffBusy.add(id));
        (ex.scopeIds || []).forEach((sid) => {
          scopeCounts[sid] = (scopeCounts[sid] || 0) + 1;
        });
      });

      const overlappingScopes = Object.entries(scopeCounts)
        .filter(([, cnt]) => cnt > 1)
        .map(([sid, cnt]) => `${scopeMap[sid] || sid} (${cnt})`);

      const totalActivities = lessons.length + execs.length;
      const venueRate = Math.round((venuesUsed.size / totalVenues) * 100);
      const staffRate = Math.round((staffBusy.size / totalStaff) * 100);

      let densityLevel = 'normal';
      let densityLabel = 'كثافة طبيعية';
      if (venueRate >= 70 || staffRate >= 65 || totalActivities >= 28 || overlappingScopes.length >= 2) {
        densityLevel = 'high';
        densityLabel = 'كثافة تشغيلية مرتفعة';
      } else if (venueRate >= 45 || staffRate >= 45 || totalActivities >= 18 || overlappingScopes.length >= 1) {
        densityLevel = 'medium';
        densityLabel = 'كثافة متوسطة';
      }

      const slotObj = {
        key: `${dayAr}__${pId}`,
        day: dayAr,
        dateIso,
        periodId: pId,
        periodName: period.name,
        lessonsCount: lessons.length,
        programsCount: execs.length,
        totalActivities,
        venuesCount: venuesUsed.size,
        totalVenues,
        venueRate,
        staffCount: staffBusy.size,
        totalStaff,
        staffRate,
        overlappingScopes,
        densityLevel,
        densityLabel,
        records: [...execs, ...lessons],
      };

      slots.push(slotObj);
      if (densityLevel === 'high') {
        highDensitySlots.push(slotObj);
      }
    });
  });

  return {
    targetWeek,
    weekDates,
    slots,
    highDensitySlots,
  };
}
