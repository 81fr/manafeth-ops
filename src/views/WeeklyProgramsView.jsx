import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
  Search,
  Edit3,
  Plus,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Eye,
  CheckSquare,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { hasPermission, canEditProgram, canDeleteEntity, canAccessDepartment } from '../engine/permissions';
import { globalWeekToMonthInfo, getDatesForGlobalWeek, formatTime12Ar, formatDateRangeAr } from '../engine/dateUtils';
import { StatusBadge, PlannedGreenPill, DepartmentPill } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { ReadinessBadge, ReadinessInspectorModal } from '../components/InteractiveDashboards';

/**
 * Powers both "برامج هذا الأسبوع" (Req #11) and "برامج الأسبوع القادم" (Req #12)
 * Displays the exact 7-point readiness checklist per program without asking users to recreate planned programs.
 */
export default function WeeklyProgramsView({
  initialTarget = 'this-week', // 'this-week' | 'next-week'
  onOpenScheduleModal,
  onOpenDetailModal,
}) {
  const { state, currentUser, softDeleteEntity, bulkSoftDeleteEntities } = useOps();
  const defaultWeek =
    initialTarget === 'next-week' ? state.meta.nextGlobalWeek : state.meta.currentGlobalWeek;

  const canViewAllDepts = hasPermission(currentUser, 'view_all_club_programs') || currentUser?.isAdmin;
  const canViewDrafts = hasPermission(currentUser, 'view_drafts');
  const canCreateNewProgram = hasPermission(currentUser, 'create_program');

  const [selectedWeek, setSelectedWeek] = useState(defaultWeek);
  const [deptFilter, setDeptFilter] = useState(() =>
    !canViewAllDepts && currentUser?.departmentId ? currentUser.departmentId : 'all'
  );
  const [readinessFilter, setReadinessFilter] = useState('all'); // 'all' | 'unscheduled' | 'scheduled' | 'conflict'
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedOccIds, setSelectedOccIds] = useState([]);
  const [bulkDeleteItems, setBulkDeleteItems] = useState(null);
  const [readinessTarget, setReadinessTarget] = useState(null);

  useEffect(() => {
    setSelectedOccIds([]);
  }, [selectedWeek, deptFilter, readinessFilter]);

  useEffect(() => {
    setSelectedWeek(
      initialTarget === 'next-week' ? state.meta.nextGlobalWeek : state.meta.currentGlobalWeek
    );
  }, [initialTarget, state.meta.currentGlobalWeek, state.meta.nextGlobalWeek]);

  const weekInfo = useMemo(() => globalWeekToMonthInfo(selectedWeek), [selectedWeek]);
  const weekDates = useMemo(() => getDatesForGlobalWeek(selectedWeek), [selectedWeek]);

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);

  const visibleDepartments = useMemo(
    () =>
      canViewAllDepts
        ? state.departments
        : state.departments.filter((d) => canAccessDepartment(currentUser, d.id)),
    [state.departments, canViewAllDepts, currentUser]
  );

  const canSeeExecution = (ex) => {
    if (!ex) return false;
    if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) {
      return false;
    }
    return true;
  };

  const weekOccurrences = useMemo(() => {
    return state.plannedOccurrences.filter((occ) => {
      if (occ.plannedGlobalWeek !== Number(selectedWeek)) return false;
      if (!canViewAllDepts && !canAccessDepartment(currentUser, occ.departmentId)) return false;
      if (deptFilter !== 'all' && occ.departmentId !== deptFilter) return false;
      const ex = canSeeExecution(occ.linkedExecution) ? occ.linkedExecution : null;
      const hasTarget = Boolean(ex?.scopeIds?.length > 0 || ex?.studentIds?.length > 0);
      const isComplete = Boolean(
        ex && ex.day && ex.periodId && ex.venueId && ex.leadEmployeeId && hasTarget
      );
      const hasConflict = Boolean(ex?.conflictsSnapshot?.length > 0 && ex.status !== 'معتمد باستثناء');
      if (readinessFilter === 'unscheduled' && isComplete) return false;
      if (readinessFilter === 'scheduled' && !isComplete) return false;
      if (readinessFilter === 'conflict' && !hasConflict) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        const hay = `${occ.programName} ${occ.initiative} ${occ.strategicIndicator} ${occ.departmentName}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    state.plannedOccurrences,
    selectedWeek,
    deptFilter,
    readinessFilter,
    searchQuery,
    canViewAllDepts,
    canViewDrafts,
    currentUser,
  ]);

  const totalInWeek = useMemo(
    () =>
      state.plannedOccurrences.filter(
        (o) =>
          o.plannedGlobalWeek === Number(selectedWeek) &&
          (canViewAllDepts || canAccessDepartment(currentUser, o.departmentId))
      ).length,
    [state.plannedOccurrences, selectedWeek, canViewAllDepts, currentUser]
  );

  const unscheduledCount = useMemo(
    () =>
      state.plannedOccurrences.filter(
        (o) =>
          o.plannedGlobalWeek === Number(selectedWeek) &&
          (canViewAllDepts || canAccessDepartment(currentUser, o.departmentId)) &&
          (!o.linkedExecution || !canSeeExecution(o.linkedExecution))
      ).length,
    [state.plannedOccurrences, selectedWeek, canViewAllDepts, canViewDrafts, currentUser]
  );

  const deletableOccurrences = useMemo(() => {
    return weekOccurrences.filter((occ) => {
      const ex = canSeeExecution(occ.linkedExecution) ? occ.linkedExecution : null;
      const delType = ex ? 'program_execution' : 'planned_occurrence';
      return canDeleteEntity(currentUser, delType, occ.departmentId);
    });
  }, [weekOccurrences, currentUser, canViewDrafts]);

  const allDeletableSelected =
    deletableOccurrences.length > 0 &&
    deletableOccurrences.every((occ) => selectedOccIds.includes(occ.id));

  const toggleSelectAll = () => {
    if (allDeletableSelected) {
      setSelectedOccIds([]);
    } else {
      setSelectedOccIds(deletableOccurrences.map((occ) => occ.id));
    }
  };

  const toggleSelectRow = (occId) => {
    setSelectedOccIds((prev) =>
      prev.includes(occId) ? prev.filter((id) => id !== occId) : [...prev, occId]
    );
  };

  const handleTriggerBulkDelete = () => {
    const items = deletableOccurrences
      .filter((occ) => selectedOccIds.includes(occ.id))
      .map((occ) => {
        const ex = canSeeExecution(occ.linkedExecution) ? occ.linkedExecution : null;
        return {
          entityType: ex ? 'program_execution' : 'planned_occurrence',
          entityId: ex ? ex.id : occ.id,
          entityTitle: `${occ.programName} (${occ.departmentName})`,
        };
      });
    if (items.length > 0) {
      setBulkDeleteItems(items);
    }
  };

  const renderCheckCell = (ok, label) =>
    ok ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--approved-text)', fontWeight: 700, fontSize: '0.76rem' }}>
        <CheckCircle2 size={14} color="#00A59B" />
        <span>{label}</span>
      </span>
    ) : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b45309', fontWeight: 700, fontSize: '0.74rem' }}>
        <XCircle size={14} color="#f59e0b" />
        <span>غير محدد</span>
      </span>
    );

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {Number(selectedWeek) === state.meta.currentGlobalWeek
                  ? 'برامج هذا الأسبوع (المخططة باللون الأخضر)'
                  : Number(selectedWeek) === state.meta.nextGlobalWeek
                  ? 'برامج الأسبوع القادم (للاستعداد والتنسيق المبكر)'
                  : `البرامج المخططة للأسبوع (${selectedWeek})`}
              </h2>
              <PlannedGreenPill
                monthName={weekInfo.monthName}
                weekLabel={weekInfo.weekLabel}
                globalWeek={selectedWeek}
              />
            </div>
            <p style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: 4 }}>
              نطاق التواريخ: من الأحد ({weekDates['الأحد']}) إلى الخميس ({weekDates['الخميس']}) • إجمالي البرامج المخططة: <strong>{totalInWeek}</strong> • غير المستكملة بعد: <strong style={{ color: '#b45309' }}>{unscheduledCount}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={selectedWeek <= 1}
              onClick={() => setSelectedWeek((w) => Math.max(1, Number(w) - 1))}
            >
              <ChevronRight size={15} />
              <span>الأسبوع السابق</span>
            </button>
            <select
              className="form-select"
              style={{ width: 215 }}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
            >
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                const inf = globalWeekToMonthInfo(w);
                return (
                  <option key={w} value={w}>
                    أسبوع {w}: {inf.monthName.split(' ')[0]} — {inf.weekLabel}
                    {w === state.meta.currentGlobalWeek ? ' (الحالي)' : w === state.meta.nextGlobalWeek ? ' (القادم)' : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={selectedWeek >= 52}
              onClick={() => setSelectedWeek((w) => Math.min(52, Number(w) + 1))}
            >
              <span>الأسبوع التالي</span>
              <ChevronLeft size={15} />
            </button>
            {canCreateNewProgram && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onOpenScheduleModal({ mode: 'new_program', defaultGlobalWeek: selectedWeek })}
              >
                <Plus size={14} />
                <span>إضافة برنامج للأسبوع</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 0 }}>
        <Filter size={16} color="var(--brand-teal)" />
        <select
          className="form-select"
          style={{ width: 210 }}
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          {canViewAllDepts && <option value="all">جميع الأقسام ({totalInWeek})</option>}
          {visibleDepartments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          className="form-select"
          style={{ width: 210 }}
          value={readinessFilter}
          onChange={(e) => setReadinessFilter(e.target.value)}
        >
          <option value="all">كل حالات الجاهزية</option>
          <option value="unscheduled">غير مجدولة (مطلوب استكمالها)</option>
          <option value="scheduled">مكتملة الجدولة التنفيذية</option>
          <option value="conflict">بها تعارض مرصود</option>
        </select>

        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            placeholder="بحث باسم البرنامج أو المبادرة أو المؤشر..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {deletableOccurrences.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={toggleSelectAll}
              style={{ fontWeight: 800 }}
            >
              <CheckSquare size={14} color="var(--brand-teal)" />
              <span>
                {allDeletableSelected
                  ? `إلغاء تحديد الكل (${deletableOccurrences.length})`
                  : `تحديد الكل (${deletableOccurrences.length})`}
              </span>
            </button>
            {selectedOccIds.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleTriggerBulkDelete}
              >
                <Trash2 size={14} />
                <span>حذف المحدد ({selectedOccIds.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Full Readiness Checklist Table (Req #11) */}
      <div className="table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th style={{ width: 42, textAlign: 'center' }}>
                {deletableOccurrences.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    onChange={toggleSelectAll}
                    title="تحديد الكل / إلغاء تحديد الكل"
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--brand-teal)' }}
                  />
                )}
              </th>
              <th>البرنامج والمرجعية</th>
              <th>القسم</th>
              <th>الشهر والأسبوع</th>
              <th>تحديد اليوم؟</th>
              <th>تحديد الوقت؟</th>
              <th>تحديد الفئة / الطلاب؟</th>
              <th>تحديد القاعة؟</th>
              <th>تحديد المسؤول؟</th>
              <th>يوجد تعارض؟</th>
              <th>حالة الاعتماد</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {weekOccurrences.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  لا توجد برامج مطابقة لمعايير التصفية في هذا الأسبوع.
                </td>
              </tr>
            ) : (
              weekOccurrences.map((occ) => {
                const ex = canSeeExecution(occ.linkedExecution) ? occ.linkedExecution : null;
                const isUnscheduled = !ex;
                const hasConflict = Boolean(ex?.conflictsSnapshot?.length > 0 && ex.status !== 'معتمد باستثناء');
                const canEditRow = canEditProgram(currentUser, ex || occ);
                const delType = ex ? 'program_execution' : 'planned_occurrence';
                const delId = ex ? ex.id : occ.id;
                const canDeleteRow = canDeleteEntity(currentUser, delType, occ.departmentId);
                const isSelected = selectedOccIds.includes(occ.id);

                const targetSummaryParts = [];
                if (ex?.scopeIds?.length) {
                  targetSummaryParts.push(ex.scopeIds.map((s) => scopeMap[s]).slice(0, 2).join('، '));
                }
                if (ex?.studentIds?.length) {
                  targetSummaryParts.push(`${ex.studentIds.length} طلاب محددون`);
                }

                return (
                  <tr
                    key={occ.id}
                    style={
                      isSelected
                        ? { background: 'rgba(239, 68, 68, 0.06)' }
                        : isUnscheduled
                        ? { background: 'rgba(245, 158, 11, 0.045)' }
                        : undefined
                    }
                  >
                    <td style={{ textAlign: 'center' }}>
                      {canDeleteRow && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(occ.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#dc2626' }}
                        />
                      )}
                    </td>
                    <td style={{ minWidth: 230 }}>
                      <div
                        onClick={() => onOpenDetailModal({ occurrence: occ, execution: ex })}
                        style={{ fontWeight: 800, color: 'var(--brand-ink)', cursor: 'pointer' }}
                      >
                        {occ.programName}
                      </div>
                      {(ex?.subPrograms || []).length > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--brand-teal)', fontWeight: 700, marginTop: 2 }}>
                          ↳ يتضمن {ex.subPrograms.length} فقرات فرعية
                        </div>
                      )}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        المبادرة: {occ.initiative || '—'}
                      </div>
                      {occ.strategicIndicator && (
                        <div style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>
                          المؤشر: {occ.strategicIndicator}
                        </div>
                      )}
                    </td>
                    <td>
                      <DepartmentPill
                        deptId={occ.departmentId}
                        deptName={occ.departmentName}
                        departments={state.departments}
                      />
                    </td>
                    <td>
                      <PlannedGreenPill
                        monthName={occ.plannedMonthName}
                        weekLabel={occ.plannedWeekLabel}
                        globalWeek={occ.plannedGlobalWeek}
                        compact
                      />
                    </td>
                    <td>
                      {renderCheckCell(
                        Boolean(ex?.day),
                        ex
                          ? formatDateRangeAr(ex.executionDate, ex.executionEndDate || ex.executionDate, { compact: true })
                          : ''
                      )}
                    </td>
                    <td>
                      {renderCheckCell(
                        Boolean(ex?.periodId),
                        ex ? `${ex.periodName} (${formatTime12Ar(ex.startTime)})` : ''
                      )}
                    </td>
                    <td>
                      {renderCheckCell(
                        targetSummaryParts.length > 0,
                        targetSummaryParts.join(' + ')
                      )}
                    </td>
                    <td>{renderCheckCell(Boolean(ex?.venueId), ex?.venueId ? venueMap[ex.venueId] : '')}</td>
                    <td>{renderCheckCell(Boolean(ex?.leadEmployeeId), ex?.leadEmployeeId ? empMap[ex.leadEmployeeId] : '')}</td>
                    <td>
                      {!ex ? (
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>يفحص عند الجدولة</span>
                      ) : hasConflict ? (
                        <span className="status-badge badge-conflict" style={{ fontSize: '0.7rem' }}>
                          نعم ({ex.conflictsSnapshot.length})
                        </span>
                      ) : (
                        <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>
                          لا يوجد
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <StatusBadge status={isUnscheduled ? 'يحتاج جدولة' : ex.status} size="sm" />
                        <ReadinessBadge
                          item={occ}
                          state={state}
                          compact
                          onClick={() => setReadinessTarget({ occurrence: occ, execution: ex })}
                        />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          title="عرض البطاقة"
                          onClick={() => onOpenDetailModal({ occurrence: occ, execution: ex })}
                        >
                          <Eye size={13} />
                        </button>
                        {canEditRow && (
                          <button
                            type="button"
                            className={`btn btn-sm ${isUnscheduled ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() =>
                              onOpenScheduleModal({
                                mode: ex ? 'edit_execution' : 'schedule_planned',
                                occurrence: occ,
                                execution: ex,
                                defaultGlobalWeek: selectedWeek,
                              })
                            }
                          >
                            <Edit3 size={13} />
                            <span>{isUnscheduled ? 'جدولة التنفيذ' : 'تعديل'}</span>
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
                                entityTitle: occ.programName,
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
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget || bulkDeleteItems)}
        entityType={deleteTarget?.entityType}
        entityTitle={deleteTarget?.entityTitle}
        items={bulkDeleteItems}
        onCancel={() => {
          setDeleteTarget(null);
          setBulkDeleteItems(null);
        }}
        onConfirm={async (reason) => {
          if (bulkDeleteItems?.length > 0) {
            await bulkSoftDeleteEntities(bulkDeleteItems, reason);
            setSelectedOccIds([]);
            setBulkDeleteItems(null);
          } else if (deleteTarget) {
            await softDeleteEntity({
              entityType: deleteTarget.entityType,
              entityId: deleteTarget.entityId,
              reason,
            });
            setDeleteTarget(null);
          }
        }}
      />
      <ReadinessInspectorModal
        isOpen={Boolean(readinessTarget)}
        onClose={() => setReadinessTarget(null)}
        targetItem={readinessTarget}
        state={state}
        onOpenScheduleModal={onOpenScheduleModal}
        onOpenDetailModal={onOpenDetailModal}
      />
    </div>
  );
}

