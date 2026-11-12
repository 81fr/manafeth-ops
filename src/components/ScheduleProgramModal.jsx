import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Users,
  Layers,
  CheckCircle2,
  Sparkles,
  Send,
  Save,
  ShieldAlert,
  ArrowLeftRight,
  Info,
  Building2,
  Plus,
  Trash2,
  GitBranch,
  UserPlus,
  Search,
  Lock,
} from 'lucide-react';
import { useOps } from '../engine/store';
import {
  WORK_DAYS_AR,
  dateToArabicDay,
  dateToPlanWeekInfo,
  getDatesForGlobalWeek,
  formatTime12Ar,
  computeCoveredPeriods,
  CLOSED_SUBMISSION_WINDOW_MESSAGE,
  expandDatesRange,
  formatDateRangeAr,
} from '../engine/dateUtils';
import {
  detectProgramConflicts,
  getVenuesAvailability,
  generateConflictAlternatives,
  getPeriodTiming,
  getEmployeeDailyChronologicalSchedule,
} from '../engine/conflictEngine';
import { hasPermission, canAccessDepartment, canDeleteEntity } from '../engine/permissions';
import { StatusBadge, PlannedGreenPill } from './StatusBadge';

export default function ScheduleProgramModal({
  isOpen,
  onClose,
  mode = 'schedule_planned',
  occurrence = null,
  execution = null,
  defaultGlobalWeek = null,
  onCompleted = null,
}) {
  const {
    state,
    currentUser,
    submissionWindow,
    activeGlobalWeek,
    scheduleProgramExecution,
    submitExceptionRequest,
    saveStudent,
  } = useOps();

  const targetWeek =
    occurrence?.plannedGlobalWeek ||
    execution?.executionGlobalWeek ||
    defaultGlobalWeek ||
    activeGlobalWeek ||
    state.meta.currentGlobalWeek;

  const weekDates = useMemo(() => getDatesForGlobalWeek(targetWeek), [targetWeek]);

  const programPeriods = useMemo(
    () => state.periods.filter((p) => p.category === 'program_period').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [state.periods]
  );

  const allowedDepartments = useMemo(() => {
    const filtered = state.departments.filter((d) => canAccessDepartment(currentUser, d.id));
    return filtered.length > 0 ? filtered : state.departments;
  }, [state.departments, currentUser]);

  const buildInitialForm = () => {
    const base = execution || occurrence || {};
    const initDay = execution?.day || 'الأحد';
    const initDate = execution?.executionDate || weekDates[initDay] || weekDates['الأحد'] || '2026-11-01';
    const initEndDate = execution?.executionEndDate || initDate;
    const initFromPeriod = execution?.fromPeriodId || execution?.periodId || 'P1';
    const initToPeriod = execution?.toPeriodId || initFromPeriod;
    const cov = computeCoveredPeriods(state.periods, initFromPeriod, initToPeriod);
    const pFirst = getPeriodTiming(state.periods, cov.coveredPeriodIds[0] || initFromPeriod);
    const pLast = getPeriodTiming(
      state.periods,
      cov.coveredPeriodIds[cov.coveredPeriodIds.length - 1] || initToPeriod
    );

    const defaultDeptId =
      base.departmentId ||
      currentUser?.departmentId ||
      allowedDepartments[0]?.id ||
      'dept_tarbawi';

    const deptEmps = state.employees.filter((e) => e.departmentId === defaultDeptId);
    const defaultLeadEmp =
      execution?.leadEmployeeId ||
      deptEmps[0]?.id ||
      currentUser?.employeeId ||
      state.employees[0]?.id ||
      '';

    const initTargetMode =
      execution?.targetMode ||
      (execution?.studentIds?.length && execution?.scopeIds?.length
        ? 'both'
        : execution?.studentIds?.length
        ? 'students'
        : 'scopes');

    return {
      id: mode === 'edit_execution' ? execution?.id : undefined,
      occurrenceId:
        mode === 'clone_program' || mode === 'new_program'
          ? null
          : base.occurrenceId || occurrence?.id || null,
      programId: mode === 'new_program' ? null : base.programId || null,
      clonedFromId: mode === 'clone_program' ? execution?.id || occurrence?.id : null,
      isNewProgram: mode === 'new_program' || mode === 'clone_program',
      programName:
        mode === 'clone_program'
          ? `${base.programName || ''} (نسخة تنفيذية)`
          : base.programName || '',
      departmentId: defaultDeptId,
      strategicGoal: base.strategicGoal || '',
      strategicIndicator: base.strategicIndicator || '',
      initiative: base.initiative || '',
      programType: base.programType || 'برنامج اعتيادي',
      plannedMonth: base.plannedMonth || 11,
      plannedMonthName: base.plannedMonthName || 'نوفمبر (الشهر 11)',
      plannedWeekInMonth: base.plannedWeekInMonth || 1,
      plannedWeekLabel: base.plannedWeekLabel || 'الأسبوع الأول',
      plannedGlobalWeek: base.plannedGlobalWeek || targetWeek,
      executionDate: initDate,
      executionEndDate: initEndDate,
      day: dateToArabicDay(initDate) || initDay,
      periodId: initFromPeriod,
      fromPeriodId: initFromPeriod,
      toPeriodId: initToPeriod,
      startTime: execution?.startTime || cov.startTime || pFirst.start,
      endTime: execution?.endTime || cov.endTime || pLast.end,
      venueId: execution?.venueId || '',
      targetMode: initTargetMode,
      scopeIds: execution?.scopeIds || [],
      studentIds: execution?.studentIds || [],
      leadEmployeeId: defaultLeadEmp,
      participatingEmployeeIds: execution?.participatingEmployeeIds || [],
      subPrograms: (execution?.subPrograms || []).map((sp) => ({
        ...sp,
        executionDate: sp.executionDate || initDate,
        executionEndDate: sp.executionEndDate || sp.executionDate || initEndDate,
      })),
      shiftReason: execution?.shiftReason || '',
      description: execution?.description || '',
      objective: execution?.objective || '',
      requirements: execution?.requirements || '',
      notes: execution?.notes || '',
      sourceFile: base.sourceFile || 'منصة منافذ التشغيلية',
    };
  };

  const [form, setForm] = useState(buildInitialForm);
  const [step, setStep] = useState('schedule');
  const [venueTab, setVenueTab] = useState('available');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Student search & quick add state (Req #28–#29)
  const [studentSearch, setStudentSearch] = useState('');
  const [showNewStudentBox, setShowNewStudentBox] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentScopeId, setNewStudentScopeId] = useState('');

  const [exceptionForm, setExceptionForm] = useState({
    reasonForException: '',
    importanceJustification: '',
    whyCannotChangeTime: '',
    impactOfNonExecution: '',
    proposedConflictSolution: '',
    notes: '',
  });
  const [opinionEmployeeIds, setOpinionEmployeeIds] = useState([]);
  const [approverEmployeeId, setApproverEmployeeId] = useState(
    state.employees.find((e) => e.isApprover)?.id || 'EMP-37'
  );

  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm());
      setStep('schedule');
      setFeedbackMsg('');
      setStudentSearch('');
      setShowNewStudentBox(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, occurrence?.id, execution?.id]);

  // Covered periods computation (Req #20–#21)
  const coveredPeriods = useMemo(
    () => computeCoveredPeriods(state.periods, form.fromPeriodId, form.toPeriodId),
    [state.periods, form.fromPeriodId, form.toPeriodId]
  );

  const coveredPeriodIdsSet = useMemo(
    () => new Set(coveredPeriods.coveredPeriodIds || []),
    [coveredPeriods]
  );

  const execWeekInfo = useMemo(() => dateToPlanWeekInfo(form.executionDate), [form.executionDate]);
  const isMovedFromPlan = Boolean(
    !form.isNewProgram &&
      form.plannedGlobalWeek &&
      execWeekInfo?.globalWeek &&
      Number(form.plannedGlobalWeek) !== Number(execWeekInfo.globalWeek)
  );

  const isWindowBlockedForNew = Boolean(form.isNewProgram && !form.id && submissionWindow && !submissionWindow.isOpen);

  const { availableVenues, occupiedVenues } = useMemo(
    () =>
      getVenuesAvailability(
        {
          day: form.day,
          executionDate: form.executionDate,
          executionEndDate: form.executionEndDate || form.executionDate,
          periodId: form.fromPeriodId,
          fromPeriodId: form.fromPeriodId,
          toPeriodId: form.toPeriodId,
          coveredPeriodIds: coveredPeriods.coveredPeriodIds || [form.fromPeriodId],
          startTime: form.startTime,
          endTime: form.endTime,
          excludeExecId: form.id,
        },
        state
      ),
    [form.day, form.executionDate, form.executionEndDate, form.fromPeriodId, form.toPeriodId, coveredPeriods, form.startTime, form.endTime, form.id, state]
  );

  const coveredDatesList = useMemo(
    () => expandDatesRange(form.executionDate, form.executionEndDate || form.executionDate, { workDaysOnly: true }),
    [form.executionDate, form.executionEndDate]
  );

  useEffect(() => {
    if (!form.venueId && availableVenues.length > 0) {
      setForm((prev) => ({ ...prev, venueId: availableVenues[0].id }));
    }
  }, [availableVenues, form.venueId]);

  // Two-Level Conflict Check (Main + Sub-Programs + Students + 4-Level Behavior)
  const conflictResult = useMemo(() => {
    return detectProgramConflicts(
      {
        ...form,
        coveredPeriodIds: coveredPeriods.coveredPeriodIds || [form.fromPeriodId],
        globalWeek: execWeekInfo?.globalWeek || form.plannedGlobalWeek,
      },
      state
    );
  }, [form, coveredPeriods, execWeekInfo, state]);

  const smartAlternatives = useMemo(() => {
    if (conflictResult.conflicts.length === 0) return [];
    return generateConflictAlternatives(
      {
        ...form,
        coveredPeriodIds: coveredPeriods.coveredPeriodIds || [form.fromPeriodId],
        globalWeek: execWeekInfo?.globalWeek || form.plannedGlobalWeek,
      },
      state,
      conflictResult.conflicts
    );
  }, [form, coveredPeriods, execWeekInfo, state, conflictResult.conflicts]);

  const leadEmployeeSchedule = useMemo(() => {
    if (!form.leadEmployeeId || !form.day) return [];
    return getEmployeeDailyChronologicalSchedule(
      form.leadEmployeeId,
      form.day,
      form.executionDate,
      state
    );
  }, [form.leadEmployeeId, form.day, form.executionDate, state]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim();
    const list = state.students || [];
    if (!q) return list.slice(0, 30);
    return list.filter(
      (s) =>
        s.name.includes(q) ||
        (s.scopeName || '').includes(q) ||
        s.id.toLowerCase().includes(q.toLowerCase())
    );
  }, [state.students, studentSearch]);

  const studentMap = useMemo(
    () => Object.fromEntries((state.students || []).map((s) => [s.id, s])),
    [state.students]
  );

  const openExceptionStep = () => {
    const suggestedOps = new Set();
    let suggestedApprover = state.employees.find((e) => e.isApprover)?.id || 'EMP-37';

    conflictResult.conflicts.forEach((c) => {
      const rule = state.exceptionRoutingRules.find(
        (r) => r.matchType === 'conflict_code' && r.matchValue === c.code
      );
      if (rule) {
        (rule.opinionEmployeeIds || []).forEach((id) => suggestedOps.add(id));
        if (rule.approverEmployeeIds?.[0]) suggestedApprover = rule.approverEmployeeIds[0];
      }
    });

    if (suggestedOps.size === 0) {
      const defRule = state.exceptionRoutingRules.find((r) => r.matchType === 'default');
      (defRule?.opinionEmployeeIds || []).forEach((id) => suggestedOps.add(id));
    }

    setOpinionEmployeeIds(Array.from(suggestedOps));
    setApproverEmployeeId(suggestedApprover);
    setStep('exception');
  };

  if (!isOpen) return null;

  const handleDateChange = (dateVal) => {
    const dAr = dateToArabicDay(dateVal);
    setForm((prev) => {
      const nextEndDate =
        !prev.executionEndDate ||
        prev.executionEndDate === prev.executionDate ||
        prev.executionEndDate < dateVal
          ? dateVal
          : prev.executionEndDate;
      return {
        ...prev,
        executionDate: dateVal,
        executionEndDate: nextEndDate,
        day: dAr || prev.day,
        subPrograms: (prev.subPrograms || []).map((sp) => {
          const spMatchesPrev = !sp.executionDate || sp.executionDate === prev.executionDate;
          if (!spMatchesPrev) return sp;
          const spNextEnd =
            !sp.executionEndDate ||
            sp.executionEndDate === sp.executionDate ||
            sp.executionEndDate < dateVal
              ? dateVal
              : sp.executionEndDate;
          return {
            ...sp,
            executionDate: dateVal,
            executionEndDate: spNextEnd,
            day: dAr || prev.day,
          };
        }),
      };
    });
  };

  const handleEndDateChange = (endVal) => {
    setForm((prev) => {
      const safeEnd = !endVal || endVal < prev.executionDate ? prev.executionDate : endVal;
      return {
        ...prev,
        executionEndDate: safeEnd,
      };
    });
  };

  const handleDayQuickPick = (dayAr) => {
    const iso = weekDates[dayAr];
    setForm((prev) => {
      const nextDate = iso || prev.executionDate;
      const nextEndDate =
        !prev.executionEndDate ||
        prev.executionEndDate === prev.executionDate ||
        prev.executionEndDate < nextDate
          ? nextDate
          : prev.executionEndDate;
      return {
        ...prev,
        day: dayAr,
        executionDate: nextDate,
        executionEndDate: nextEndDate,
        subPrograms: (prev.subPrograms || []).map((sp) =>
          !sp.executionDate || sp.executionDate === prev.executionDate
            ? {
                ...sp,
                executionDate: nextDate,
                executionEndDate:
                  !sp.executionEndDate ||
                  sp.executionEndDate === sp.executionDate ||
                  sp.executionEndDate < nextDate
                    ? nextDate
                    : sp.executionEndDate,
                day: dayAr,
              }
            : sp
        ),
      };
    });
  };

  const handlePeriodRangeChange = (nextFrom, nextTo) => {
    const cov = computeCoveredPeriods(state.periods, nextFrom, nextTo);
    const firstId = cov.coveredPeriodIds[0] || nextFrom;
    const lastId = cov.coveredPeriodIds[cov.coveredPeriodIds.length - 1] || nextTo;
    const pFirst = getPeriodTiming(state.periods, firstId);
    const pLast = getPeriodTiming(state.periods, lastId);
    setForm((prev) => ({
      ...prev,
      periodId: firstId,
      fromPeriodId: cov.fromPeriodId || nextFrom,
      toPeriodId: cov.toPeriodId || nextTo,
      startTime: cov.startTime || pFirst.start,
      endTime: cov.endTime || pLast.end,
    }));
  };

  const toggleScope = (scopeId) => {
    setForm((prev) => {
      const exists = prev.scopeIds.includes(scopeId);
      return {
        ...prev,
        scopeIds: exists ? prev.scopeIds.filter((x) => x !== scopeId) : [...prev.scopeIds, scopeId],
      };
    });
  };

  const toggleStudent = (studentId) => {
    setForm((prev) => {
      const exists = (prev.studentIds || []).includes(studentId);
      return {
        ...prev,
        studentIds: exists
          ? prev.studentIds.filter((id) => id !== studentId)
          : [...(prev.studentIds || []), studentId], // duplicate-safe
      };
    });
  };

  const handleQuickAddStudent = () => {
    if (!newStudentName.trim()) return;
    const created = saveStudent({
      name: newStudentName.trim(),
      scopeId: newStudentScopeId || state.scopes[0]?.id || '',
    });
    if (created?.id) {
      setForm((prev) => ({
        ...prev,
        studentIds: prev.studentIds.includes(created.id) ? prev.studentIds : [...prev.studentIds, created.id],
      }));
      setNewStudentName('');
      setShowNewStudentBox(false);
    }
  };

  const toggleParticipant = (empId) => {
    setForm((prev) => {
      const exists = prev.participatingEmployeeIds.includes(empId);
      return {
        ...prev,
        participatingEmployeeIds: exists
          ? prev.participatingEmployeeIds.filter((x) => x !== empId)
          : [...prev.participatingEmployeeIds, empId],
      };
    });
  };

  // Hierarchical Sub-Programs Handlers (Req #17–#22) + Multi-Day Date Range per Sub-Program
  const addSubProgramRow = (presetName = '') => {
    const pT = getPeriodTiming(state.periods, form.fromPeriodId);
    const newSub = {
      id: `SUB-NEW-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      isUnsaved: true,
      name: presetName,
      executionDate: form.executionDate,
      executionEndDate: form.executionEndDate || form.executionDate,
      day: form.day,
      fromPeriodId: form.fromPeriodId,
      toPeriodId: form.fromPeriodId,
      startTime: pT.start,
      endTime: pT.end,
      leadEmployeeId: form.leadEmployeeId,
      venueId: form.venueId,
      scopeIds: form.scopeIds,
      studentIds: form.studentIds,
      notes: '',
    };
    setForm((prev) => ({
      ...prev,
      subPrograms: [...(prev.subPrograms || []), newSub],
    }));
  };

  const addStandardStageSubPrograms = () => {
    const stages = ['الاستعداد والتجهيز', 'استقبال الطلاب', 'العرض الرئيسي', 'التكريم', 'الختام'];
    const pIds =
      coveredPeriods.coveredPeriodIds?.length > 0
        ? coveredPeriods.coveredPeriodIds
        : [form.fromPeriodId];
    const generated = stages.map((stName, idx) => {
      const pid = pIds[Math.min(idx, pIds.length - 1)] || form.fromPeriodId;
      const pT = getPeriodTiming(state.periods, pid);
      return {
        id: `SUB-TPL-${Date.now()}-${idx}`,
        isUnsaved: true,
        name: stName,
        executionDate: form.executionDate,
        executionEndDate: form.executionEndDate || form.executionDate,
        day: form.day,
        fromPeriodId: pid,
        toPeriodId: pid,
        startTime: pT.start,
        endTime: pT.end,
        leadEmployeeId: form.leadEmployeeId,
        venueId: form.venueId,
        scopeIds: form.scopeIds,
        studentIds: form.studentIds,
        notes: '',
      };
    });
    setForm((prev) => ({
      ...prev,
      subPrograms: [...(prev.subPrograms || []), ...generated],
    }));
  };

  const updateSubProgramRow = (subId, patch) => {
    setForm((prev) => ({
      ...prev,
      subPrograms: (prev.subPrograms || []).map((sp) => {
        if (sp.id !== subId) return sp;
        const next = { ...sp, ...patch };
        if (patch.executionDate !== undefined) {
          const dAr = dateToArabicDay(patch.executionDate);
          next.day = dAr || sp.day;
          if (
            !sp.executionEndDate ||
            sp.executionEndDate === sp.executionDate ||
            sp.executionEndDate < patch.executionDate
          ) {
            next.executionEndDate = patch.executionDate;
          }
        }
        if (patch.executionEndDate !== undefined) {
          const baseStart = next.executionDate || prev.executionDate;
          next.executionEndDate =
            !patch.executionEndDate || patch.executionEndDate < baseStart ? baseStart : patch.executionEndDate;
        }
        if (patch.fromPeriodId || patch.toPeriodId) {
          const fId = patch.fromPeriodId || sp.fromPeriodId || 'P1';
          const tId = patch.toPeriodId || sp.toPeriodId || fId;
          const cov = computeCoveredPeriods(state.periods, fId, tId);
          const first = getPeriodTiming(state.periods, cov.coveredPeriodIds[0] || fId);
          const last = getPeriodTiming(
            state.periods,
            cov.coveredPeriodIds[cov.coveredPeriodIds.length - 1] || tId
          );
          next.startTime = cov.startTime || first.start;
          next.endTime = cov.endTime || last.end;
        }
        return next;
      }),
    }));
  };

  const removeSubProgramRow = (subObj) => {
    if (!subObj.isUnsaved && !canDeleteEntity(currentUser, 'subprogram', form.departmentId)) {
      setFeedbackMsg('ليس لديك صلاحية حذف فقرة فرعية محفوظة مسبقًا.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      subPrograms: (prev.subPrograms || []).filter((sp) => sp.id !== subObj.id),
    }));
  };

  const applyAlternative = (alt) => {
    const changes = { ...alt.changes };
    if (changes.periodId) {
      changes.fromPeriodId = changes.periodId;
      changes.toPeriodId = changes.periodId;
    }
    setForm((prev) => ({
      ...prev,
      ...changes,
    }));
    setFeedbackMsg(`تم تطبيق البديل الذكي: ${alt.label}`);
  };

  const handleDirectSave = async (saveAsDraft = false) => {
    if (isWindowBlockedForNew) {
      setFeedbackMsg(CLOSED_SUBMISSION_WINDOW_MESSAGE);
      return;
    }
    if (!form.programName.trim()) {
      setFeedbackMsg('يرجى إدخال اسم البرنامج أو النشاط.');
      return;
    }
    if (!form.leadEmployeeId) {
      setFeedbackMsg('يرجى اختيار الموظف المسؤول عن التنفيذ.');
      return;
    }
    if (!form.venueId) {
      setFeedbackMsg('يرجى تحديد القاعة أو الموقع.');
      return;
    }
    if (isMovedFromPlan && !form.shiftReason.trim() && !saveAsDraft) {
      setFeedbackMsg('نظراً لاختلاف تاريخ التنفيذ عن الأسبوع الأخضر المخطط، يرجى كتابة سبب نقل الموعد لحفظه في السجل.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        scopeIds: form.targetMode === 'students' ? [] : form.scopeIds,
        studentIds: form.targetMode === 'scopes' ? [] : form.studentIds,
      };
      const res = await scheduleProgramExecution(payload, { saveAsDraft });
      if (res && res.ok === false) {
        setFeedbackMsg(res.error || CLOSED_SUBMISSION_WINDOW_MESSAGE);
        return;
      }
      if (onCompleted) onCompleted(res);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleExceptionSubmit = async (e) => {
    e.preventDefault();
    if (isWindowBlockedForNew) {
      setFeedbackMsg(CLOSED_SUBMISSION_WINDOW_MESSAGE);
      return;
    }
    if (!exceptionForm.reasonForException.trim() || !exceptionForm.importanceJustification.trim()) {
      setFeedbackMsg('يرجى تعبئة سبب طلب الاستثناء ومبرر أهمية إقامة النشاط.');
      return;
    }
    if (opinionEmployeeIds.length === 0) {
      setFeedbackMsg('يرجى تحديد شخص واحد على الأقل لإبداء الرأي قبل الاعتماد.');
      return;
    }
    setSaving(true);
    try {
      const res = await submitExceptionRequest({
        executionDraft: {
          ...form,
          scopeIds: form.targetMode === 'students' ? [] : form.scopeIds,
          studentIds: form.targetMode === 'scopes' ? [] : form.studentIds,
        },
        conflicts: conflictResult.conflicts,
        exceptionForm,
        opinionEmployeeIds,
        approverEmployeeId,
      });
      if (res && res.ok === false) {
        setFeedbackMsg(res.error || CLOSED_SUBMISSION_WINDOW_MESSAGE);
        return;
      }
      if (onCompleted) onCompleted({ exceptionRecord: res.exceptionRecord || res });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const isPlannedReadOnly = mode === 'schedule_planned';
  const canCreateSub = hasPermission(currentUser, 'create_subprogram') || hasPermission(currentUser, 'edit_program');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--brand-ink)' }}>
                {step === 'exception'
                  ? 'رفع طلب استثناء إلكتروني (نقل تلقائي للبيانات والتعارضات)'
                  : mode === 'new_program'
                  ? 'إضافة وجدولة برنامج تنفيذي جديد'
                  : mode === 'clone_program'
                  ? 'نسخ برنامج سابق إلى موعد أو فئة جديدة'
                  : mode === 'edit_execution'
                  ? 'تعديل الجدولة التنفيذية للبرنامج'
                  : 'جدولة التنفيذ لبرنامج مخطط مسبقًا'}
              </h2>
              {form.plannedGlobalWeek && !form.isNewProgram && (
                <PlannedGreenPill
                  monthName={form.plannedMonthName}
                  weekLabel={form.plannedWeekLabel}
                  globalWeek={form.plannedGlobalWeek}
                />
              )}
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
              {step === 'exception'
                ? 'تم نقل جميع بيانات البرنامج والفقرات والتعارضات آليًا دون إعادة كتابة — أكمل مبررات الاستثناء وحدد أصحاب الرأي فقط.'
                : 'يدعم النظام نطاق الفترات المتعددة، الفقرات الفرعية الهرمية (↳)، استهداف فئة أو طلاب محددين، والفحص المزدوج للتعارضات.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="إغلاق">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Monthly Day 1–15 Submission Window Status Banner for Brand-New Programs (Req #31–#35) */}
          {form.isNewProgram && !form.id && (
            <div
              className={`alert-banner ${isWindowBlockedForNew ? 'danger' : 'teal'}`}
              style={{
                marginBottom: '0.9rem',
                background: isWindowBlockedForNew ? '#fef2f2' : undefined,
                borderColor: isWindowBlockedForNew ? '#fca5a5' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.82rem', color: isWindowBlockedForNew ? '#b91c1c' : undefined }}>
                {isWindowBlockedForNew ? <Lock size={17} color="#b91c1c" /> : <Calendar size={16} color="var(--brand-teal)" />}
                <span>
                  {isWindowBlockedForNew
                    ? CLOSED_SUBMISSION_WINDOW_MESSAGE
                    : `فترة رفع البرامج الجديدة متاحة حاليًا (اليوم ${submissionWindow?.dayOfMonth || ''} من الشهر — المسموح من 1 إلى 15 من كل شهر).`}
                </span>
              </div>
            </div>
          )}

          {feedbackMsg && (
            <div className="alert-banner warn" style={{ marginBottom: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.82rem' }}>
                <Info size={16} />
                <span>{feedbackMsg}</span>
              </div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setFeedbackMsg('')}>
                إخفاء
              </button>
            </div>
          )}

          {step === 'schedule' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* Section 1: Planned Metadata or Basic Program Info */}
              {isPlannedReadOnly ? (
                <div
                  style={{
                    background: 'linear-gradient(90deg, rgba(0,165,155,0.07), rgba(140,194,64,0.08))',
                    border: '1px solid rgba(0,165,155,0.25)',
                    borderRadius: 12,
                    padding: '0.85rem 1rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>اسم البرنامج (من الخطة المعتمدة)</div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--brand-ink)' }}>{form.programName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>القسم والمبادرة</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                      {state.departments.find((d) => d.id === form.departmentId)?.name} — {form.initiative || 'عام'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>المؤشر الاستراتيجي</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{form.strategicIndicator || '—'}</div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: '1rem' }}>
                  <div className="card-title" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                    <Building2 size={16} color="var(--brand-teal)" />
                    <span>بيانات البرنامج الرئيسي الأساسية</span>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">اسم البرنامج / النشاط الرئيسي *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={form.programName}
                        onChange={(e) => setForm({ ...form, programName: e.target.value })}
                        placeholder="مثال: إقامة مسرح للطلاب"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">القسم المسؤول *</label>
                      <select
                        className="form-select"
                        value={form.departmentId}
                        onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                      >
                        {allowedDepartments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">نوع البرنامج *</label>
                      <select
                        className="form-select"
                        value={form.programType}
                        onChange={(e) => setForm({ ...form, programType: e.target.value })}
                      >
                        {state.programTypes.map((pt) => {
                          const ptName = typeof pt === 'object' ? pt.name : pt;
                          return (
                            <option key={pt.id || ptName} value={ptName}>
                              {ptName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">المبادرة المرتبطة</label>
                      <input
                        type="text"
                        className="form-input"
                        value={form.initiative}
                        onChange={(e) => setForm({ ...form, initiative: e.target.value })}
                        placeholder="اسم المبادرة"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">المؤشر الاستراتيجي</label>
                      <input
                        type="text"
                        className="form-input"
                        value={form.strategicIndicator}
                        onChange={(e) => setForm({ ...form, strategicIndicator: e.target.value })}
                        placeholder="المؤشر المرتبط"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 2: Date Range (من تاريخ -> إلى تاريخ), Day, Multi-Period Range (من الفترة -> إلى الفترة) & Time */}
              <div className="card" style={{ padding: '1rem' }}>
                <div className="card-header" style={{ marginBottom: '0.7rem' }}>
                  <div className="card-title" style={{ fontSize: '0.9rem' }}>
                    <Calendar size={16} color="var(--brand-teal)" />
                    <span>تحديد نطاق التاريخ (من تاريخ — إلى تاريخ) ونطاق الفترات</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {WORK_DAYS_AR.map((dAr) => (
                      <button
                        key={dAr}
                        type="button"
                        className={`btn btn-sm ${form.day === dAr ? 'btn-teal' : 'btn-secondary'}`}
                        onClick={() => handleDayQuickPick(dAr)}
                      >
                        {dAr} ({weekDates[dAr]?.slice(5)})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))' }}>
                  <div className="form-group">
                    <label className="form-label">من تاريخ (بداية التنفيذ) *</label>
                    <input
                      type="date"
                      className="form-input"
                      data-testid="main-from-date"
                      value={form.executionDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">إلى تاريخ (نهاية التنفيذ) *</label>
                    <input
                      type="date"
                      className="form-input"
                      data-testid="main-to-date"
                      min={form.executionDate}
                      value={form.executionEndDate || form.executionDate}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">من الفترة *</label>
                    <select
                      className="form-select"
                      value={form.fromPeriodId}
                      onChange={(e) => {
                        const nextFrom = e.target.value;
                        const fromOrd = state.periods.find((p) => p.id === nextFrom)?.order || 0;
                        const toOrd = state.periods.find((p) => p.id === form.toPeriodId)?.order || 0;
                        handlePeriodRangeChange(nextFrom, toOrd < fromOrd ? nextFrom : form.toPeriodId);
                      }}
                    >
                      {programPeriods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatTime12Ar(p.approvedStart)} - {formatTime12Ar(p.approvedEnd)})
                        </option>
                      ))}
                      <optgroup label="أوقات أخرى">
                        {state.periods
                          .filter((p) => p.category === 'fixed_event')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatTime12Ar(p.approvedStart)} - {formatTime12Ar(p.approvedEnd)})
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">إلى الفترة *</label>
                    <select
                      className="form-select"
                      value={form.toPeriodId}
                      onChange={(e) => handlePeriodRangeChange(form.fromPeriodId, e.target.value)}
                    >
                      {programPeriods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatTime12Ar(p.approvedStart)} - {formatTime12Ar(p.approvedEnd)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">وقت البداية والنهاية</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <input
                        type="time"
                        className="form-input"
                        value={form.startTime}
                        onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      />
                      <input
                        type="time"
                        className="form-input"
                        value={form.endTime}
                        onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Multi-Day Date Range Summary Strip */}
                {form.executionEndDate && form.executionEndDate > form.executionDate && (
                  <div
                    style={{
                      marginTop: '0.65rem',
                      padding: '0.5rem 0.85rem',
                      borderRadius: 10,
                      background: 'rgba(124, 58, 237, 0.08)',
                      border: '1px solid rgba(124, 58, 237, 0.28)',
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.55rem',
                      fontSize: '0.78rem',
                    }}
                  >
                    <strong style={{ color: '#6d28d9' }}>
                      يمتد البرنامج على مدى ({coveredDatesList.length} أيام تشغيلية):
                    </strong>
                    {coveredDatesList.map((dItem) => (
                      <span
                        key={dItem.date}
                        style={{
                          padding: '2px 9px',
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: '0.73rem',
                          background: '#fff',
                          color: '#5b21b6',
                          border: '1px solid rgba(124, 58, 237, 0.35)',
                        }}
                      >
                        {dItem.day} ({dItem.date})
                      </span>
                    ))}
                  </div>
                )}

                {/* Visual Covered Periods Checkmarks Strip (Req #21) */}
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.55rem 0.85rem',
                    borderRadius: 10,
                    background: 'rgba(0,165,155,0.08)',
                    border: '1px solid rgba(0,165,155,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.65rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <strong style={{ color: 'var(--brand-ink)' }}>الفترات المشمولة:</strong>
                  {programPeriods.map((p) => {
                    const checked = coveredPeriodIdsSet.has(p.id);
                    const shortLabel = p.name.replace('الفترة ', '');
                    return (
                      <span
                        key={p.id}
                        style={{
                          padding: '3px 11px',
                          borderRadius: 999,
                          fontWeight: 800,
                          fontSize: '0.76rem',
                          background: checked ? '#00A59B' : 'var(--card-bg)',
                          color: checked ? '#fff' : 'var(--text-muted)',
                          border: checked ? '1px solid #00A59B' : '1px solid var(--border)',
                        }}
                      >
                        {checked ? `✓ ${shortLabel}` : `○ ${shortLabel}`}
                      </span>
                    );
                  })}
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
                    إجمالي التغطية: {formatTime12Ar(form.startTime)} — {formatTime12Ar(form.endTime)}
                  </span>
                </div>

                {isMovedFromPlan && (
                  <div className="alert-banner warn" style={{ marginTop: '0.8rem', marginBottom: 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowLeftRight size={15} />
                        <span>
                          تنبيه نقل موعد عن الخطة الأصلية ({form.plannedMonthName} — {form.plannedWeekLabel}). سيتم حفظ الخطة الأصلية وتسجيل سبب النقل:
                        </span>
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        style={{ marginTop: 6, background: '#fff' }}
                        placeholder="اكتب سبب تقديم أو تأخير البرنامج عن أسبوعه المخطط *"
                        value={form.shiftReason}
                        onChange={(e) => setForm({ ...form, shiftReason: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Employees, Target Audience (Scopes OR Specific Students — Req #28–#30), and Venues */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Users size={15} color="var(--brand-teal)" />
                      <span>الموظف المسؤول عن التنفيذ *</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.leadEmployeeId}
                      onChange={(e) => setForm({ ...form, leadEmployeeId: e.target.value })}
                    >
                      <option value="">-- اختر الموظف المسؤول --</option>
                      {state.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} — {emp.departmentName} ({emp.jobTitle})
                        </option>
                      ))}
                    </select>
                  </div>

                  {form.leadEmployeeId && (
                    <div
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '0.55rem 0.75rem',
                        fontSize: '0.74rem',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--brand-ink)', marginBottom: 4 }}>
                        جدول الموظف المختار يوم {form.day} ({leadEmployeeSchedule.length}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {leadEmployeeSchedule.map((it) => (
                          <span
                            key={it.id}
                            className={`status-badge ${coveredPeriodIdsSet.has(it.periodId) ? 'badge-conflict' : 'badge-muted'}`}
                            style={{ fontSize: '0.67rem' }}
                          >
                            {it.periodName}: {it.title} ({it.location})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">الموظفون المشاركون (اختياري)</label>
                    <div
                      style={{
                        maxHeight: 90,
                        overflowY: 'auto',
                        border: '1px solid var(--border)',
                        borderRadius: 9,
                        padding: '0.45rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 5,
                      }}
                    >
                      {state.employees
                        .filter((e) => e.id !== form.leadEmployeeId)
                        .map((emp) => {
                          const active = form.participatingEmployeeIds.includes(emp.id);
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => toggleParticipant(emp.id)}
                              className={`btn btn-sm ${active ? 'btn-teal' : 'btn-secondary'}`}
                              style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            >
                              {emp.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Target Audience Mode Selector: Scopes vs Specific Students (Req #28–#30) */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Layers size={15} color="var(--brand-teal)" />
                        <span>الفئة المستهدفة أو الطلاب المحددون</span>
                      </label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[
                          { k: 'scopes', lbl: 'نطاق أو فئة' },
                          { k: 'students', lbl: 'طلاب محددون' },
                          { k: 'both', lbl: 'فئة + طلاب' },
                        ].map((m) => (
                          <button
                            key={m.k}
                            type="button"
                            className={`btn btn-sm ${form.targetMode === m.k ? 'btn-teal' : 'btn-secondary'}`}
                            style={{ padding: '2px 8px', fontSize: '0.71rem' }}
                            onClick={() => setForm({ ...form, targetMode: m.k })}
                          >
                            {m.lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(form.targetMode === 'scopes' || form.targetMode === 'both') && (
                      <div
                        style={{
                          maxHeight: 115,
                          overflowY: 'auto',
                          border: '1px solid var(--border)',
                          borderRadius: 9,
                          padding: '0.45rem',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 5,
                          marginBottom: form.targetMode === 'both' ? 8 : 0,
                        }}
                      >
                        {state.scopes.map((sc) => {
                          const selected = form.scopeIds.includes(sc.id);
                          return (
                            <button
                              key={sc.id}
                              type="button"
                              onClick={() => toggleScope(sc.id)}
                              className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ padding: '3px 9px', fontSize: '0.71rem' }}
                            >
                              {sc.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {(form.targetMode === 'students' || form.targetMode === 'both') && (
                      <div
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: '0.6rem',
                          background: 'var(--bg)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={14} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                              type="text"
                              className="form-input"
                              style={{ paddingRight: 28, fontSize: '0.76rem', height: 32 }}
                              placeholder="ابحث عن طالب بالاسم أو الفئة من قاعدة البيانات..."
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => setShowNewStudentBox((v) => !v)}
                            title="تسجيل طالب جديد في قاعدة البيانات"
                          >
                            <UserPlus size={14} />
                            <span>+ طالب</span>
                          </button>
                        </div>

                        {showNewStudentBox && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr auto', gap: 5, marginBottom: 6, padding: 6, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <input
                              type="text"
                              className="form-input"
                              style={{ height: 30, fontSize: '0.75rem' }}
                              placeholder="اسم الطالب الثلاثي *"
                              value={newStudentName}
                              onChange={(e) => setNewStudentName(e.target.value)}
                            />
                            <select
                              className="form-select"
                              style={{ height: 30, fontSize: '0.74rem' }}
                              value={newStudentScopeId}
                              onChange={(e) => setNewStudentScopeId(e.target.value)}
                            >
                              <option value="">اختر النطاق</option>
                              {state.scopes.map((sc) => (
                                <option key={sc.id} value={sc.id}>
                                  {sc.name}
                                </option>
                              ))}
                            </select>
                            <button type="button" className="btn btn-sm btn-teal" onClick={handleQuickAddStudent}>
                              إضافة
                            </button>
                          </div>
                        )}

                        {/* Selected Students Chips */}
                        {form.studentIds?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                            {form.studentIds.map((sid) => {
                              const st = studentMap[sid];
                              return (
                                <span
                                  key={sid}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    background: '#00A59B',
                                    color: '#fff',
                                    borderRadius: 999,
                                    padding: '2px 9px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  <span>{st?.name || sid}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleStudent(sid)}
                                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                                    title="حذف الطالب من القائمة"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {filteredStudents.map((st) => {
                            const isSel = (form.studentIds || []).includes(st.id);
                            return (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => toggleStudent(st.id)}
                                className={`btn btn-sm ${isSel ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                              >
                                {isSel ? '✓ ' : '+ '}
                                {st.name} ({st.scopeName})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Venues Split: Available vs Occupied */}
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="card-title" style={{ fontSize: '0.9rem' }}>
                      <MapPin size={16} color="var(--brand-teal)" />
                      <span>القاعات والمواقع ({form.day})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${venueTab === 'available' ? 'btn-teal' : 'btn-secondary'}`}
                        onClick={() => setVenueTab('available')}
                      >
                        المتاحة ({availableVenues.length})
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${venueTab === 'occupied' ? 'btn-danger' : 'btn-secondary'}`}
                        onClick={() => setVenueTab('occupied')}
                      >
                        المشغولة ({occupiedVenues.length})
                      </button>
                    </div>
                  </div>

                  {venueTab === 'available' ? (
                    <div
                      style={{
                        maxHeight: 245,
                        overflowY: 'auto',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: 6,
                      }}
                    >
                      {availableVenues.map((v) => {
                        const active = form.venueId === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setForm({ ...form, venueId: v.id })}
                            style={{
                              textAlign: 'right',
                              padding: '0.5rem 0.65rem',
                              borderRadius: 10,
                              border: active ? '2px solid var(--brand-teal)' : '1px solid var(--border)',
                              background: active ? 'rgba(0,165,155,0.1)' : 'var(--bg)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--brand-ink)' }}>{v.name}</div>
                            <div style={{ fontSize: '0.67rem', color: 'var(--brand-teal)', fontWeight: 700 }}>{v.type}</div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ maxHeight: 245, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {occupiedVenues.map(({ venue, occupancies }) => {
                        const active = form.venueId === venue.id;
                        return (
                          <div
                            key={venue.id}
                            onClick={() => setForm({ ...form, venueId: venue.id })}
                            style={{
                              padding: '0.55rem 0.75rem',
                              borderRadius: 10,
                              border: active ? '2px solid #ef4444' : '1px solid #fecaca',
                              background: active ? 'rgba(239,68,68,0.12)' : 'var(--conflict-bg)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--conflict-text)' }}>
                              {venue.name} (مشغولة — انقر في حال طلب استثناء)
                            </div>
                            {occupancies.map((occ, idx) => (
                              <div key={idx} style={{ fontSize: '0.72rem', color: 'var(--text)', marginTop: 2 }}>
                                • {occ.programName} ({occ.departmentName}) | {occ.timeRange}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 'auto' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="هدف البرنامج المختصر / الوصف"
                      value={form.objective}
                      onChange={(e) => setForm({ ...form, objective: e.target.value })}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="المتطلبات التشغيلية أو ملاحظات"
                      value={form.requirements}
                      onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 3.5: Unlimited Hierarchical Sub-Programs Builder (↳ الفقرات والبرامج الفرعية — Req #17–#22) */}
              <div className="card" style={{ padding: '1rem', borderStyle: 'dashed', borderColor: 'rgba(0,165,155,0.45)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '0.65rem' }}>
                  <div>
                    <div className="card-title" style={{ fontSize: '0.9rem' }}>
                      <GitBranch size={16} color="var(--brand-teal)" />
                      <span>الفقرات والبرامج الفرعية التابعة للبرنامج الرئيسي (↳ عدد غير محدود: {(form.subPrograms || []).length})</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      يمكن تقسيم البرنامج الرئيسي إلى فقرات متتابعة أو متوازية (استعداد، استقبال، عرض، تكريم، ختام) ويتم فحص تعارض كل فقرة آليًا.
                    </div>
                  </div>
                  {canCreateSub && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(form.subPrograms || []).length === 0 && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={addStandardStageSubPrograms}>
                          <Sparkles size={13} />
                          <span>إدراج فقرات قياسية (5 فقرات)</span>
                        </button>
                      )}
                      {(form.subPrograms || []).length > 0 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => setForm((f) => ({ ...f, subPrograms: [] }))}
                        >
                          <Trash2 size={13} />
                          <span>حذف كل الفقرات ({(form.subPrograms || []).length})</span>
                        </button>
                      )}
                      <button type="button" className="btn btn-sm btn-teal" onClick={() => addSubProgramRow('')}>
                        <Plus size={14} />
                        <span>إضافة فقرة / برنامج فرعي (↳)</span>
                      </button>
                    </div>
                  )}
                </div>

                {(form.subPrograms || []).length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.45rem 0' }}>
                    لا توجد فقرات فرعية مضافة حاليًا (اختياري — انقر «إضافة فقرة / برنامج فرعي» لتفصيل مراحل التنفيذ وتحديد تاريخ من وإلى لكل فقرة).
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {(form.subPrograms || []).map((sp, idx) => {
                      const spStart = sp.executionDate || form.executionDate;
                      const spEnd = sp.executionEndDate || spStart;
                      const spMultiDay = spEnd > spStart;
                      return (
                        <div
                          key={sp.id}
                          style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRight: '4px solid var(--brand-teal)',
                            borderRadius: 10,
                            padding: '0.7rem 0.85rem',
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 6, alignItems: 'end' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>↳ اسم الفقرة / البرنامج الفرعي #{idx + 1} *</label>
                              <input
                                type="text"
                                className="form-input"
                                style={{ height: 34, fontSize: '0.79rem' }}
                                placeholder="مثال: العرض المسرحي"
                                value={sp.name}
                                onChange={(e) => updateSubProgramRow(sp.id, { name: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>من تاريخ *</label>
                              <input
                                type="date"
                                className="form-input"
                                data-testid={`sub-from-date-${idx}`}
                                style={{ height: 34, fontSize: '0.75rem' }}
                                value={spStart}
                                onChange={(e) => updateSubProgramRow(sp.id, { executionDate: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>إلى تاريخ *</label>
                              <input
                                type="date"
                                className="form-input"
                                data-testid={`sub-to-date-${idx}`}
                                style={{ height: 34, fontSize: '0.75rem' }}
                                min={spStart}
                                value={spEnd}
                                onChange={(e) => updateSubProgramRow(sp.id, { executionEndDate: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>الفترة</label>
                              <select
                                className="form-select"
                                style={{ height: 34, fontSize: '0.76rem' }}
                                value={sp.fromPeriodId || form.fromPeriodId}
                                onChange={(e) =>
                                  updateSubProgramRow(sp.id, {
                                    fromPeriodId: e.target.value,
                                    toPeriodId: e.target.value,
                                  })
                                }
                              >
                                {programPeriods.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>من وقت</label>
                              <input
                                type="time"
                                className="form-input"
                                style={{ height: 34, fontSize: '0.76rem' }}
                                value={sp.startTime}
                                onChange={(e) => updateSubProgramRow(sp.id, { startTime: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>إلى وقت</label>
                              <input
                                type="time"
                                className="form-input"
                                style={{ height: 34, fontSize: '0.76rem' }}
                                value={sp.endTime}
                                onChange={(e) => updateSubProgramRow(sp.id, { endTime: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.7rem' }}>المسؤول عن الفقرة</label>
                              <select
                                className="form-select"
                                style={{ height: 34, fontSize: '0.75rem' }}
                                value={sp.leadEmployeeId || form.leadEmployeeId}
                                onChange={(e) => updateSubProgramRow(sp.id, { leadEmployeeId: e.target.value })}
                              >
                                {state.employees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'end' }}>
                              <div style={{ flex: 1 }}>
                                <label className="form-label" style={{ fontSize: '0.7rem' }}>القاعة / الموقع</label>
                                <select
                                  className="form-select"
                                  style={{ height: 34, fontSize: '0.75rem' }}
                                  value={sp.venueId || form.venueId}
                                  onChange={(e) => updateSubProgramRow(sp.id, { venueId: e.target.value })}
                                >
                                  <option value="">نفس قاعة الرئيسي</option>
                                  {state.venues.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {(sp.isUnsaved || canDeleteEntity(currentUser, 'subprogram', form.departmentId)) && (
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ color: '#dc2626', height: 34, width: 34, flexShrink: 0 }}
                                  onClick={() => removeSubProgramRow(sp)}
                                  title="حذف الفقرة الفرعية"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                          {spMultiDay && (
                            <div style={{ marginTop: 5, fontSize: '0.71rem', color: '#6d28d9', fontWeight: 700 }}>
                              📅 تمتد هذه الفقرة الفرعية: {formatDateRangeAr(spStart, spEnd, { compact: true })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 4: Two-Level Conflict Engine Result + Smart Alternatives (Req #23–#27, #30) */}
              <div
                className="card"
                style={{
                  borderColor: conflictResult.conflicts.length === 0 ? 'var(--brand-teal)' : '#ef4444',
                  background:
                    conflictResult.conflicts.length === 0
                      ? 'rgba(0, 165, 155, 0.05)'
                      : 'rgba(239, 68, 68, 0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {conflictResult.conflicts.length === 0 ? (
                      <CheckCircle2 size={20} color="var(--brand-teal)" />
                    ) : (
                      <ShieldAlert size={20} color="#dc2626" />
                    )}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                        نتيجة الفحص الآلي للبرنامج الرئيسي والفقرات الفرعية:{' '}
                        <StatusBadge status={conflictResult.overallLevel} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {conflictResult.conflicts.length === 0
                          ? 'جميع العناصر والفقرات والطلاب والقاعات سليمة — جاهز للاعتماد المباشر.'
                          : `تم رصد (${conflictResult.conflicts.length}) ملاحظات/تعارضات (حاجبة: ${conflictResult.blockingConflicts.length} | تنبيهية: ${conflictResult.advisoryConflicts.length}).`}
                      </div>
                    </div>
                  </div>
                </div>

                {conflictResult.conflicts.length > 0 && (
                  <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {conflictResult.conflicts.map((cnf) => (
                      <div
                        key={cnf.id}
                        style={{
                          background: 'var(--card-bg)',
                          border: `1px solid ${cnf.blocksApproval ? '#fca5a5' : '#fde68a'}`,
                          borderRadius: 10,
                          padding: '0.65rem 0.85rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ color: cnf.blocksApproval ? '#b91c1c' : '#b45309' }}>{cnf.typeLabel}</strong>
                            {cnf.isSubProgramConflict && (
                              <span className="status-badge badge-exception" style={{ fontSize: '0.69rem' }}>
                                ↳ التعارض داخل الفقرة الفرعية: {cnf.subProgramName}
                              </span>
                            )}
                          </div>
                          <StatusBadge status={cnf.severity} size="sm" />
                        </div>
                        <div style={{ color: 'var(--text)', marginBottom: 4 }}>{cnf.reason}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <span>البرنامج الرئيسي: <strong>{cnf.mainProgramName || cnf.proposedProgram}</strong></span>
                          {cnf.subProgramName && <span>الفقرة الفرعية: <strong>{cnf.subProgramName}</strong></span>}
                          <span>الالتزام القائم: <strong>{cnf.existingProgram}</strong></span>
                          <span>القسم القائم: <strong>{cnf.existingDepartment}</strong></span>
                          {cnf.employeeName && <span>الموظف: <strong>{cnf.employeeName}</strong></span>}
                          {cnf.studentName && <span style={{ color: '#b91c1c' }}>الطالب: <strong>{cnf.studentName}</strong></span>}
                          {cnf.scopeName && <span>الفئة: <strong>{cnf.scopeName}</strong></span>}
                          {cnf.venueName && <span>القاعة: <strong>{cnf.venueName}</strong></span>}
                          <span>الموعد: <strong>{cnf.day} • {cnf.periodName} ({cnf.timeRange})</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {smartAlternatives.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.9rem',
                      background: 'var(--card-bg)',
                      border: '1px solid rgba(0, 165, 155, 0.35)',
                      borderRadius: 11,
                      padding: '0.8rem 0.95rem',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--brand-teal)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={16} />
                      <span>بدائل ذكية خالية من التعارض يقترحها النظام:</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 8 }}>
                      {smartAlternatives.map((alt) => (
                        <div
                          key={alt.id}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 9,
                            padding: '0.6rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--brand-teal)' }}>{alt.category}</div>
                            <div style={{ fontSize: '0.77rem', fontWeight: 700, marginTop: 2 }}>{alt.label}</div>
                          </div>
                          <button type="button" className="btn btn-sm btn-teal" onClick={() => applyAlternative(alt)}>
                            تطبيق هذا البديل الخالي من التعارض
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* STEP 2: ZERO RE-ENTRY EXCEPTION REQUEST FORM */
            <form id="exception-req-form" onSubmit={handleExceptionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  background: 'rgba(124, 58, 237, 0.07)',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                }}
              >
                <div style={{ fontWeight: 800, color: '#6d28d9', fontSize: '0.88rem', marginBottom: 4 }}>
                  البيانات المنقولة آليًا مع الطلب (بدون إعادة إدخال):
                </div>
                <div style={{ fontSize: '0.79rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  <span>البرنامج: <strong>{form.programName}</strong></span>
                  <span>القسم: <strong>{state.departments.find((d) => d.id === form.departmentId)?.name}</strong></span>
                  <span>الموعد: <strong>{form.day} ({form.executionDate}) — {coveredPeriods.combinedLabel || form.fromPeriodId}</strong></span>
                  <span>القاعة: <strong>{state.venues.find((v) => v.id === form.venueId)?.name}</strong></span>
                  <span>التعارضات المرفقة: <strong>{conflictResult.conflicts.length} تعارضات مفصلة</strong></span>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">سبب طلب الاستثناء *</label>
                  <textarea
                    className="form-textarea"
                    required
                    value={exceptionForm.reasonForException}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, reasonForException: e.target.value })}
                    placeholder="وضّح سبب الحاجة للاستثناء..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">مبرر أهمية إقامة النشاط *</label>
                  <textarea
                    className="form-textarea"
                    required
                    value={exceptionForm.importanceJustification}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, importanceJustification: e.target.value })}
                    placeholder="لماذا يكتسب هذا النشاط أولوية؟"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">لماذا لا يمكن تغيير الوقت أو القاعة؟</label>
                  <textarea
                    className="form-textarea"
                    value={exceptionForm.whyCannotChangeTime}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, whyCannotChangeTime: e.target.value })}
                    placeholder="مثلاً: ارتباط ضيف خارجي أو مناسبة محددة..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">أثر عدم إقامة البرنامج + الحل المقترح للتعارض</label>
                  <textarea
                    className="form-textarea"
                    value={exceptionForm.proposedConflictSolution}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, proposedConflictSolution: e.target.value })}
                    placeholder="اقترح كيفية معالجة البرنامج المتأثر..."
                  />
                </div>
              </div>

              <div className="card" style={{ padding: '0.95rem' }}>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', marginBottom: 6 }}>
                  تحديد الأشخاص المطلوب أخذ رأيهم قبل الاعتماد:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.85rem' }}>
                  {state.employees.map((emp) => {
                    const checked = opinionEmployeeIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() =>
                          setOpinionEmployeeIds((prev) =>
                            checked ? prev.filter((x) => x !== emp.id) : [...prev, emp.id]
                          )
                        }
                        className={`btn btn-sm ${checked ? 'btn-violet' : 'btn-secondary'}`}
                        style={{ fontSize: '0.73rem' }}
                      >
                        {emp.name} ({(emp.jobTitle || '').split(' ')[0]})
                      </button>
                    );
                  })}
                </div>

                <div className="form-group" style={{ maxWidth: 420 }}>
                  <label className="form-label">صاحب صلاحية الاعتماد النهائي للطلب:</label>
                  <select
                    className="form-select"
                    value={approverEmployeeId}
                    onChange={(e) => setApproverEmployeeId(e.target.value)}
                  >
                    {state.employees
                      .filter((e) => e.isApprover)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} — {emp.jobTitle}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step === 'schedule' ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving || isWindowBlockedForNew}
                  onClick={() => handleDirectSave(true)}
                >
                  <Save size={15} />
                  <span>حفظ كمسودة</span>
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  إلغاء
                </button>
                {conflictResult.requiresException ? (
                  <button
                    type="button"
                    className="btn btn-violet"
                    disabled={saving || isWindowBlockedForNew}
                    onClick={openExceptionStep}
                  >
                    <Send size={15} />
                    <span>رفع طلب استثناء ({conflictResult.blockingConflicts.length} تعارض)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || isWindowBlockedForNew}
                    onClick={() => handleDirectSave(false)}
                  >
                    <CheckCircle2 size={16} />
                    <span>{saving ? 'جاري الحفظ...' : 'اعتماد وإدراج في الجدول التشغيلي'}</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setStep('schedule')}>
                العودة لشاشة الجدولة والبدائل
              </button>
              <button type="submit" form="exception-req-form" className="btn btn-violet" disabled={saving || isWindowBlockedForNew}>
                <Send size={15} />
                <span>إرسال طلب الاستثناء لأصحاب الرأي ({opinionEmployeeIds.length})</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
