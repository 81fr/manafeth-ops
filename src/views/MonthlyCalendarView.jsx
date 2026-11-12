import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Filter, LayoutGrid, Table2, Edit3, ShieldCheck, Trash2, CheckSquare } from 'lucide-react';
import { useOps } from '../engine/store';
import { hasPermission, canEditProgram, canDeleteEntity } from '../engine/permissions';
import { MONTH_NAMES_AR, MONTH_WEEKS_MAP, WEEK_ORDINALS_AR, formatDateTimeAr } from '../engine/dateUtils';
import { StatusBadge, DepartmentPill } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

/**
 * Monthly & Annual Approved Plan Calendar (الخطة المعتمدة والتقويم التخطيطي — Req #7, #13, #48)
 * Displays the currently published Approved Plan Version read-only to employees, hiding drafts unless authorized!
 */
export default function MonthlyCalendarView({ onOpenScheduleModal, onOpenDetailModal }) {
  const { state, currentUser, softDeleteEntity, bulkSoftDeleteEntities } = useOps();
  const [selectedMonth, setSelectedMonth] = useState(state.meta.currentMonth || 11);

  const canViewAllDepts = hasPermission(currentUser, 'view_all_club_programs') || currentUser?.isAdmin;
  const canViewDrafts = hasPermission(currentUser, 'view_drafts');

  const [deptFilter, setDeptFilter] = useState(() =>
    (currentUser?.accessScope === 'self' || currentUser?.accessScope === 'department') && currentUser?.departmentId
      ? currentUser.departmentId
      : 'all'
  );
  const [viewMode, setViewMode] = useState('month_board'); // 'month_board' | 'annual_matrix'
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedOccIds, setSelectedOccIds] = useState([]);
  const [bulkDeleteItems, setBulkDeleteItems] = useState(null);

  useEffect(() => {
    setSelectedOccIds([]);
  }, [selectedMonth, deptFilter]);

  const weeksInMonth = MONTH_WEEKS_MAP[selectedMonth] || [45, 46, 47, 48];

  const canSeeExecution = (ex) => {
    if (!ex) return false;
    if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) {
      return false;
    }
    return true;
  };

  const monthOccurrencesByWeek = useMemo(() => {
    const map = {};
    weeksInMonth.forEach((gw, idx) => {
      map[idx + 1] = {
        weekInMonth: idx + 1,
        weekLabel: WEEK_ORDINALS_AR[idx + 1],
        globalWeek: gw,
        items: [],
      };
    });

    state.plannedOccurrences.forEach((occ) => {
      if (occ.plannedMonth !== Number(selectedMonth)) return;
      if (deptFilter !== 'all' && occ.departmentId !== deptFilter) return;
      if (searchText.trim() && !`${occ.programName} ${occ.initiative}`.includes(searchText.trim())) {
        return;
      }
      if (map[occ.plannedWeekInMonth]) {
        map[occ.plannedWeekInMonth].items.push(occ);
      }
    });

    return Object.values(map);
  }, [state.plannedOccurrences, selectedMonth, deptFilter, searchText, weeksInMonth]);

  const deletableMonthOccurrences = useMemo(() => {
    return monthOccurrencesByWeek
      .flatMap((wk) => wk.items)
      .filter((occ) => canDeleteEntity(currentUser, 'planned_occurrence', occ.departmentId));
  }, [monthOccurrencesByWeek, currentUser]);

  const allMonthDeletableSelected =
    deletableMonthOccurrences.length > 0 &&
    deletableMonthOccurrences.every((occ) => selectedOccIds.includes(occ.id));

  const toggleSelectAllMonth = () => {
    if (allMonthDeletableSelected) {
      setSelectedOccIds([]);
    } else {
      setSelectedOccIds(deletableMonthOccurrences.map((occ) => occ.id));
    }
  };

  const toggleSelectOcc = (occId) => {
    setSelectedOccIds((prev) =>
      prev.includes(occId) ? prev.filter((id) => id !== occId) : [...prev, occId]
    );
  };

  const handleBulkDeleteMonth = () => {
    const items = deletableMonthOccurrences
      .filter((occ) => selectedOccIds.includes(occ.id))
      .map((occ) => ({
        entityType: 'planned_occurrence',
        entityId: occ.id,
        entityTitle: `${occ.programName} (${MONTH_NAMES_AR[selectedMonth]} - ${occ.plannedWeekLabel})`,
      }));
    if (items.length > 0) setBulkDeleteItems(items);
  };

  // Annual summary counts per month x department
  const annualMatrix = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const mOccs = state.plannedOccurrences.filter((o) => o.plannedMonth === m);
      const byDept = {};
      state.departments.forEach((d) => {
        byDept[d.id] = mOccs.filter((o) => o.departmentId === d.id).length;
      });
      return {
        month: m,
        monthName: MONTH_NAMES_AR[m],
        weeksCount: (MONTH_WEEKS_MAP[m] || []).length,
        total: mOccs.length,
        byDept,
      };
    });
  }, [state.plannedOccurrences, state.departments]);

  const approvedPlan = state.approvedPlanVersion || {
    versionNumber: 'v1.0',
    title: 'الخطة التشغيلية المعتمدة لأقسام نادي تراؤف للبنين 2026',
    approvedBy: 'إدارة النادي',
    approvedAt: '2026-01-01T08:00:00Z',
  };

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Approved Plan Version Banner (Req #7) */}
      <div
        className="card"
        style={{
          padding: '0.85rem 1.15rem',
          borderRight: '4px solid var(--brand-teal)',
          background: 'linear-gradient(90deg, rgba(0,165,155,0.06), transparent)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={20} color="var(--brand-teal)" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                الخطة المعتمدة — الإصدار ({approvedPlan.versionNumber}): {approvedPlan.title}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                اعتماد: <strong>{approvedPlan.approvedBy}</strong> • آخر نشر معتمد: {formatDateTimeAr(approvedPlan.approvedAt)}
                {!canViewDrafts && ' • (يُعرض الإصدار المعتمد فقط دون المسودات)'}
              </div>
            </div>
          </div>
          {!hasPermission(currentUser, 'edit_program') && !hasPermission(currentUser, 'schedule_planned_program') && (
            <span className="status-badge badge-approved">وضع القراءة الواضحة للموظف</span>
          )}
        </div>
      </div>

      {/* Top Controls */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '0.85rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              التقويم التخطيطي الشهري والسنوي للبرامج المعتمدة
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              يقسّم كل شهر إلى أسابيعه الفعلية ويعرض البرامج المخططة باللون الأخضر للقسم المرتبط بالمستخدم أو لجميع الأقسام لتنسيق الأنشطة.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'month_board' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('month_board')}
            >
              <LayoutGrid size={14} />
              <span>تقسيم أسابيع الشهر</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'annual_matrix' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('annual_matrix')}
            >
              <Table2 size={14} />
              <span>مصفوفة العام الكامل (12 شهرًا)</span>
            </button>
          </div>
        </div>

        {/* 12 Month Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '0.85rem' }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setSelectedMonth(m);
                setViewMode('month_board');
              }}
              className={`btn btn-sm ${selectedMonth === m && viewMode === 'month_board' ? 'btn-teal' : 'btn-secondary'}`}
            >
              <span>{MONTH_NAMES_AR[m].split(' ')[0]} ({m})</span>
            </button>
          ))}
        </div>

        {/* Department & Search Filters */}
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={15} color="var(--brand-teal)" />
          {(canViewAllDepts || currentUser?.departmentId) && (
            <button
              type="button"
              className={`btn btn-sm ${deptFilter === 'all' ? 'btn-teal' : 'btn-secondary'}`}
              onClick={() => setDeptFilter('all')}
            >
              جميع الأقسام معًا
            </button>
          )}
          {state.departments.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`btn btn-sm ${deptFilter === d.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDeptFilter(d.id)}
            >
              {d.name} {currentUser?.departmentId === d.id ? '★' : ''}
            </button>
          ))}
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: 250, marginRight: 'auto' }}
            placeholder="بحث في برامج الشهر..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {viewMode === 'month_board' && deletableMonthOccurrences.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={toggleSelectAllMonth}
                style={{ fontWeight: 800 }}
              >
                <CheckSquare size={14} color="var(--brand-teal)" />
                <span>
                  {allMonthDeletableSelected
                    ? `إلغاء تحديد الكل (${deletableMonthOccurrences.length})`
                    : `تحديد الكل (${deletableMonthOccurrences.length})`}
                </span>
              </button>
              {selectedOccIds.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={handleBulkDeleteMonth}
                >
                  <Trash2 size={14} />
                  <span>حذف المحدد ({selectedOccIds.length})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {viewMode === 'month_board' ? (
        /* Month Divided into Weeks Columns (Req #13) */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(265px, 1fr))`,
            gap: '0.9rem',
            alignItems: 'start',
          }}
        >
          {monthOccurrencesByWeek.map((wk) => {
            const isCurrentWeek = wk.globalWeek === state.meta.currentGlobalWeek;
            return (
              <div
                key={wk.globalWeek}
                className="card"
                style={{
                  padding: '0.9rem',
                  borderTop: isCurrentWeek ? '4px solid var(--brand-teal)' : '4px solid #8CC240',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{wk.weekLabel}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {MONTH_NAMES_AR[selectedMonth]} • أسبوع سنوي ({wk.globalWeek})
                    </div>
                  </div>
                  <span className="status-badge badge-planned-green">{wk.items.length} برنامج</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: 540, overflowY: 'auto' }}>
                  {wk.items.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                      لا توجد برامج مخططة في هذا الأسبوع.
                    </div>
                  ) : (
                    wk.items.map((occ) => {
                      const ex = canSeeExecution(occ.linkedExecution) ? occ.linkedExecution : null;
                      const canEditOcc = canEditProgram(currentUser, ex || occ);
                      const canDeleteOcc = canDeleteEntity(currentUser, 'planned_occurrence', occ.departmentId);
                      const isOccSelected = selectedOccIds.includes(occ.id);
                      return (
                        <div
                          key={occ.id}
                          style={{
                            border: isOccSelected ? '1.5px solid #dc2626' : '1px solid var(--planned-green-border)',
                            background: isOccSelected
                              ? 'rgba(239,68,68,0.06)'
                              : ex
                              ? 'var(--card-bg)'
                              : 'var(--planned-green-bg)',
                            borderRadius: 10,
                            padding: '0.65rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {canDeleteOcc && (
                                <input
                                  type="checkbox"
                                  checked={isOccSelected}
                                  onChange={() => toggleSelectOcc(occ.id)}
                                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                                />
                              )}
                              <DepartmentPill
                                deptId={occ.departmentId}
                                deptName={occ.departmentName}
                                departments={state.departments}
                              />
                            </div>
                            <StatusBadge status={ex ? ex.status : 'مخطط'} size="sm" />
                          </div>

                          <div
                            onClick={() => onOpenDetailModal({ occurrence: occ, execution: ex })}
                            style={{ fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', color: 'var(--brand-ink)' }}
                          >
                            {occ.programName}
                          </div>

                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            المبادرة: {occ.initiative || '—'}
                          </div>

                          {ex && (
                            <div style={{ fontSize: '0.71rem', fontWeight: 700, color: 'var(--brand-teal)' }}>
                              مجدول: {ex.day} ({ex.executionDate?.slice(5)}) • {ex.periodName}
                              {(ex.subPrograms || []).length > 0 ? ` • ↳ ${ex.subPrograms.length} فقرات` : ''}
                            </div>
                          )}

                          {(canEditOcc || canDeleteOcc) && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
                              {canEditOcc && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                  onClick={() =>
                                    onOpenScheduleModal({
                                      mode: ex ? 'edit_execution' : 'schedule_planned',
                                      occurrence: occ,
                                      execution: ex,
                                      defaultGlobalWeek: wk.globalWeek,
                                    })
                                  }
                                >
                                  <Edit3 size={12} />
                                  <span>{ex ? 'تعديل الجدولة' : 'جدولة التنفيذ'}</span>
                                </button>
                              )}
                              {canDeleteOcc && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  style={{ padding: '2px 7px', fontSize: '0.7rem' }}
                                  title="حذف آمن للموعد المخطط"
                                  onClick={() =>
                                    setDeleteTarget({
                                      entityType: 'planned_occurrence',
                                      entityId: occ.id,
                                      entityTitle: `${occ.programName} (${MONTH_NAMES_AR[selectedMonth]} - ${wk.weekLabel})`,
                                    })
                                  }
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Annual 12-Month Matrix across All Departments */
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>عدد أسابيع الشهر بالخطة</th>
                {state.departments.map((d) => (
                  <th key={d.id}>{d.name}</th>
                ))}
                <th>إجمالي المواعيد الخضراء</th>
                <th>استعراض</th>
              </tr>
            </thead>
            <tbody>
              {annualMatrix.map((row) => (
                <tr key={row.month}>
                  <td style={{ fontWeight: 800 }}>{row.monthName}</td>
                  <td>{row.weeksCount} أسابيع</td>
                  {state.departments.map((d) => (
                    <td key={d.id}>
                      <strong>{row.byDept[d.id] || 0}</strong> موعد مخطط
                    </td>
                  ))}
                  <td>
                    <span className="status-badge badge-planned-green">{row.total} موعد مخطط</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-teal"
                      onClick={() => {
                        setSelectedMonth(row.month);
                        setViewMode('month_board');
                      }}
                    >
                      فتح تقويم الشهر
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  );
}

