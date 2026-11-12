import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Star,
  Award,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Users,
  Layers,
  MapPin,
  Calendar,
  Clock,
  Shield,
  Eye,
  EyeOff,
  Link2,
  Trash2,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { formatDateTimeAr } from '../engine/dateUtils';
import { DepartmentPill, StatusBadge } from './StatusBadge';

export default function EvaluationModal({
  isOpen,
  onClose,
  target = null,
  initialLevel = null,
  initialEmployeeId = null,
  onSubmitted = null,
}) {
  const {
    state,
    currentUser,
    evaluations,
    evalCriteria,
    evalSettings,
    evalMe,
    submitEvaluation,
    deleteEvaluation,
  } = useOps();

  // Resolve target details
  const targetKind = useMemo(() => {
    if (!target) return 'program_execution';
    if (target.kind) return target.kind;
    if (target.subProgram) return 'sub_program';
    if (target.periodKey || target.generalSup || target.reception) return 'supervision';
    if (target.assignedEmployeeId || target.dueDate) return 'task';
    return 'program_execution';
  }, [target]);

  const targetId = useMemo(() => {
    if (!target) return '';
    if (target.targetId) return target.targetId;
    if (targetKind === 'sub_program') {
      const execId = target.execution?.id || target.executionId || '';
      const subId = target.subProgram?.id || target.subProgramId || '';
      return `${execId}::${subId}`;
    }
    if (targetKind === 'supervision') {
      const dutyId = target.duty?.id || target.id || '';
      const dateIso = target.date || target.executionDate || new Date().toISOString().slice(0, 10);
      const pKey = target.periodKey || 'asr';
      return `${dutyId}|${dateIso}|${pKey}`;
    }
    if (targetKind === 'task') {
      return target.task?.id || target.id || '';
    }
    return target.execution?.id || target.id || '';
  }, [target, targetKind]);

  // Extract display facts
  const targetMeta = useMemo(() => {
    if (!target) return {};
    const empMap = Object.fromEntries(state.employees.map((e) => [e.id, e]));
    const scopeMap = Object.fromEntries(state.scopes.map((s) => [s.id, s.name]));

    if (targetKind === 'sub_program') {
      const exec = target.execution || {};
      const sub = target.subProgram || {};
      const leadId = sub.leadEmployeeId || exec.leadEmployeeId || '';
      const partIds = sub.participatingEmployeeIds || exec.participatingEmployeeIds || [];
      const employees = [leadId, ...partIds].filter(Boolean).map((id) => empMap[id]).filter(Boolean);
      return {
        title: sub.name || 'فقرة فرعية',
        parentProgramName: exec.programName,
        departmentName: exec.departmentName,
        departmentId: exec.departmentId,
        date: sub.executionDate || exec.executionDate,
        day: sub.day || exec.day,
        periodName: sub.periodName || exec.periodName,
        venueName: sub.venueName || exec.venueName,
        leadName: empMap[leadId]?.name,
        leadEmployeeId: leadId,
        employees,
        status: exec.status || 'منفذ',
      };
    }

    if (targetKind === 'supervision') {
      const duty = target.duty || target;
      const emp = empMap[duty.employeeId] || { name: duty.supervisor };
      const periodLabelMap = {
        reception: 'استقبال الطلاب',
        asr: 'قبل صلاة العصر',
        maghrib: 'قبل صلاة المغرب',
        isha: 'قبل صلاة العشاء',
        dismissal: 'أثناء الانصراف والحافلات',
      };
      const pKey = target.periodKey || 'asr';
      const loc =
        pKey === 'reception'
          ? duty.reception
          : pKey === 'asr'
          ? duty.asrHall
          : pKey === 'maghrib'
          ? duty.maghribHall
          : pKey === 'isha'
          ? duty.ishaHall
          : duty.dismissal;

      return {
        title: `الإشراف اليومي — ${periodLabelMap[pKey] || pKey}`,
        departmentName: 'الإدارة العامة للنادي',
        date: target.date || new Date().toISOString().slice(0, 10),
        day: target.day || 'اليومي',
        periodName: periodLabelMap[pKey] || pKey,
        venueName: loc || duty.floor,
        leadName: duty.supervisor,
        leadEmployeeId: duty.employeeId,
        employees: [emp].filter(Boolean),
        status: 'منفذ',
      };
    }

    if (targetKind === 'task') {
      const task = target.task || target;
      const emp = empMap[task.assignedEmployeeId];
      return {
        title: task.title,
        departmentName: task.departmentName,
        departmentId: task.departmentId,
        date: task.dueDate,
        periodName: 'تكليف تشغيلي',
        venueName: 'ميداني',
        leadName: emp?.name || task.assignedEmployeeName,
        leadEmployeeId: task.assignedEmployeeId,
        employees: emp ? [emp] : [],
        status: task.status || 'منجزة',
      };
    }

    // Default: program_execution
    const exec = target.execution || target;
    const leadId = exec.leadEmployeeId;
    const partIds = exec.participatingEmployeeIds || [];
    const employees = [leadId, ...partIds].filter(Boolean).map((id) => empMap[id]).filter(Boolean);
    const scopeNames = (exec.scopeIds || []).map((s) => scopeMap[s] || s);

    return {
      title: exec.programName,
      departmentName: exec.departmentName,
      departmentId: exec.departmentId,
      date: exec.executionDate,
      day: exec.day,
      periodName: exec.periodName,
      venueName: exec.venueName,
      scopes: scopeNames,
      leadName: empMap[leadId]?.name,
      leadEmployeeId: leadId,
      employees,
      status: exec.status || 'منفذ',
    };
  }, [target, targetKind, state.employees, state.scopes]);

  // Evaluation level: 'program' vs 'employee'
  const [evalLevel, setEvalLevel] = useState(() => {
    if (initialLevel) return initialLevel;
    if (targetKind === 'supervision') return 'employee';
    return 'program';
  });

  // Selected employee for employee-level evaluation
  const [selectedEmpId, setSelectedEmpId] = useState(() => {
    if (initialEmployeeId) return initialEmployeeId;
    return targetMeta.leadEmployeeId || targetMeta.employees?.[0]?.id || '';
  });

  // Supervision status (e.g. 'موجود بفاعلية')
  const [supervisionStatus, setSupervisionStatus] = useState('موجود بفاعلية');

  // Form scores: { [criterionId]: number }
  const [scoresMap, setScoresMap] = useState({});

  // Qualitative feedback fields
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [shareWithEmployee, setShareWithEmployee] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Sync level and selected employee when target or modal opens
  useEffect(() => {
    if (targetKind === 'supervision') {
      setEvalLevel('employee');
      setSelectedEmpId(initialEmployeeId || targetMeta.leadEmployeeId || targetMeta.employees?.[0]?.id || '');
    } else if (initialLevel) {
      setEvalLevel(initialLevel);
      setSelectedEmpId(initialEmployeeId || targetMeta.leadEmployeeId || targetMeta.employees?.[0]?.id || '');
    } else {
      setEvalLevel('program');
      setSelectedEmpId(targetMeta.leadEmployeeId || targetMeta.employees?.[0]?.id || '');
    }
  }, [target, isOpen, targetKind, initialLevel, initialEmployeeId, targetMeta.leadEmployeeId]);

  // Find existing evaluations on this target
  const existingEvaluations = useMemo(() => {
    if (!targetId) return [];
    return evaluations.filter(
      (e) => e.targetId === targetId && !e.isDeleted
    );
  }, [evaluations, targetId]);

  // Current user's evaluation for this level and employee
  const myExistingEval = useMemo(() => {
    return existingEvaluations.find((e) => {
      if (!e.isMine) return false;
      if (e.evalLevel !== evalLevel) return false;
      if (evalLevel === 'employee') {
        return e.evaluatedEmployeeId === selectedEmpId;
      }
      return true;
    });
  }, [existingEvaluations, evalLevel, selectedEmpId]);

  // Populate form if user previously evaluated this target/employee
  useEffect(() => {
    if (myExistingEval) {
      const map = {};
      (myExistingEval.scores || []).forEach((s) => {
        map[s.criterionId] = s.score;
      });
      setScoresMap(map);
      setNotes(myExistingEval.notes || '');
      setInternalNotes(myExistingEval.internalNotes || '');
      setStrengths(myExistingEval.strengths || '');
      setImprovements(myExistingEval.improvements || '');
      setRecommendations(myExistingEval.recommendations || '');
      setAttachmentName(myExistingEval.attachmentName || '');
      setAttachmentUrl(myExistingEval.attachmentUrl || '');
      setShareWithEmployee(myExistingEval.shareWithEmployee !== false);
      if (myExistingEval.supervisionStatus) {
        setSupervisionStatus(myExistingEval.supervisionStatus);
      }
    } else {
      // Reset form to clean state
      setScoresMap({});
      setNotes('');
      setInternalNotes('');
      setStrengths('');
      setImprovements('');
      setRecommendations('');
      setAttachmentName('');
      setAttachmentUrl('');
      setShareWithEmployee(true);
      if (targetKind === 'supervision') setSupervisionStatus('موجود بفاعلية');
    }
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [myExistingEval, evalLevel, selectedEmpId, targetKind]);

  // Applicable criteria from settings
  const applicableCriteria = useMemo(() => {
    return (evalCriteria || []).filter((c) => {
      if (c.isDeleted || !c.isActive) return false;
      if (!c.levels || !c.levels.includes(evalLevel)) return false;
      if (c.kinds && c.kinds.length > 0 && !c.kinds.includes(targetKind)) return false;
      return true;
    });
  }, [evalCriteria, evalLevel, targetKind]);

  // Realtime Live Score and Percentage computation
  const liveScoreCalc = useMemo(() => {
    let total = 0;
    let max = 0;
    let count = 0;

    applicableCriteria.forEach((crit) => {
      const val = scoresMap[crit.id];
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val);
        total += num;
        max += crit.maxScore;
        count += 1;
      }
    });

    if (targetKind === 'supervision') {
      const supOptions = evalSettings.supervision_statuses || [];
      const matched = supOptions.find((o) => o.label === supervisionStatus);
      const supScore = matched && matched.score !== null ? Number(matched.score) : null;
      if (count === 0) {
        return {
          total: supScore ?? 0,
          max: 100,
          percent: supScore ?? 0,
          count: 1,
        };
      }
      const pct = max > 0 ? Math.round((100 * total) / max * 10) / 10 : 0;
      return { total, max, percent: pct, count };
    }

    const pct = max > 0 ? Math.round((100 * total) / max * 10) / 10 : 0;
    return { total, max, percent: pct, count };
  }, [applicableCriteria, scoresMap, targetKind, supervisionStatus, evalSettings]);

  if (!isOpen || !target) return null;

  // Grade color and label helper
  const getGradeInfo = (pct) => {
    if (pct >= 90) return { label: 'ممتاز', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' };
    if (pct >= 80) return { label: 'جيد جدًا', color: '#00A59B', bg: 'rgba(0,165,155,0.1)' };
    if (pct >= 70) return { label: 'جيد', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' };
    if (pct >= 60) return { label: 'مقبول', color: '#d97706', bg: 'rgba(217,119,6,0.1)' };
    return { label: 'يحتاج تحسين', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' };
  };

  const gradeInfo = getGradeInfo(liveScoreCalc.percent);

  const handleScoreChange = (critId, scoreValue) => {
    setScoresMap((prev) => ({
      ...prev,
      [critId]: scoreValue,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const effectiveLevel = targetKind === 'supervision' ? 'employee' : evalLevel;
    const effectiveEmpId =
      effectiveLevel === 'employee'
        ? selectedEmpId || targetMeta.leadEmployeeId || targetMeta.employees?.[0]?.id
        : null;

    // Validation
    if (effectiveLevel === 'employee' && !effectiveEmpId) {
      setErrorMessage('يرجى تحديد الموظف المراد تقييمه.');
      return;
    }

    if (effectiveLevel === 'employee' && effectiveEmpId === currentUser?.employeeId) {
      setErrorMessage('لا يمكنك تقييم أدائك الشخصي.');
      return;
    }

    // Required criteria check
    for (const c of applicableCriteria) {
      if (c.isRequired && (scoresMap[c.id] === undefined || scoresMap[c.id] === '')) {
        setErrorMessage(`المعيار «${c.name}» إلزامي. يرجى رصد الدرجة.`);
        return;
      }
    }

    if (targetKind !== 'supervision' && liveScoreCalc.count === 0) {
      setErrorMessage('يرجى رصد درجة معيار واحد على الأقل.');
      return;
    }

    const scoresPayload = Object.entries(scoresMap)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([criterionId, score]) => ({
        criterionId,
        score: Number(score),
      }));

    const payload = {
      targetKind,
      targetId,
      evalLevel: effectiveLevel,
      evaluatedEmployeeId: effectiveEmpId,
      supervisionStatus: targetKind === 'supervision' ? supervisionStatus : null,
      scores: scoresPayload,
      notes: notes.trim(),
      internalNotes: internalNotes.trim(),
      strengths: strengths.trim(),
      improvements: improvements.trim(),
      recommendations: recommendations.trim(),
      attachmentName: attachmentName.trim(),
      attachmentUrl: attachmentUrl.trim(),
      shareWithEmployee,
    };

    setSaving(true);
    const res = await submitEvaluation(payload);
    setSaving(false);

    if (!res.ok) {
      setErrorMessage(res.error || 'تعذر حفظ التقييم.');
    } else {
      setSuccessMessage('تم اعتماد وحفظ التقييم بنجاح في قاعدة البيانات.');
      if (onSubmitted) onSubmitted(res);
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  const handleDeletePrevious = async () => {
    if (!myExistingEval) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا التقييم؟')) return;
    setSaving(true);
    const res = await deleteEvaluation(myExistingEval.id, 'حذف التقييم من المقيم');
    setSaving(false);
    if (res.ok) {
      setScoresMap({});
      setSuccessMessage('تم حذف التقييم.');
    } else {
      setErrorMessage(res.error || 'تعذر حذف التقييم.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 860, maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ paddingBottom: '0.8rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'var(--brand-teal)',
                  color: '#fff',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                }}
              >
                <Sparkles size={13} />
                <span>
                  {targetKind === 'sub_program'
                    ? 'تقييم فقرة فرعية ↳'
                    : targetKind === 'supervision'
                    ? 'تقييم الإشراف الميداني'
                    : targetKind === 'task'
                    ? 'تقييم تكليف تشغيلي'
                    : 'تقييم برنامج تنفيذي'}
                </span>
              </span>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }}>{targetMeta.title}</h3>
            </div>
            {targetMeta.parentProgramName && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>
                البرنامج الرئيسي: <strong>{targetMeta.parentProgramName}</strong>
              </div>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="إغلاق">
            <X size={18} />
          </button>
        </div>

        {/* Target Metadata Banner */}
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>القسم: </span>
              <strong>{targetMeta.departmentName}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>التاريخ: </span>
              <strong>
                {targetMeta.date} {targetMeta.day ? `(${targetMeta.day})` : ''}
              </strong>
            </div>
            {targetMeta.periodName && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>الفترة: </span>
                <strong>{targetMeta.periodName}</strong>
              </div>
            )}
            {targetMeta.venueName && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>الموقع: </span>
                <strong>{targetMeta.venueName}</strong>
              </div>
            )}
            {targetMeta.leadName && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>المسؤول: </span>
                <strong>{targetMeta.leadName}</strong>
              </div>
            )}
          </div>
          <StatusBadge status={targetMeta.status || 'منفذ'} size="sm" />
        </div>

        {/* Level Switcher (Programs & Sub-Programs) */}
        {targetKind !== 'supervision' && targetKind !== 'task' && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: '1.1rem',
              background: 'var(--bg)',
              padding: 4,
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${evalLevel === 'program' ? 'btn-teal' : 'btn-secondary'}`}
              style={{ flex: 1, borderRadius: 8 }}
              onClick={() => setEvalLevel('program')}
            >
              <Award size={14} />
              <span>تقييم البرنامج العام ككل</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${evalLevel === 'employee' ? 'btn-teal' : 'btn-secondary'}`}
              style={{ flex: 1, borderRadius: 8 }}
              onClick={() => setEvalLevel('employee')}
            >
              <User size={14} />
              <span>تقييم أداء موظف محدد في البرنامج</span>
            </button>
          </div>
        )}

        {/* Employee Selector (when in Employee Level) */}
        {evalLevel === 'employee' && (
          <div
            className="card"
            style={{
              padding: '0.85rem 1rem',
              marginBottom: '1.1rem',
              background: 'rgba(0,165,155,0.04)',
              borderColor: 'rgba(0,165,155,0.25)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.86rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={15} color="var(--brand-teal)" />
              <span>الموظف المراد تقييم أدائه في هذا النشاط:</span>
            </div>
            <select
              className="form-select"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
            >
              {targetMeta.employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.id === targetMeta.leadEmployeeId ? '★ (المسؤول المباشر)' : '— (مشارك)'} — {emp.jobTitle || emp.departmentName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Daily Supervision Status Selector (Matching Reference Site!) */}
        {targetKind === 'supervision' && (
          <div className="card" style={{ padding: '0.9rem', marginBottom: '1.1rem' }}>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 8 }}>
              حالة التواجد في موقع الإشراف الميداني (الموقع المرجعي):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              {(evalSettings.supervision_statuses || []).map((opt) => {
                const isSelected = supervisionStatus === opt.label;
                let borderCol = 'var(--border)';
                let bgCol = 'var(--bg)';
                if (isSelected) {
                  borderCol = opt.score === 100 ? '#16a34a' : opt.score === 60 ? '#d97706' : '#dc2626';
                  bgCol = opt.score === 100 ? 'rgba(22,163,74,0.1)' : opt.score === 60 ? 'rgba(217,119,6,0.1)' : 'rgba(220,38,38,0.1)';
                }
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSupervisionStatus(opt.label)}
                    style={{
                      padding: '0.7rem 0.5rem',
                      borderRadius: 10,
                      border: `2px solid ${borderCol}`,
                      background: bgCol,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.79rem', color: isSelected ? borderCol : 'var(--text)' }}>
                      {opt.label}
                    </div>
                    {opt.score !== null ? (
                      <span
                        className="status-badge"
                        style={{
                          fontSize: '0.68rem',
                          background: opt.score >= 90 ? '#16a34a' : opt.score > 0 ? '#d97706' : '#dc2626',
                          color: '#fff',
                        }}
                      >
                        {opt.score}%
                      </span>
                    ) : (
                      <span className="status-badge badge-pending" style={{ fontSize: '0.68rem' }}>مستأذن</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Existing Evaluation Indicator */}
        {myExistingEval && (
          <div
            style={{
              padding: '0.65rem 0.9rem',
              borderRadius: 10,
              background: 'rgba(217,119,6,0.08)',
              border: '1px solid #fde68a',
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
            }}
          >
            <span>
              ℹ️ لديك تقييم سابق مسجل لهذا العنصر (النتيجة السابقة: <strong>{myExistingEval.percent}%</strong> بتاريخ {formatDateTimeAr(myExistingEval.createdAt)}). يمكنك تعديل التقييم وإعادة حفظه.
            </span>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={handleDeletePrevious}
            >
              <Trash2 size={12} />
              <span>حذف التقييم</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Live Score Summary Banner */}
          <div
            style={{
              padding: '0.9rem 1.2rem',
              borderRadius: 12,
              background: gradeInfo.bg,
              border: `2px solid ${gradeInfo.color}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>النتيجة المحسوبة آليًا:</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: gradeInfo.color }}>
                  {liveScoreCalc.percent}%
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: gradeInfo.color }}>
                  ({gradeInfo.label})
                </span>
                {liveScoreCalc.max > 0 && (
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginRight: 6 }}>
                    [{liveScoreCalc.total} من {liveScoreCalc.max} درجة]
                  </span>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'left', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              <div>المقيّم: <strong>{currentUser.name}</strong> ({currentUser.roleLabel})</div>
              <div>المعايير المكتملة: <strong>{liveScoreCalc.count}</strong> من {applicableCriteria.length}</div>
            </div>
          </div>

          {/* Criteria Catalog Scoring Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={16} color="var(--brand-teal)" />
              <span>معايير التقييم ({evalLevel === 'program' ? 'مستوى البرنامج' : 'مستوى أداء الموظف'}):</span>
            </div>

            {applicableCriteria.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                لا توجد معايير محددة لهذا المستوى حاليًا في إعدادات النظام.
              </div>
            ) : (
              applicableCriteria.map((crit) => {
                const currentScore = scoresMap[crit.id];
                const scoreButtons = Array.from({ length: crit.maxScore }, (_, i) => i + 1);

                return (
                  <div
                    key={crit.id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 12,
                      background: 'var(--bg)',
                      border: currentScore !== undefined ? '1.5px solid var(--brand-teal)' : '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: '0.86rem' }}>{crit.name}</strong>
                        {crit.isRequired && (
                          <span style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 800 }}>* إلزامي</span>
                        )}
                      </div>
                      <span
                        className="status-badge"
                        style={{ fontSize: '0.72rem', background: 'var(--border)', color: 'var(--text)' }}
                      >
                        الدرجة القصوى: {crit.maxScore}
                      </span>
                    </div>

                    {crit.description && (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {crit.description}
                      </div>
                    )}

                    {/* Interactive Score Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 6 }}>رصد الدرجة:</span>
                      {scoreButtons.map((val) => {
                        const isValSelected = Number(currentScore) === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleScoreChange(crit.id, val)}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              border: isValSelected ? '2px solid var(--brand-teal)' : '1px solid var(--border)',
                              background: isValSelected ? 'var(--brand-teal)' : 'var(--card-bg)',
                              color: isValSelected ? '#fff' : 'var(--text)',
                              fontWeight: 800,
                              fontSize: '0.84rem',
                              cursor: 'pointer',
                              display: 'grid',
                              placeItems: 'center',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {val}
                          </button>
                        );
                      })}
                      {currentScore !== undefined && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ fontSize: '0.7rem', color: '#dc2626' }}
                          onClick={() => handleScoreChange(crit.id, undefined)}
                          title="مسح الدرجة"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Qualitative Feedback Sections */}
          <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={16} color="var(--brand-teal)" />
              <span>الملاحظات النوعية والشواهد والتوصيات:</span>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" style={{ color: '#16a34a' }}>نقاط القوة والتميز المرصودة</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="أبرز الإيجابيات ومواطن التميز والإبداع أثناء التنفيذ..."
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: '#d97706' }}>فرص التحسين والتطوير</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="الجوانب التي يوصى بالتركيز عليها للارتقاء بالأداء..."
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">التوصيات المقترحة للمرات القادمة</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="توصيات عملية للإدارة أو فريق العمل لتحسين وتطوير البرامج المستقبلية..."
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">ملحوظات عامة على البرنامج / الأداء</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="أي ملاحظات عامة حول التجهيز، الانضباط، البيئة، الخ..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Confidential Internal Notes */}
            <div
              style={{
                background: 'rgba(239,68,68,0.04)',
                border: '1.5px dashed rgba(239,68,68,0.3)',
                padding: '0.85rem 1rem',
                borderRadius: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="form-label" style={{ color: '#b91c1c', fontWeight: 800, margin: 0 }}>
                  🔒 ملاحظات سرية خاصة بالإدارة (لن تظهر للموظف المقيم)
                </label>
                <span style={{ fontSize: '0.68rem', color: '#b91c1c' }}>محمية بصلاحيات الرؤية</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="ملاحظات توجيهية للإدارة أو رئيس القسم فقط دون إظهارها في تقرير الموظف الشخصي..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>

            {/* Attachments & Evidence */}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">اسم المرفق / الشاهد</label>
                <input
                  className="form-input"
                  placeholder="مثال: تقرير مصور / كشف حضور الطلاب"
                  value={attachmentName}
                  onChange={(e) => setAttachmentName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">رابط المرفق / محرك الأقراص (Google Drive / OneDrive)</label>
                <input
                  className="form-input"
                  style={{ direction: 'ltr', textAlign: 'right' }}
                  placeholder="https://..."
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                />
              </div>
            </div>

            {/* Share with Employee Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.8rem',
                borderRadius: 8,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '0.8rem' }}>
                <strong>إتاحة إطلاع الموظف على التقييم:</strong>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  عند التفعيل، يستطيع الموظف مشاهدة الدرجة ونقاط القوة والتحسين في بوابته (تقييماتي).
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${shareWithEmployee ? 'btn-teal' : 'btn-secondary'}`}
                onClick={() => setShareWithEmployee(!shareWithEmployee)}
              >
                {shareWithEmployee ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{shareWithEmployee ? 'متاح للموظف' : 'محجوب عن الموظف'}</span>
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {errorMessage && (
            <div className="card" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="card" style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="modal-footer" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-teal" disabled={saving}>
              <CheckCircle2 size={16} />
              <span>{saving ? 'جاري الاعتماد والحفظ...' : myExistingEval ? 'تحديث واعتماد التقييم' : 'اعتماد وحفظ التقييم'}</span>
            </button>
          </div>
        </form>

        {/* Existing Evaluations by Other Evaluators */}
        {existingEvaluations.length > 0 && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.86rem', marginBottom: 8, color: 'var(--brand-ink)' }}>
              التقييمات السابقة المسجلة على هذا العنصر ({existingEvaluations.length}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {existingEvaluations.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 10,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                  }}
                >
                  <div>
                    <strong>{ev.evaluatorName}</strong> ({ev.evaluatorRoleLabel}) —{' '}
                    <span>{ev.evalLevel === 'program' ? 'تقييم البرنامج' : `أداء: ${ev.evaluatedEmployeeName}`}</span>
                    <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>• {formatDateTimeAr(ev.createdAt)}</span>
                  </div>
                  <span
                    className="status-badge"
                    style={{
                      fontWeight: 800,
                      background: getGradeInfo(ev.percent).bg,
                      color: getGradeInfo(ev.percent).color,
                    }}
                  >
                    {ev.percent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
