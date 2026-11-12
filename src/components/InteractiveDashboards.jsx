import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Calendar,
  CalendarCheck,
  CalendarRange,
  Users,
  MapPin,
  Sparkles,
  BarChart3,
  Award,
  BellRing,
  History,
  Flame,
  Plus,
  Edit3,
  Eye,
  X,
  RefreshCw,
  Info,
  ArrowUpLeft,
  ListChecks,
  CheckCheck,
  Layers,
  UserCheck,
  Building2,
  FileWarning,
  Search,
} from 'lucide-react';
import {
  METRIC_DEFINITIONS_AR,
  computeProgramReadiness,
  computePlatformAnalytics,
  computeDepartmentHeadDashboard,
  computeEarlyWarnings,
  computeChangesSinceLastLogin,
  computeCrowdingForecast,
} from '../engine/analyticsEngine';
import {
  WORK_DAYS_AR,
  MONTH_NAMES_AR,
  formatDateTimeAr,
  getDatesForGlobalWeek,
  isDateInExecutionRange,
  formatDateRangeAr,
} from '../engine/dateUtils';
import { hasPermission } from '../engine/permissions';
import { StatusBadge, DepartmentPill, PlannedGreenPill } from './StatusBadge';

// ============================================================================
// 1. OPERATIONAL READINESS BADGE & MODAL (Req #13 — مؤشر «جاهزية البرنامج»)
// Never relies on color alone: always pairs icon + explicit label + X/6 score
// ============================================================================
export function ReadinessBadge({ item, state, readinessObj = null, onClick = null, compact = false }) {
  const r = readinessObj || computeProgramReadiness(item, state);

  let bg = '#fef3c7';
  let border = '#f59e0b';
  let color = '#92400e';
  let Icon = AlertTriangle;

  if (r.statusCode === 'ready') {
    bg = '#ecfdf5';
    border = '#10b981';
    color = '#065f46';
    Icon = CheckCircle2;
  } else if (r.statusCode === 'blocked') {
    bg = '#fef2f2';
    border = '#ef4444';
    color = '#991b1b';
    Icon = ShieldAlert;
  }

  return (
    <button
      type="button"
      className="readiness-badge-btn"
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick(r);
        }
      }}
      title={
        r.missingRequirements.length > 0
          ? `المتطلبات الناقصة: ${r.missingRequirements.join(' | ')}`
          : 'مكتمل المتطلبات وجاهز للتنفيذ (6/6)'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: compact ? '0.18rem 0.5rem' : '0.26rem 0.65rem',
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: compact ? '0.68rem' : '0.73rem',
        fontWeight: 800,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
      }}
    >
      <Icon size={compact ? 12 : 13} />
      <span>{r.status}</span>
      <span style={{ opacity: 0.85 }}>({r.passedCount}/{r.totalCount})</span>
    </button>
  );
}

export function ReadinessInspectorModal({
  isOpen,
  onClose,
  targetItem,
  state,
  onOpenScheduleModal,
  onOpenDetailModal,
}) {
  if (!isOpen || !targetItem) return null;
  const readiness = targetItem.readiness || computeProgramReadiness(targetItem.occurrence || targetItem.execution || targetItem, state);
  const title =
    targetItem.programName ||
    targetItem.occurrence?.programName ||
    targetItem.execution?.programName ||
    'فحص جاهزية البرنامج';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListChecks size={19} color="var(--brand-teal)" />
              <span>فحص الجاهزية التشغيلية: {title}</span>
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              يتحقق النظام من استكمال المتطلبات الستة الأساسية قبل التنفيذ دون احتساب جاهزية وهمية.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>حالة الجاهزية الحالية</div>
              <div style={{ marginTop: 4 }}>
                <ReadinessBadge readinessObj={readiness} />
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--brand-teal)' }}>
                {readiness.percent}%
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                مكتمل {readiness.passedCount} من {readiness.totalCount} متطلبات
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {readiness.checks.map((chk) => (
              <div
                key={chk.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0.65rem 0.85rem',
                  borderRadius: 10,
                  background: chk.passed ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${chk.passed ? '#bbf7d0' : '#fde68a'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {chk.passed ? (
                    <CheckCircle2 size={16} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />
                  ) : (
                    <AlertTriangle size={16} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>{chk.label}</div>
                    <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 2 }}>{chk.detail}</div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: chk.passed ? '#15803d' : '#b45309',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chk.passed ? 'مكتمل ✓' : 'ناقص !'}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              إغلاق
            </button>
            {onOpenDetailModal && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onClose();
                  onOpenDetailModal({
                    occurrence: targetItem.occurrence || (!targetItem.executionDate ? targetItem : null),
                    execution: targetItem.execution || (targetItem.executionDate ? targetItem : null),
                  });
                }}
              >
                <Eye size={14} />
                <span>عرض بطاقة البرنامج</span>
              </button>
            )}
            {onOpenScheduleModal && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  const occ = targetItem.occurrence || (!targetItem.executionDate && targetItem.plannedGlobalWeek ? targetItem : null);
                  const ex = targetItem.execution || (targetItem.executionDate ? targetItem : occ?.linkedExecution || null);
                  onOpenScheduleModal({
                    mode: ex ? 'edit_execution' : 'schedule_planned',
                    occurrence: occ,
                    execution: ex,
                  });
                }}
              >
                <Edit3 size={14} />
                <span>استكمال / تعديل الجدولة الآن</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. METRIC DEFINITIONS REFERENCE MODAL (Req #22 — تعريف المؤشرات المعتمدة)
// ============================================================================
export function MetricDefinitionsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={19} color="var(--brand-teal)" />
              <span>دليل تعريف المؤشرات المعتمدة ومعادلات الاحتساب</span>
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              مصدر حساب موحد بين لوحات القيادة والتقارير التشغيلية والصفحات التفصيلية لمنع أي أرقام مضللة.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {Object.entries(METRIC_DEFINITIONS_AR).map(([key, item]) => (
              <div
                key={key}
                style={{
                  padding: '0.75rem 0.95rem',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--brand-teal)', marginBottom: 4 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text)', marginBottom: 4 }}>
                  <strong>التعريف:</strong> {item.definition}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  <strong>طريقة الحساب:</strong> {item.formula}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. DRILL-DOWN RECORDS MODAL (Req #9 & #20 — كل رقم ومخطط يفتح سجلاته الفعلية)
// ============================================================================
export function DrillDownRecordsModal({
  drillDown,
  onClose,
  state,
  onOpenScheduleModal,
  onOpenDetailModal,
  onOpenEvaluationModal,
  onNavigate,
  onInspectReadiness,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  if (!drillDown) return null;

  const rawRecords = Array.isArray(drillDown.records) ? drillDown.records : [];
  const filtered = rawRecords.filter((rec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const title = (
      rec.programName ||
      rec.title ||
      rec.entityName ||
      rec.name ||
      rec.programSnapshot?.programName ||
      ''
    ).toLowerCase();
    const dept = (rec.departmentName || '').toLowerCase();
    return title.includes(q) || dept.includes(q);
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 880 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 900 }}>
              {drillDown.title || 'السجلات التفصيلية للمؤشر'} ({rawRecords.length})
            </h2>
            {drillDown.subtitle && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {drillDown.subtitle}
              </p>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {rawRecords.length > 3 && (
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="ابحث داخل هذه السجلات بالاسم أو القسم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              لا توجد سجلات ضمن هذا المؤشر حاليًا.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>البرنامج / السجل</th>
                    <th>القسم</th>
                    <th>التوقيت / الأسبوع</th>
                    <th>الحالة</th>
                    <th>الجاهزية</th>
                    <th>الإجراء المباشر</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 80).map((rec, idx) => {
                    const isTask = Boolean(rec.assignedEmployeeId || rec.dueDate) && !rec.programName;
                    const isException = Boolean(rec.programSnapshot || rec.whyCannotChangeTime);
                    const isConflict = Boolean(rec.existingProgram && rec.proposedProgram);

                    const name = isTask
                      ? rec.title
                      : isException
                      ? `طلب استثناء: ${rec.programSnapshot?.programName || rec.executionId}`
                      : isConflict
                      ? `${rec.programName} (تعارض مع: ${rec.existingProgram})`
                      : rec.programName || rec.title || rec.name || 'سجل تشغيلي';

                    const deptName = rec.departmentName || '—';
                    const timing = isTask
                      ? `استحقاق: ${rec.dueDate || '—'} (${rec.assignedEmployeeName || ''})`
                      : rec.executionDate || rec.execution?.executionDate
                      ? `${rec.executionDate || rec.execution?.executionDate} • ${rec.periodName || rec.execution?.periodName || ''}`
                      : rec.plannedMonthName
                      ? `${rec.plannedMonthName} — ${rec.plannedWeekLabel || ''} (أسبوع ${rec.plannedGlobalWeek || ''})`
                      : rec.day
                      ? `${rec.day} • ${rec.periodName || ''}`
                      : '—';

                    const status = rec.effectiveStatus || rec.status || rec.severity || 'مخطط';
                    const canShowReadiness = !isTask && !isException && !isConflict && (rec.programName || rec.occurrence || rec.execution);

                    return (
                      <tr key={rec.id || idx}>
                        <td style={{ fontWeight: 800, fontSize: '0.8rem' }}>{name}</td>
                        <td>
                          {rec.departmentId ? (
                            <DepartmentPill
                              deptId={rec.departmentId}
                              deptName={deptName}
                              departments={state.departments}
                            />
                          ) : (
                            <span style={{ fontSize: '0.75rem' }}>{deptName}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem' }}>{timing}</td>
                        <td>
                          <StatusBadge status={status} />
                        </td>
                        <td>
                          {canShowReadiness ? (
                            <ReadinessBadge
                              item={rec.occurrence || rec.execution || rec}
                              state={state}
                              readinessObj={rec.readiness}
                              compact
                              onClick={() => onInspectReadiness && onInspectReadiness(rec)}
                            />
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {isException ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  onClose();
                                  onNavigate('exceptions', rec.id);
                                }}
                              >
                                فتح الطلب
                              </button>
                            ) : isTask ? (
                              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--brand-teal)' }}>
                                مكلف: {rec.assignedEmployeeName || '—'}
                              </span>
                            ) : (
                              <>
                                {onOpenDetailModal && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => {
                                      onClose();
                                      onOpenDetailModal({
                                        occurrence: rec.occurrence || (!rec.executionDate && rec.plannedGlobalWeek ? rec : null),
                                        execution: rec.execution || (rec.executionDate ? rec : rec.linkedExecution || null),
                                      });
                                    }}
                                  >
                                    <Eye size={13} />
                                    <span>التفاصيل</span>
                                  </button>
                                )}
                                {onOpenScheduleModal && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    onClick={() => {
                                      onClose();
                                      const occ = rec.occurrence || (!rec.executionDate && rec.plannedGlobalWeek ? rec : null);
                                      const ex = rec.execution || (rec.executionDate ? rec : rec.linkedExecution || null);
                                      onOpenScheduleModal({
                                        mode: ex ? 'edit_execution' : 'schedule_planned',
                                        occurrence: occ,
                                        execution: ex,
                                      });
                                    }}
                                  >
                                    <Edit3 size={13} />
                                    <span>{rec.execution || rec.executionDate ? 'تعديل' : 'جدولة'}</span>
                                  </button>
                                )}
                                {status === 'منفذ' && onOpenEvaluationModal && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-teal"
                                    onClick={() => {
                                      onClose();
                                      onOpenEvaluationModal({
                                        target: {
                                          kind: 'program_execution',
                                          id: (rec.execution || rec).id,
                                          execution: rec.execution || rec,
                                        },
                                      });
                                    }}
                                  >
                                    <Award size={13} />
                                    <span>تقييم</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. ROLE-BASED QUICK ACTIONS BAR (Req #18 — الإجراءات السريعة حسب الصلاحيات)
// ============================================================================
export function QuickActionsBar({
  currentUser,
  onOpenScheduleModal,
  onNavigate,
  onOpenAssignTask,
}) {
  if (!currentUser) return null;

  const actions = [];

  if (hasPermission(currentUser, 'create_program')) {
    actions.push({
      key: 'add_program',
      label: 'إضافة برنامج جديد',
      icon: Plus,
      cls: 'btn-primary',
      onClick: () => onOpenScheduleModal({ mode: 'new_program' }),
    });
  }

  if (hasPermission(currentUser, 'schedule_planned_program')) {
    actions.push({
      key: 'schedule_week',
      label: 'جدولة برنامج من الخطة',
      icon: CalendarCheck,
      cls: 'btn-teal',
      onClick: () => onNavigate('this-week'),
    });
  }

  if (hasPermission(currentUser, 'view_conflicts')) {
    actions.push({
      key: 'open_conflicts',
      label: 'فحص ومعالجة التعارضات',
      icon: ShieldAlert,
      cls: 'btn-secondary',
      onClick: () => onNavigate('master-schedule'),
    });
  }

  if (hasPermission(currentUser, 'submit_exception') || hasPermission(currentUser, 'view_exceptions')) {
    actions.push({
      key: 'exceptions',
      label: hasPermission(currentUser, 'approve_exception') ? 'مراجعة الاعتمادات والاستثناءات' : 'طلبات الاستثناء',
      icon: Sparkles,
      cls: 'btn-secondary',
      onClick: () => onNavigate('exceptions'),
    });
  }

  if (hasPermission(currentUser, 'create_task') && onOpenAssignTask) {
    actions.push({
      key: 'assign_task',
      label: 'توزيع مهمة لموظف',
      icon: ListChecks,
      cls: 'btn-secondary',
      onClick: onOpenAssignTask,
    });
  }

  actions.push({
    key: 'evaluations',
    label: 'فتح التقييمات والمتابعة',
    icon: Award,
    cls: 'btn-secondary',
    onClick: () => onNavigate('evaluations'),
  });

  if (hasPermission(currentUser, 'view_dept_programs') || hasPermission(currentUser, 'view_all_club_programs')) {
    actions.push({
      key: 'review_week_plan',
      label: 'مراجعة خطة الأسبوع',
      icon: CalendarRange,
      cls: 'btn-secondary',
      onClick: () => onNavigate('this-week'),
    });
  }

  return (
    <div
      className="card"
      style={{
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.84rem' }}>
        <Sparkles size={16} color="var(--brand-teal)" />
        <span>الإجراءات السريعة المتاحة حسب صلاحياتك:</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.key}
              type="button"
              className={`btn btn-sm ${act.cls}`}
              onClick={act.onClick}
            >
              <Icon size={14} />
              <span>{act.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 5. EARLY WARNINGS & "WHAT CHANGED SINCE LAST LOGIN" (Req #14 & #15)
// ============================================================================
export function EarlyWarningAndUpdatesSection({
  state,
  currentUser,
  evaluations,
  auditLogs,
  notifications,
  lastLoginSeenAt,
  todayIso,
  onOpenDrillDown,
  onNavigate,
  onOpenDetailModal,
}) {
  const warnings = useMemo(
    () => computeEarlyWarnings({ state, currentUser, evaluations, todayIso }),
    [state, currentUser, evaluations, todayIso]
  );

  const recentChanges = useMemo(
    () =>
      computeChangesSinceLastLogin({
        state,
        auditLogs,
        notifications,
        currentUser,
        lastLoginSeenAt,
      }),
    [state, auditLogs, notifications, currentUser, lastLoginSeenAt]
  );

  const handleClickChange = (chg) => {
    if (chg.entityType === 'program_execution') {
      const ex = (state.scheduledExecutions || []).find((e) => e.id === chg.entityId);
      if (ex && onOpenDetailModal) {
        onOpenDetailModal({ execution: ex });
        return;
      }
    }
    if (chg.routeTarget && chg.routeTarget !== 'detail_execution') {
      onNavigate(chg.routeTarget, chg.entityType === 'exception_request' ? chg.entityId : null);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
      }}
    >
      {/* Early Warning Panel (Req #14) */}
      <div className="card" style={{ border: warnings.length > 0 ? '1.5px solid #f59e0b' : '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '0.92rem' }}>
            <BellRing size={18} color="#d97706" />
            <span>الإنذار المبكر والتنبيهات الاستباقية</span>
          </div>
          <span className="status-badge badge-unscheduled" style={{ fontSize: '0.7rem' }}>
            {warnings.length} تنبيه ضمن مسؤوليتك
          </span>
        </div>

        {warnings.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#059669', fontSize: '0.82rem', fontWeight: 700 }}>
            <CheckCircle2 size={18} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
            <span>لا توجد مخاطر أو تأخيرات تشغيلية مرصودة ضمن نطاق مسؤوليتك حاليًا.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {warnings.map((w) => (
              <div
                key={w.id}
                onClick={() =>
                  onOpenDrillDown({
                    title: w.title,
                    subtitle: w.description,
                    records: w.records,
                  })
                }
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 10,
                  background: w.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${w.severity === 'critical' ? '#fca5a5' : '#fde68a'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '0.81rem',
                      color: w.severity === 'critical' ? '#991b1b' : '#92400e',
                    }}
                  >
                    {w.title}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: 2 }}>{w.description}</div>
                </div>
                <button type="button" className="btn btn-sm btn-secondary" style={{ flexShrink: 0 }}>
                  <span>{w.actionLabel}</span>
                  <ArrowUpLeft size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* What Changed Since Last Login ("آخر المستجدات" — Req #15) */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '0.92rem' }}>
            <History size={18} color="var(--brand-teal)" />
            <span>آخر المستجدات (ما الذي تغير منذ آخر دخول؟)</span>
          </div>
          {lastLoginSeenAt && (
            <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
              منذ: {formatDateTimeAr(lastLoginSeenAt)}
            </span>
          )}
        </div>

        {recentChanges.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            لا توجد تغييرات جديدة مسجلة منذ آخر زيارة.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
            {recentChanges.slice(0, 6).map((chg) => (
              <div
                key={chg.id}
                onClick={() => handleClickChange(chg)}
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  border: chg.isNewSinceVisit ? '1px solid rgba(0,165,155,0.45)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="status-badge badge-approved" style={{ fontSize: '0.66rem' }}>
                      {chg.badge}
                    </span>
                    <strong style={{ fontSize: '0.79rem' }}>{chg.title}</strong>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    {chg.summary}
                  </div>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'left' }}>
                  <div>{formatDateTimeAr(chg.timestamp)}</div>
                  <div style={{ color: 'var(--brand-teal)', fontWeight: 700, marginTop: 2 }}>فتح السجل ←</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 6. OPERATIONAL CROWDING FORECAST PANEL (Req #16 — توقع الازدحام التشغيلي)
// ============================================================================
export function CrowdingForecastPanel({ state, onOpenDrillDown }) {
  const curW = state.meta?.currentGlobalWeek || 45;
  const nextW = state.meta?.nextGlobalWeek || 46;
  const [targetWeek, setTargetWeek] = useState(nextW);

  const forecast = useMemo(() => computeCrowdingForecast(state, targetWeek), [state, targetWeek]);
  const progPeriods = useMemo(
    () =>
      (state.periods || [])
        .filter((p) => p.category === 'program_period')
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [state.periods]
  );

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '0.95rem' }}>
            <Flame size={18} color="#ea580c" />
            <span>توقع الازدحام والكثافة التشغيلية ({targetWeek === nextW ? 'الأسبوع القادم' : 'هذا الأسبوع'} — الأسبوع {targetWeek})</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
            يوضح الفترات التي يكثر فيها عدد البرامج، إشغال القاعات، تكليف الموظفين، واستهداف الفئات نفسها (تنبيه تخطيطي مبكر ولا يُعد وحده تعارضًا نهائيًا).
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn btn-sm ${targetWeek === nextW ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTargetWeek(nextW)}
          >
            الأسبوع القادم ({nextW})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${targetWeek === curW ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTargetWeek(curW)}
          >
            هذا الأسبوع ({curW})
          </button>
        </div>
      </div>

      {forecast.highDensitySlots.length > 0 && (
        <div className="alert-banner warn" style={{ marginBottom: 12, fontSize: '0.78rem' }}>
          <AlertTriangle size={16} />
          <span>
            <strong>تنبيه كثافة تشغيلية مبكر:</strong> رصد النظام ({forecast.highDensitySlots.length}) فترات ذات كثافة مرتفعة في إشغال القاعات وتكليف الموظفين؛ اضغط على أي فترة لعرض البرامج والحصص المسجلة فيها.
          </span>
        </div>
      )}

      <div className="table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>اليوم</th>
              {progPeriods.map((p) => (
                <th key={p.id}>
                  {p.name} ({p.approvedStart} - {p.approvedEnd})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORK_DAYS_AR.map((dayAr) => (
              <tr key={dayAr}>
                <td style={{ fontWeight: 900, whiteSpace: 'nowrap' }}>
                  <div>{dayAr}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {forecast.weekDates[dayAr]}
                  </div>
                </td>
                {progPeriods.map((p) => {
                  const slot = forecast.slots.find((s) => s.day === dayAr && s.periodId === p.id);
                  if (!slot) return <td key={p.id}>—</td>;

                  const isHigh = slot.densityLevel === 'high';
                  const isMed = slot.densityLevel === 'medium';

                  return (
                    <td
                      key={p.id}
                      onClick={() =>
                        onOpenDrillDown({
                          title: `تفاصيل الكثافة التشغيلية: ${dayAr} (${slot.dateIso}) — ${p.name}`,
                          subtitle: `إجمالي البرامج والالتزامات: ${slot.totalActivities} | القاعات المشغولة: ${slot.venuesCount}/${slot.totalVenues} (${slot.venueRate}%) | الموظفون المكلفون: ${slot.staffCount}/${slot.totalStaff} (${slot.staffRate}%)`,
                          records: slot.records,
                        })
                      }
                      style={{
                        cursor: 'pointer',
                        background: isHigh ? '#fef2f2' : isMed ? '#fffbeb' : 'var(--bg)',
                        borderLeft: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: '0.69rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: isHigh ? '#fee2e2' : isMed ? '#fef3c7' : '#dcfce7',
                            color: isHigh ? '#991b1b' : isMed ? '#92400e' : '#166534',
                          }}
                        >
                          {isHigh ? '▲ ' : isMed ? '● ' : '✓ '}
                          {slot.densityLabel}
                        </span>
                        <strong style={{ fontSize: '0.78rem' }}>{slot.totalActivities} نشاط</strong>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>القاعات: {slot.venuesCount}/{slot.totalVenues} ({slot.venueRate}%)</span>
                        <span>الموظفون: {slot.staffCount}/{slot.totalStaff} ({slot.staffRate}%)</span>
                      </div>
                      {slot.overlappingScopes.length > 0 && (
                        <div style={{ fontSize: '0.67rem', color: '#b45309', marginTop: 3, fontWeight: 700 }}>
                          تشارك فئات: {slot.overlappingScopes.slice(0, 2).join('، ')}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// 7. INTERACTIVE SCHEDULE EXPLORER (Req #17 — الجدول التفاعلي اليوم / الأسبوع / الشهر)
// Supports clicking Program -> details, Employee -> schedule, Venue -> bookings
// ============================================================================
export function InteractiveScheduleExplorer({
  state,
  selectedDateIso,
  selectedDayAr,
  onSelectDay,
  onOpenDetailModal,
  onOpenScheduleModal,
}) {
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week' | 'month'
  const [inspectEntity, setInspectEntity] = useState(null); // { type: 'employee'|'venue', id, name }

  const curW = state.meta?.currentGlobalWeek || 45;
  const curM = state.meta?.currentMonth || 11;
  const weekDates = useMemo(() => getDatesForGlobalWeek(curW), [curW]);

  const empMap = useMemo(() => Object.fromEntries((state.employees || []).map((e) => [e.id, e])), [state.employees]);
  const venueMap = useMemo(() => Object.fromEntries((state.venues || []).map((v) => [v.id, v])), [state.venues]);

  const dayItems = useMemo(() => {
    const execs = (state.scheduledExecutions || []).filter((ex) =>
      isDateInExecutionRange(selectedDateIso, selectedDayAr, ex)
    );
    const lessons = (state.weeklyCommitments || []).filter((wc) => wc.day === selectedDayAr).slice(0, 18);
    return { execs, lessons };
  }, [state.scheduledExecutions, state.weeklyCommitments, selectedDateIso, selectedDayAr]);

  const weekItems = useMemo(() => {
    return (state.plannedOccurrences || []).filter((o) => Number(o.plannedGlobalWeek) === Number(curW));
  }, [state.plannedOccurrences, curW]);

  const monthItems = useMemo(() => {
    return (state.plannedOccurrences || []).filter((o) => Number(o.plannedMonth) === Number(curM));
  }, [state.plannedOccurrences, curM]);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '0.95rem' }}>
            <Calendar size={18} color="var(--brand-teal)" />
            <span>الجدول التفاعلي الموحد (اليوم / الأسبوع / الشهر)</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
            اضغط على اسم البرنامج لفتح تفاصيله، أو على اسم الموظف لعرض جدوله، أو على اسم القاعة لعرض حجوزاتها.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'day', label: `اليوم (${selectedDayAr})` },
            { id: 'week', label: `الأسبوع الحالي (${curW})` },
            { id: 'month', label: `الشهر الحالي (${MONTH_NAMES_AR[curM]?.split(' ')[0] || 'نوفمبر'})` },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              className={`btn btn-sm ${viewMode === m.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'day' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {WORK_DAYS_AR.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${selectedDayAr === d ? 'btn-teal' : 'btn-secondary'}`}
                onClick={() => onSelectDay && onSelectDay(d)}
              >
                {d} ({weekDates[d]})
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>البرنامج / النشاط</th>
                  <th>القسم</th>
                  <th>الفترة</th>
                  <th>الموظف المسؤول (اضغط لجدوله)</th>
                  <th>القاعة / الموقع (اضغط لحجوزاتها)</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {dayItems.execs.map((ex) => (
                  <tr key={ex.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onOpenDetailModal && onOpenDetailModal({ execution: ex })}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--brand-ink)',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontFamily: 'inherit',
                        }}
                      >
                        {ex.programName}
                      </button>
                    </td>
                    <td>
                      <DepartmentPill deptId={ex.departmentId} deptName={ex.departmentName} departments={state.departments} />
                    </td>
                    <td style={{ fontSize: '0.75rem', fontWeight: 700 }}>{ex.periodName || ex.periodId}</td>
                    <td>
                      {ex.leadEmployeeId ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setInspectEntity({
                              type: 'employee',
                              id: ex.leadEmployeeId,
                              name: empMap[ex.leadEmployeeId]?.name || ex.leadEmployeeId,
                            })
                          }
                        >
                          <Users size={12} />
                          <span>{empMap[ex.leadEmployeeId]?.name || ex.leadEmployeeId}</span>
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {ex.venueId ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setInspectEntity({
                              type: 'venue',
                              id: ex.venueId,
                              name: venueMap[ex.venueId]?.name || ex.venueId,
                            })
                          }
                        >
                          <MapPin size={12} />
                          <span>{venueMap[ex.venueId]?.name || ex.venueId}</span>
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <StatusBadge status={ex.status} />
                    </td>
                  </tr>
                ))}

                {dayItems.lessons.map((wc) => (
                  <tr key={wc.id}>
                    <td style={{ fontWeight: 700, fontSize: '0.78rem' }}>{wc.title}</td>
                    <td>
                      <DepartmentPill deptId={wc.departmentId} departments={state.departments} />
                    </td>
                    <td style={{ fontSize: '0.74rem' }}>{wc.periodName}</td>
                    <td>
                      {wc.leadEmployeeId ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setInspectEntity({
                              type: 'employee',
                              id: wc.leadEmployeeId,
                              name: empMap[wc.leadEmployeeId]?.name || wc.leadEmployeeId,
                            })
                          }
                        >
                          <Users size={12} />
                          <span>{empMap[wc.leadEmployeeId]?.name || wc.leadEmployeeId}</span>
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {wc.venueId ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setInspectEntity({
                              type: 'venue',
                              id: wc.venueId,
                              name: venueMap[wc.venueId]?.name || wc.venueId,
                            })
                          }
                        >
                          <MapPin size={12} />
                          <span>{venueMap[wc.venueId]?.name || wc.venueId}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.73rem' }}>{wc.venueNote || '—'}</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status="معتمد بالجدول" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(viewMode === 'week' || viewMode === 'month') && (
        <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>البرنامج</th>
                <th>القسم</th>
                <th>الأسبوع المخطط</th>
                <th>المسؤول</th>
                <th>القاعة</th>
                <th>الحالة والجاهزية</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {(viewMode === 'week' ? weekItems : monthItems).slice(0, 45).map((occ) => {
                const ex = occ.linkedExecution;
                return (
                  <tr key={occ.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onOpenDetailModal && onOpenDetailModal({ occurrence: occ, execution: ex })}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--brand-ink)',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontFamily: 'inherit',
                        }}
                      >
                        {occ.programName}
                      </button>
                    </td>
                    <td>
                      <DepartmentPill deptId={occ.departmentId} deptName={occ.departmentName} departments={state.departments} />
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
                      {ex?.leadEmployeeId ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setInspectEntity({
                              type: 'employee',
                              id: ex.leadEmployeeId,
                              name: empMap[ex.leadEmployeeId]?.name || ex.leadEmployeeId,
                            })
                          }
                        >
                          {empMap[ex.leadEmployeeId]?.name || ex.leadEmployeeId}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>غير محدد</span>
                      )}
                    </td>
                    <td>
                      {ex?.venueId ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setInspectEntity({
                              type: 'venue',
                              id: ex.venueId,
                              name: venueMap[ex.venueId]?.name || ex.venueId,
                            })
                          }
                        >
                          {venueMap[ex.venueId]?.name || ex.venueId}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>غير محددة</span>
                      )}
                    </td>
                    <td>
                      <ReadinessBadge item={occ} state={state} compact />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() =>
                          onOpenScheduleModal &&
                          onOpenScheduleModal({
                            mode: ex ? 'edit_execution' : 'schedule_planned',
                            occurrence: occ,
                            execution: ex,
                          })
                        }
                      >
                        {ex ? 'تعديل' : 'جدولة'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Inspector Modal for Employee Schedule or Venue Bookings */}
      {inspectEntity && (
        <div className="modal-backdrop" onClick={() => setInspectEntity(null)}>
          <div className="modal-panel" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '0.96rem', fontWeight: 900 }}>
                {inspectEntity.type === 'employee'
                  ? `جدول وبرامج الموظف: ${inspectEntity.name}`
                  : `حجوزات وبرامج القاعة: ${inspectEntity.name}`}
              </h3>
              <button type="button" className="icon-btn" onClick={() => setInspectEntity(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
              {inspectEntity.type === 'employee' ? (
                <div className="table-wrap">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>اليوم</th>
                        <th>الفترة</th>
                        <th>النشاط / البرنامج</th>
                        <th>الموقع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(state.weeklyCommitments || [])
                        .filter(
                          (wc) =>
                            wc.leadEmployeeId === inspectEntity.id ||
                            (wc.participatingEmployeeIds || []).includes(inspectEntity.id)
                        )
                        .map((wc) => (
                          <tr key={wc.id}>
                            <td style={{ fontWeight: 800 }}>{wc.day}</td>
                            <td>{wc.periodName}</td>
                            <td style={{ fontWeight: 700 }}>{wc.title}</td>
                            <td>{venueMap[wc.venueId]?.name || wc.venueNote || '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>اليوم</th>
                        <th>الفترة</th>
                        <th>النشاط / البرنامج الحاجز للقاعة</th>
                        <th>المسؤول</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(state.weeklyCommitments || [])
                        .filter((wc) => wc.venueId === inspectEntity.id)
                        .map((wc) => (
                          <tr key={wc.id}>
                            <td style={{ fontWeight: 800 }}>{wc.day}</td>
                            <td>{wc.periodName}</td>
                            <td style={{ fontWeight: 700 }}>{wc.title}</td>
                            <td>{empMap[wc.leadEmployeeId]?.name || '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 8. CLUB DIRECTOR EXECUTIVE DASHBOARD (Section 2: Req #6, #7, #8, #9)
// ============================================================================
export function ClubDirectorExecutiveDashboard({
  state,
  evaluations,
  todayIso,
  lastSyncedAt,
  onManualRefresh,
  onNavigate,
  onOpenScheduleModal,
  onOpenDetailModal,
  onOpenEvaluationModal,
  onSelectDepartmentDetail,
}) {
  const [periodScope, setPeriodScope] = useState('current_month'); // 'this_week' | 'two_weeks' | 'current_month' | 'all_year'
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [drillDown, setDrillDown] = useState(null);
  const [readinessTarget, setReadinessTarget] = useState(null);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const analytics = useMemo(
    () =>
      computePlatformAnalytics({
        state,
        evaluations,
        periodScope,
        deptFilter,
        todayIso,
      }),
    [state, evaluations, periodScope, deptFilter, todayIso]
  );

  const { kpis, departmentCards, decisionsRequired, charts } = analytics;

  const handleRefresh = async () => {
    if (refreshing || !onManualRefresh) return;
    setRefreshing(true);
    try {
      await onManualRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDecisionAction = (dec) => {
    if (dec.routeTarget === 'exceptions') {
      onNavigate('exceptions', dec.entityId);
    } else if (dec.routeTarget === 'detail_execution' && dec.raw) {
      onOpenDetailModal({ execution: dec.raw });
    } else if (dec.routeTarget === 'schedule_occurrence' && dec.raw) {
      onOpenScheduleModal({ mode: 'schedule_planned', occurrence: dec.raw });
    } else if (dec.routeTarget === 'discrepancies') {
      onNavigate('discrepancies');
    } else if (dec.routeTarget === 'task') {
      setDrillDown({
        title: dec.title,
        subtitle: dec.subtitle,
        records: [dec.raw],
      });
    }
  };

  const kpiCardsConfig = [
    {
      key: 'planned',
      label: 'إجمالي البرامج المخططة',
      value: kpis.planned.value,
      sub: periodScope === 'current_month' ? 'خلال الشهر الحالي' : periodScope === 'this_week' ? 'خلال هذا الأسبوع' : 'ضمن النطاق المحدد',
      color: '#16a34a',
      icon: Calendar,
      data: kpis.planned,
    },
    {
      key: 'scheduled',
      label: 'البرامج المجدولة',
      value: kpis.scheduled.value,
      sub: `من أصل ${kpis.planned.value} برنامج مخطط`,
      color: '#00A59B',
      icon: CalendarCheck,
      data: kpis.scheduled,
    },
    {
      key: 'executed',
      label: 'البرامج المنفذة',
      value: kpis.executed.value,
      sub: 'تم توثيق تنفيذها فعليًا',
      color: '#2563eb',
      icon: CheckCheck,
      data: kpis.executed,
    },
    {
      key: 'overdue',
      label: 'غير المنفذة والمستحقة',
      value: kpis.overdue.value,
      sub: 'برامج مستحقة تحتاج جدولة/توثيق',
      color: kpis.overdue.value > 0 ? '#d97706' : '#059669',
      icon: Clock,
      data: kpis.overdue,
    },
    {
      key: 'postponedOrCancelled',
      label: 'المؤجلة والملغاة',
      value: kpis.postponedOrCancelled.value,
      sub: `مؤجل: ${kpis.postponedOrCancelled.postponedCount} • ملغي: ${kpis.postponedOrCancelled.cancelledCount}`,
      color: '#64748b',
      icon: FileWarning,
      data: kpis.postponedOrCancelled,
    },
    {
      key: 'compliance',
      label: 'نسبة الالتزام بالخطة',
      value: `${kpis.compliance.value}%`,
      sub: `المستحق الفعال: ${kpis.compliance.effectiveDueCount} برنامج`,
      color: '#0f766e',
      icon: BarChart3,
      data: kpis.compliance,
    },
    {
      key: 'openConflicts',
      label: 'التعارضات غير المعالجة',
      value: kpis.openConflicts.value,
      sub: 'تعارضات فعلية تنتظر الحل',
      color: kpis.openConflicts.value > 0 ? '#dc2626' : '#059669',
      icon: ShieldAlert,
      data: kpis.openConflicts,
    },
    {
      key: 'pendingExceptions',
      label: 'طلبات الاستثناء المعلقة',
      value: kpis.pendingExceptions.value,
      sub: 'بانتظار الرأي أو الاعتماد أو المعالجة',
      color: '#7c3aed',
      icon: Sparkles,
      data: kpis.pendingExceptions,
    },
    {
      key: 'pendingApprovals',
      label: 'طلبات الاعتماد المنتظرة',
      value: kpis.pendingApprovals.value,
      sub: 'تحتاج قرار اعتماد نهائي',
      color: '#ea580c',
      icon: UserCheck,
      data: kpis.pendingApprovals,
    },
    {
      key: 'overdueTasks',
      label: 'المهام المتأخرة',
      value: kpis.overdueTasks.value,
      sub: `المهام المفتوحة: ${kpis.overdueTasks.openCount}`,
      color: kpis.overdueTasks.value > 0 ? '#dc2626' : '#0284c7',
      icon: ListChecks,
      data: kpis.overdueTasks,
    },
    {
      key: 'unevaluatedExecuted',
      label: 'منفذة لم تُقيّم بعد',
      value: kpis.unevaluatedExecuted.value,
      sub: 'برامج منفذة بانتظار التقييم',
      color: kpis.unevaluatedExecuted.value > 0 ? '#d97706' : '#059669',
      icon: Award,
      data: kpis.unevaluatedExecuted,
    },
    {
      key: 'evalCompletion',
      label: 'نسبة استكمال التقييمات',
      value: `${kpis.evalCompletion.value}%`,
      sub: `إجمالي التقييمات المسجلة: ${kpis.evalCompletion.totalEvaluationsRecords}`,
      color: '#0284c7',
      icon: Award,
      data: kpis.evalCompletion,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
      {/* Executive Header & Scope Controls */}
      <div
        className="card"
        style={{
          border: '1.5px solid rgba(0, 165, 155, 0.45)',
          background: 'linear-gradient(135deg, rgba(0,165,155,0.07) 0%, rgba(2,132,199,0.05) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '1.08rem', color: 'var(--brand-ink)' }}>
              <Building2 size={21} color="var(--brand-teal)" />
              <span>لوحة القيادة التنفيذية لمدير الإدارة — نادي تراؤف للبنين</span>
            </div>
            <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 3 }}>
              صورة شاملة ومباشرة للوضع التشغيلي للأقسام الأربعة، مستوى تنفيذ الخطة، والقرارات التي تتطلب تدخلك. (اضغط على أي مؤشر أو مخطط لعرض سجلاته الفعلية).
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 175, height: 35, fontSize: '0.77rem', fontWeight: 700 }}
              value={periodScope}
              onChange={(e) => setPeriodScope(e.target.value)}
              aria-label="نطاق الفترة الزمنية"
            >
              <option value="this_week">هذا الأسبوع (الأسبوع 45)</option>
              <option value="two_weeks">الأسبوع الحالي والقادم (45-46)</option>
              <option value="current_month">الشهر الحالي (نوفمبر)</option>
              <option value="all_year">الخطة السنوية كاملة (52 أسبوعًا)</option>
            </select>

            <select
              className="form-select"
              style={{ width: 175, height: 35, fontSize: '0.77rem', fontWeight: 700 }}
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="تصفية حسب القسم"
            >
              <option value="ALL">جميع الأقسام الأربعة</option>
              {(state.departments || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setShowDefinitions(true)}
              title="عرض التعريف المعتمد وطريقة حساب كل مؤشر"
            >
              <Info size={14} />
              <span>تعريف المؤشرات</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              title={`آخر تحديث: ${formatDateTimeAr(lastSyncedAt)}`}
            >
              <RefreshCw size={14} />
              <span>{refreshing ? 'جارٍ التحديث...' : 'تحديث مباشر'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION: DECISIONS REQUIRED BOARD ("يحتاج قرارك" — Req #8) */}
      <div
        className="card"
        style={{
          border: decisionsRequired.length > 0 ? '1.5px solid #f59e0b' : '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '0.98rem' }}>
            <AlertTriangle size={19} color="#d97706" />
            <span>يحتاج قرارك (مرتبة حسب الأهمية والاستحقاق الزمني)</span>
            <span className="status-badge badge-unscheduled" style={{ fontSize: '0.72rem' }}>
              {decisionsRequired.length} عنصر
            </span>
          </div>
          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            طلبات الاعتماد • الاستثناءات • التعارضات • اختلافات البيانات • البرامج والمهام المستحقة
          </span>
        </div>

        {decisionsRequired.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: '0.84rem' }}>
            لا توجد طلبات أو تعارضات معلقة تنتظر قرارك حاليًا.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 10,
            }}
          >
            {decisionsRequired.slice(0, 6).map((dec) => (
              <div
                key={dec.id}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: 12,
                  background: 'var(--bg)',
                  border: dec.priorityScore >= 90 ? '1.5px solid #fca5a5' : '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span
                      className={`status-badge ${dec.priorityScore >= 90 ? 'badge-conflict' : 'badge-unscheduled'}`}
                      style={{ fontSize: '0.67rem' }}
                    >
                      {dec.categoryLabel}
                    </span>
                    <span style={{ fontSize: '0.69rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      الاستحقاق: {dec.dueDate}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.83rem', color: 'var(--text)' }}>{dec.title}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>{dec.subtitle}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-teal)' }}>
                    {dec.departmentName}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => handleDecisionAction(dec)}
                  >
                    <span>{dec.actionLabel}</span>
                    <ArrowUpLeft size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION: 12 EXECUTIVE SUMMARY KPI CARDS (Req #6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
          gap: 10,
        }}
      >
        {kpiCardsConfig.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              role="button"
              tabIndex={0}
              onClick={() =>
                setDrillDown({
                  title: `${card.label} (${card.value})`,
                  subtitle: `${card.data.meta?.definition || ''} — ${card.data.meta?.formula || ''}`,
                  records: card.data.records,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDrillDown({
                    title: `${card.label} (${card.value})`,
                    subtitle: card.data.meta?.definition || '',
                    records: card.data.records,
                  });
                }
              }}
              className="card"
              style={{
                padding: '0.85rem 1rem',
                cursor: 'pointer',
                borderTop: `3.5px solid ${card.color}`,
                transition: 'transform 0.15s ease',
              }}
              title={`${card.data.meta?.definition || ''} (اضغط لعرض السجلات)`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                  {card.label}
                </span>
                <Icon size={17} color={card.color} />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.15 }}>
                {card.value}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                <span>{card.sub}</span>
                <span style={{ color: 'var(--brand-teal)', fontWeight: 700 }}>عرض ←</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* SECTION: 4 INTERACTIVE DEPARTMENT CARDS (Req #7 — متابعة الأقسام) */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: '0.98rem' }}>
              متابعة الأقسام الأربعة ومستوى الالتزام بالخطة
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              اضغط على أي قسم للانتقال إلى لوحة تفاصيل القسم وفريقه وبرامجه مباشرة، أو اضغط على أي مؤشر فرعي لعرض سجلاته.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 12,
          }}
        >
          {departmentCards.map((dc) => (
            <div
              key={dc.id}
              style={{
                borderRadius: 14,
                border: `1.5px solid ${dc.color}55`,
                background: 'var(--bg)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '0.96rem', color: dc.color }}>{dc.name}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    رئيس القسم: <strong style={{ color: 'var(--text)' }}>{dc.headName}</strong>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background:
                      dc.complianceBadge === 'ready'
                        ? '#ecfdf5'
                        : dc.complianceBadge === 'blocked'
                        ? '#fef2f2'
                        : '#fffbeb',
                    color:
                      dc.complianceBadge === 'ready'
                        ? '#065f46'
                        : dc.complianceBadge === 'blocked'
                        ? '#991b1b'
                        : '#92400e',
                  }}
                >
                  {dc.complianceStatus}
                </span>
              </div>

              {/* Progress Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', marginBottom: 4 }}>
                  <span>الالتزام واستكمال الجدولة:</span>
                  <strong style={{ color: dc.color }}>{dc.scheduleRate}% ({dc.scheduledCount}/{dc.totalPrograms})</strong>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, dc.scheduleRate)}%`,
                      height: '100%',
                      background: dc.color,
                    }}
                  />
                </div>
              </div>

              {/* Clickable Mini Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: '0.72rem' }}>
                <button
                  type="button"
                  onClick={() =>
                    setDrillDown({
                      title: `برامج ${dc.name} (${dc.totalPrograms})`,
                      records: dc.records.all,
                    })
                  }
                  style={{
                    padding: '0.4rem',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)' }}>البرامج</div>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{dc.totalPrograms}</strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDrillDown({
                      title: `البرامج المتأخرة / المستحقة — ${dc.name}`,
                      records: dc.records.overdue,
                    })
                  }
                  style={{
                    padding: '0.4rem',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)' }}>المتأخرة</div>
                  <strong style={{ fontSize: '0.88rem', color: dc.overdueCount > 0 ? '#d97706' : '#059669' }}>
                    {dc.overdueCount}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDrillDown({
                      title: `التعارضات المفتوحة — ${dc.name}`,
                      records: dc.records.conflicts,
                    })
                  }
                  style={{
                    padding: '0.4rem',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)' }}>التعارضات</div>
                  <strong style={{ fontSize: '0.88rem', color: dc.conflictsCount > 0 ? '#dc2626' : '#059669' }}>
                    {dc.conflictsCount}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDrillDown({
                      title: `طلبات تنتظر إجراء — ${dc.name}`,
                      records: dc.records.pendingReqs,
                    })
                  }
                  style={{
                    padding: '0.4rem',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)' }}>بانتظار إجراء</div>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{dc.pendingActionsCount}</strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDrillDown({
                      title: `البرامج المنفذة — ${dc.name}`,
                      records: dc.records.executed,
                    })
                  }
                  style={{
                    padding: '0.4rem',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)' }}>المنفذة</div>
                  <strong style={{ fontSize: '0.88rem', color: '#2563eb' }}>{dc.executedCount}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('evaluations')}
                  style={{
                    padding: '0.4rem',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)' }}>التقييمات</div>
                  <strong style={{ fontSize: '0.88rem', color: '#0f766e' }}>{dc.evalCompletionRate}%</strong>
                </button>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ width: '100%', justifyContent: 'center', background: dc.color, borderColor: dc.color }}
                onClick={() => onSelectDepartmentDetail && onSelectDepartmentDetail(dc.id)}
              >
                <span>فتح لوحة تفاصيل {dc.shortName} وفريقه</span>
                <ArrowUpLeft size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION: 7 INTERACTIVE CHARTS (Req #9 — المخططات التفاعلية) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Chart 1 & 3: Planned vs Scheduled vs Executed & Dept Comparison */}
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: '0.92rem', marginBottom: 4 }}>
            1. المخطط مقابل المجدول والمنفذ ومقارنة الأقسام
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            اضغط على أي قسم في المخطط لعرض البرامج المكونة له.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {charts.deptComparisonChart.map((row) => {
              const maxVal = Math.max(1, ...charts.deptComparisonChart.map((r) => r.planned));
              const pPct = Math.round((row.planned / maxVal) * 100);
              const sPct = Math.round((row.scheduled / maxVal) * 100);
              return (
                <div
                  key={row.deptId}
                  onClick={() =>
                    setDrillDown({
                      title: `برامج ${row.fullName} (${row.planned} مخطط / ${row.scheduled} مجدول)`,
                      records: row.records,
                    })
                  }
                  style={{ cursor: 'pointer', padding: '0.45rem', borderRadius: 8, background: 'var(--bg)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 4 }}>
                    <strong style={{ color: row.color }}>{row.name}</strong>
                    <span>
                      مخطط: <strong>{row.planned}</strong> • مجدول: <strong>{row.scheduled}</strong> • منفذ: <strong>{row.executed}</strong> ({row.scheduleRate}%)
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', position: 'relative', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pPct}%`,
                        height: '100%',
                        background: `${row.color}44`,
                        position: 'absolute',
                        right: 0,
                      }}
                    />
                    <div
                      style={{
                        width: `${sPct}%`,
                        height: '100%',
                        background: row.color,
                        position: 'absolute',
                        right: 0,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Monthly Evolution across Months 1..12 */}
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: '0.92rem', marginBottom: 4 }}>
            2. تطور البرامج والتنفيذ خلال أشهر الخطة (1–12)
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            اضغط على عمود أي شهر لعرض برامج ذلك الشهر.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: 5,
              alignItems: 'end',
              height: 165,
              paddingTop: 14,
            }}
          >
            {charts.monthlyEvolutionChart.map((m) => {
              const maxM = Math.max(1, ...charts.monthlyEvolutionChart.map((x) => x.planned));
              const hPct = Math.max(8, Math.round((m.planned / maxM) * 100));
              return (
                <div
                  key={m.month}
                  onClick={() =>
                    setDrillDown({
                      title: `برامج شهر ${m.fullLabel} (${m.planned})`,
                      records: m.records,
                    })
                  }
                  title={`${m.fullLabel}: ${m.planned} برنامج مخطط`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: '100%',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.64rem', fontWeight: 800, marginBottom: 3 }}>{m.planned}</span>
                  <div
                    style={{
                      width: '100%',
                      height: `${hPct}%`,
                      borderRadius: '6px 6px 2px 2px',
                      background: m.isCurrent ? 'var(--brand-teal)' : '#0284c788',
                      border: m.isCurrent ? '2px solid #0f766e' : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.62rem',
                      marginTop: 4,
                      fontWeight: m.isCurrent ? 900 : 600,
                      color: m.isCurrent ? 'var(--brand-teal)' : 'var(--text-muted)',
                    }}
                  >
                    ش{m.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 4: Programs Distribution by Status */}
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: '0.92rem', marginBottom: 4 }}>
            3. توزيع البرامج حسب الحالة التشغيلية
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            اضغط على أي حالة لفتح جميع البرامج المصنفة تحتها.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {charts.statusBuckets.map((b) => (
              <div
                key={b.key}
                onClick={() =>
                  setDrillDown({
                    title: `البرامج بحالة: ${b.label} (${b.count})`,
                    records: b.records,
                  })
                }
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  borderRight: `4px solid ${b.color}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>{b.label}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{b.percent}% من النطاق</div>
                </div>
                <strong style={{ fontSize: '1.05rem', color: b.color }}>{b.count}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 5, 6, 7 Combined Interactive Breakdown: Conflicts, Evaluations & Tasks */}
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: '0.92rem', marginBottom: 4 }}>
            4. التعارضات، استكمال التقييمات، وتوزيع المهام
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            مؤشرات الرقابة النوعية (اضغط على أي شريط لفتح السجلات).
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--brand-ink)' }}>
              أ) التعارضات حسب النوع ({kpis.openConflicts.value}):
            </div>
            {charts.conflictsByTypeChart.length === 0 ? (
              <div style={{ fontSize: '0.74rem', color: '#059669' }}>لا توجد تعارضات مفتوحة حاليًا ✓</div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {charts.conflictsByTypeChart.map((ct) => (
                  <button
                    key={ct.label}
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() =>
                      setDrillDown({
                        title: `التعارضات من نوع: ${ct.label}`,
                        records: ct.records,
                      })
                    }
                  >
                    <span>{ct.label}:</span>
                    <strong style={{ color: '#dc2626' }}>{ct.count}</strong>
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--brand-ink)', marginTop: 4 }}>
              ب) توزيع المهام الوظيفية والتكليفات:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {charts.tasksDistributionChart.map((tb) => (
                <div
                  key={tb.key}
                  onClick={() =>
                    setDrillDown({
                      title: `${tb.label} (${tb.count})`,
                      records: tb.records,
                    })
                  }
                  style={{
                    padding: '0.5rem',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    border: `1px solid ${tb.color}55`,
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>{tb.label}</div>
                  <strong style={{ fontSize: '1rem', color: tb.color }}>{tb.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <MetricDefinitionsModal isOpen={showDefinitions} onClose={() => setShowDefinitions(false)} />

      <DrillDownRecordsModal
        drillDown={drillDown}
        onClose={() => setDrillDown(null)}
        state={state}
        onOpenScheduleModal={onOpenScheduleModal}
        onOpenDetailModal={onOpenDetailModal}
        onOpenEvaluationModal={onOpenEvaluationModal}
        onNavigate={onNavigate}
        onInspectReadiness={(item) => setReadinessTarget(item)}
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

// ============================================================================
// 9. DEPARTMENT HEAD DASHBOARD (Section 3: Req #10, #11, #12)
// Scoped strictly to the Department Head's department!
// ============================================================================
export function DepartmentHeadDashboard({
  state,
  evaluations,
  departmentId,
  canSwitchDepartment = false,
  selectedDateIso,
  selectedDayAr,
  onNavigate,
  onOpenScheduleModal,
  onOpenDetailModal,
  onOpenEvaluationModal,
  onOpenAssignTask,
}) {
  const [activeDeptId, setActiveDeptId] = useState(departmentId || state.departments?.[0]?.id || 'dept_tarbawi');
  const [activeBucketKey, setActiveBucketKey] = useState('auto');
  const [drillDown, setDrillDown] = useState(null);
  const [readinessTarget, setReadinessTarget] = useState(null);
  const [selectedStaffMember, setSelectedStaffMember] = useState(null);

  const effectiveDeptId = canSwitchDepartment ? activeDeptId : departmentId || activeDeptId;

  const dash = useMemo(
    () =>
      computeDepartmentHeadDashboard({
        state,
        evaluations,
        departmentId: effectiveDeptId,
        selectedDateIso,
        selectedDayAr,
      }),
    [state, evaluations, effectiveDeptId, selectedDateIso, selectedDayAr]
  );

  const { department, kpis, programTrackingBuckets, deptTeamRows } = dash;
  const activeBucket =
    (activeBucketKey !== 'auto' && programTrackingBuckets.find((b) => b.key === activeBucketKey)) ||
    programTrackingBuckets.find((b) => b.count > 0) ||
    programTrackingBuckets[0];

  const kpiEntries = Object.entries(kpis);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
      {/* Dept Header */}
      <div
        className="card"
        style={{
          border: `1.5px solid ${department?.color || '#00A59B'}66`,
          background: 'var(--bg-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '1.05rem', color: department?.color || 'var(--brand-teal)' }}>
              <Layers size={20} />
              <span>لوحة قيادة {department?.name || 'القسم'} — متابعة البرامج والفريق</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
              رئيس القسم المعتمد: <strong>{department?.headName || '—'}</strong> • تعرض هذه اللوحة مؤشرات القسم، جاهزية البرامج، ومتابعة فريق القسم.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {canSwitchDepartment && (
              <select
                className="form-select"
                style={{ width: 210, height: 35, fontSize: '0.78rem', fontWeight: 800 }}
                value={effectiveDeptId}
                onChange={(e) => setActiveDeptId(e.target.value)}
              >
                {(state.departments || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    معاينة: {d.name}
                  </option>
                ))}
              </select>
            )}
            {onOpenAssignTask && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={onOpenAssignTask}>
                <Plus size={14} />
                <span>إسناد مهمة لموظف بالقسم</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 13 Department KPIs (Req #10) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: 8,
        }}
      >
        {kpiEntries.map(([key, item]) => (
          <div
            key={key}
            onClick={() =>
              setDrillDown({
                title: `${item.label} — ${department?.name || ''} (${item.value})`,
                records: item.records,
              })
            }
            className="card"
            style={{
              padding: '0.7rem 0.85rem',
              cursor: 'pointer',
              borderRight: `3.5px solid ${department?.color || '#00A59B'}`,
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, marginTop: 4 }}>{item.value}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--brand-teal)', marginTop: 2, fontWeight: 700 }}>
              عرض السجلات ←
            </div>
          </div>
        ))}
      </div>

      {/* SECTION: PROGRAM EXECUTION & READINESS TRACKING ("متابعة تنفيذ البرامج" — Req #12) */}
      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: '0.96rem' }}>
            متابعة تنفيذ وجاهزية برامج {department?.name}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            صنّف النظام برامج القسم حسب حالتها وجاهزيتها التشغيلية؛ اضغط على أي تصنيف لعرض البرامج واتخاذ الإجراء المباشر.
          </div>
        </div>

        {/* 8 Interactive Bucket Filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {programTrackingBuckets.map((b) => {
            const active = activeBucket.key === b.key;
            return (
              <button
                key={b.key}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveBucketKey(b.key)}
                style={active ? { background: b.color, borderColor: b.color } : {}}
              >
                <span>{b.label}</span>
                <span
                  style={{
                    background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg)',
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontSize: '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  {b.count}
                </span>
              </button>
            );
          })}
        </div>

        {activeBucket.items.length === 0 ? (
          <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            لا توجد برامج ضمن تصنيف «{activeBucket.label}» حاليًا.
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>اسم البرنامج</th>
                  <th>الأسبوع / الموعد</th>
                  <th>المسؤول</th>
                  <th>القاعة</th>
                  <th>الحالة</th>
                  <th>جاهزية البرنامج (اضغط للتفاصيل)</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {activeBucket.items.map((item) => {
                  const ex = item.execution;
                  const occ = item.occurrence;
                  const empName = ex?.leadEmployeeId
                    ? state.employees.find((e) => e.id === ex.leadEmployeeId)?.name || ex.leadEmployeeId
                    : 'غير محدد';
                  const venueName = ex?.venueId
                    ? state.venues.find((v) => v.id === ex.venueId)?.name || ex.venueId
                    : 'غير محددة';

                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 800, fontSize: '0.8rem' }}>{item.programName}</td>
                      <td style={{ fontSize: '0.74rem' }}>
                        {ex?.executionDate
                          ? `${ex.day || ''} (${ex.executionDate}) • ${ex.periodName || ''}`
                          : `${item.plannedMonthName || ''} — ${item.plannedWeekLabel || ''} (أسبوع ${item.plannedGlobalWeek || ''})`}
                      </td>
                      <td style={{ fontSize: '0.75rem', fontWeight: ex?.leadEmployeeId ? 700 : 400, color: ex?.leadEmployeeId ? 'var(--text)' : '#d97706' }}>
                        {empName}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: ex?.venueId ? 'var(--text)' : '#d97706' }}>
                        {venueName}
                      </td>
                      <td>
                        <StatusBadge status={item.effectiveStatus} />
                      </td>
                      <td>
                        <ReadinessBadge
                          readinessObj={item.readiness}
                          compact
                          onClick={() => setReadinessTarget(item)}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() =>
                              onOpenScheduleModal({
                                mode: ex ? 'edit_execution' : 'schedule_planned',
                                occurrence: occ,
                                execution: ex,
                              })
                            }
                          >
                            <Edit3 size={12} />
                            <span>{ex ? 'استكمال/تعديل' : 'جدولة الآن'}</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => onOpenDetailModal({ occurrence: occ, execution: ex })}
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION: DEPARTMENT TEAM FOLLOW-UP ("فريق القسم" — Req #11) */}
      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: '0.96rem' }}>
            فريق القسم ({deptTeamRows.length} موظفين — اضغط على اسم الموظف لفتح ملفه التشغيلي وجدوله)
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            يعرض البرامج الحالية، المهام المفتوحة والمتأخرة، التكليفات اليومية، نصاب الجدول الدراسي، والتقييمات وفق الصلاحيات.
          </div>
        </div>

        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>اسم الموظف</th>
                <th>المسمى / الدور</th>
                <th>برامجه الحالية</th>
                <th>مهامه المفتوحة</th>
                <th>المهام المتأخرة</th>
                <th>التكليفات اليومية (الإشراف)</th>
                <th>حصص الجدول الدراسي</th>
                <th>متوسط التقييم</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {deptTeamRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedStaffMember(row)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontWeight: 800,
                        fontSize: '0.81rem',
                        color: 'var(--brand-ink)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontFamily: 'inherit',
                      }}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{row.jobTitle}</td>
                  <td style={{ fontWeight: 800 }}>{row.currentPrograms.length}</td>
                  <td style={{ fontWeight: 800 }}>{row.openTasks.length}</td>
                  <td>
                    <span
                      style={{
                        fontWeight: 800,
                        color: row.overdueTasks.length > 0 ? '#dc2626' : '#059669',
                      }}
                    >
                      {row.overdueTasks.length}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{row.supervisionDuties.length} موقع</td>
                  <td style={{ fontWeight: 700 }}>{row.timetableLessons.length} حصة</td>
                  <td>
                    {row.avgEval != null ? (
                      <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>
                        {row.avgEval}% ({row.evaluations.length})
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>لا يوجد بعد</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setSelectedStaffMember(row)}
                    >
                      <Eye size={13} />
                      <span>فتح الملف</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Operational Detail Modal for Department Head */}
      {selectedStaffMember && (
        <div className="modal-backdrop" onClick={() => setSelectedStaffMember(null)}>
          <div className="modal-panel" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '1.02rem', fontWeight: 900 }}>
                  الملف التشغيلي للموظف: {selectedStaffMember.name}
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {selectedStaffMember.jobTitle} • @{selectedStaffMember.username}
                </p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedStaffMember(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: 6 }}>
                  1. البرامج المسندة للموظف ({selectedStaffMember.currentPrograms.length}):
                </div>
                {selectedStaffMember.currentPrograms.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>لا توجد برامج تنفيذية مجدولة حاليًا.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>البرنامج</th>
                          <th>التاريخ والفترة</th>
                          <th>الدور</th>
                          <th>الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStaffMember.currentPrograms.map((ex) => (
                          <tr key={ex.id}>
                            <td style={{ fontWeight: 800 }}>{ex.programName}</td>
                            <td>{ex.executionDate} • {ex.periodName}</td>
                            <td>{ex.leadEmployeeId === selectedStaffMember.id ? 'مسؤول البرنامج' : 'مشارك'}</td>
                            <td><StatusBadge status={ex.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: 6 }}>
                  2. الجدول الدراسي الأسبوعي المعتمد ({selectedStaffMember.timetableLessons.length} حصة):
                </div>
                <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>اليوم</th>
                        <th>الفترة</th>
                        <th>النشاط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStaffMember.timetableLessons.map((wc) => (
                        <tr key={wc.id}>
                          <td style={{ fontWeight: 800 }}>{wc.day}</td>
                          <td>{wc.periodName}</td>
                          <td>{wc.title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <DrillDownRecordsModal
        drillDown={drillDown}
        onClose={() => setDrillDown(null)}
        state={state}
        onOpenScheduleModal={onOpenScheduleModal}
        onOpenDetailModal={onOpenDetailModal}
        onOpenEvaluationModal={onOpenEvaluationModal}
        onNavigate={onNavigate}
        onInspectReadiness={(item) => setReadinessTarget(item)}
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
