import React, { useState, useMemo } from 'react';
import { Calendar, Filter, LayoutGrid, List, Plus, Shield } from 'lucide-react';
import { useOps } from '../engine/store';
import { hasPermission } from '../engine/permissions';
import {
  WORK_DAYS_AR,
  getDatesForGlobalWeek,
  globalWeekToMonthInfo,
  formatTime12Ar,
  isDateInExecutionRange,
  formatDateRangeAr,
} from '../engine/dateUtils';
import { StatusBadge, DepartmentPill } from '../components/StatusBadge';
import { OperationalFileCard } from '../components/OperationalFilesToolbar';

/**
 * Unified Daily & Weekly Master Operational Schedule (الجدول التشغيلي الموحد — Req #10, #14, #20-#22, #27, #48)
 * Combines Weekly Recurring Commitments + Supervision + Scheduled Department Programs + Approved Exceptions
 * Strictly Read-Only for regular employees unless permitted!
 */
export default function MasterScheduleView({ onOpenScheduleModal, onOpenDetailModal }) {
  const { state, currentUser, activeGlobalWeek, setActiveGlobalWeek } = useOps();

  const canCreateProgram = hasPermission(currentUser, 'create_program');
  const canViewDrafts = hasPermission(currentUser, 'view_drafts');

  const [displayMode, setDisplayMode] = useState('weekly_grid'); // 'weekly_grid' | 'list'
  const [dayFilter, setDayFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [empFilter, setEmpFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [venueFilter, setVenueFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [includeSupervision, setIncludeSupervision] = useState(false);

  const weekDates = useMemo(() => getDatesForGlobalWeek(activeGlobalWeek), [activeGlobalWeek]);

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);
  const periodMap = useMemo(() => Object.fromEntries(state.periods.map((p) => [p.id, p])), [state.periods]);

  // Visible periods respecting showInSchedule (Req #27)
  const visiblePeriods = useMemo(
    () => state.periods.filter((p) => p.showInSchedule !== false),
    [state.periods]
  );

  // Build unified operational entries for the selected week
  const unifiedEntries = useMemo(() => {
    const entries = [];

    // 1. Weekly recurring classes & activities across Sun..Thu
    state.weeklyCommitments.forEach((rawWcm) => {
      const dateStr = weekDates[rawWcm.day];
      const ov = state.commitmentOverrides[`${rawWcm.id}__${dateStr}`];
      if (ov?.cancelledForDate || ov?.suspendedForDate) return;

      const day = ov?.newDay || rawWcm.day;
      const periodId = ov?.newPeriodId || rawWcm.periodId;
      const venueId = ov?.newVenueId !== undefined ? ov.newVenueId : rawWcm.venueId;
      const leadEmpId = ov?.newLeadEmployeeId || rawWcm.leadEmployeeId || rawWcm.employeeId;
      const pObj = periodMap[periodId];
      if (pObj && pObj.showInSchedule === false) return;

      entries.push({
        id: rawWcm.id,
        title: rawWcm.title || rawWcm.activityTitle || 'نشاط أسبوعي',
        departmentId: rawWcm.departmentId,
        departmentName: state.departments.find((d) => d.id === rawWcm.departmentId)?.name || 'عام',
        day,
        date: weekDates[day] || '',
        periodId,
        coveredPeriodIds: [periodId],
        periodName: pObj?.name || rawWcm.periodName,
        startTime: pObj?.approvedStart || pObj?.startTime || '15:50',
        endTime: pObj?.approvedEnd || pObj?.endTime || '16:40',
        venueId,
        venueName: venueMap[venueId] || rawWcm.venueName || rawWcm.venueNote || 'بدون قاعة',
        scopeIds: rawWcm.scopeIds || [],
        scopeName:
          (rawWcm.scopeIds || []).map((s) => scopeMap[s]).filter(Boolean).join('، ') ||
          (rawWcm.scopeNames || []).join('، ') ||
          rawWcm.rawClassText ||
          'عام',
        leadEmployeeId: leadEmpId,
        participatingEmployeeIds: rawWcm.participatingEmployeeIds || [],
        employeeName: empMap[leadEmpId] || rawWcm.employeeName || '—',
        activityType: rawWcm.programType || 'برنامج تعليمي',
        status: 'معتمد بالجدول',
        origin: 'جدول أسبوعي ثابت',
        subPrograms: [],
      });
    });

    // 2. Scheduled Department Programs & Approved Exceptions for this week (supports single-day & multi-day ranges)
    state.scheduledExecutions.forEach((ex) => {
      if (ex.status === 'ملغي') return;
      if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) {
        return;
      }
      const pObj = periodMap[ex.periodId];
      const covIds = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
      const scopeLabels = (ex.scopeIds || []).map((s) => scopeMap[s]).filter(Boolean);
      if (ex.studentIds?.length > 0) {
        scopeLabels.push(`طلاب محددون (${ex.studentIds.length})`);
      }

      const matchedDaysInWeek = WORK_DAYS_AR.filter((dAr) => {
        const dIso = weekDates[dAr];
        if (ex.executionDate && dIso) {
          return isDateInExecutionRange(dIso, dAr, ex);
        }
        return (
          ex.day === dAr &&
          (!ex.executionGlobalWeek || Number(ex.executionGlobalWeek) === Number(activeGlobalWeek))
        );
      });

      const isMultiDay = ex.executionEndDate && ex.executionEndDate > ex.executionDate;

      matchedDaysInWeek.forEach((dAr) => {
        const dIso = weekDates[dAr] || ex.executionDate;
        entries.push({
          id: matchedDaysInWeek.length > 1 ? `${ex.id}__${dAr}` : ex.id,
          executionObj: ex,
          title: isMultiDay
            ? `${ex.programName} (${formatDateRangeAr(ex.executionDate, ex.executionEndDate, { compact: true })})`
            : ex.programName,
          departmentId: ex.departmentId,
          departmentName: ex.departmentName,
          day: dAr,
          date: dIso,
          periodId: ex.periodId,
          coveredPeriodIds: covIds,
          periodName: ex.periodName || pObj?.name || '',
          startTime: ex.startTime || pObj?.approvedStart || '',
          endTime: ex.endTime || pObj?.approvedEnd || '',
          venueId: ex.venueId,
          venueName: venueMap[ex.venueId] || '—',
          scopeIds: ex.scopeIds || [],
          scopeName: scopeLabels.join('، ') || 'عام',
          leadEmployeeId: ex.leadEmployeeId,
          participatingEmployeeIds: ex.participatingEmployeeIds || [],
          employeeName: empMap[ex.leadEmployeeId] || '—',
          activityType: ex.status === 'معتمد باستثناء' ? 'استثناء معتمد' : ex.programType || 'برنامج قسم',
          status: ex.status,
          origin: 'جدولة تنفيذية للأقسام',
          subPrograms: ex.subPrograms || [],
        });
      });
    });

    // 3. Optional Daily Supervision blocks
    if (includeSupervision) {
      WORK_DAYS_AR.forEach((dAr) => {
        state.supervisionDuties.forEach((sr) => {
          if (sr.showInSchedule === false) return;
          entries.push({
            id: `SUP-${dAr}-${sr.id}`,
            title: `إشراف ميداني واستقبال وصلوات وانصراف (${sr.floor})`,
            departmentId: null,
            departmentName: 'الإشراف اليومي',
            day: dAr,
            date: weekDates[dAr],
            periodId: 'PER_RECEPTION',
            coveredPeriodIds: ['PER_RECEPTION'],
            periodName: 'أوقات الإشراف والصلوات',
            startTime: '15:15',
            endTime: '19:45',
            venueId: null,
            venueName: sr.reception || sr.receptionLocation || sr.floor,
            scopeIds: [],
            scopeName: sr.floor,
            leadEmployeeId: sr.employeeId,
            participatingEmployeeIds: [],
            employeeName: sr.supervisor || sr.supervisorName || '—',
            activityType: 'إشراف يومي',
            status: 'معتمد بالجدول',
            origin: 'جدول الإشراف اليومي',
            subPrograms: [],
          });
        });
      });
    }

    // Apply all user filters (Req #14)
    return entries.filter((item) => {
      if (dayFilter !== 'all' && item.day !== dayFilter) return false;
      if (deptFilter !== 'all' && item.departmentId !== deptFilter) return false;
      if (
        empFilter !== 'all' &&
        item.leadEmployeeId !== empFilter &&
        !(item.participatingEmployeeIds || []).includes(empFilter)
      ) {
        return false;
      }
      if (scopeFilter !== 'all' && !(item.scopeIds || []).includes(scopeFilter)) return false;
      if (venueFilter !== 'all' && item.venueId !== venueFilter) return false;
      if (
        periodFilter !== 'all' &&
        item.periodId !== periodFilter &&
        !(item.coveredPeriodIds || []).includes(periodFilter)
      ) {
        return false;
      }
      if (typeFilter !== 'all' && item.activityType !== typeFilter) return false;
      return true;
    });
  }, [
    state.weeklyCommitments,
    state.commitmentOverrides,
    state.scheduledExecutions,
    state.supervisionDuties,
    state.departments,
    activeGlobalWeek,
    weekDates,
    periodMap,
    venueMap,
    scopeMap,
    empMap,
    includeSupervision,
    dayFilter,
    deptFilter,
    empFilter,
    scopeFilter,
    venueFilter,
    periodFilter,
    typeFilter,
    canViewDrafts,
    currentUser,
  ]);

  const activityTypes = useMemo(() => {
    return [
      'برنامج تعليمي',
      'برنامج تربوي / حلقة',
      'برنامج ترفيهي وتحفيزي',
      'برنامج مهاري وموهبة',
      'برنامج اعتيادي',
      'برنامج نوعي',
      'استثناء معتمد',
      'إشراف يومي',
    ];
  }, []);

  const gridPeriods = visiblePeriods.filter((p) => p.category === 'program_period');

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {canCreateProgram && <OperationalFileCard fileType="schedule" compact />}

      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                الجدول التشغيلي اليومي والأسبوعي الموحد للنادي والأقسام
              </h2>
              {!canCreateProgram && (
                <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>
                  للاطلاع فقط (معلومة تشغيلية عامة)
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              يدمج الحصص والأنشطة الأسبوعية الثابتة مع البرامج المجدولة للأقسام والفقرات الفرعية والاستثناءات المعتمدة في عرض واحد ({unifiedEntries.length} سجل معروض).
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-select"
              style={{ width: 215 }}
              value={activeGlobalWeek}
              onChange={(e) => setActiveGlobalWeek(Number(e.target.value))}
            >
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                const inf = globalWeekToMonthInfo(w);
                return (
                  <option key={w} value={w}>
                    أسبوع {w}: {inf.monthName.split(' ')[0]} — {inf.weekLabel}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              className={`btn btn-sm ${displayMode === 'weekly_grid' ? 'btn-teal' : 'btn-secondary'}`}
              onClick={() => setDisplayMode('weekly_grid')}
            >
              <LayoutGrid size={14} />
              <span>شبكة الأسبوع والفترات</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${displayMode === 'list' ? 'btn-teal' : 'btn-secondary'}`}
              onClick={() => setDisplayMode('list')}
            >
              <List size={14} />
              <span>قائمة تفصيلية</span>
            </button>
            {canCreateProgram && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onOpenScheduleModal({ mode: 'new_program' })}
              >
                <Plus size={14} />
                <span>إضافة برنامج</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Multi-Dimensional Filter Bar (Req #14) */}
      <div className="filter-bar" style={{ marginBottom: 0 }}>
        <Filter size={15} color="var(--brand-teal)" />
        <select className="form-select" style={{ width: 130 }} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
          <option value="all">كل الأيام</option>
          {WORK_DAYS_AR.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select className="form-select" style={{ width: 165 }} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="all">كل الأقسام</option>
          {state.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <select className="form-select" style={{ width: 175 }} value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="all">كل الموظفين والمعلمين</option>
          {state.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>

        <select className="form-select" style={{ width: 155 }} value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
          <option value="all">كل الفئات والنطاقات</option>
          {state.scopes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select className="form-select" style={{ width: 160 }} value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
          <option value="all">كل القاعات والمواقع</option>
          {state.venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>

        <select className="form-select" style={{ width: 145 }} value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
          <option value="all">كل الفترات</option>
          {visiblePeriods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select className="form-select" style={{ width: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">كل أنواع الأنشطة</option>
          {activityTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeSupervision}
            onChange={(e) => setIncludeSupervision(e.target.checked)}
          />
          <span>إظهار الإشراف اليومي</span>
        </label>
      </div>

      {displayMode === 'weekly_grid' ? (
        /* Sun..Thu x Periods Matrix */
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: 135 }}>اليوم / التاريخ</th>
                {gridPeriods.map((p) => (
                  <th key={p.id}>
                    <div>{p.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {formatTime12Ar(p.approvedStart)} - {formatTime12Ar(p.approvedEnd)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(dayFilter === 'all' ? WORK_DAYS_AR : [dayFilter]).map((dayAr) => (
                <tr key={dayAr}>
                  <td style={{ verticalAlign: 'top', fontWeight: 800, background: 'var(--bg)' }}>
                    <div>{dayAr}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{weekDates[dayAr]}</div>
                  </td>
                  {gridPeriods.map((per) => {
                    const cellItems = unifiedEntries.filter(
                      (it) => it.day === dayAr && (it.coveredPeriodIds || [it.periodId]).includes(per.id)
                    );
                    return (
                      <td key={per.id} style={{ verticalAlign: 'top', minWidth: 250 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 265, overflowY: 'auto' }}>
                          {cellItems.length === 0 ? (
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>لا توجد أنشطة مطابقة</span>
                          ) : (
                            cellItems.map((it) => {
                              const matchingSubs = (it.subPrograms || []).filter((sp) =>
                                (sp.coveredPeriodIds || [sp.periodId]).includes(per.id)
                              );
                              return (
                                <div
                                  key={`${it.id}-${per.id}`}
                                  onClick={() => it.executionObj && onOpenDetailModal({ execution: it.executionObj })}
                                  style={{
                                    padding: '6px 8px',
                                    borderRadius: 8,
                                    border: it.executionObj ? '1.5px solid var(--brand-teal)' : '1px solid var(--border)',
                                    background: it.status === 'معتمد باستثناء' ? 'var(--exception-bg)' : 'var(--bg)',
                                    fontSize: '0.75rem',
                                    cursor: it.executionObj ? 'pointer' : 'default',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                                    <strong>{it.title}</strong>
                                    {it.executionObj && <StatusBadge status={it.status} size="sm" />}
                                  </div>
                                  {(it.coveredPeriodIds || []).length > 1 && (
                                    <div style={{ fontSize: '0.67rem', color: 'var(--brand-teal)', fontWeight: 700 }}>
                                      ✓ ممتد عبر: {it.periodName}
                                    </div>
                                  )}
                                  {matchingSubs.length > 0 && (
                                    <div style={{ marginTop: 3, paddingRight: 6, borderRight: '2px solid var(--brand-teal)' }}>
                                      {matchingSubs.map((sp) => (
                                        <div key={sp.id || sp.name} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                          ↳ {sp.name}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    الفئة: {it.scopeName} | القاعة: {it.venueName} | {it.employeeName}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Detailed Tabular View */
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>اليوم والتاريخ</th>
                <th>الفترات والوقت</th>
                <th>البرنامج الرئيسي والفقرات الفرعية</th>
                <th>القسم</th>
                <th>النوع</th>
                <th>الفئة / الطلاب</th>
                <th>القاعة / الموقع</th>
                <th>الموظف / المعلم</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {unifiedEntries.slice(0, 250).map((it) => (
                <tr
                  key={it.id}
                  style={{ cursor: it.executionObj ? 'pointer' : 'default' }}
                  onClick={() => it.executionObj && onOpenDetailModal({ execution: it.executionObj })}
                >
                  <td style={{ fontWeight: 700 }}>{it.day} ({it.date})</td>
                  <td>{it.periodName} ({formatTime12Ar(it.startTime)} - {formatTime12Ar(it.endTime)})</td>
                  <td>
                    <div style={{ fontWeight: 800 }}>{it.title}</div>
                    {(it.subPrograms || []).length > 0 && (
                      <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {it.subPrograms.map((sp) => (
                          <span key={sp.id || sp.name} style={{ fontSize: '0.71rem', color: 'var(--brand-teal)', fontWeight: 700 }}>
                            ↳ {sp.name} ({sp.periodName || sp.periodId})
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <DepartmentPill deptId={it.departmentId} deptName={it.departmentName} departments={state.departments} />
                  </td>
                  <td>{it.activityType}</td>
                  <td>{it.scopeName}</td>
                  <td>{it.venueName}</td>
                  <td>{it.employeeName}</td>
                  <td><StatusBadge status={it.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

