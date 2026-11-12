import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  UserCheck,
  CheckSquare,
  ShieldAlert,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Plus,
  Wrench,
  Clock,
  Trash2,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { hasPermission, canDeleteEntity, canBulkDelete } from '../engine/permissions';
import { formatDateTimeAr, formatTime12Ar } from '../engine/dateUtils';
import { StatusBadge, DepartmentPill } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

// Exact 12 Resolution Actions from Req #43
const AFFECTED_RESOLUTION_ACTIONS = [
  'تعديل وقت البرنامج المتأثر',
  'تغيير القاعة',
  'تغيير الموظف',
  'تأجيل البرنامج',
  'تعليق التنفيذ لذلك اليوم',
  'إلغاء البرنامج لذلك اليوم',
  'دمج النشاط',
  'نقل النشاط إلى يوم آخر',
  'نقل النشاط إلى فترة أخرى',
  'إعادة جدولة البرنامج المتأثر',
  'إشعار القسم المعني',
  'تحديث الجدول العام',
];

export default function ExceptionsCenterView({
  initialSelectedExceptionId = null,
  onOpenScheduleModal,
}) {
  const {
    state,
    currentUser,
    submitExceptionOpinion,
    decideExceptionFinal,
    resolveAffectedProgramItem,
    softDeleteEntity,
    bulkSoftDeleteEntities,
  } = useOps();

  const [queueTab, setQueueTab] = useState('all'); // 'needs_my_opinion' | 'needs_approval' | 'affected_pending' | 'all'
  const [selectedExId, setSelectedExId] = useState(initialSelectedExceptionId);

  // Bulk and single delete state
  const [selectedExIds, setSelectedExIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteItems, setBulkDeleteItems] = useState(null);
  const [bannerMsg, setBannerMsg] = useState(null);

  // Opinion form state
  const [opinionEmpId, setOpinionEmpId] = useState(currentUser?.employeeId || '');
  const [opinionDecision, setOpinionDecision] = useState('موافق');
  const [opinionNotes, setOpinionNotes] = useState('');

  // Final approval form state
  const [finalDecision, setFinalDecision] = useState('اعتماد');
  const [finalNotes, setFinalNotes] = useState('');

  // Affected program resolution state per affectedItemId
  const [affDrafts, setAffDrafts] = useState({});

  useEffect(() => {
    if (initialSelectedExceptionId) {
      setSelectedExId(initialSelectedExceptionId);
    }
  }, [initialSelectedExceptionId]);

  useEffect(() => {
    if (currentUser?.employeeId) {
      setOpinionEmpId(currentUser.employeeId);
    }
  }, [currentUser?.employeeId]);

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);
  const studentMap = useMemo(() => Object.fromEntries((state.students || []).map((s) => [s.id, s.name])), [state.students]);

  const canSubmitOrCreate =
    hasPermission(currentUser, 'submit_exception') ||
    hasPermission(currentUser, 'create_program') ||
    hasPermission(currentUser, 'schedule_planned_program');
  const canGiveOpinionPerm = hasPermission(currentUser, 'give_opinion') || Boolean(currentUser?.isOpinionGiver);
  const canApproveExceptionPerm =
    hasPermission(currentUser, 'approve_exception') || Boolean(currentUser?.isApprover) || Boolean(currentUser?.isAdmin);

  const needsMyOpinionList = useMemo(() => {
    return state.exceptionRequests.filter((r) => {
      if (r.status !== 'بانتظار إبداء الرأي') return false;
      if (currentUser?.isAdmin || canGiveOpinionPerm) return true;
      return r.opinions.some((o) => o.employeeId === currentUser?.employeeId);
    });
  }, [state.exceptionRequests, currentUser, canGiveOpinionPerm]);

  const needsApprovalList = useMemo(
    () => state.exceptionRequests.filter((r) => r.status === 'بانتظار الاعتماد'),
    [state.exceptionRequests]
  );

  const affectedPendingList = useMemo(
    () => state.exceptionRequests.filter((r) => r.status === 'معتمد باستثناء' && !r.allAffectedResolved),
    [state.exceptionRequests]
  );

  const filteredRequests = useMemo(() => {
    if (queueTab === 'needs_my_opinion') return needsMyOpinionList;
    if (queueTab === 'needs_approval') return needsApprovalList;
    if (queueTab === 'affected_pending') return affectedPendingList;
    return state.exceptionRequests;
  }, [queueTab, needsMyOpinionList, needsApprovalList, affectedPendingList, state.exceptionRequests]);

  const activeEx = useMemo(() => {
    return (
      state.exceptionRequests.find((r) => r.id === selectedExId) ||
      filteredRequests[0] ||
      null
    );
  }, [state.exceptionRequests, selectedExId, filteredRequests]);

  const handleOpinionSave = (e) => {
    e.preventDefault();
    if (!activeEx) return;
    const targetReviewer =
      opinionEmpId ||
      activeEx.opinions.find((o) => !o.decision)?.employeeId ||
      currentUser?.employeeId;
    submitExceptionOpinion(activeEx.id, {
      employeeId: targetReviewer,
      decision: opinionDecision,
      notes: opinionNotes,
    });
    setOpinionNotes('');
  };

  const handleFinalApprovalSave = (e) => {
    e.preventDefault();
    if (!activeEx) return;
    decideExceptionFinal(activeEx.id, {
      decision: finalDecision,
      notes: finalNotes,
    });
    setFinalNotes('');
  };

  const getAffDraft = (affId) =>
    affDrafts[affId] || {
      action: 'تغيير القاعة',
      details: '',
      newDate: '',
      newPeriodId: '',
      newVenueId: '',
      newEmployeeId: '',
    };

  const setAffField = (affId, key, val) => {
    setAffDrafts((prev) => ({
      ...prev,
      [affId]: {
        ...getAffDraft(affId),
        [key]: val,
      },
    }));
  };

  const canDeleteExceptions = canDeleteEntity(currentUser, 'exception');
  const canBulkDeleteExceptions = canBulkDelete(currentUser, 'exception');

  const allFilteredSelected =
    filteredRequests.length > 0 &&
    filteredRequests.every((req) => selectedExIds.includes(req.id));

  const handleConfirmDelete = async (reason) => {
    if (bulkDeleteItems?.length > 0) {
      const res = await bulkSoftDeleteEntities(bulkDeleteItems, reason);
      if (res?.ok) {
        setBannerMsg({
          type: 'teal',
          text: `تم حذف (${res.count}) طلبات استثناء محددة بنجاح وحفظ نسخ كاملة في سلة المحذوفات.`,
        });
        setSelectedExIds([]);
        if (bulkDeleteItems.some((i) => i.entityId === selectedExId)) {
          setSelectedExId(null);
        }
      } else if (res?.error) {
        setBannerMsg({ type: 'warn', text: res.error });
      }
      setBulkDeleteItems(null);
      return;
    }
    if (!deleteTarget) return;
    const res = await softDeleteEntity({
      entityType: deleteTarget.entityType,
      entityId: deleteTarget.entityId,
      reason,
    });
    if (res?.ok) {
      setBannerMsg({
        type: 'teal',
        text: `تم حذف طلب الاستثناء «${deleteTarget.entityTitle}» بنجاح وحفظه بسلة المحذوفات.`,
      });
      if (selectedExId === deleteTarget.entityId) {
        setSelectedExId(null);
      }
      setSelectedExIds((prev) => prev.filter((id) => id !== deleteTarget.entityId));
    } else if (res?.error) {
      setBannerMsg({ type: 'warn', text: res.error });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {bannerMsg && (
        <div
          className={`alert-banner ${bannerMsg.type === 'warn' ? 'warn' : 'teal'}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}
        >
          <span>{bannerMsg.text}</span>
          <button type="button" className="icon-btn" onClick={() => setBannerMsg(null)}>
            ×
          </button>
        </div>
      )}
      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              مركز طلبات الاستثناء، إبداء الرأي، الاعتماد النهائي، ومعالجة البرامج المتأثرة
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              دورة إلكترونية موثقة بالكامل: مقارنة جنباً إلى جنب بين النشاط المطلوب والالتزامات القائمة، جمع آراء المختصين، الاعتماد النهائي، ومعالجة البرامج المتأثرة دون أي إلغاء تلقائي صامت.
            </p>
          </div>
          {canSubmitOrCreate && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenScheduleModal({ mode: 'new_program' })}
            >
              <Plus size={15} />
              <span>جدولة برنامج / رفع طلب استثناء جديد</span>
            </button>
          )}
        </div>

        {/* Queue Tabs (Req #37, #40, #42) */}
        <div className="tabs-bar" style={{ marginTop: '0.9rem', marginBottom: 0 }}>
          <button
            type="button"
            className={`tab-btn ${queueTab === 'all' ? 'active' : ''}`}
            onClick={() => setQueueTab('all')}
          >
            <span>جميع الطلبات ({state.exceptionRequests.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${queueTab === 'needs_my_opinion' ? 'active' : ''}`}
            onClick={() => setQueueTab('needs_my_opinion')}
          >
            <UserCheck size={14} />
            <span>طلبات تحتاج رأيي ({needsMyOpinionList.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${queueTab === 'needs_approval' ? 'active' : ''}`}
            onClick={() => setQueueTab('needs_approval')}
          >
            <CheckSquare size={14} />
            <span>بانتظار الاعتماد النهائي ({needsApprovalList.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${queueTab === 'affected_pending' ? 'active' : ''}`}
            onClick={() => setQueueTab('affected_pending')}
          >
            <Wrench size={14} />
            <span>برامج متأثرة تنتظر المعالجة ({affectedPendingList.length})</span>
          </button>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.8rem' }}>
          <Sparkles size={34} color="var(--brand-teal)" style={{ marginBottom: 8 }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>لا توجد طلبات استثناء في هذا المسار حاليًا</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            عند وجود تعارض أثناء جدولة أي برنامج، يمكنك الضغط على زر «رفع طلب استثناء» ليظهر الطلب هنا فورًا محمّلاً بجميع بيانات البرنامج والتعارضات دون إعادة كتابة.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Right List of Requests */}
          <div className="card" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 6px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>
                قائمة الطلبات ({filteredRequests.length})
              </div>
              {canBulkDeleteExceptions && filteredRequests.length > 0 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.68rem', padding: '2px 6px', fontWeight: 700 }}
                    onClick={() =>
                      setSelectedExIds(allFilteredSelected ? [] : filteredRequests.map((r) => r.id))
                    }
                  >
                    <CheckSquare size={12} color="var(--brand-teal)" />
                    <span>{allFilteredSelected ? 'إلغاء الكل' : 'تحديد الكل'}</span>
                  </button>
                  {selectedExIds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      style={{ fontSize: '0.68rem', padding: '2px 6px', fontWeight: 800 }}
                      onClick={() =>
                        setBulkDeleteItems(
                          filteredRequests
                            .filter((r) => selectedExIds.includes(r.id))
                            .map((r) => ({
                              entityType: 'exception',
                              entityId: r.id,
                              entityTitle: `طلب استثناء: ${r.programSnapshot?.programName || r.id} (${r.departmentName})`,
                            }))
                        )
                      }
                    >
                      <Trash2 size={12} />
                      <span>حذف ({selectedExIds.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {filteredRequests.map((req) => {
              const isSelected = activeEx?.id === req.id;
              const isChecked = selectedExIds.includes(req.id);
              const pendingAff = (req.affectedItems || []).filter((a) => !a.resolutionAction).length;
              const canDelThis = canDeleteEntity(currentUser, 'exception', req.departmentId);

              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedExId(req.id)}
                  style={{
                    padding: '0.7rem 0.8rem',
                    borderRadius: 11,
                    border: isSelected ? '2px solid var(--brand-teal)' : '1px solid var(--border)',
                    background: isChecked ? 'rgba(239, 68, 68, 0.05)' : isSelected ? 'rgba(0,165,155,0.08)' : 'var(--bg)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {canBulkDeleteExceptions && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedExIds((prev) =>
                              prev.includes(req.id) ? prev.filter((id) => id !== req.id) : [...prev, req.id]
                            );
                          }}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#dc2626' }}
                        />
                      )}
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>{req.id}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <StatusBadge status={req.status} size="sm" />
                      {canDelThis && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ color: '#dc2626', padding: 2 }}
                          title="حذف طلب الاستثناء"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              entityType: 'exception',
                              entityId: req.id,
                              entityTypeLabel: 'طلب استثناء واعتماد',
                              entityTitle: `طلب استثناء: ${req.programSnapshot?.programName || req.id} (${req.departmentName})`,
                            });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', marginTop: 4 }}>
                    {req.programSnapshot?.programName}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {req.departmentName} • {req.programSnapshot?.day} ({req.programSnapshot?.executionDate})
                  </div>
                  {req.status === 'معتمد باستثناء' && !req.allAffectedResolved && (
                    <div style={{ marginTop: 5 }}>
                      <span className="status-badge badge-conflict" style={{ fontSize: '0.67rem' }}>
                        باقي {pendingAff} برامج متأثرة غير معالجة (الطلب مفتوح)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Left: Side-by-Side Exception Study & Resolution Screen (Req #38 - #43) */}
          {activeEx && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Top Status Bar */}
              <div className="card" style={{ padding: '0.95rem 1.15rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                        شاشة دراسة الاستثناء: {activeEx.programSnapshot?.programName}
                      </h3>
                      <StatusBadge status={activeEx.status} />
                      {activeEx.status === 'معتمد باستثناء' && (
                        <span className={`status-badge ${activeEx.allAffectedResolved ? 'badge-approved' : 'badge-conflict'}`}>
                          {activeEx.allAffectedResolved
                            ? 'مكتمل الإغلاق (تمت معالجة كافة البرامج المتأثرة)'
                            : 'قيد استكمال معالجة البرامج المتأثرة (لا يُغلق الطلب حتى حسمها)'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
                      مقدم الطلب: <strong>{activeEx.requestedBy}</strong> ({activeEx.departmentName}) • تاريخ الرفع: {formatDateTimeAr(activeEx.createdAt)}
                    </div>
                  </div>

                  {canDeleteEntity(currentUser, 'exception', activeEx.departmentId) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        setDeleteTarget({
                          entityType: 'exception',
                          entityId: activeEx.id,
                          entityTypeLabel: 'طلب استثناء واعتماد',
                          entityTitle: `طلب استثناء: ${activeEx.programSnapshot?.programName || activeEx.id} (${activeEx.departmentName})`,
                        })
                      }
                    >
                      <Trash2 size={14} />
                      <span>حذف طلب الاستثناء</span>
                    </button>
                  )}
                </div>
              </div>

              {/* SIDE-BY-SIDE COMPARISON SCREEN (Req #38) */}
              <div className="comparison-grid">
                {/* Side A: Proposed New Exception Activity */}
                <div className="card" style={{ borderTop: '4px solid #7c3aed' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#6d28d9', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={16} />
                    <span>الطرف الأول: البرنامج الجديد المطلوب استثناؤه</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                    <div>• اسم البرنامج: <strong>{activeEx.programSnapshot?.programName}</strong></div>
                    <div>• القسم المقدم: <DepartmentPill deptId={activeEx.departmentId} deptName={activeEx.departmentName} departments={state.departments} /></div>
                    <div>• نوع البرنامج والمبادرة: <strong>{activeEx.programSnapshot?.programType} — {activeEx.programSnapshot?.initiative || 'عام'}</strong></div>
                    <div>• الموعد المطلوب: <strong>{activeEx.programSnapshot?.day} ({activeEx.programSnapshot?.executionDate}) — {activeEx.programSnapshot?.periodName} ({formatTime12Ar(activeEx.programSnapshot?.startTime)} - {formatTime12Ar(activeEx.programSnapshot?.endTime)})</strong></div>
                    <div>• الموقع / القاعة: <strong>{venueMap[activeEx.programSnapshot?.venueId] || '—'}</strong></div>
                    <div>• الفئات المستهدفة: <strong>{(activeEx.programSnapshot?.scopeIds || []).map((id) => scopeMap[id]).join('، ') || 'عام'}</strong></div>
                    {(activeEx.programSnapshot?.studentIds || []).length > 0 && (
                      <div>
                        • الطلاب المحددون ({activeEx.programSnapshot.studentIds.length}):{' '}
                        <strong>
                          {activeEx.programSnapshot.studentIds.map((sid) => studentMap[sid] || sid).join('، ')}
                        </strong>
                      </div>
                    )}
                    <div>• الموظف المسؤول: <strong>{empMap[activeEx.programSnapshot?.leadEmployeeId] || '—'}</strong></div>

                    {(activeEx.programSnapshot?.subPrograms || []).length > 0 && (
                      <div style={{ marginTop: 4, padding: '6px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.76rem', marginBottom: 4 }}>
                          الفقرات / البرامج الفرعية ({activeEx.programSnapshot.subPrograms.length}):
                        </div>
                        {activeEx.programSnapshot.subPrograms.map((sp) => (
                          <div key={sp.id || sp.name} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            ↳ <strong>{sp.name}</strong> ({sp.periodName || sp.periodId}) — {venueMap[sp.venueId] || 'نفس القاعة'}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <div><strong>سبب طلب الاستثناء:</strong> {activeEx.reasonForException}</div>
                      <div style={{ marginTop: 4 }}><strong>مبرر أهمية النشاط:</strong> {activeEx.importanceJustification}</div>
                      {activeEx.whyCannotChangeTime && (
                        <div style={{ marginTop: 4 }}><strong>سبب تعذر تغيير الوقت:</strong> {activeEx.whyCannotChangeTime}</div>
                      )}
                      {activeEx.proposedConflictSolution && (
                        <div style={{ marginTop: 4 }}><strong>الحل المقترح من القسم:</strong> {activeEx.proposedConflictSolution}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Side B: Existing Conflicting Programs & Operational Impact */}
                <div className="card" style={{ borderTop: '4px solid #ef4444' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#b91c1c', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowLeftRight size={16} />
                    <span>الطرف الثاني: البرامج والالتزامات القائمة المتعارضة ({activeEx.conflicts.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                    {activeEx.conflicts.map((cnf) => (
                      <div
                        key={cnf.id}
                        style={{
                          padding: '0.65rem 0.8rem',
                          borderRadius: 10,
                          background: 'var(--conflict-bg)',
                          border: '1px solid #fca5a5',
                          fontSize: '0.79rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <strong style={{ color: '#b91c1c' }}>{cnf.typeLabel}</strong>
                          <StatusBadge status={cnf.severity} size="sm" />
                        </div>
                        {cnf.subProgramName && (
                          <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#7c3aed', marginBottom: 2 }}>
                            ↳ التعارض داخل الفقرة الفرعية: {cnf.subProgramName} ({cnf.periodName || cnf.periodId})
                          </div>
                        )}
                        <div>• الالتزام القائم: <strong>{cnf.existingProgram}</strong> ({cnf.existingDepartment})</div>
                        <div>
                          • المتأثرون: الموظف ({cnf.employeeName || '—'}) | الفئة ({cnf.scopeName || '—'}) | القاعة ({cnf.venueName || '—'})
                          {cnf.studentName ? ` | الطالب (${cnf.studentName})` : ''}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: 3 }}>
                          الأثر عند الموافقة: يستلزم معالجة «{cnf.existingProgram}» (نقل قاعة/وقت أو دمج أو تأجيل ليوم واحد).
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* OPINIONS COLLECTION & SUBMISSION PANEL (Req #39) */}
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={17} color="#ea580c" />
                  <span>آراء المختصين وأصحاب العلاقة ({activeEx.opinions.filter((o) => o.decision).length} من {activeEx.opinions.length} مكتمل)</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, marginBottom: '0.9rem' }}>
                  {activeEx.opinions.map((op) => (
                    <div
                      key={op.employeeId}
                      style={{
                        padding: '0.65rem 0.8rem',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: op.decision ? 'var(--bg)' : 'var(--pending-bg)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{op.employeeName}</div>
                      <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>{op.employeeJobTitle}</div>
                      <div style={{ marginTop: 5 }}>
                        {op.decision ? (
                          <>
                            <StatusBadge
                              status={
                                op.decision === 'موافق'
                                  ? 'معتمد'
                                  : op.decision === 'غير موافق'
                                  ? 'مرفوض'
                                  : 'بانتظار الاعتماد'
                              }
                              size="sm"
                            />{' '}
                            <strong style={{ fontSize: '0.76rem' }}>({op.decision})</strong>
                            {op.notes && <div style={{ marginTop: 4, fontSize: '0.75rem' }}>«{op.notes}»</div>}
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {formatDateTimeAr(op.decidedAt)}
                            </div>
                          </>
                        ) : (
                          <span className="status-badge badge-pending" style={{ fontSize: '0.7rem' }}>
                            بانتظار إبداء الرأي
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form to record Opinion */}
                {(activeEx.status === 'بانتظار إبداء الرأي' || activeEx.status === 'بانتظار الاعتماد') &&
                  (canGiveOpinionPerm ||
                    currentUser?.isAdmin ||
                    activeEx.opinions.some((o) => o.employeeId === currentUser?.employeeId)) && (
                  <form
                    onSubmit={handleOpinionSave}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 11,
                      padding: '0.85rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr 160px 1.5fr auto',
                      gap: '0.6rem',
                      alignItems: 'end',
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">إبداء الرأي باسم المختص:</label>
                      <select
                        className="form-select"
                        value={opinionEmpId}
                        onChange={(e) => setOpinionEmpId(e.target.value)}
                      >
                        {activeEx.opinions.map((op) => (
                          <option key={op.employeeId} value={op.employeeId}>
                            {op.employeeName} {op.decision ? `(تم: ${op.decision})` : '(بانتظار الرأي)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">الرأي *</label>
                      <select
                        className="form-select"
                        value={opinionDecision}
                        onChange={(e) => setOpinionDecision(e.target.value)}
                      >
                        <option value="موافق">موافق</option>
                        <option value="موافق بشروط">موافق بشروط</option>
                        <option value="غير موافق">غير موافق</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">الملاحظات أو الشروط</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="أدخل شروط الموافقة أو مرئيات القسم المتأثر..."
                        value={opinionNotes}
                        onChange={(e) => setOpinionNotes(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-teal">
                      حفظ الرأي وتوثيقه
                    </button>
                  </form>
                )}
              </div>

              {/* FINAL APPROVAL DECISION PANEL (Req #40 - #42) */}
              {(canApproveExceptionPerm || activeEx.approverDecision) && (
                <div className="card" style={{ borderTop: '4px solid var(--brand-teal)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.7rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckSquare size={17} color="var(--brand-teal)" />
                    <span>قرار صاحب صلاحية الاعتماد النهائي</span>
                  </div>

                  {activeEx.approverDecision ? (
                    <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 10, fontSize: '0.84rem' }}>
                      <div>
                        القرار المتخذ: <strong>{activeEx.approverDecision}</strong> بواسطة <strong>{activeEx.approverName}</strong> بتاريخ {formatDateTimeAr(activeEx.approverDecidedAt)}
                      </div>
                      {activeEx.approverNotes && <div style={{ marginTop: 4 }}>ملاحظات الاعتماد: {activeEx.approverNotes}</div>}
                    </div>
                  ) : (
                    <form
                      onSubmit={handleFinalApprovalSave}
                      style={{ display: 'grid', gridTemplateColumns: '190px 1fr auto', gap: '0.65rem', alignItems: 'end' }}
                    >
                      <div className="form-group">
                        <label className="form-label">القرار النهائي *</label>
                        <select
                          className="form-select"
                          value={finalDecision}
                          onChange={(e) => setFinalDecision(e.target.value)}
                        >
                          <option value="اعتماد">اعتماد (معتمد باستثناء)</option>
                          <option value="اعتماد بشروط">اعتماد بشروط</option>
                          <option value="إعادة للتعديل">إعادة للتعديل</option>
                          <option value="رفض">رفض الاستثناء</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">شروط أو توجيهات صاحب الصلاحية</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="تُحفظ في سجل القرارات وتُبلّغ للأقسام المعنية..."
                          value={finalNotes}
                          onChange={(e) => setFinalNotes(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary">
                        إصدار قرار الاعتماد
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* POST-APPROVAL AFFECTED PROGRAMS RESOLUTION QUEUE (Req #42 & #43) */}
              {activeEx.status === 'معتمد باستثناء' && (activeEx.affectedItems || []).length > 0 && (
                <div className="card" style={{ borderTop: '4px solid #f59e0b' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.94rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wrench size={17} color="#d97706" />
                    <span>معالجة البرامج والالتزامات المتأثرة بعد اعتماد الاستثناء ({activeEx.affectedItems.filter((a) => a.resolutionAction).length} / {activeEx.affectedItems.length})</span>
                  </div>
                  <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>
                    التزامًا بقاعدة السلامة التشغيلية: لم يتم إلغاء أي برنامج قائم تلقائيًا. يرجى تحديد الإجراء المعتمد لكل برنامج متأثر أدناه حتى يُعتبر طلب الاستثناء مغلقًا بالكامل:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {activeEx.affectedItems.map((aff) => {
                      const draft = getAffDraft(aff.id);
                      return (
                        <div
                          key={aff.id}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: '0.85rem 1rem',
                            background: aff.resolutionAction ? 'rgba(0,165,155,0.05)' : 'var(--unscheduled-bg)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                            <div>
                              <strong>{aff.existingProgramTitle}</strong> ({aff.existingDepartment}) — <span style={{ fontSize: '0.75rem' }}>{aff.conflictTypeLabel}</span>
                            </div>
                            {aff.resolutionAction ? (
                              <span className="status-badge badge-approved">تمت المعالجة: {aff.resolutionAction}</span>
                            ) : (
                              <span className="status-badge badge-conflict">ينتظر تحديد الإجراء</span>
                            )}
                          </div>

                          {aff.resolutionAction ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              تم الحسم بواسطة <strong>{aff.resolvedBy}</strong> ({formatDateTimeAr(aff.resolvedAt)}) — التفاصيل: {aff.resolutionDetails || 'تم التحديث في الجدول العام'}
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 8, marginTop: 8, alignItems: 'end' }}>
                              <div className="form-group">
                                <label className="form-label">إجراء المعالجة (12 خيارًا) *</label>
                                <select
                                  className="form-select"
                                  value={draft.action}
                                  onChange={(e) => setAffField(aff.id, 'action', e.target.value)}
                                >
                                  {AFFECTED_RESOLUTION_ACTIONS.map((act) => (
                                    <option key={act} value={act}>{act}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">قاعة بديلة (اختياري)</label>
                                <select
                                  className="form-select"
                                  value={draft.newVenueId}
                                  onChange={(e) => setAffField(aff.id, 'newVenueId', e.target.value)}
                                >
                                  <option value="">-- الإبقاء على الحالية --</option>
                                  {state.venues.map((v) => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">فترة بديلة (اختياري)</label>
                                <select
                                  className="form-select"
                                  value={draft.newPeriodId}
                                  onChange={(e) => setAffField(aff.id, 'newPeriodId', e.target.value)}
                                >
                                  <option value="">-- الإبقاء على الحالية --</option>
                                  {state.periods.filter((p) => p.category === 'program_period').map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">موظف بديل (اختياري)</label>
                                <select
                                  className="form-select"
                                  value={draft.newEmployeeId}
                                  onChange={(e) => setAffField(aff.id, 'newEmployeeId', e.target.value)}
                                >
                                  <option value="">-- الإبقاء على الحالي --</option>
                                  {state.employees.map((em) => (
                                    <option key={em.id} value={em.id}>{em.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">ملاحظة المعالجة والتنسيق</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  placeholder="توضيح للقسم والموظف..."
                                  value={draft.details}
                                  onChange={(e) => setAffField(aff.id, 'details', e.target.value)}
                                />
                              </div>

                              <button
                                type="button"
                                className="btn btn-teal"
                                onClick={() => resolveAffectedProgramItem(activeEx.id, aff.id, draft)}
                              >
                                اعتماد المعالجة وتحديث الجدول
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget || bulkDeleteItems)}
        onClose={() => {
          setDeleteTarget(null);
          setBulkDeleteItems(null);
        }}
        onConfirm={handleConfirmDelete}
        entityType={deleteTarget?.entityType}
        entityTitle={deleteTarget?.entityTitle}
        items={bulkDeleteItems}
      />
    </div>
  );
}

