import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CalendarClock,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  UserCheck,
  CheckSquare,
  Bell,
  Plus,
  PlayCircle,
  Clock,
  ArrowLeft,
  Building2,
  User,
  BookOpen,
  Shield,
  FileCheck2,
  ListTodo,
  MapPin,
  Layers,
  GitBranch,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { useOps } from '../engine/store';
import {
  WORK_DAYS_AR,
  globalWeekToMonthInfo,
  getDatesForGlobalWeek,
  formatTime12Ar,
  getCurrentAndNextOperationalPeriod,
  isDateInExecutionRange,
} from '../engine/dateUtils';
import {
  getEmployeeDailyChronologicalSchedule,
  getEmployeeSupervisionBlocks,
} from '../engine/conflictEngine';
import { hasPermission, canEditProgram, canDeleteEntity } from '../engine/permissions';
import { StatusBadge, PlannedGreenPill, DepartmentPill } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import {
  ClubDirectorExecutiveDashboard,
  DepartmentHeadDashboard,
  QuickActionsBar,
  EarlyWarningAndUpdatesSection,
  CrowdingForecastPanel,
  InteractiveScheduleExplorer,
  DrillDownRecordsModal,
  ReadinessInspectorModal,
} from '../components/InteractiveDashboards';

export default function DashboardView({
  onNavigate,
  onOpenScheduleModal,
  onOpenDetailModal,
  onOpenEvaluationModal,
}) {
  const {
    state,
    currentUser,
    userOrgContext,
    notifications,
    auditLogs,
    evaluations,
    lastSyncedAt,
    lastLoginSeenAt,
    manualRefreshCloud,
    saveTask,
    updateTaskStatus,
    softDeleteEntity,
    bulkSoftDeleteEntities,
  } = useOps();

  const curW = state.meta.currentGlobalWeek; // 45
  const nextW = state.meta.nextGlobalWeek; // 46
  const curWeekInfo = globalWeekToMonthInfo(curW);
  const nextWeekInfo = globalWeekToMonthInfo(nextW);
  const curWeekDates = useMemo(() => getDatesForGlobalWeek(curW), [curW]);

  const [selectedDayAr, setSelectedDayAr] = useState('الاثنين');
  const selectedDateIso = curWeekDates[selectedDayAr] || '2026-11-02';
  const [personalTab, setPersonalTab] = useState('today'); // 'today' | 'timetable' | 'tasks' | 'supervision' | 'plan' | 'alerts'
  const [pulsePeriodOverride, setPulsePeriodOverride] = useState('auto'); // 'auto' | 'P1' | 'P2' | 'P3'

  // Quick Task modal state for Dept Heads / Club Director / Admin
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignedEmployeeId: '',
    dueDate: '2026-11-05',
    priority: 'متوسطة',
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkDeleteTasks, setBulkDeleteTasks] = useState(null);
  const [inspectDeptId, setInspectDeptId] = useState(null);
  const [topDrillDown, setTopDrillDown] = useState(null);
  const [topReadinessTarget, setTopReadinessTarget] = useState(null);

  const canViewDrafts = hasPermission(currentUser, 'view_drafts');
  const canCreateProgram = hasPermission(currentUser, 'create_program');
  const canSchedulePlanned = hasPermission(currentUser, 'schedule_planned_program');
  const canCreateTask = hasPermission(currentUser, 'create_task');
  const canSeeAllClubLeadership =
    currentUser?.isAdmin ||
    userOrgContext?.isClubDirector ||
    hasPermission(currentUser, 'view_all_club_programs');
  const canSeeDeptLeadership =
    !canSeeAllClubLeadership &&
    (userOrgContext?.isDeptHead || hasPermission(currentUser, 'view_dept_programs'));

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);
  const studentMap = useMemo(
    () => Object.fromEntries((state.students || []).map((st) => [st.id, st.name])),
    [state.students]
  );

  const programPeriods = useMemo(
    () => state.periods.filter((p) => p.category === 'program_period').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [state.periods]
  );

  // =========================================================================
  // 1. LIVE OPERATIONAL PULSE: الآن (Current Period) & التالي (Next Period) (Req #11)
  // =========================================================================
  const livePulse = useMemo(() => {
    const basePulse = getCurrentAndNextOperationalPeriod(state.periods);
    let activeP = basePulse.currentPeriod;
    let nextP = basePulse.nextPeriod;
    let modeLabel = basePulse.clubStatusLabel;

    if (pulsePeriodOverride !== 'auto') {
      const idx = programPeriods.findIndex((p) => p.id === pulsePeriodOverride);
      activeP = programPeriods[idx] || programPeriods[0];
      nextP = programPeriods[idx + 1] || null;
      modeLabel = `معاينة ${activeP?.name || ''}`;
    } else if (!activeP && programPeriods.length > 0) {
      // Outside evening hours (15:45–19:50): preview Period 1 for operational readiness
      activeP = programPeriods[0];
      nextP = programPeriods[1] || null;
    }

    const collectForPeriod = (periodObj) => {
      if (!periodObj) return { items: [], occupiedVenuesSet: new Set(), scopesSet: new Set(), specialItems: [] };
      const pId = periodObj.id;
      const items = [];
      const occupiedVenuesSet = new Set();
      const scopesSet = new Set();
      const specialItems = [];

      state.weeklyCommitments.forEach((wc) => {
        if (wc.day !== selectedDayAr || wc.periodId !== pId) return;
        const ov = state.commitmentOverrides?.[`${wc.id}__${selectedDateIso}`];
        if (ov?.cancelledForDate || ov?.suspendedForDate) return;
        items.push({
          id: wc.id,
          title: wc.title,
          deptId: wc.departmentId,
          deptName: state.departments.find((d) => d.id === wc.departmentId)?.name || 'عام',
          venueName: wc.venueId ? venueMap[wc.venueId] : '—',
          scopeLabel: (wc.scopeIds || []).map((s) => scopeMap[s]).filter(Boolean).join('، '),
          empName: wc.leadEmployeeId ? empMap[wc.leadEmployeeId] : '—',
          kind: 'حصة معتمدة',
          isSpecial: false,
        });
        if (wc.venueId && venueMap[wc.venueId]) occupiedVenuesSet.add(venueMap[wc.venueId]);
        (wc.scopeIds || []).forEach((s) => scopeMap[s] && scopesSet.add(scopeMap[s]));
      });

      state.scheduledExecutions.forEach((ex) => {
        if (ex.status === 'ملغي' || ex.status === 'مؤجل' || ex.status === 'مرفوض') return;
        if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) return;
        const sameDay = isDateInExecutionRange(selectedDateIso, selectedDayAr, ex);
        if (!sameDay) return;
        const covIds = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
        if (!covIds.includes(pId)) return;

        const isSpec = ex.programType === 'برنامج نوعي' || ex.programType === 'نشاط عام للنادي';
        const entry = {
          id: ex.id,
          title: ex.programName,
          deptId: ex.departmentId,
          deptName: ex.departmentName,
          venueName: ex.venueId ? venueMap[ex.venueId] : '—',
          scopeLabel:
            ex.scopeIds?.length
              ? ex.scopeIds.map((s) => scopeMap[s]).filter(Boolean).join('، ')
              : ex.studentIds?.length
              ? `${ex.studentIds.length} طلاب محددين`
              : 'عام',
          empName: ex.leadEmployeeId ? empMap[ex.leadEmployeeId] : '—',
          kind: ex.programType || 'برنامج مجدول',
          isSpecial: isSpec,
          subPrograms: (ex.subPrograms || []).filter((sp) =>
            (sp.coveredPeriodIds || [sp.fromPeriodId || sp.periodId]).includes(pId)
          ),
          rawExec: ex,
        };
        items.push(entry);
        if (isSpec) specialItems.push(entry);
        if (ex.venueId && venueMap[ex.venueId]) occupiedVenuesSet.add(venueMap[ex.venueId]);
        (ex.scopeIds || []).forEach((s) => scopeMap[s] && scopesSet.add(scopeMap[s]));
      });

      return { items, occupiedVenuesSet, scopesSet, specialItems };
    };

    return {
      modeLabel,
      isLiveHours: Boolean(basePulse.currentPeriod),
      currentPeriod: activeP,
      nextPeriod: nextP,
      nowData: collectForPeriod(activeP),
      nextData: collectForPeriod(nextP),
    };
  }, [
    state.periods,
    state.weeklyCommitments,
    state.commitmentOverrides,
    state.scheduledExecutions,
    state.departments,
    pulsePeriodOverride,
    programPeriods,
    selectedDayAr,
    selectedDateIso,
    venueMap,
    scopeMap,
    empMap,
    canViewDrafts,
    currentUser,
  ]);

  // =========================================================================
  // 2. PERSONAL DATA FOR LOGGED-IN EMPLOYEE ("ما لدي اليوم؟" — Req #5–#8)
  // =========================================================================
  const myTodayTimeline = useMemo(() => {
    if (!currentUser?.employeeId) return [];
    return getEmployeeDailyChronologicalSchedule(
      currentUser.employeeId,
      selectedDayAr,
      selectedDateIso,
      state
    );
  }, [currentUser, selectedDayAr, selectedDateIso, state]);

  // Locked Weekly Study Timetable strictly for logged-in employee (Req #6)
  const myWeeklyStudyTimetable = useMemo(() => {
    if (!currentUser?.employeeId) return [];
    return state.weeklyCommitments.filter(
      (wc) =>
        wc.leadEmployeeId === currentUser.employeeId ||
        (wc.participatingEmployeeIds || []).includes(currentUser.employeeId)
    );
  }, [state.weeklyCommitments, currentUser]);

  const myTasks = useMemo(() => {
    return (state.tasks || []).filter((t) => t.assignedEmployeeId === currentUser?.employeeId);
  }, [state.tasks, currentUser]);

  const mySupervisionDuties = useMemo(() => {
    if (!currentUser?.employeeId) return [];
    return state.supervisionDuties.filter(
      (sv) => sv.employeeId === currentUser.employeeId || sv.supervisor === currentUser.name
    );
  }, [state.supervisionDuties, currentUser]);

  const mySupervisionBlocks = useMemo(() => {
    if (!currentUser?.employeeId) return [];
    return getEmployeeSupervisionBlocks(currentUser.employeeId, state, { forDisplay: true });
  }, [currentUser, state]);

  const myApprovedPlanItems = useMemo(() => {
    return state.plannedOccurrences.filter((occ) => {
      const effSt = occ.effectiveStatus || occ.status;
      if (effSt === 'مسودة' && !canViewDrafts) return false;
      if (occ.linkedExecution) {
        const ex = occ.linkedExecution;
        if (
          ex.leadEmployeeId === currentUser?.employeeId ||
          (ex.participatingEmployeeIds || []).includes(currentUser?.employeeId)
        ) {
          return true;
        }
      }
      if (currentUser?.departmentId && occ.departmentId === currentUser.departmentId) {
        return true;
      }
      return false;
    });
  }, [state.plannedOccurrences, currentUser, canViewDrafts]);

  const myNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (n.targetEmployeeId && n.targetEmployeeId === currentUser?.employeeId) return true;
      if (n.targetDeptId && n.targetDeptId === currentUser?.departmentId) return true;
      if (n.targetRole === 'all') return true;
      if (n.targetRole === 'admin' && currentUser?.isAdmin) return true;
      return false;
    });
  }, [notifications, currentUser]);

  // =========================================================================
  // 3. WHAT'S HAPPENING TODAY IN THE CLUB ("ماذا يحدث اليوم في النادي؟" — Req #9 & #10)
  // =========================================================================
  const clubTodayByPeriod = useMemo(() => {
    return programPeriods.map((period) => {
      const pId = period.id;
      const execs = state.scheduledExecutions.filter((ex) => {
        if (ex.status === 'ملغي' || ex.status === 'مرفوض') return false;
        if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) return false;
        const sameDay = ex.executionDate === selectedDateIso || (!ex.executionDate && ex.day === selectedDayAr);
        if (!sameDay) return false;
        const covIds = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
        return covIds.includes(pId);
      });

      const lessons = state.weeklyCommitments.filter((wc) => {
        if (wc.day !== selectedDayAr || wc.periodId !== pId) return false;
        const ov = state.commitmentOverrides?.[`${wc.id}__${selectedDateIso}`];
        return !ov?.cancelledForDate && !ov?.suspendedForDate;
      });

      return {
        period,
        execs,
        lessons,
      };
    });
  }, [
    programPeriods,
    state.scheduledExecutions,
    state.weeklyCommitments,
    state.commitmentOverrides,
    selectedDateIso,
    selectedDayAr,
    canViewDrafts,
    currentUser,
  ]);

  const clubGeneralAndSpecialToday = useMemo(() => {
    return state.scheduledExecutions.filter((ex) => {
      if (ex.status === 'ملغي' || ex.status === 'مرفوض' || ex.status === 'مسودة') return false;
      const sameDay = ex.executionDate === selectedDateIso || (!ex.executionDate && ex.day === selectedDayAr);
      return sameDay && (ex.programType === 'برنامج نوعي' || ex.programType === 'نشاط عام للنادي' || (ex.subPrograms || []).length > 0);
    });
  }, [state.scheduledExecutions, selectedDateIso, selectedDayAr]);

  // =========================================================================
  // 4. LEADERSHIP SUMMARIES (Strictly Scoped for Club Director / Dept Head / Admin)
  // =========================================================================
  const thisWeekOccs = useMemo(
    () => state.plannedOccurrences.filter((o) => o.plannedGlobalWeek === curW),
    [state.plannedOccurrences, curW]
  );
  const nextWeekOccs = useMemo(
    () => state.plannedOccurrences.filter((o) => o.plannedGlobalWeek === nextW),
    [state.plannedOccurrences, nextW]
  );

  const deptSummary = useMemo(() => {
    return state.departments.map((d) => {
      const w45 = thisWeekOccs.filter((o) => o.departmentId === d.id);
      const w46 = nextWeekOccs.filter((o) => o.departmentId === d.id);
      const scheduled45 = w45.filter((o) => Boolean(o.linkedExecution)).length;
      const staffCount = state.employees.filter((e) => e.departmentId === d.id).length;
      return {
        ...d,
        staffCount,
        thisWeekTotal: w45.length,
        thisWeekScheduled: scheduled45,
        thisWeekPending: w45.length - scheduled45,
        nextWeekTotal: w46.length,
      };
    });
  }, [state.departments, thisWeekOccs, nextWeekOccs, state.employees]);

  const myDeptStaff = useMemo(() => {
    if (!currentUser?.departmentId) return [];
    return state.employees.filter((e) => e.departmentId === currentUser.departmentId);
  }, [state.employees, currentUser]);

  const myDeptTasks = useMemo(() => {
    if (!currentUser?.departmentId) return [];
    return (state.tasks || []).filter((t) => t.departmentId === currentUser.departmentId);
  }, [state.tasks, currentUser]);

  const myDeptThisWeekUnscheduled = useMemo(() => {
    const base = canSeeAllClubLeadership
      ? thisWeekOccs
      : thisWeekOccs.filter((o) => o.departmentId === currentUser?.departmentId);
    return base.filter((o) => !o.linkedExecution || o.effectiveStatus === 'مخطط' || o.effectiveStatus === 'يحتاج جدولة');
  }, [thisWeekOccs, canSeeAllClubLeadership, currentUser]);

  const assignableEmployeesForTask = useMemo(() => {
    if (canSeeAllClubLeadership) return state.employees;
    return state.employees.filter((e) => e.departmentId === currentUser?.departmentId);
  }, [state.employees, canSeeAllClubLeadership, currentUser]);

  const handleSaveTaskSubmit = (e) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !taskForm.assignedEmployeeId) return;
    saveTask(taskForm);
    setTaskForm({
      title: '',
      description: '',
      assignedEmployeeId: '',
      dueDate: '2026-11-05',
      priority: 'متوسطة',
    });
    setShowTaskModal(false);
  };

  const handleConfirmDelete = async (reason) => {
    if (bulkDeleteTasks?.length > 0) {
      await bulkSoftDeleteEntities(bulkDeleteTasks, reason);
      setSelectedTaskIds([]);
      setBulkDeleteTasks(null);
      return;
    }
    if (!deleteTarget) return;
    await softDeleteEntity({
      entityType: deleteTarget.entityType,
      entityId: deleteTarget.entityId,
      reason,
    });
    setDeleteTarget(null);
  };

  const hasSupervisionToday = mySupervisionBlocks.length > 0 || mySupervisionDuties.length > 0;

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {/* ========================================================================= */}
      {/* SECTION 1: PERSONAL IDENTITY & AUTOMATIC ORG CONTEXT BANNER (Req #1, #13-#16) */}
      {/* ========================================================================= */}
      <div
        className="card"
        style={{
          padding: '1rem 1.2rem',
          background: 'linear-gradient(135deg, rgba(0,165,155,0.09), rgba(140,194,64,0.07))',
          borderColor: 'rgba(0,165,155,0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--brand-ink)' }}>
                مرحبًا، {currentUser?.name}
              </h2>
              <span className="status-badge badge-approved" style={{ fontSize: '0.72rem' }}>
                {currentUser?.roleLabel}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                (@{currentUser?.username})
              </span>
            </div>

            {/* Auto-Resolved Org Context Strip */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.95rem',
                marginTop: 8,
                fontSize: '0.79rem',
                color: 'var(--text)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Building2 size={14} color="var(--brand-teal)" />
                <span>الإدارة: <strong>{userOrgContext?.administration?.name || 'نادي تراؤف للبنين'}</strong></span>
              </span>
              <span>•</span>
              <span>
                مدير النادي: <strong>{userOrgContext?.clubDirectorName || 'عبد الرزاق محمد العنزي'}</strong>
              </span>
              <span>•</span>
              <span>
                القسم: <strong>{userOrgContext?.departmentName || 'الإدارة العامة'}</strong>
              </span>
              {userOrgContext?.departmentHeadName && userOrgContext.departmentHeadName !== '—' && (
                <>
                  <span>•</span>
                  <span>
                    رئيس القسم: <strong>{userOrgContext.departmentHeadName}</strong>
                  </span>
                </>
              )}
              <span>•</span>
              <span style={{ color: 'var(--brand-teal)', fontWeight: 800 }}>
                نطاق العرض: {userOrgContext?.scopeLabel}
              </span>
            </div>
          </div>

          {/* Day Selector + Authorized Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--card-bg)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
              {WORK_DAYS_AR.map((dAr) => (
                <button
                  key={dAr}
                  type="button"
                  onClick={() => setSelectedDayAr(dAr)}
                  className={`btn btn-sm ${selectedDayAr === dAr ? 'btn-teal' : 'btn-secondary'}`}
                  style={{ padding: '3px 9px', fontSize: '0.73rem' }}
                >
                  {dAr}
                </button>
              ))}
            </div>

            {canCreateTask && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  setTaskForm((prev) => ({
                    ...prev,
                    assignedEmployeeId: assignableEmployeesForTask[0]?.id || '',
                  }));
                  setShowTaskModal(true);
                }}
              >
                <ListTodo size={14} />
                <span>+ إسناد مهمة</span>
              </button>
            )}

            {canCreateProgram && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onOpenScheduleModal({ mode: 'new_program' })}
              >
                <Plus size={14} />
                <span>+ برنامج جديد</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROLE-BASED QUICK ACTIONS BAR (Req #18)                                    */}
      {/* ========================================================================= */}
      <QuickActionsBar
        currentUser={currentUser}
        onOpenScheduleModal={onOpenScheduleModal}
        onNavigate={onNavigate}
        onOpenAssignTask={
          canCreateTask
            ? () => {
                setTaskForm((prev) => ({
                  ...prev,
                  assignedEmployeeId: assignableEmployeesForTask[0]?.id || '',
                }));
                setShowTaskModal(true);
              }
            : null
        }
      />

      {/* ========================================================================= */}
      {/* EARLY WARNINGS & WHAT CHANGED SINCE LAST LOGIN (Req #14 & #15)            */}
      {/* ========================================================================= */}
      <EarlyWarningAndUpdatesSection
        state={state}
        currentUser={currentUser}
        evaluations={evaluations}
        auditLogs={auditLogs}
        notifications={notifications}
        lastLoginSeenAt={lastLoginSeenAt}
        todayIso={selectedDateIso}
        onOpenDrillDown={(dd) => setTopDrillDown(dd)}
        onNavigate={onNavigate}
        onOpenDetailModal={onOpenDetailModal}
      />

      {/* ========================================================================= */}
      {/* CLUB DIRECTOR & SYSTEM ADMIN INTERACTIVE EXECUTIVE DASHBOARD (Req #6-#9)  */}
      {/* ========================================================================= */}
      {canSeeAllClubLeadership && (
        <>
          <ClubDirectorExecutiveDashboard
            state={state}
            evaluations={evaluations}
            todayIso={selectedDateIso}
            lastSyncedAt={lastSyncedAt}
            onManualRefresh={manualRefreshCloud}
            onNavigate={onNavigate}
            onOpenScheduleModal={onOpenScheduleModal}
            onOpenDetailModal={onOpenDetailModal}
            onOpenEvaluationModal={onOpenEvaluationModal}
            onSelectDepartmentDetail={(deptId) => setInspectDeptId(deptId)}
          />

          {inspectDeptId && (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setInspectDeptId(null)}
                >
                  إخفاء معاينة القسم المختار
                </button>
              </div>
              <DepartmentHeadDashboard
                state={state}
                evaluations={evaluations}
                departmentId={inspectDeptId}
                canSwitchDepartment
                selectedDateIso={selectedDateIso}
                selectedDayAr={selectedDayAr}
                onNavigate={onNavigate}
                onOpenScheduleModal={onOpenScheduleModal}
                onOpenDetailModal={onOpenDetailModal}
                onOpenEvaluationModal={onOpenEvaluationModal}
                onOpenAssignTask={
                  canCreateTask
                    ? () => {
                        setTaskForm((prev) => ({
                          ...prev,
                          assignedEmployeeId: assignableEmployeesForTask[0]?.id || '',
                        }));
                        setShowTaskModal(true);
                      }
                    : null
                }
              />
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* DEPARTMENT HEAD INTERACTIVE DASHBOARD (Req #10-#12 — Strictly Scoped)     */}
      {/* ========================================================================= */}
      {canSeeDeptLeadership && (
        <DepartmentHeadDashboard
          state={state}
          evaluations={evaluations}
          departmentId={currentUser?.departmentId}
          canSwitchDepartment={false}
          selectedDateIso={selectedDateIso}
          selectedDayAr={selectedDayAr}
          onNavigate={onNavigate}
          onOpenScheduleModal={onOpenScheduleModal}
          onOpenDetailModal={onOpenDetailModal}
          onOpenEvaluationModal={onOpenEvaluationModal}
          onOpenAssignTask={
            canCreateTask
              ? () => {
                  setTaskForm((prev) => ({
                    ...prev,
                    assignedEmployeeId: assignableEmployeesForTask[0]?.id || '',
                  }));
                  setShowTaskModal(true);
                }
              : null
          }
        />
      )}

      {/* ========================================================================= */}
      {/* OPERATIONAL CROWDING FORECAST & INTERACTIVE SCHEDULE (Req #16 & #17)      */}
      {/* ========================================================================= */}
      {(canSeeAllClubLeadership || canSeeDeptLeadership) && (
        <>
          <CrowdingForecastPanel
            state={state}
            onOpenDrillDown={(dd) => setTopDrillDown(dd)}
          />
          <InteractiveScheduleExplorer
            state={state}
            selectedDateIso={selectedDateIso}
            selectedDayAr={selectedDayAr}
            onSelectDay={(d) => setSelectedDayAr(d)}
            onOpenDetailModal={onOpenDetailModal}
            onOpenScheduleModal={onOpenScheduleModal}
          />
        </>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: LIVE OPERATIONAL PULSE — الآن (Current) & التالي (Next) (Req #11) */}
      {/* ========================================================================= */}
      <div className="card" style={{ padding: '0.95rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PlayCircle size={18} color="var(--brand-teal)" />
            <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--brand-ink)' }}>
              النبض التشغيلي للنادي ({selectedDayAr} {selectedDateIso}) — <span style={{ color: 'var(--brand-teal)' }}>الآن</span> و<span style={{ color: '#0284c7' }}>التالي</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${pulsePeriodOverride === 'auto' ? 'btn-teal' : 'btn-secondary'}`}
              style={{ fontSize: '0.71rem', padding: '2px 9px' }}
              onClick={() => setPulsePeriodOverride('auto')}
            >
              تلقائي حسب الوقت
            </button>
            {programPeriods.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${pulsePeriodOverride === p.id ? 'btn-teal' : 'btn-secondary'}`}
                style={{ fontSize: '0.71rem', padding: '2px 9px' }}
                onClick={() => setPulsePeriodOverride(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.85rem' }}>
          {/* Card: الآن */}
          <div
            style={{
              background: 'rgba(0,165,155,0.06)',
              border: '1px solid rgba(0,165,155,0.3)',
              borderRadius: 12,
              padding: '0.85rem 1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ background: '#00A59B', color: '#fff', fontWeight: 800, fontSize: '0.73rem', padding: '2px 10px', borderRadius: 999 }}>
                  الآن
                </span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--brand-ink)' }}>
                  {livePulse.currentPeriod?.name || 'الفترة الأولى'}
                </strong>
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                {livePulse.currentPeriod
                  ? `${formatTime12Ar(livePulse.currentPeriod.approvedStart)} - ${formatTime12Ar(livePulse.currentPeriod.approvedEnd)}`
                  : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.75rem', marginBottom: 8 }}>
              <span>البرامج والأنشطة الجارية: <strong>{livePulse.nowData.items.length}</strong></span>
              <span>•</span>
              <span>القاعات المشغولة: <strong>{livePulse.nowData.occupiedVenuesSet.size}</strong></span>
              <span>•</span>
              <span>الفئات المشاركة: <strong>{livePulse.nowData.scopesSet.size}</strong></span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 135, overflowY: 'auto' }}>
              {livePulse.nowData.items.slice(0, 6).map((it) => (
                <div
                  key={it.id}
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '4px 8px',
                    fontSize: '0.74rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <div>
                    <strong>{it.title}</strong>
                    {it.isSpecial && (
                      <span className="status-badge badge-exception" style={{ marginRight: 6, fontSize: '0.65rem' }}>
                        برنامج نوعي
                      </span>
                    )}
                    {it.subPrograms?.length > 0 && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--brand-teal)' }}>
                        ↳ {it.subPrograms.map((sp) => sp.name).join(' • ')}
                      </div>
                    )}
                  </div>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {it.venueName} • {it.scopeLabel}
                  </span>
                </div>
              ))}
              {livePulse.nowData.items.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>لا توجد برامج مسجلة في هذه الفترة.</div>
              )}
            </div>
          </div>

          {/* Card: التالي */}
          <div
            style={{
              background: 'rgba(2,132,199,0.05)',
              border: '1px solid rgba(2,132,199,0.28)',
              borderRadius: 12,
              padding: '0.85rem 1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ background: '#0284c7', color: '#fff', fontWeight: 800, fontSize: '0.73rem', padding: '2px 10px', borderRadius: 999 }}>
                  التالي
                </span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--brand-ink)' }}>
                  {livePulse.nextPeriod ? livePulse.nextPeriod.name : 'نهاية الفترات المسائية (انصراف الطلاب)'}
                </strong>
              </div>
              {livePulse.nextPeriod && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {formatTime12Ar(livePulse.nextPeriod.approvedStart)} - {formatTime12Ar(livePulse.nextPeriod.approvedEnd)}
                </span>
              )}
            </div>

            {livePulse.nextPeriod ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.75rem', marginBottom: 8 }}>
                  <span>البرامج القادمة: <strong>{livePulse.nextData.items.length}</strong></span>
                  <span>•</span>
                  <span>القاعات المحجوزة: <strong>{livePulse.nextData.occupiedVenuesSet.size}</strong></span>
                  <span>•</span>
                  <span>الفئات المنتقلة: <strong>{livePulse.nextData.scopesSet.size}</strong></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 135, overflowY: 'auto' }}>
                  {livePulse.nextData.items.slice(0, 6).map((it) => (
                    <div
                      key={it.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '4px 8px',
                        fontSize: '0.74rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <strong>{it.title}</strong>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {it.venueName} • {it.scopeLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12 }}>
                لا توجد فترة برامج تالية بعد الفترة الثالثة — يتبعها وقت العشاء والانصراف المعتمد.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: CORE TWO-COLUMN PORTAL — "ما لدي اليوم؟" + "ماذا يحدث اليوم في النادي؟" */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        {/* RIGHT COLUMN: ما لدي اليوم؟ (Personal Employee Workspace — Req #5–#8) */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: '0.7rem' }}>
            <div className="card-title" style={{ fontSize: '0.95rem' }}>
              <User size={17} color="var(--brand-teal)" />
              <span>ما لدي اليوم؟ (بياناتي وجدولي ومهامي الخاصة)</span>
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate('my-day')}>
              صفحة جدولي المفصلة
            </button>
          </div>

          {/* Personal Sub-Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '0.85rem' }}>
            {[
              { id: 'today', label: `التزاماتي اليوم (${myTodayTimeline.length})`, icon: Clock },
              { id: 'timetable', label: `جدولي الدراسي (${myWeeklyStudyTimetable.length})`, icon: BookOpen },
              { id: 'tasks', label: `مهامي (${myTasks.length})`, icon: ListTodo },
              { id: 'supervision', label: `إشرافي اليومي (${hasSupervisionToday ? `${mySupervisionBlocks.length} مهام` : '—'})`, icon: Shield },
              { id: 'plan', label: `خطتي المعتمدة (${myApprovedPlanItems.length})`, icon: FileCheck2 },
              { id: 'alerts', label: `تنبيهاتي (${myNotifications.length})`, icon: Bell },
            ].map((tb) => {
              const Icon = tb.icon;
              return (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setPersonalTab(tb.id)}
                  className={`btn btn-sm ${personalTab === tb.id ? 'btn-teal' : 'btn-secondary'}`}
                  style={{ fontSize: '0.72rem', padding: '4px 9px' }}
                >
                  <Icon size={13} />
                  <span>{tb.label}</span>
                </button>
              );
            })}
          </div>

          {/* Personal Tab 1: Today's Chronological Schedule */}
          {personalTab === 'today' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 410, overflowY: 'auto' }}>
              {mySupervisionBlocks.length > 0 && (
                <div
                  style={{
                    background: 'rgba(234,88,12,0.08)',
                    border: '1px solid rgba(234,88,12,0.35)',
                    borderRadius: 10,
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.77rem',
                  }}
                >
                  <strong style={{ color: '#c2410c' }}>تكليفك اليوم في الإشراف المعتمد ({selectedDayAr}):</strong>{' '}
                  {mySupervisionBlocks.map((b) => `${b.title} (${b.location})`).join(' • ')}
                </div>
              )}

              {myTodayTimeline.length === 0 ? (
                <div style={{ padding: '1.4rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', background: 'var(--bg)', borderRadius: 10 }}>
                  لا توجد حصص أو برامج تنفيذية مسجلة باسمك في يوم ({selectedDayAr}).
                </div>
              ) : (
                myTodayTimeline.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.rawExecution && onOpenDetailModal({ execution: item.rawExecution })}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRight: '4px solid var(--brand-teal)',
                      borderRadius: 10,
                      padding: '0.65rem 0.85rem',
                      cursor: item.rawExecution ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: '0.84rem', color: 'var(--brand-ink)' }}>{item.title}</strong>
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      <span>الفترة: <strong>{item.periodName}</strong></span>
                      <span>الوقت: <strong>{formatTime12Ar(item.startTime)} - {formatTime12Ar(item.endTime)}</strong></span>
                      <span>الموقع: <strong>{item.location}</strong></span>
                      {item.scopeLabel && <span>الفئة: <strong>{item.scopeLabel}</strong></span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Personal Tab 2: Locked Personal Study Timetable (Req #6) */}
          {personalTab === 'timetable' && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--brand-teal)', fontWeight: 800, marginBottom: 8 }}>
                الجدول الدراسي المعتمد المرتبط بحساب ({currentUser?.name}) تلقائيًا:
              </div>
              {myWeeklyStudyTimetable.length === 0 ? (
                <div style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'var(--bg)', borderRadius: 10 }}>
                  لا توجد حصص دراسية أسبوعية ثابتة مرتبطة باسمك في الجدول الدراسي المعتمد.
                </div>
              ) : (
                <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>اليوم</th>
                        <th>الفترة والوقت</th>
                        <th>النشاط / المادة</th>
                        <th>الفئة</th>
                        <th>الموقع / القاعة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myWeeklyStudyTimetable.map((wc) => {
                        const pObj = state.periods.find((p) => p.id === wc.periodId);
                        return (
                          <tr key={wc.id}>
                            <td style={{ fontWeight: 800 }}>{wc.day}</td>
                            <td style={{ fontSize: '0.74rem' }}>
                              <div>{wc.periodName}</div>
                              <div style={{ color: 'var(--text-muted)' }}>
                                {pObj ? `${formatTime12Ar(pObj.approvedStart)} - ${formatTime12Ar(pObj.approvedEnd)}` : ''}
                              </div>
                            </td>
                            <td style={{ fontWeight: 800, color: 'var(--brand-ink)' }}>{wc.title}</td>
                            <td>{(wc.scopeIds || []).map((id) => scopeMap[id]).join('، ') || '—'}</td>
                            <td>{wc.venueId ? venueMap[wc.venueId] : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Personal Tab 3: My Tasks */}
          {personalTab === 'tasks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 380, overflowY: 'auto' }}>
              {myTasks.some((t) => canDeleteEntity(currentUser, 'task', t.departmentId)) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.72rem', fontWeight: 800 }}
                    onClick={() => {
                      const delIds = myTasks
                        .filter((t) => canDeleteEntity(currentUser, 'task', t.departmentId))
                        .map((t) => t.id);
                      setSelectedTaskIds(selectedTaskIds.length === delIds.length ? [] : delIds);
                    }}
                  >
                    <CheckSquare size={12} color="var(--brand-teal)" />
                    <span>
                      {selectedTaskIds.length ===
                      myTasks.filter((t) => canDeleteEntity(currentUser, 'task', t.departmentId)).length
                        ? 'إلغاء تحديد المهام'
                        : `تحديد الكل (${
                            myTasks.filter((t) => canDeleteEntity(currentUser, 'task', t.departmentId)).length
                          })`}
                    </span>
                  </button>
                  {selectedTaskIds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      style={{ fontSize: '0.72rem' }}
                      onClick={() =>
                        setBulkDeleteTasks(
                          myTasks
                            .filter((t) => selectedTaskIds.includes(t.id))
                            .map((t) => ({
                              entityType: 'task',
                              entityId: t.id,
                              entityTitle: t.title,
                            }))
                        )
                      }
                    >
                      <Trash2 size={12} />
                      <span>حذف المحدد ({selectedTaskIds.length})</span>
                    </button>
                  )}
                </div>
              )}
              {myTasks.length === 0 ? (
                <div style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'var(--bg)', borderRadius: 10 }}>
                  لا توجد مهام مسندة إليك حاليًا.
                </div>
              ) : (
                myTasks.map((tsk) => {
                  const canDelTsk = canDeleteEntity(currentUser, 'task', tsk.departmentId);
                  const isTskSelected = selectedTaskIds.includes(tsk.id);
                  return (
                  <div
                    key={tsk.id}
                    style={{
                      background: isTskSelected ? 'rgba(239,68,68,0.06)' : 'var(--bg)',
                      border: isTskSelected ? '1.5px solid #dc2626' : '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '0.65rem 0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {canDelTsk && (
                          <input
                            type="checkbox"
                            checked={isTskSelected}
                            onChange={() =>
                              setSelectedTaskIds((prev) =>
                                prev.includes(tsk.id) ? prev.filter((id) => id !== tsk.id) : [...prev, tsk.id]
                              )
                            }
                            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                        )}
                        <strong style={{ fontSize: '0.84rem' }}>{tsk.title}</strong>
                      </div>
                      <StatusBadge status={tsk.status} size="sm" />
                    </div>
                    {tsk.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{tsk.description}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '0.72rem' }}>
                      <span>تاريخ الاستحقاق: <strong>{tsk.dueDate}</strong> • الأولوية: {tsk.priority}</span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {tsk.status !== 'منجزة' ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-teal"
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => updateTaskStatus(tsk.id, 'منجزة')}
                          >
                            <CheckCircle2 size={12} />
                            <span>تحديد كمنجزة</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => updateTaskStatus(tsk.id, 'قيد التنفيذ')}
                          >
                            إعادة فتح
                          </button>
                        )}
                        {canDeleteEntity(currentUser, 'task', tsk.departmentId) && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: '#dc2626', width: 26, height: 26 }}
                            title="حذف المهمة"
                            onClick={() =>
                              setDeleteTarget({
                                entityType: 'task',
                                entityId: tsk.id,
                                entityTitle: tsk.title,
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          )}

          {/* Personal Tab 4: My Daily Supervision + Link to General Approved Supervision (Req #8) */}
          {personalTab === 'supervision' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: '0.77rem', fontWeight: 800 }}>تكليفك الشخصي في جدول الإشراف اليومي المعتمد:</span>
                <button type="button" className="btn btn-sm btn-teal" onClick={() => onNavigate('supervision')}>
                  عرض جدول الإشراف العام للنادي كاملًا
                </button>
              </div>
              {mySupervisionBlocks.length === 0 ? (
                <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: 10, fontSize: '0.79rem', color: 'var(--text-muted)' }}>
                  لا يوجد تكليف إشراف يومي مباشر باسمك — يمكنك الاطلاع على جدول الإشراف اليومي العام للنادي كاملًا من الزر أعلاه.
                </div>
              ) : (
                mySupervisionBlocks.map((blk) => (
                  <div
                    key={blk.id}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: 10,
                      border: '1.5px solid var(--brand-teal)',
                      background: 'rgba(0,165,155,0.08)',
                      fontSize: '0.79rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <strong>{blk.title}</strong>
                      <span className="status-badge badge-approved">تكليفك اليوم</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 3 }}>
                      الموقع / النقطة: <strong>{blk.location}</strong> • الوقت: {formatTime12Ar(blk.startTime)} - {formatTime12Ar(blk.endTime)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Personal Tab 5: Approved Plan (Read-Only, No Drafts for Regular Employees — Req #7) */}
          {personalTab === 'plan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  padding: '0.6rem 0.85rem',
                  borderRadius: 10,
                  background: 'var(--planned-green-bg)',
                  border: '1px solid #8CC240',
                  fontSize: '0.76rem',
                }}
              >
                <div style={{ fontWeight: 800, color: 'var(--planned-green-text)' }}>
                  الإصدار المعتمد الحالي: {state.approvedPlanVersion?.versionNumber || 'v1.0'} — {state.approvedPlanVersion?.title}
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                  للقراءة والاطلاع — معتمد بواسطة: {state.approvedPlanVersion?.approvedBy} (تُخفى المسودات تلقائيًا عن غير المخولين).
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {myApprovedPlanItems.slice(0, 25).map((occ) => (
                  <div
                    key={occ.id}
                    onClick={() => onOpenDetailModal({ occurrence: occ, execution: occ.linkedExecution })}
                    style={{
                      padding: '0.55rem 0.8rem',
                      borderRadius: 9,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>{occ.programName}</div>
                      <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                        {occ.plannedMonthName} • {occ.plannedWeekLabel}
                      </div>
                    </div>
                    <StatusBadge status={occ.effectiveStatus || occ.status} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personal Tab 6: My Alerts */}
          {personalTab === 'alerts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {myNotifications.slice(0, 12).map((ntf) => (
                <div
                  key={ntf.id}
                  style={{
                    padding: '0.6rem 0.8rem',
                    borderRadius: 9,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    fontSize: '0.77rem',
                  }}
                >
                  <div style={{ fontSize: '0.69rem', fontWeight: 800, color: 'var(--brand-teal)' }}>{ntf.type}</div>
                  <div style={{ fontWeight: 800, marginTop: 2 }}>{ntf.title}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>{ntf.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LEFT COLUMN: ماذا يحدث اليوم في النادي؟ (General Club Operational Schedule by Period — Req #9 & #10) */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: '0.75rem' }}>
            <div className="card-title" style={{ fontSize: '0.95rem' }}>
              <Calendar size={17} color="var(--brand-teal)" />
              <span>ماذا يحدث اليوم في النادي؟ ({selectedDayAr} — عرض تشغيلي عام)</span>
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate('master-schedule')}>
              الجدول الموحد الكامل
            </button>
          </div>

          {/* Highlighted General / Special / Multi-Stage Programs Today */}
          {clubGeneralAndSpecialToday.length > 0 && (
            <div
              style={{
                marginBottom: '0.85rem',
                padding: '0.7rem 0.85rem',
                borderRadius: 11,
                background: 'rgba(124,58,237,0.06)',
                border: '1px solid rgba(124,58,237,0.28)',
              }}
            >
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6d28d9', marginBottom: 6 }}>
                البرامج العامة والنوعية المعتمدة اليوم في النادي:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clubGeneralAndSpecialToday.map((ex) => (
                  <div
                    key={ex.id}
                    onClick={() => onOpenDetailModal({ execution: ex })}
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 9,
                      padding: '0.55rem 0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: '0.82rem' }}>{ex.programName}</strong>
                      <DepartmentPill deptId={ex.departmentId} deptName={ex.departmentName} departments={state.departments} />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                      الفترات: <strong>{ex.periodName}</strong> • القاعة: <strong>{venueMap[ex.venueId] || '—'}</strong> • المسؤول: <strong>{empMap[ex.leadEmployeeId] || '—'}</strong>
                    </div>
                    {ex.subPrograms?.length > 0 && (
                      <div style={{ marginTop: 5, paddingRight: 8, borderRight: '2px solid var(--brand-teal)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {ex.subPrograms.map((sp) => (
                          <span key={sp.id} style={{ fontSize: '0.7rem', color: 'var(--brand-teal)', fontWeight: 700 }}>
                            ↳ {sp.name} ({formatTime12Ar(sp.startTime)})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grouped by Operational Periods: الفترة الأولى | الفترة الثانية | الفترة الثالثة */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: 440, overflowY: 'auto' }}>
            {clubTodayByPeriod.map(({ period, execs, lessons }) => (
              <div
                key={period.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 11,
                  padding: '0.7rem 0.85rem',
                  background: 'var(--bg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--brand-ink)' }}>
                    {period.name} ({formatTime12Ar(period.approvedStart)} - {formatTime12Ar(period.approvedEnd)})
                  </strong>
                  <span className="status-badge badge-muted" style={{ fontSize: '0.68rem' }}>
                    {execs.length} برامج أقسام • {lessons.length} حصص معتمدة
                  </span>
                </div>

                {execs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: lessons.length ? 6 : 0 }}>
                    {execs.map((ex) => (
                      <div
                        key={ex.id}
                        onClick={() => onOpenDetailModal({ execution: ex })}
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid rgba(0,165,155,0.3)',
                          borderRadius: 8,
                          padding: '0.5rem 0.7rem',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.8rem', color: 'var(--brand-ink)' }}>{ex.programName}</strong>
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <DepartmentPill deptId={ex.departmentId} deptName={ex.departmentName} departments={state.departments} />
                            <StatusBadge status={ex.status} size="sm" />
                          </div>
                        </div>
                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <span><MapPin size={11} style={{ verticalAlign: 'middle' }} /> {venueMap[ex.venueId] || '—'}</span>
                          <span><Layers size={11} style={{ verticalAlign: 'middle' }} /> {ex.scopeIds?.length ? ex.scopeIds.map((s) => scopeMap[s]).join('، ') : ex.studentIds?.length ? `${ex.studentIds.map((st) => studentMap[st] || st).slice(0, 3).join('، ')}` : 'عام'}</span>
                          <span>المسؤول: {empMap[ex.leadEmployeeId] || '—'}</span>
                        </div>
                        {ex.subPrograms?.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--brand-teal)', fontWeight: 700 }}>
                            <GitBranch size={11} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
                            {ex.subPrograms.map((sp) => `↳ ${sp.name}`).join('   ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {lessons.slice(0, 8).map((ls) => (
                    <span
                      key={ls.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 7,
                        padding: '3px 8px',
                        fontSize: '0.7rem',
                      }}
                    >
                      <strong>{ls.title}</strong> ({(ls.scopeIds || []).map((id) => scopeMap[id]).join('، ')} • {venueMap[ls.venueId] || '—'})
                    </span>
                  ))}
                  {lessons.length > 8 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ fontSize: '0.68rem', padding: '2px 7px' }}
                      onClick={() => onNavigate('master-schedule')}
                    >
                      +{lessons.length - 8} أنشطة أخرى...
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4A: CLUB DIRECTOR & SYSTEM ADMIN EXECUTIVE OVERVIEW (Req #14 — Hidden from Regular Employees!) */}
      {/* ========================================================================= */}
      {canSeeAllClubLeadership && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Sparkles size={17} color="var(--brand-teal)" />
              <span>لوحة إشراف إدارة نادي تراؤف للبنين — الأقسام الأربعة ورؤساؤها المعتمدون</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate('this-week')}>
                برامج هذا الأسبوع ({thisWeekOccs.length})
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate('exceptions')}>
                مركز الاستثناءات ({state.exceptionRequests.length})
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))', gap: '0.85rem' }}>
            {deptSummary.map((dept) => (
              <div
                key={dept.id}
                style={{
                  border: '1px solid var(--border)',
                  borderTop: `4px solid ${dept.color}`,
                  borderRadius: 12,
                  padding: '0.9rem 1rem',
                  background: 'var(--bg)',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: dept.color }}>{dept.name}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-ink)', marginTop: 3 }}>
                  رئيس القسم: {dept.headName || '—'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 8px' }}>
                  عدد الموظفين: {dept.staffCount} موظفًا
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.76rem' }}>
                  <div style={{ background: 'var(--card-bg)', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>هذا الأسبوع (45)</div>
                    <div style={{ fontWeight: 800 }}>
                      {dept.thisWeekTotal} مخطط ({dept.thisWeekScheduled} مجدول)
                    </div>
                  </div>
                  <div style={{ background: 'var(--card-bg)', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>الأسبوع القادم (46)</div>
                    <div style={{ fontWeight: 800 }}>{dept.nextWeekTotal} برنامج</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4B: DEPARTMENT HEAD WORKSPACE (Req #15 — Scoped Strictly to Own Department!) */}
      {/* ========================================================================= */}
      {canSeeDeptLeadership && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <UserCheck size={17} color="var(--brand-teal)" />
              <span>لوحة رئاسة ({userOrgContext?.departmentName}) — موظفو ومهام وبرامج القسم</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {canCreateTask && (
                <button
                  type="button"
                  className="btn btn-sm btn-teal"
                  onClick={() => {
                    setTaskForm((prev) => ({
                      ...prev,
                      assignedEmployeeId: myDeptStaff[0]?.id || '',
                    }));
                    setShowTaskModal(true);
                  }}
                >
                  + إسناد مهمة لموظف بالقسم
                </button>
              )}
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate('this-week')}>
                جدولة برامج القسم ({myDeptThisWeekUnscheduled.length} بانتظار الجدولة)
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.9rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>
                موظفو القسم ({myDeptStaff.length}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {myDeptStaff.map((emp) => (
                  <span key={emp.id} className="status-badge badge-muted" style={{ fontSize: '0.73rem', padding: '4px 10px' }}>
                    {emp.name} ({emp.jobTitle})
                  </span>
                ))}
              </div>

              {myDeptTasks.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>
                    مهام موظفي القسم ({myDeptTasks.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 170, overflowY: 'auto' }}>
                    {myDeptTasks.map((t) => (
                      <div key={t.id} style={{ padding: '5px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>{t.title}</strong> — {t.assignedEmployeeName}</span>
                        <StatusBadge status={t.status} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>
                برامج القسم المطلوب استكمال جدولتها هذا الأسبوع ({myDeptThisWeekUnscheduled.length}):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {myDeptThisWeekUnscheduled.slice(0, 8).map((occ) => (
                  <div
                    key={occ.id}
                    style={{
                      padding: '6px 9px',
                      borderRadius: 9,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{occ.programName}</span>
                    {canSchedulePlanned && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => onOpenScheduleModal({ mode: 'schedule_planned', occurrence: occ })}
                      >
                        جدولة التنفيذ
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Assign Task Modal */}
      {showTaskModal && (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal-panel" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800, fontSize: '1rem' }}>إسناد مهمة تشغيلية جديدة</h3>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowTaskModal(false)}>
                إغلاق
              </button>
            </div>
            <form onSubmit={handleSaveTaskSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">عنوان المهمة *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    placeholder="أدخل عنوان المهمة..."
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">الموظف المكلف *</label>
                  <select
                    className="form-select"
                    required
                    value={taskForm.assignedEmployeeId}
                    onChange={(e) => setTaskForm({ ...taskForm, assignedEmployeeId: e.target.value })}
                  >
                    <option value="">-- اختر الموظف --</option>
                    {assignableEmployeesForTask.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} — {emp.departmentName}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="form-label">تاريخ الاستحقاق</label>
                    <input
                      type="date"
                      className="form-input"
                      value={taskForm.dueDate}
                      onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">الأولوية</label>
                    <select
                      className="form-select"
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    >
                      <option value="عالية">عالية</option>
                      <option value="متوسطة">متوسطة</option>
                      <option value="عادية">عادية</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">تفاصيل المهمة</label>
                  <textarea
                    className="form-textarea"
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    placeholder="وصف مختصر للمطلوب تنفيذه..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary">
                  حفظ وإرسال تنبيه للموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget || bulkDeleteTasks)}
        onClose={() => {
          setDeleteTarget(null);
          setBulkDeleteTasks(null);
        }}
        onConfirm={handleConfirmDelete}
        entityType="task"
        entityTitle={deleteTarget?.entityTitle}
        items={bulkDeleteTasks}
      />

      <DrillDownRecordsModal
        drillDown={topDrillDown}
        onClose={() => setTopDrillDown(null)}
        state={state}
        onOpenScheduleModal={onOpenScheduleModal}
        onOpenDetailModal={onOpenDetailModal}
        onOpenEvaluationModal={onOpenEvaluationModal}
        onNavigate={onNavigate}
        onInspectReadiness={(item) => setTopReadinessTarget(item)}
      />

      <ReadinessInspectorModal
        isOpen={Boolean(topReadinessTarget)}
        onClose={() => setTopReadinessTarget(null)}
        targetItem={topReadinessTarget}
        state={state}
        onOpenScheduleModal={onOpenScheduleModal}
        onOpenDetailModal={onOpenDetailModal}
      />
    </div>
  );
}
