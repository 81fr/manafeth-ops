import React, { useState, useMemo } from 'react';
import {
  Search,
  BarChart3,
  Download,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Edit3,
  Trash2,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { hasPermission, canEditProgram, canDeleteEntity, canAccessDepartment } from '../engine/permissions';
import { MONTH_NAMES_AR, WORK_DAYS_AR } from '../engine/dateUtils';
import { exportOperationalExcel } from '../engine/excelImporter';
import { StatusBadge, PlannedGreenPill, DepartmentPill } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

/**
 * Comprehensive 16-Filter Search + Non-Financial Operational Reports & Plan Adherence (Req #6, #52, #65, #66)
 * Strictly ZERO financial fields anywhere in UI, Search, Reports, or Exports!
 */
export default function SearchAndReportsView({
  initialSubTab = 'search',
  onOpenScheduleModal,
  onOpenDetailModal,
}) {
  const { state, currentUser, softDeleteEntity } = useOps();
  const [subTab, setSubTab] = useState(initialSubTab);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canViewAllDepts = hasPermission(currentUser, 'view_all_club_programs') || currentUser?.isAdmin;
  const canViewDrafts = hasPermission(currentUser, 'view_drafts');

  React.useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // 16 Search Filters (Req #52)
  const [filters, setFilters] = useState({
    q: '',
    deptId: !canViewAllDepts && currentUser?.departmentId ? currentUser.departmentId : 'all',
    initiative: 'all',
    indicator: 'all',
    employeeId: 'all',
    scopeId: 'all',
    venueId: 'all',
    month: 'all',
    globalWeek: 'all',
    day: 'all',
    periodId: 'all',
    programType: 'all',
    status: 'all',
    hasConflict: 'all',
    hasException: 'all',
  });

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);
  const studentMap = useMemo(() => Object.fromEntries((state.students || []).map((s) => [s.id, s.name])), [state.students]);

  const distinctInitiatives = useMemo(
    () => Array.from(new Set(state.programsCatalog.map((p) => p.initiative).filter(Boolean))),
    [state.programsCatalog]
  );

  const distinctIndicators = useMemo(
    () => Array.from(new Set(state.programsCatalog.map((p) => p.strategicIndicator).filter(Boolean))),
    [state.programsCatalog]
  );

  // Unified searchable rows across all plannedOccurrences + standalone scheduledExecutions
  const allSearchableRows = useMemo(() => {
    const canSeeExecution = (ex) => {
      if (!ex) return false;
      if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) {
        return false;
      }
      return true;
    };

    const rows = state.plannedOccurrences.map((occ) => {
      const rawEx = occ.linkedExecution;
      const ex = canSeeExecution(rawEx) ? rawEx : null;
      const hasCnf = Boolean(ex?.conflictsSnapshot?.length > 0 && ex.status !== 'معتمد باستثناء');
      const hasExc = Boolean(ex?.exceptionRequestId || ex?.status === 'معتمد باستثناء' || ex?.status?.includes('الرأي'));
      const studentNames = (ex?.studentIds || []).map((sid) => studentMap[sid]).filter(Boolean);
      const scopeNames = (ex?.scopeIds || []).map((s) => scopeMap[s]).filter(Boolean);
      return {
        id: occ.id,
        occurrence: occ,
        execution: ex,
        programName: occ.programName,
        subProgramsCount: (ex?.subPrograms || []).length,
        departmentId: occ.departmentId,
        departmentName: occ.departmentName,
        initiative: occ.initiative || '',
        strategicIndicator: occ.strategicIndicator || '',
        plannedMonth: occ.plannedMonth,
        plannedMonthName: occ.plannedMonthName,
        plannedWeekLabel: occ.plannedWeekLabel,
        plannedGlobalWeek: occ.plannedGlobalWeek,
        executionGlobalWeek: ex?.executionGlobalWeek || null,
        day: ex?.day || '',
        executionDate: ex?.executionDate || '',
        periodId: ex?.periodId || '',
        coveredPeriodIds: ex?.coveredPeriodIds || (ex?.periodId ? [ex.periodId] : []),
        periodName: ex?.periodName || '',
        venueId: ex?.venueId || '',
        venueName: ex?.venueId ? venueMap[ex.venueId] : '',
        scopeIds: ex?.scopeIds || [],
        scopeName: [...scopeNames, ...(studentNames.length ? [`طلاب (${studentNames.length})`] : [])].join('، '),
        leadEmployeeId: ex?.leadEmployeeId || '',
        participatingEmployeeIds: ex?.participatingEmployeeIds || [],
        employeeName: ex?.leadEmployeeId ? empMap[ex.leadEmployeeId] : (occ.jobRoles || []).join('، '),
        programType: ex?.programType || occ.programType || 'برنامج اعتيادي',
        status: ex ? ex.status : 'مخطط',
        hasConflict: hasCnf,
        hasException: hasExc,
      };
    });

    // Any standalone scheduled execution without occurrenceId
    state.scheduledExecutions.forEach((ex) => {
      if (ex.occurrenceId) return;
      if (!canSeeExecution(ex)) return;
      const studentNames = (ex.studentIds || []).map((sid) => studentMap[sid]).filter(Boolean);
      const scopeNames = (ex.scopeIds || []).map((s) => scopeMap[s]).filter(Boolean);
      rows.unshift({
        id: ex.id,
        occurrence: null,
        execution: ex,
        programName: ex.programName,
        subProgramsCount: (ex.subPrograms || []).length,
        departmentId: ex.departmentId,
        departmentName: ex.departmentName,
        initiative: ex.initiative || '',
        strategicIndicator: ex.strategicIndicator || '',
        plannedMonth: ex.plannedMonth,
        plannedMonthName: ex.plannedMonthName,
        plannedWeekLabel: ex.plannedWeekLabel,
        plannedGlobalWeek: ex.plannedGlobalWeek,
        executionGlobalWeek: ex.executionGlobalWeek,
        day: ex.day || '',
        executionDate: ex.executionDate || '',
        periodId: ex.periodId || '',
        coveredPeriodIds: ex.coveredPeriodIds || (ex.periodId ? [ex.periodId] : []),
        periodName: ex.periodName || '',
        venueId: ex.venueId || '',
        venueName: ex.venueId ? venueMap[ex.venueId] : '',
        scopeIds: ex.scopeIds || [],
        scopeName: [...scopeNames, ...(studentNames.length ? [`طلاب (${studentNames.length})`] : [])].join('، '),
        leadEmployeeId: ex.leadEmployeeId || '',
        participatingEmployeeIds: ex.participatingEmployeeIds || [],
        employeeName: ex.leadEmployeeId ? empMap[ex.leadEmployeeId] : '',
        programType: ex.programType || 'برنامج اعتيادي',
        status: ex.status,
        hasConflict: Boolean(ex.conflictsSnapshot?.length > 0 && ex.status !== 'معتمد باستثناء'),
        hasException: Boolean(ex.exceptionRequestId || ex.status === 'معتمد باستثناء'),
      });
    });

    return rows.filter((r) => canViewAllDepts || canAccessDepartment(currentUser, r.departmentId));
  }, [
    state.plannedOccurrences,
    state.scheduledExecutions,
    venueMap,
    scopeMap,
    empMap,
    studentMap,
    canViewDrafts,
    canViewAllDepts,
    currentUser,
  ]);

  const filteredRows = useMemo(() => {
    return allSearchableRows.filter((r) => {
      if (filters.q.trim()) {
        const q = filters.q.trim();
        const hay = `${r.programName} ${r.departmentName} ${r.initiative} ${r.strategicIndicator} ${r.employeeName} ${r.venueName} ${r.scopeName}`;
        if (!hay.includes(q)) return false;
      }
      if (filters.deptId !== 'all' && r.departmentId !== filters.deptId) return false;
      if (filters.initiative !== 'all' && r.initiative !== filters.initiative) return false;
      if (filters.indicator !== 'all' && r.strategicIndicator !== filters.indicator) return false;
      if (
        filters.employeeId !== 'all' &&
        r.leadEmployeeId !== filters.employeeId &&
        !(r.participatingEmployeeIds || []).includes(filters.employeeId)
      ) {
        return false;
      }
      if (filters.scopeId !== 'all' && !(r.scopeIds || []).includes(filters.scopeId)) return false;
      if (filters.venueId !== 'all' && r.venueId !== filters.venueId) return false;
      if (filters.month !== 'all' && Number(r.plannedMonth) !== Number(filters.month)) return false;
      if (filters.globalWeek !== 'all' && Number(r.plannedGlobalWeek) !== Number(filters.globalWeek)) return false;
      if (filters.day !== 'all' && r.day !== filters.day) return false;
      if (
        filters.periodId !== 'all' &&
        r.periodId !== filters.periodId &&
        !(r.coveredPeriodIds || []).includes(filters.periodId)
      ) {
        return false;
      }
      if (filters.programType !== 'all' && r.programType !== filters.programType) return false;
      if (filters.status !== 'all' && r.status !== filters.status) return false;
      if (filters.hasConflict === 'yes' && !r.hasConflict) return false;
      if (filters.hasConflict === 'no' && r.hasConflict) return false;
      if (filters.hasException === 'yes' && !r.hasException) return false;
      if (filters.hasException === 'no' && r.hasException) return false;
      return true;
    });
  }, [allSearchableRows, filters]);

  // Plan Adherence & Operational Analytics (Req #65 & #66)
  const analytics = useMemo(() => {
    let onTime = 0;
    let early = 0;
    let late = 0;
    let cancelled = 0;
    let notYetExecuted = 0;

    allSearchableRows.forEach((r) => {
      if (r.status === 'ملغي') {
        cancelled++;
      } else if (r.execution) {
        if (!r.plannedGlobalWeek || r.executionGlobalWeek === r.plannedGlobalWeek) onTime++;
        else if (r.executionGlobalWeek < r.plannedGlobalWeek) early++;
        else late++;
      } else {
        notYetExecuted++;
      }
    });

    const byDept = state.departments.map((d) => {
      const dRows = allSearchableRows.filter((r) => r.departmentId === d.id);
      const scheduled = dRows.filter((r) => Boolean(r.execution)).length;
      const completed = dRows.filter((r) => r.status === 'منفذ' || r.status === 'مكتمل').length;
      const withConflict = dRows.filter((r) => r.hasConflict).length;
      const withException = dRows.filter((r) => r.hasException).length;
      return {
        ...d,
        plannedTotal: dRows.length,
        distinctPrograms: state.programsCatalog.filter((p) => p.departmentId === d.id).length,
        scheduled,
        unscheduled: dRows.length - scheduled,
        completed,
        withConflict,
        withException,
      };
    });

    // Top Initiatives count
    const initCounts = {};
    allSearchableRows.forEach((r) => {
      const k = `${r.departmentName} — ${r.initiative || 'عام'}`;
      initCounts[k] = (initCounts[k] || 0) + 1;
    });
    const topInitiatives = Object.entries(initCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return { onTime, early, late, cancelled, notYetExecuted, byDept, topInitiatives };
  }, [allSearchableRows, state.departments, state.programsCatalog]);

  const handleExportSearch = () => {
    const exportRows = filteredRows.map((r) => ({
      'اسم البرنامج': r.programName,
      'القسم': r.departmentName,
      'المبادرة': r.initiative,
      'المؤشر الاستراتيجي': r.strategicIndicator,
      'الشهر المخطط': r.plannedMonthName,
      'الأسبوع المخطط': r.plannedWeekLabel,
      'رقم الأسبوع السنوي': r.plannedGlobalWeek,
      'اليوم التنفيذي': r.day || 'غير محدد',
      'التاريخ التنفيذي': r.executionDate || 'غير محدد',
      'الفترة': r.periodName || 'غير محدد',
      'القاعة / الموقع': r.venueName || 'غير محدد',
      'الفئة / النطاق': r.scopeName || 'غير محدد',
      'الموظف المسؤول': r.employeeName || 'غير محدد',
      'نوع البرنامج': r.programType,
      'الحالة': r.status,
      'يوجد تعارض': r.hasConflict ? 'نعم' : 'لا',
      'مرتبط باستثناء': r.hasException ? 'نعم' : 'لا',
    }));
    exportOperationalExcel(exportRows, 'البرامج_والمواعيد', 'تقرير_بحث_منصة_منافذ.xlsx');
  };

  const resetFilters = () =>
    setFilters({
      q: '',
      deptId: 'all',
      initiative: 'all',
      indicator: 'all',
      employeeId: 'all',
      scopeId: 'all',
      venueId: 'all',
      month: 'all',
      globalWeek: 'all',
      day: 'all',
      periodId: 'all',
      programType: 'all',
      status: 'all',
      hasConflict: 'all',
      hasException: 'all',
    });

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Tabs */}
      <div className="card" style={{ padding: '0.85rem 1.15rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="tabs-bar" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            <button
              type="button"
              className={`tab-btn ${subTab === 'search' ? 'active' : ''}`}
              onClick={() => setSubTab('search')}
            >
              <Search size={15} />
              <span>البحث والتصفية الشاملة ({filteredRows.length})</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${subTab === 'reports' ? 'active' : ''}`}
              onClick={() => setSubTab('reports')}
            >
              <BarChart3 size={15} />
              <span>التقارير التشغيلية وقياس الالتزام بالخطة</span>
            </button>
          </div>

          <button type="button" className="btn btn-sm btn-teal" onClick={handleExportSearch}>
            <Download size={14} />
            <span>تصدير Excel تشغيلي (بدون أي بيانات مالية)</span>
          </button>
        </div>
      </div>

      {subTab === 'search' ? (
        <>
          {/* 16-Criteria Filter Grid (Req #52) */}
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.6rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder="بحث نصي شامل..."
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
              <select className="form-select" value={filters.deptId} onChange={(e) => setFilters({ ...filters, deptId: e.target.value })}>
                <option value="all">القسم: الكل</option>
                {state.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="form-select" value={filters.initiative} onChange={(e) => setFilters({ ...filters, initiative: e.target.value })}>
                <option value="all">المبادرة: الكل</option>
                {distinctInitiatives.map((ini) => <option key={ini} value={ini}>{ini}</option>)}
              </select>
              <select className="form-select" value={filters.indicator} onChange={(e) => setFilters({ ...filters, indicator: e.target.value })}>
                <option value="all">المؤشر: الكل</option>
                {distinctIndicators.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
              </select>
              <select className="form-select" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
                <option value="all">الشهر: الكل</option>
                {Object.entries(MONTH_NAMES_AR).map(([m, name]) => <option key={m} value={m}>{name}</option>)}
              </select>
              <select className="form-select" value={filters.globalWeek} onChange={(e) => setFilters({ ...filters, globalWeek: e.target.value })}>
                <option value="all">الأسبوع السنوي: الكل</option>
                {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>الأسبوع {w}</option>)}
              </select>
              <select className="form-select" value={filters.day} onChange={(e) => setFilters({ ...filters, day: e.target.value })}>
                <option value="all">اليوم: الكل</option>
                {WORK_DAYS_AR.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="form-select" value={filters.periodId} onChange={(e) => setFilters({ ...filters, periodId: e.target.value })}>
                <option value="all">الفترة: الكل</option>
                {state.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="form-select" value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}>
                <option value="all">الموظف / المعلم: الكل</option>
                {state.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <select className="form-select" value={filters.scopeId} onChange={(e) => setFilters({ ...filters, scopeId: e.target.value })}>
                <option value="all">الفئة / النطاق: الكل</option>
                {state.scopes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="form-select" value={filters.venueId} onChange={(e) => setFilters({ ...filters, venueId: e.target.value })}>
                <option value="all">القاعة / الموقع: الكل</option>
                {state.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <select className="form-select" value={filters.programType} onChange={(e) => setFilters({ ...filters, programType: e.target.value })}>
                <option value="all">نوع البرنامج: الكل</option>
                {state.programTypes.map((pt) => {
                  const ptName = typeof pt === 'object' ? pt.name : pt;
                  return <option key={pt.id || ptName} value={ptName}>{ptName}</option>;
                })}
              </select>
              <select className="form-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="all">الحالة: الكل</option>
                {['مخطط', 'يحتاج جدولة', 'مسودة', 'معتمد', 'معتمد باستثناء', 'بانتظار إبداء الرأي', 'بانتظار الاعتماد', 'يوجد تعارض', 'منفذ', 'مكتمل', 'مؤجل', 'ملغي'].map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <select className="form-select" value={filters.hasConflict} onChange={(e) => setFilters({ ...filters, hasConflict: e.target.value })}>
                <option value="all">وجود تعارض: الكل</option>
                <option value="yes">يوجد تعارض</option>
                <option value="no">بدون تعارض</option>
              </select>
              <select className="form-select" value={filters.hasException} onChange={(e) => setFilters({ ...filters, hasException: e.target.value })}>
                <option value="all">وجود استثناء: الكل</option>
                <option value="yes">مرتبط باستثناء</option>
                <option value="no">بدون استثناء</option>
              </select>
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                <RotateCcw size={14} />
                <span>إعادة تعيين</span>
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>اسم البرنامج</th>
                  <th>القسم</th>
                  <th>المبادرة</th>
                  <th>الموعد المخطط (الأخضر)</th>
                  <th>التنفيذ الفعلي</th>
                  <th>القاعة / الفئة</th>
                  <th>المسؤول</th>
                  <th>الحالة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 120).map((r) => {
                  const canEditRow = canEditProgram(currentUser, r.execution || r.occurrence);
                  const delType = r.execution ? 'program_execution' : 'planned_occurrence';
                  const delId = r.execution ? r.execution.id : r.occurrence?.id;
                  const canDeleteRow = Boolean(delId && canDeleteEntity(currentUser, delType, r.departmentId));
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 800 }}>
                        <div
                          style={{ cursor: 'pointer', color: 'var(--brand-ink)' }}
                          onClick={() => onOpenDetailModal({ occurrence: r.occurrence, execution: r.execution })}
                        >
                          {r.programName}
                        </div>
                        {r.subProgramsCount > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--brand-teal)', fontWeight: 700, marginTop: 2 }}>
                            ↳ يتضمن {r.subProgramsCount} فقرات فرعية
                          </div>
                        )}
                      </td>
                      <td>
                        <DepartmentPill deptId={r.departmentId} deptName={r.departmentName} departments={state.departments} />
                      </td>
                      <td style={{ fontSize: '0.76rem' }}>{r.initiative || '—'}</td>
                      <td>
                        <PlannedGreenPill
                          monthName={r.plannedMonthName}
                          weekLabel={r.plannedWeekLabel}
                          globalWeek={r.plannedGlobalWeek}
                          compact
                        />
                      </td>
                      <td style={{ fontSize: '0.77rem' }}>
                        {r.execution ? `${r.day} (${r.executionDate}) • ${r.periodName}` : 'لم يُجدول'}
                      </td>
                      <td style={{ fontSize: '0.76rem' }}>
                        {r.venueName || '—'} {r.scopeName ? `(${r.scopeName})` : ''}
                      </td>
                      <td style={{ fontSize: '0.76rem' }}>{r.employeeName || '—'}</td>
                      <td>
                        <StatusBadge status={r.status} size="sm" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            title="عرض التفاصيل"
                            onClick={() => onOpenDetailModal({ occurrence: r.occurrence, execution: r.execution })}
                          >
                            <Eye size={13} />
                          </button>
                          {canEditRow && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              title="جدولة أو تعديل"
                              onClick={() =>
                                onOpenScheduleModal({
                                  mode: r.execution ? 'edit_execution' : 'schedule_planned',
                                  occurrence: r.occurrence,
                                  execution: r.execution,
                                })
                              }
                            >
                              <Edit3 size={13} />
                            </button>
                          )}
                          {canDeleteRow && (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              title="حذف آمن"
                              onClick={() =>
                                setDeleteTarget({
                                  entityType: delType,
                                  entityId: delId,
                                  entityTitle: r.programName,
                                })
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredRows.length > 120 && (
              <div style={{ padding: '0.7rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                يُعرض أول 120 سجلاً من أصل {filteredRows.length} لتسريع التصفح — استخدم الفلاتر أعلاه أو التصدير لملف Excel لعرض القائمة الكاملة.
              </div>
            )}
          </div>
        </>
      ) : (
        /* OPERATIONAL REPORTS & PLAN ADHERENCE (Req #65 & #66) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Plan Adherence KPIs (Req #66) */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '0.85rem' }}>
              <span>تقرير قياس الالتزام بالخطة (مقارنة الأسبوع الأخضر المخطط مع أسبوع التنفيذ الفعلي)</span>
            </div>
            <div className="stats-grid" style={{ marginBottom: 0 }}>
              <div className="stat-card" style={{ '--stat-color': '#00A59B' }}>
                <div>
                  <div className="stat-value">{analytics.onTime}</div>
                  <div className="stat-label">مجدول / منفذ في موعده المخطط</div>
                </div>
              </div>
              <div className="stat-card" style={{ '--stat-color': '#3b82f6' }}>
                <div>
                  <div className="stat-value">{analytics.early}</div>
                  <div className="stat-label">نُفّذ مبكرًا عن الأسبوع المخطط</div>
                </div>
              </div>
              <div className="stat-card" style={{ '--stat-color': '#f59e0b' }}>
                <div>
                  <div className="stat-value">{analytics.late}</div>
                  <div className="stat-label">نُفّذ متأخرًا عن الأسبوع المخطط</div>
                </div>
              </div>
              <div className="stat-card" style={{ '--stat-color': '#8CC240' }}>
                <div>
                  <div className="stat-value">{analytics.notYetExecuted}</div>
                  <div className="stat-label">مواعيد مخططة قيد الاستكمال</div>
                </div>
              </div>
              <div className="stat-card" style={{ '--stat-color': '#ef4444' }}>
                <div>
                  <div className="stat-value">{analytics.cancelled}</div>
                  <div className="stat-label">برامج تم إلغاؤها</div>
                </div>
              </div>
            </div>
          </div>

          {/* Department Operational Performance Table */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '0.8rem' }}>
              <span>تقرير أداء وجاهزية الأقسام الأربعة (تقرير تشغيلي خالٍ من أي قيم مالية)</span>
            </div>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>القسم</th>
                    <th>عدد البرامج المميزة</th>
                    <th>إجمالي المواعيد المخططة (الأخضر)</th>
                    <th>تمت جدولتها تنفيذياً</th>
                    <th>غير مجدولة بعد</th>
                    <th>مكتملة / منفذة</th>
                    <th>تعارضات</th>
                    <th>استثناءات</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.byDept.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 800, color: d.color }}>{d.name}</td>
                      <td>{d.distinctPrograms} برنامجًا</td>
                      <td><span className="status-badge badge-planned-green">{d.plannedTotal} موعد</span></td>
                      <td><strong style={{ color: 'var(--brand-teal)' }}>{d.scheduled}</strong></td>
                      <td>{d.unscheduled}</td>
                      <td>{d.completed}</td>
                      <td>{d.withConflict}</td>
                      <td>{d.withException}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Initiatives & Resource Summary */}
          <div className="comparison-grid">
            <div className="card">
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 8 }}>أكثر المبادرات كثافة في المواعيد المخططة:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {analytics.topInitiatives.map(([label, cnt]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '5px 8px', background: 'var(--bg)', borderRadius: 8 }}>
                    <span>{label}</span>
                    <strong>{cnt} موعد</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 8 }}>تقرير القاعات والالتزامات الثابتة:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  • إجمالي القاعات والمواقع التشغيلية: <strong>{state.venues.length} موقعًا</strong> (منها {state.venues.filter((v) => v.occupiedPeriodsInClassTable === 0).length} قاعات متخصصة ومرافق متاحة لبرامج الأقسام).
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  • إجمالي الحصص والأنشطة الأسبوعية الثابتة المربوطة: <strong>{state.weeklyCommitments.length} حصة ونشاطًا</strong>.
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  • إجمالي تكليفات الإشراف اليومي (استقبال، صلوات، انصراف): <strong>{state.supervisionDuties.length} تكليفًا ميدانيًا</strong>.
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  • إجمالي طلبات الاستثناء المرفوعة في المنصة: <strong>{state.exceptionRequests.length} طلبات</strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        entityType={deleteTarget?.entityType}
        entityTitle={deleteTarget?.entityTitle}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async (reason) => {
          if (deleteTarget) {
            await softDeleteEntity({
              entityType: deleteTarget.entityType,
              entityId: deleteTarget.entityId,
              reason,
            });
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
