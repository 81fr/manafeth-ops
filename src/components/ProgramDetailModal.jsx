import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Users,
  Layers,
  CheckCheck,
  PauseCircle,
  XCircle,
  Edit3,
  Copy,
  History,
  ShieldAlert,
  Sparkles,
  FileText,
  ArrowLeftRight,
  GitBranch,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckSquare,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { formatDateTimeAr, formatTime12Ar, formatDateRangeAr } from '../engine/dateUtils';
import { canEditProgram, canDeleteEntity, hasPermission } from '../engine/permissions';
import { StatusBadge, PlannedGreenPill, DepartmentPill } from './StatusBadge';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { ReadinessBadge, ReadinessInspectorModal } from './InteractiveDashboards';

export default function ProgramDetailModal({
  isOpen,
  onClose,
  occurrence = null,
  execution = null,
  onScheduleOrEdit = null,
  onClone = null,
  onNavigateExceptions = null,
  onOpenEvaluation = null,
}) {
  const { state, auditLogs, updateProgramStatus, softDeleteEntity, bulkSoftDeleteEntities, currentUser, evaluations } = useOps();
  const [activeTab, setActiveTab] = useState('overview');
  const [statusReason, setStatusReason] = useState('');
  const [expandedSubId, setExpandedSubId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedSubIds, setSelectedSubIds] = useState([]);
  const [bulkDeleteSubs, setBulkDeleteSubs] = useState(null);
  const [showReadinessModal, setShowReadinessModal] = useState(false);

  const execObj = execution || occurrence?.linkedExecution || null;
  const baseObj = execObj || occurrence;

  const targetId = execObj?.id || baseObj?.id;
  const programEvaluations = useMemo(() => {
    if (!targetId || !evaluations) return [];
    return evaluations.filter((e) => e.targetId === targetId && !e.isDeleted);
  }, [evaluations, targetId]);

  const hasEvaluations = programEvaluations.length > 0;
  const avgEvalScore = useMemo(() => {
    if (!hasEvaluations) return null;
    const total = programEvaluations.reduce((s, e) => s + Number(e.percent || 0), 0);
    return Math.round((total / programEvaluations.length) * 10) / 10;
  }, [programEvaluations, hasEvaluations]);

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);
  const studentMap = useMemo(
    () => Object.fromEntries((state.students || []).map((st) => [st.id, st.name])),
    [state.students]
  );

  const linkedException = useMemo(() => {
    if (!execObj) return null;
    return (
      state.exceptionRequests.find(
        (r) => r.id === execObj.exceptionRequestId || r.executionId === execObj.id
      ) || null
    );
  }, [execObj, state.exceptionRequests]);

  const relatedLogs = useMemo(() => {
    if (!baseObj) return [];
    const ids = new Set([baseObj.id, execObj?.id, occurrence?.id, linkedException?.id].filter(Boolean));
    return auditLogs.filter(
      (l) => ids.has(l.entityId) || (l.entityTitle && l.entityTitle === baseObj.programName)
    );
  }, [baseObj, execObj, occurrence, linkedException, auditLogs]);

  if (!isOpen || !baseObj) return null;

  const canManage = canEditProgram(currentUser, baseObj);
  const canCreateNew = hasPermission(currentUser, 'create_program');
  const mainEntityType = execObj ? 'program_execution' : 'planned_occurrence';
  const canDeleteMain = canDeleteEntity(currentUser, mainEntityType, baseObj.departmentId);
  const canDeleteSub = canDeleteEntity(currentUser, 'subprogram', baseObj.departmentId);
  const canSeeAudit = hasPermission(currentUser, 'view_audit_logs') || canManage;

  const effectiveStatus = execObj ? execObj.status : occurrence?.effectiveStatus || baseObj.status || 'مخطط';
  const conflicts = execObj?.conflictsSnapshot || [];
  const subPrograms = execObj?.subPrograms || [];

  const handleStatusChange = (newSt) => {
    if (!execObj || !canManage) return;
    updateProgramStatus(execObj.id, newSt, statusReason || `تحديث الحالة إلى ${newSt}`);
    setStatusReason('');
  };

  const handleConfirmDelete = async (reasonText) => {
    if (bulkDeleteSubs?.length > 0) {
      await bulkSoftDeleteEntities(bulkDeleteSubs, reasonText);
      setSelectedSubIds([]);
      setBulkDeleteSubs(null);
      return;
    }
    if (!deleteTarget) return;
    const res = await softDeleteEntity({
      entityType: deleteTarget.entityType,
      entityId: deleteTarget.entityId,
      parentId: deleteTarget.parentId || null,
      reason: reasonText,
    });
    const wasMain = deleteTarget.entityType !== 'subprogram';
    setDeleteTarget(null);
    if (res?.ok && wasMain) {
      onClose();
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          {/* Header Summary */}
          <div className="modal-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <DepartmentPill deptId={baseObj.departmentId} deptName={baseObj.departmentName} departments={state.departments} />
                <StatusBadge status={effectiveStatus} />
                <ReadinessBadge
                  item={occurrence || execObj || baseObj}
                  state={state}
                  compact
                  onClick={() => setShowReadinessModal(true)}
                />
                {effectiveStatus === 'منفذ' && (
                  hasEvaluations ? (
                    <span
                      className="status-badge"
                      style={{
                        background: 'rgba(22,163,74,0.12)',
                        color: '#16a34a',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        cursor: onOpenEvaluation ? 'pointer' : 'default',
                      }}
                      onClick={() => onOpenEvaluation && onOpenEvaluation({ target: execObj, initialLevel: 'program' })}
                      title="انقر لفتح التقييم"
                    >
                      ⭐ تم التقييم: {avgEvalScore}% ({programEvaluations.length} مقيّمين)
                    </span>
                  ) : (
                    <span
                      className="status-badge"
                      style={{
                        background: 'rgba(217,119,6,0.12)',
                        color: '#d97706',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        cursor: onOpenEvaluation ? 'pointer' : 'default',
                      }}
                      onClick={() => onOpenEvaluation && onOpenEvaluation({ target: execObj, initialLevel: 'program' })}
                      title="انقر لتقييم البرنامج"
                    >
                      ⚠️ لم يُقيّم بعد — قيّم الآن
                    </span>
                  )
                )}
                <PlannedGreenPill
                  monthName={baseObj.plannedMonthName}
                  weekLabel={baseObj.plannedWeekLabel}
                  globalWeek={baseObj.plannedGlobalWeek}
                  compact
                />
              </div>
              <h2 style={{ fontSize: '1.12rem', fontWeight: 800, color: 'var(--brand-ink)' }}>
                {baseObj.programName}
              </h2>
            </div>
            <button type="button" className="icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          {/* Concise Operational Summary Strip */}
          <div
            style={{
              padding: '0.75rem 1.35rem',
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.65rem',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={15} color="var(--brand-teal)" />
              <span>
                الموعد التنفيذي:{' '}
                <strong>
                  {execObj
                    ? formatDateRangeAr(execObj.executionDate, execObj.executionEndDate || execObj.executionDate, {
                        compact: true,
                      })
                    : 'لم يُجدول بعد'}
                </strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={15} color="var(--brand-teal)" />
              <span>
                القاعة / الموقع:{' '}
                <strong>{execObj?.venueId ? venueMap[execObj.venueId] : 'غير محدد'}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} color="var(--brand-teal)" />
              <span>
                المسؤول:{' '}
                <strong>{execObj?.leadEmployeeId ? empMap[execObj.leadEmployeeId]?.name : 'غير محدد'}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={15} color="var(--brand-teal)" />
              <span>
                الفترة والوقت:{' '}
                <strong>
                  {execObj
                    ? `${execObj.periodName} (${formatTime12Ar(execObj.startTime)} - ${formatTime12Ar(execObj.endTime)})`
                    : 'غير محدد'}
                </strong>
              </span>
            </div>
          </div>

          {/* Covered Periods Strip if Multiple Periods */}
          {execObj?.coveredPeriodNames?.length > 0 && (
            <div
              style={{
                padding: '0.45rem 1.35rem',
                background: 'rgba(0,165,155,0.06)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                fontSize: '0.76rem',
              }}
            >
              <strong style={{ color: 'var(--brand-ink)' }}>الفترات المشمولة:</strong>
              {execObj.coveredPeriodNames.map((pName) => (
                <span key={pName} className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>
                  ✓ {pName.replace('الفترة ', '')}
                </span>
              ))}
              {subPrograms.length > 0 && (
                <span style={{ marginRight: 'auto', fontWeight: 800, color: 'var(--brand-teal)' }}>
                  ↳ يشمل ({subPrograms.length}) فقرات فرعية
                </span>
              )}
            </div>
          )}

          {/* Body with Tabs */}
          <div className="modal-body">
            <div className="tabs-bar">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <FileText size={14} />
                <span>التفاصيل والفقرات ({subPrograms.length})</span>
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'plan_vs_actual' ? 'active' : ''}`}
                onClick={() => setActiveTab('plan_vs_actual')}
              >
                <ArrowLeftRight size={14} />
                <span>الخطة مقابل التنفيذ</span>
              </button>
              {hasPermission(currentUser, 'view_conflicts') && (
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'conflicts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('conflicts')}
                >
                  <ShieldAlert size={14} />
                  <span>التعارضات ({conflicts.length})</span>
                </button>
              )}
              {hasPermission(currentUser, 'view_exceptions') && (
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'exception' ? 'active' : ''}`}
                  onClick={() => setActiveTab('exception')}
                >
                  <Sparkles size={14} />
                  <span>الاستثناء والآراء {linkedException ? '(1)' : ''}</span>
                </button>
              )}
              {canSeeAudit && (
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  <History size={14} />
                  <span>سجل الإجراءات ({relatedLogs.length})</span>
                </button>
              )}
            </div>

            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div className="form-grid">
                  <div className="card" style={{ padding: '0.85rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>المبادرة</div>
                    <div style={{ fontWeight: 800, fontSize: '0.86rem', marginTop: 2 }}>{baseObj.initiative || '—'}</div>
                  </div>
                  <div className="card" style={{ padding: '0.85rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>المؤشر الاستراتيجي</div>
                    <div style={{ fontWeight: 800, fontSize: '0.84rem', marginTop: 2 }}>{baseObj.strategicIndicator || '—'}</div>
                  </div>
                  <div className="card" style={{ padding: '0.85rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>الهدف الاستراتيجي</div>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', marginTop: 2 }}>{baseObj.strategicGoal || '—'}</div>
                  </div>
                  <div className="card" style={{ padding: '0.85rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>نوع البرنامج ومصدر البيانات</div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', marginTop: 2 }}>
                      {baseObj.programType || 'برنامج اعتيادي'} — <span style={{ color: 'var(--text-muted)' }}>{baseObj.sourceFile}</span>
                    </div>
                  </div>
                </div>

                {/* Hierarchical Sub-Programs Display (↳ Req #17–#22) */}
                {subPrograms.length > 0 && (
                  <div className="card" style={{ padding: '0.95rem', borderRight: '4px solid var(--brand-teal)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.88rem', color: 'var(--brand-ink)' }}>
                        <GitBranch size={16} color="var(--brand-teal)" />
                        <span>الفقرات والبرامج الفرعية التابعة ({subPrograms.length}):</span>
                      </div>
                      {canDeleteSub && execObj && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 800 }}
                            onClick={() =>
                              setSelectedSubIds(
                                selectedSubIds.length === subPrograms.length
                                  ? []
                                  : subPrograms.map((sp) => sp.id)
                              )
                            }
                          >
                            <CheckSquare size={12} color="var(--brand-teal)" />
                            <span>
                              {selectedSubIds.length === subPrograms.length
                                ? 'إلغاء تحديد الفقرات'
                                : `تحديد الكل (${subPrograms.length})`}
                            </span>
                          </button>
                          {selectedSubIds.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                              onClick={() =>
                                setBulkDeleteSubs(
                                  subPrograms
                                    .filter((sp) => selectedSubIds.includes(sp.id))
                                    .map((sp) => ({
                                      entityType: 'subprogram',
                                      entityId: sp.id,
                                      parentId: execObj.id,
                                      entityTitle: `${sp.name} (ضمن: ${execObj.programName})`,
                                    }))
                                )
                              }
                            >
                              <Trash2 size={12} />
                              <span>حذف الفقرات المحددة ({selectedSubIds.length})</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {subPrograms.map((sp) => {
                        const isExp = expandedSubId === sp.id;
                        const isSpSelected = selectedSubIds.includes(sp.id);
                        return (
                          <div
                            key={sp.id}
                            style={{
                              background: isSpSelected ? 'rgba(239,68,68,0.06)' : 'var(--bg)',
                              border: isSpSelected ? '1.5px solid #dc2626' : '1px solid var(--border)',
                              borderRadius: 9,
                              padding: '0.55rem 0.75rem',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                gap: 8,
                              }}
                              onClick={() => setExpandedSubId(isExp ? null : sp.id)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                {canDeleteSub && execObj && (
                                  <input
                                    type="checkbox"
                                    checked={isSpSelected}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() =>
                                      setSelectedSubIds((prev) =>
                                        prev.includes(sp.id)
                                          ? prev.filter((id) => id !== sp.id)
                                          : [...prev, sp.id]
                                      )
                                    }
                                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                                  />
                                )}
                                <strong style={{ color: 'var(--brand-teal)', fontSize: '0.84rem' }}>↳ {sp.name}</strong>
                                <span className="status-badge badge-muted" style={{ fontSize: '0.68rem' }}>
                                  {formatDateRangeAr(
                                    sp.executionDate || execObj?.executionDate,
                                    sp.executionEndDate || sp.executionDate || execObj?.executionEndDate || execObj?.executionDate,
                                    { compact: true }
                                  )}
                                </span>
                                <span className="status-badge badge-muted" style={{ fontSize: '0.68rem' }}>
                                  {sp.periodName} ({formatTime12Ar(sp.startTime)} - {formatTime12Ar(sp.endTime)})
                                </span>
                                {sp.venueId && (
                                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                    • {venueMap[sp.venueId] || sp.venueId}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {effectiveStatus === 'منفذ' && onOpenEvaluation && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClose();
                                      onOpenEvaluation({
                                        target: {
                                          kind: 'sub_program',
                                          execution: execObj,
                                          subProgram: sp,
                                        },
                                        initialLevel: 'program',
                                      });
                                    }}
                                    title="تقييم هذه الفقرة الفرعية بشكل مستقل"
                                  >
                                    <Sparkles size={12} color="var(--brand-teal)" />
                                    <span>تقييم الفقرة ↳</span>
                                  </button>
                                )}
                                {canDeleteSub && execObj && (
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    style={{ color: '#dc2626', width: 28, height: 28 }}
                                    title="حذف الفقرة الفرعية"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTarget({
                                        entityType: 'subprogram',
                                        entityId: sp.id,
                                        parentId: execObj.id,
                                        entityTitle: sp.name,
                                      });
                                    }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                                {isExp ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </div>
                            </div>

                            {isExp && (
                              <div
                                style={{
                                  marginTop: 6,
                                  paddingTop: 6,
                                  borderTop: '1px dashed var(--border)',
                                  fontSize: '0.76rem',
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                                  gap: 6,
                                }}
                              >
                                <div>المسؤول: <strong>{empMap[sp.leadEmployeeId]?.name || '—'}</strong></div>
                                <div>
                                  التاريخ:{' '}
                                  <strong>
                                    {formatDateRangeAr(
                                      sp.executionDate || execObj?.executionDate,
                                      sp.executionEndDate || sp.executionDate || execObj?.executionEndDate || execObj?.executionDate,
                                      { compact: true }
                                    )}
                                  </strong>
                                </div>
                                <div>القاعة: <strong>{venueMap[sp.venueId] || 'نفس قاعة البرنامج'}</strong></div>
                                {sp.notes && <div>ملاحظات: {sp.notes}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="card" style={{ padding: '0.9rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: 6 }}>الفئات المستهدفة، الطلاب، والموظفون المشاركون:</div>
                  <div style={{ fontSize: '0.8rem', marginBottom: 6 }}>
                    • الفئات / النطاقات:{' '}
                    <strong>
                      {execObj?.scopeIds?.length
                        ? execObj.scopeIds.map((id) => scopeMap[id]).join('، ')
                        : execObj?.studentIds?.length
                        ? 'مخصص لطلاب محددين'
                        : 'تُحدد عند جدولة التنفيذ'}
                    </strong>
                  </div>
                  {execObj?.studentIds?.length > 0 && (
                    <div style={{ fontSize: '0.8rem', marginBottom: 6 }}>
                      • الطلاب المحددون ({execObj.studentIds.length}):{' '}
                      <strong style={{ color: 'var(--brand-teal)' }}>
                        {execObj.studentIds.map((sid) => studentMap[sid] || sid).join('، ')}
                      </strong>
                    </div>
                  )}
                  <div style={{ fontSize: '0.8rem', marginBottom: 6 }}>
                    • الموظف المسؤول:{' '}
                    <strong>
                      {execObj?.leadEmployeeId ? empMap[execObj.leadEmployeeId]?.name : (baseObj.jobRoles || []).join('، ') || 'لم يُحدد'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    • الموظفون المشاركون:{' '}
                    <strong>
                      {execObj?.participatingEmployeeIds?.length
                        ? execObj.participatingEmployeeIds.map((id) => empMap[id]?.name).join('، ')
                        : 'لا يوجد مشاركون إضافيون'}
                    </strong>
                  </div>
                  {(execObj?.objective || execObj?.requirements || execObj?.notes) && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: '0.79rem' }}>
                      {execObj.objective && <div>• الهدف / الوصف: {execObj.objective}</div>}
                      {execObj.requirements && <div>• المتطلبات: {execObj.requirements}</div>}
                      {execObj.notes && <div>• ملاحظات: {execObj.notes}</div>}
                    </div>
                  )}
                </div>

                {/* Lifecycle Quick Update Controls — Strictly Authorized Users Only! */}
                {execObj && canManage && (
                  <div className="card" style={{ padding: '0.9rem', background: 'var(--bg)' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.84rem', marginBottom: 6 }}>
                      تحديث الحالة التشغيلية للبرنامج:
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        style={{ maxWidth: 280 }}
                        placeholder="سبب التحديث أو ملاحظة الإنجاز (اختياري)"
                        value={statusReason}
                        onChange={(e) => setStatusReason(e.target.value)}
                      />
                      <button type="button" className="btn btn-sm btn-teal" onClick={() => handleStatusChange('منفذ')}>
                        <CheckCheck size={14} />
                        <span>تم التنفيذ (منفذ)</span>
                      </button>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => handleStatusChange('مكتمل')}>
                        <CheckCheck size={14} />
                        <span>إغلاق كمكتمل</span>
                      </button>
                      <button type="button" className="btn btn-sm btn-warning" onClick={() => handleStatusChange('مؤجل')}>
                        <PauseCircle size={14} />
                        <span>تأجيل البرنامج</span>
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => handleStatusChange('ملغي')}>
                        <XCircle size={14} />
                        <span>إلغاء البرنامج</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'plan_vs_actual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div className="comparison-grid">
                  <div className="card" style={{ borderColor: '#8CC240', background: 'var(--planned-green-bg)' }}>
                    <div style={{ fontWeight: 800, color: 'var(--planned-green-text)', marginBottom: 6 }}>
                      1. الموعد الأصلي في الخطة المعتمدة
                    </div>
                    <div style={{ fontSize: '0.84rem' }}>• الشهر المخطط: <strong>{baseObj.plannedMonthName || '—'}</strong></div>
                    <div style={{ fontSize: '0.84rem' }}>• الأسبوع داخل الشهر: <strong>{baseObj.plannedWeekLabel || '—'}</strong></div>
                    <div style={{ fontSize: '0.84rem' }}>• رقم الأسبوع السنوي: <strong>الأسبوع {baseObj.plannedGlobalWeek || '—'}</strong></div>
                  </div>

                  <div className="card">
                    <div style={{ fontWeight: 800, color: 'var(--brand-teal)', marginBottom: 6 }}>
                      2. موعد التنفيذ الفعلي المجدول
                    </div>
                    {execObj ? (
                      <>
                        <div style={{ fontSize: '0.84rem' }}>• التاريخ واليوم: <strong>{execObj.day} ({execObj.executionDate})</strong></div>
                        <div style={{ fontSize: '0.84rem' }}>• الفترات: <strong>{execObj.periodName}</strong></div>
                        <div style={{ fontSize: '0.84rem' }}>• الأسبوع التنفيذي: <strong>الأسبوع {execObj.executionGlobalWeek}</strong></div>
                        {execObj.shiftReason && (
                          <div style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--text-muted)' }}>
                            • سبب نقل الموعد المسجل: {execObj.shiftReason}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        لم تتم جدولة موعد تنفيذي بعد — البرنامج لا يزال في مرحلة التخطيط.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'conflicts' && (
              <div>
                {conflicts.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    لا توجد تعارضات مسجلة على هذا البرنامج.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conflicts.map((c) => (
                      <div key={c.id} className="card" style={{ borderColor: '#fca5a5' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <strong style={{ color: '#b91c1c' }}>{c.typeLabel}</strong>
                            {c.isSubProgramConflict && (
                              <span className="status-badge badge-exception" style={{ marginRight: 8, fontSize: '0.68rem' }}>
                                ↳ الفقرة: {c.subProgramName}
                              </span>
                            )}
                          </div>
                          <StatusBadge status={c.severity} size="sm" />
                        </div>
                        <p style={{ fontSize: '0.82rem' }}>{c.reason}</p>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          الالتزام القائم: {c.existingProgram} ({c.existingDepartment}) | المصدر: {c.source}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'exception' && (
              <div>
                {!linkedException ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    لا يوجد طلب استثناء مرتبط بهذا البرنامج.
                  </div>
                ) : (
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>طلب الاستثناء رقم: {linkedException.id}</strong>
                      <StatusBadge status={linkedException.status} />
                    </div>
                    <div style={{ fontSize: '0.82rem' }}>• سبب الطلب: {linkedException.reasonForException}</div>
                    <div style={{ fontSize: '0.82rem' }}>• مبرر الأهمية: {linkedException.importanceJustification}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.83rem', marginTop: 6 }}>آراء المختصين ({linkedException.opinions.length}):</div>
                    {linkedException.opinions.map((op) => (
                      <div key={op.employeeId} style={{ fontSize: '0.79rem', padding: '5px 8px', background: 'var(--bg)', borderRadius: 8 }}>
                        <strong>{op.employeeName}</strong>: {op.decision || 'بانتظار الرأي'} {op.notes ? `— "${op.notes}"` : ''}
                      </div>
                    ))}
                    {linkedException.approverDecision && (
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#6d28d9', marginTop: 4 }}>
                        قرار الاعتماد النهائي ({linkedException.approverName}): {linkedException.approverDecision} — {linkedException.approverNotes}
                      </div>
                    )}
                    {onNavigateExceptions && (
                      <div>
                        <button
                          type="button"
                          className="btn btn-sm btn-violet"
                          onClick={() => {
                            onClose();
                            onNavigateExceptions(linkedException.id);
                          }}
                        >
                          فتح شاشة دراسة الاستثناء والبرامج المتأثرة
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'audit' && canSeeAudit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {relatedLogs.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    لم يتم تسجيل تعديلات تشغيلية على هذا السجل بعد.
                  </div>
                ) : (
                  relatedLogs.map((log) => (
                    <div key={log.id} className="card" style={{ padding: '0.7rem 0.9rem', fontSize: '0.79rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        <span>{log.actorName} ({log.actorRole})</span>
                        <span>{formatDateTimeAr(log.timestamp)}</span>
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--brand-ink)', marginTop: 2 }}>{log.actionType}</div>
                      <div>{log.summary}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer — Strictly Permission-Gated */}
          <div className="modal-footer">
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                إغلاق
              </button>
              {canDeleteMain && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    setDeleteTarget({
                      entityType: mainEntityType,
                      entityId: execObj ? execObj.id : occurrence.id,
                      entityTitle: baseObj.programName,
                    })
                  }
                >
                  <Trash2 size={15} />
                  <span>حذف البرنامج</span>
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {effectiveStatus === 'منفذ' && onOpenEvaluation && (
                <button
                  type="button"
                  className="btn btn-teal"
                  onClick={() => {
                    onClose();
                    onOpenEvaluation({
                      target: execObj || occurrence,
                      initialLevel: 'program',
                    });
                  }}
                >
                  <Sparkles size={15} />
                  <span>{hasEvaluations ? 'عرض / تعديل التقييم' : 'تقييم البرنامج الآن'}</span>
                </button>
              )}
              {canManage && canCreateNew && onClone && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onClose();
                    onClone(execObj || occurrence);
                  }}
                >
                  <Copy size={15} />
                  <span>نسخ البرنامج لموعد/فئة أخرى</span>
                </button>
              )}
              {canManage && onScheduleOrEdit && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onScheduleOrEdit(occurrence, execObj);
                  }}
                >
                  <Edit3 size={15} />
                  <span>{execObj ? 'تعديل الجدولة التنفيذية' : 'جدولة التنفيذ الآن'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget || bulkDeleteSubs)}
        onClose={() => {
          setDeleteTarget(null);
          setBulkDeleteSubs(null);
        }}
        onConfirm={handleConfirmDelete}
        entityType={deleteTarget?.entityType}
        entityTitle={deleteTarget?.entityTitle}
        items={bulkDeleteSubs}
      />

      <ReadinessInspectorModal
        isOpen={showReadinessModal}
        onClose={() => setShowReadinessModal(false)}
        targetItem={{ occurrence, execution: execObj }}
        state={state}
        onOpenScheduleModal={
          onScheduleOrEdit
            ? () => {
                setShowReadinessModal(false);
                onClose();
                onScheduleOrEdit(occurrence, execObj);
              }
            : null
        }
      />
    </>
  );
}
