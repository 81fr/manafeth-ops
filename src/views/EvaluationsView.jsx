import React, { useState, useMemo } from 'react';
import {
  Award,
  Sparkles,
  Star,
  User,
  Users,
  Building2,
  Calendar,
  Clock,
  Layers,
  MapPin,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  Filter,
  Plus,
  Edit3,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Download,
  Eye,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  HelpCircle,
  Lock,
  X,
  Printer,
  CheckSquare,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { formatDateTimeAr } from '../engine/dateUtils';
import { DepartmentPill, StatusBadge } from '../components/StatusBadge';
import SupervisionLeadershipPlatform from '../components/SupervisionLeadershipPlatform';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { canDeleteEntity, canBulkDelete } from '../engine/permissions';
import { exportEvaluationsToExcel, printEvaluationsReport } from '../engine/evaluationReportsIO';

export default function EvaluationsView({ onOpenEvaluationModal, onOpenDetailModal }) {
  const {
    state,
    currentUser,
    userOrgContext,
    evaluations,
    evalCriteria,
    evalSettings,
    evalAccessList,
    evalAuditLogs,
    evalMe,
    saveEvalCriterion,
    deleteEvalCriterion,
    saveEvalSetting,
    setEvalAccess,
    deleteEvaluation,
    restoreEvaluation,
    softDeleteEntity,
    bulkSoftDeleteEntities,
  } = useOps();

  // Role permissions
  const isAdmin = Boolean(currentUser?.isAdmin || evalMe?.canManage);
  const isClubDirector = currentUser?.role === 'club_director' || evalMe?.viewScope === 'club';
  const isDeptHead = currentUser?.role === 'dept_head' || evalMe?.viewScope === 'department';
  const canSeeDeptTab = isDeptHead || isClubDirector || isAdmin;
  const canSeeClubTab = isClubDirector || isAdmin || isDeptHead;
  const canSeeSettingsTab = isAdmin;

  // Active Main Tab: 'my_evals' | 'dept_evals' | 'club_analytics' | 'admin_settings'
  const [activeTab, setActiveTab] = useState('my_evals');

  // Search & Filter States for evaluations
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState(() => (isDeptHead ? currentUser.departmentId : 'all'));
  const [gradeFilter, setGradeFilter] = useState('all');
  const [selectedDeptId, setSelectedDeptId] = useState(() => currentUser?.departmentId || state.departments[0]?.id || 'dept_tarbawi');

  // Delete & Bulk Selection states
  const [selectedEvalIds, setSelectedEvalIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteItems, setBulkDeleteItems] = useState(null);

  const canDeleteEvals = canDeleteEntity(currentUser, 'evaluation');
  const canBulkDeleteEvals = canBulkDelete(currentUser, 'evaluation');

  // Criteria modal state (Admin)
  const [criterionModal, setCriterionModal] = useState(null);
  const [savingCriterion, setSavingCriterion] = useState(false);

  // Authority modal state (Admin)
  const [accessModal, setAccessModal] = useState(null);
  const [savingAccess, setSavingAccess] = useState(false);

  // Status/Toast messages
  const [bannerMsg, setBannerMsg] = useState(null);

  // Grade helper
  const getGradeInfo = (pct) => {
    if (pct >= 90) return { label: 'ممتاز', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' };
    if (pct >= 80) return { label: 'جيد جدًا', color: '#00A59B', bg: 'rgba(0,165,155,0.1)' };
    if (pct >= 70) return { label: 'جيد', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' };
    if (pct >= 60) return { label: 'مقبول', color: '#d97706', bg: 'rgba(217,119,6,0.1)' };
    return { label: 'يحتاج تحسين', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' };
  };

  // 1. My Personal Evaluations (Tab 1)
  const myEvaluations = useMemo(() => {
    if (!currentUser) return [];
    return evaluations.filter((e) => {
      if (e.isDeleted) return false;
      return (
        e.evaluatedEmployeeId === currentUser.employeeId ||
        (e.evalLevel === 'program' && e.leadEmployeeId === currentUser.employeeId)
      );
    });
  }, [evaluations, currentUser]);

  const myStats = useMemo(() => {
    if (myEvaluations.length === 0) return { avg: 0, count: 0, ledCount: 0, partCount: 0, supCount: 0 };
    const total = myEvaluations.reduce((sum, e) => sum + Number(e.percent || 0), 0);
    const avg = Math.round((total / myEvaluations.length) * 10) / 10;
    const ledCount = myEvaluations.filter((e) => e.evalLevel === 'program').length;
    const partCount = myEvaluations.filter((e) => e.evalLevel === 'employee' && e.targetKind !== 'supervision').length;
    const supCount = myEvaluations.filter((e) => e.targetKind === 'supervision').length;
    return { avg, count: myEvaluations.length, ledCount, partCount, supCount };
  }, [myEvaluations]);

  // Aggregated Strengths and Improvements for personal summary
  const myAggregatedStrengths = useMemo(() => {
    return myEvaluations.map((e) => e.strengths).filter(Boolean);
  }, [myEvaluations]);

  const myAggregatedImprovements = useMemo(() => {
    return myEvaluations.map((e) => e.improvements).filter(Boolean);
  }, [myEvaluations]);

  // 2. Department Evaluations (Tab 2)
  const targetDeptId = isDeptHead && !isAdmin && !isClubDirector ? currentUser.departmentId : selectedDeptId;

  const deptEvaluations = useMemo(() => {
    return evaluations.filter((e) => {
      if (e.isDeleted) return false;
      if (targetDeptId === 'all') return true;
      return e.departmentId === targetDeptId || e.evaluatedDepartmentId === targetDeptId;
    });
  }, [evaluations, targetDeptId]);

  const deptStats = useMemo(() => {
    if (deptEvaluations.length === 0) return { avg: 0, count: 0, excellent: 0, needsImprovement: 0 };
    const total = deptEvaluations.reduce((sum, e) => sum + Number(e.percent || 0), 0);
    const avg = Math.round((total / deptEvaluations.length) * 10) / 10;
    const excellent = deptEvaluations.filter((e) => e.percent >= 90).length;
    const needsImprovement = deptEvaluations.filter((e) => e.percent < 75).length;
    return { avg, count: deptEvaluations.length, excellent, needsImprovement };
  }, [deptEvaluations]);

  // Executed programs in department that have not been evaluated yet!
  const unEvaluatedDeptPrograms = useMemo(() => {
    const evaluatedTargetIds = new Set(evaluations.filter((e) => !e.isDeleted).map((e) => e.targetId));
    return state.scheduledExecutions.filter((ex) => {
      if (ex.status !== 'منفذ') return false;
      if (targetDeptId !== 'all' && ex.departmentId !== targetDeptId) return false;
      return !evaluatedTargetIds.has(ex.id);
    });
  }, [state.scheduledExecutions, evaluations, targetDeptId]);

  // Department staff ranking
  const deptStaffScores = useMemo(() => {
    const deptEmployees = state.employees.filter((e) => targetDeptId === 'all' || e.departmentId === targetDeptId);
    return deptEmployees.map((emp) => {
      const empEvals = deptEvaluations.filter((e) => e.evaluatedEmployeeId === emp.id);
      const total = empEvals.reduce((sum, e) => sum + Number(e.percent || 0), 0);
      const avg = empEvals.length > 0 ? Math.round((total / empEvals.length) * 10) / 10 : null;
      return {
        employee: emp,
        evalCount: empEvals.length,
        avgScore: avg,
      };
    }).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  }, [state.employees, targetDeptId, deptEvaluations]);

  // 3. Club Analytics (Tab 3)
  const clubStats = useMemo(() => {
    const activeEvals = evaluations.filter((e) => !e.isDeleted);
    if (activeEvals.length === 0) return { avg: 0, count: 0, deptBreakdown: [] };
    const total = activeEvals.reduce((sum, e) => sum + Number(e.percent || 0), 0);
    const avg = Math.round((total / activeEvals.length) * 10) / 10;

    const deptBreakdown = state.departments.map((dept) => {
      const dEvals = activeEvals.filter((e) => e.departmentId === dept.id || e.evaluatedDepartmentId === dept.id);
      const dTotal = dEvals.reduce((sum, e) => sum + Number(e.percent || 0), 0);
      const dAvg = dEvals.length > 0 ? Math.round((dTotal / dEvals.length) * 10) / 10 : 0;
      return {
        dept,
        count: dEvals.length,
        avg: dAvg,
      };
    });

    return { avg, count: activeEvals.length, deptBreakdown };
  }, [evaluations, state.departments]);

  // Supervision attendance analytics
  const supervisionPresenceAnalytics = useMemo(() => {
    const supEvals = evaluations.filter((e) => e.targetKind === 'supervision' && !e.isDeleted);
    const total = supEvals.length;
    if (total === 0) return { active: 0, inactive: 0, absent: 0, excused: 0, complianceRate: 0 };
    const active = supEvals.filter((e) => e.supervisionStatus === 'موجود بفاعلية').length;
    const inactive = supEvals.filter((e) => e.supervisionStatus === 'موجود دون فاعلية').length;
    const absent = supEvals.filter((e) => e.supervisionStatus === 'غير موجود في موقع الإشراف' || e.supervisionStatus === 'متغيب عن العمل').length;
    const excused = supEvals.filter((e) => e.supervisionStatus === 'في إجازة / مستأذن').length;
    const complianceRate = Math.round(((active + inactive * 0.6) / total) * 100);
    return { active, inactive, absent, excused, complianceRate, total };
  }, [evaluations]);

  // Handle Save Criterion Modal
  const handleSaveCriterion = async (e) => {
    e.preventDefault();
    if (!criterionModal) return;
    setSavingCriterion(true);
    const res = await saveEvalCriterion(criterionModal);
    setSavingCriterion(false);
    if (res.ok) {
      setBannerMsg('تم حفظ وتحديث معيار التقييم بنجاح.');
      setCriterionModal(null);
    } else {
      alert(res.error || 'تعذر حفظ المعيار.');
    }
  };

  // Handle Delete Criterion
  const handleDeleteCriterion = async (crit) => {
    if (!window.confirm(`هل أنت متأكد من حذف المعيار «${crit.name}»؟`)) return;
    const res = await deleteEvalCriterion(crit.id);
    if (res.ok) {
      setBannerMsg(`تم حذف المعيار «${crit.name}».`);
    } else {
      alert(res.error || 'تعذر حذف المعيار.');
    }
  };

  // Handle Save Access Modal
  const handleSaveAccess = async (e) => {
    e.preventDefault();
    if (!accessModal) return;
    setSavingAccess(true);
    const res = await setEvalAccess(accessModal.employeeId, {
      view_scope: accessModal.view_scope,
      can_evaluate: accessModal.can_evaluate,
      can_manage: accessModal.can_manage,
    });
    setSavingAccess(false);
    if (res.ok) {
      setBannerMsg('تم تحديث صلاحيات التقييم للموظف بنجاح.');
      setAccessModal(null);
    } else {
      alert(res.error || 'تعذر تحديث الصلاحيات.');
    }
  };

  // Safe Soft-Delete & Restore Confirmation for Evaluations
  const handleConfirmDelete = async (reason) => {
    if (bulkDeleteItems?.length > 0) {
      const res = await bulkSoftDeleteEntities(bulkDeleteItems, reason);
      if (res?.ok) {
        setBannerMsg(`تم حذف (${res.count}) سجلات تقييم بنجاح ونقلها لسلة المحذوفات.`);
        setSelectedEvalIds([]);
      } else if (res?.error) {
        setBannerMsg(res.error);
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
      setBannerMsg(`تم حذف التقييم «${deleteTarget.entityTitle}» بنجاح ونقله لسلة المحذوفات.`);
      setSelectedEvalIds((prev) => prev.filter((id) => id !== deleteTarget.entityId));
    } else if (res?.error) {
      setBannerMsg(res.error);
    }
    setDeleteTarget(null);
  };

  const handleSingleDelete = (ev) => {
    setDeleteTarget({
      entityType: 'evaluation',
      entityId: ev.id,
      entityTitle: ev.programName
        ? `${ev.programName} (${ev.evaluatedEmployeeName || ev.departmentName || 'تقييم'})`
        : ev.targetTitle || 'سجل تقييم',
    });
  };

  const handleBulkDeleteClick = (scopeEvaluations) => {
    const targets = scopeEvaluations.filter((ev) => selectedEvalIds.includes(ev.id));
    if (targets.length === 0) return;
    setBulkDeleteItems(
      targets.map((ev) => ({
        entityType: 'evaluation',
        entityId: ev.id,
        entityTitle: ev.programName
          ? `${ev.programName} (${ev.evaluatedEmployeeName || ev.departmentName || 'تقييم'})`
          : ev.targetTitle || ev.id,
      }))
    );
  };

  // =========================================================================
  // Excel (.xlsx) & PDF Reports Exporters
  // =========================================================================
  const handleExportMyEvalsExcel = () => {
    const rows = myEvaluations.map((ev, i) => {
      const gr = getGradeInfo(ev.percent);
      return {
        'م': i + 1,
        'اسم البرنامج': ev.programName || ev.targetTitle || '—',
        'الفقرة الفرعية': ev.subProgramName || '—',
        'القسم': ev.departmentName || '—',
        'التاريخ': ev.execDate || ev.evaluationDate || '—',
        'اليوم': ev.dayName || '—',
        'الفترة': ev.periodName || ev.periodKey || '—',
        'الموقع': ev.venueName || ev.location || '—',
        'النسبة المئوية': `${ev.percent}%`,
        'التقدير': gr.label,
        'نقاط القوة': ev.strengths || '—',
        'فرص التحسين': ev.improvements || '—',
        'التوصيات': ev.recommendations || '—',
        'الملاحظات': ev.notes || '—',
        'المقيّم': ev.evaluatorName || '—',
        'صفة المقيّم': ev.evaluatorRoleLabel || '—',
        'تاريخ التقييم': formatDateTimeAr(ev.createdAt),
      };
    });
    exportEvaluationsToExcel(rows, 'تقييماتي_الشخصية', 'تقرير_تقييماتي_نادي_تراؤف.xlsx');
  };

  const handlePrintMyEvalsPdf = () => {
    printEvaluationsReport({
      title: `تقرير التقييمات الشخصية — ${currentUser?.name || 'الموظف'}`,
      subtitle: 'نادي تراؤف للبنين — سجل التقييمات والأداء المعتمد',
      stats: [
        { label: 'معدل الأداء العام', value: myStats.count > 0 ? `${myStats.avg}%` : '—', color: getGradeInfo(myStats.avg).color },
        { label: 'إجمالي التقييمات المرصودة', value: myStats.count, color: '#00A59B' },
        { label: 'برامج قدتها كمسؤول', value: myStats.ledCount, color: '#6366f1' },
        { label: 'مشاركات وتكليفات وإشراف', value: myStats.partCount + myStats.supCount, color: '#8CC240' },
      ],
      columns: [
        { key: '#', label: 'م', width: '35px' },
        { key: 'program', label: 'البرنامج / التكليف', align: 'right' },
        { key: 'dept', label: 'القسم' },
        { key: 'date', label: 'التاريخ' },
        { key: 'period', label: 'الفترة' },
        { key: 'percent', label: 'النسبة', isScore: true },
        { key: 'grade', label: 'التقدير' },
        { key: 'evaluator', label: 'المقيّم' },
      ],
      rows: myEvaluations.map((ev) => {
        const gr = getGradeInfo(ev.percent);
        return {
          program: (ev.programName || ev.targetTitle || '—') + (ev.subProgramName ? ` (↳ ${ev.subProgramName})` : ''),
          dept: ev.departmentName || '—',
          date: ev.execDate || ev.evaluationDate || '—',
          period: ev.periodName || ev.periodKey || '—',
          percent: ev.percent,
          grade: gr.label,
          evaluator: ev.evaluatorName || '—',
        };
      }),
      notes: 'تم استخراج هذا التقرير من منصة نادي تراؤف للبنين لإدارة العمليات.',
    });
  };

  const handleExportDeptEvalsExcel = () => {
    const rows = deptEvaluations.map((ev, i) => {
      const gr = getGradeInfo(ev.percent);
      return {
        'م': i + 1,
        'القسم': ev.departmentName || '—',
        'المستوى': ev.evalLevel === 'program' ? 'مستوى البرنامج' : 'أداء الموظف',
        'البرنامج': ev.programName || ev.targetTitle || '—',
        'الفقرة الفرعية': ev.subProgramName || '—',
        'الموظف المقيّم': ev.evaluatedEmployeeName || '—',
        'التاريخ': ev.execDate || ev.evaluationDate || '—',
        'النسبة المئوية': `${ev.percent}%`,
        'التقدير': gr.label,
        'المقيّم': ev.evaluatorName || '—',
        'الملاحظات': ev.notes || ev.recommendations || '—',
        'تاريخ التقييم': formatDateTimeAr(ev.createdAt),
      };
    });
    exportEvaluationsToExcel(rows, 'تقييمات_القسم', 'تقرير_تقييمات_القسم_نادي_تراؤف.xlsx');
  };

  const handleExportDeptStaffExcel = () => {
    const rows = deptStaffScores.map((item, i) => {
      const gr = item.avgScore !== null ? getGradeInfo(item.avgScore) : null;
      return {
        'م': i + 1,
        'الموظف': item.employee.name,
        'المسمى الوظيفي': item.employee.jobTitle,
        'القسم': item.employee.departmentName,
        'عدد التقييمات': item.evalCount,
        'المعدل العام': item.avgScore !== null ? `${item.avgScore}%` : 'لا يوجد تقييم',
        'التقدير': gr ? gr.label : '—',
      };
    });
    exportEvaluationsToExcel(rows, 'ترتيب_موظفي_القسم', 'تقرير_أداء_موظفي_القسم_نادي_تراؤف.xlsx');
  };

  const handlePrintDeptReportPdf = () => {
    const deptName =
      targetDeptId === 'all'
        ? 'جميع الأقسام الأربعة'
        : state.departments.find((d) => d.id === targetDeptId)?.name || 'القسم';
    printEvaluationsReport({
      title: `تقرير مؤشرات وتقييمات ${deptName}`,
      subtitle: 'نادي تراؤف للبنين — تقرير تقييم البرامج وأداء الكوادر المعتمد',
      stats: [
        { label: 'متوسط أداء القسم', value: deptStats.count > 0 ? `${deptStats.avg}%` : '—', color: getGradeInfo(deptStats.avg).color },
        { label: 'إجمالي التقييمات المرصودة', value: deptStats.count, color: '#00A59B' },
        { label: 'البرامج الممتازة (≥ 90%)', value: deptStats.excellent, color: '#16a34a' },
        { label: 'برامج منفذة تنتظر التقييم', value: unEvaluatedDeptPrograms.length, color: unEvaluatedDeptPrograms.length > 0 ? '#d97706' : '#16a34a' },
      ],
      columns: [
        { key: '#', label: 'م', width: '35px' },
        { key: 'title', label: 'البرنامج / التكليف', align: 'right' },
        { key: 'targetEmp', label: 'الموظف / المسؤول' },
        { key: 'date', label: 'التاريخ' },
        { key: 'percent', label: 'النسبة', isScore: true },
        { key: 'grade', label: 'التقدير' },
        { key: 'evaluator', label: 'المقيّم' },
      ],
      rows: deptEvaluations.map((ev) => {
        const gr = getGradeInfo(ev.percent);
        return {
          title: (ev.programName || ev.targetTitle || '—') + (ev.subProgramName ? ` (↳ ${ev.subProgramName})` : ''),
          targetEmp: ev.evaluatedEmployeeName || ev.leadEmployeeName || '—',
          date: ev.execDate || ev.evaluationDate || '—',
          percent: ev.percent,
          grade: gr.label,
          evaluator: ev.evaluatorName || '—',
        };
      }),
      notes: `تم اعتماد تقرير أداء ${deptName} وفق المعايير التشغيلية المعتمدة بنادي تراؤف للبنين.`,
    });
  };

  const handleExportClubAnalyticsExcel = () => {
    const rows = clubStats.deptBreakdown.map((d, i) => {
      const gr = d.count > 0 ? getGradeInfo(d.avg) : { label: 'قيد التقييم' };
      return {
        'م': i + 1,
        'القسم': d.dept.name,
        'عدد البرامج والأنشطة المقيّمة': d.count,
        'المعدل التراكمي العام': d.count > 0 ? `${d.avg}%` : '—',
        'التقدير المؤسسي': gr.label,
      };
    });
    exportEvaluationsToExcel(rows, 'المقارنة_المعيارية', 'المقارنة_المعيارية_لأقسام_نادي_تراؤف.xlsx');
  };

  const handlePrintClubAnalyticsPdf = () => {
    printEvaluationsReport({
      title: 'التقرير التحليلي الشامل لمؤشرات التقييم المؤسسي',
      subtitle: 'نادي تراؤف للبنين — المقارنة المعيارية للأقسام والانضباط الميداني',
      stats: [
        { label: 'المعدل التراكمي العام للنادي', value: clubStats.count > 0 ? `${clubStats.avg}%` : '—', color: getGradeInfo(clubStats.avg).color },
        { label: 'إجمالي التقييمات المنجزة', value: clubStats.count, color: '#00A59B' },
        { label: 'مؤشر الانضباط والتواجد الميداني', value: `${supervisionPresenceAnalytics.complianceRate}%`, color: '#8CC240' },
        { label: 'الأقسام المشمولة', value: 4, color: '#6366f1' },
      ],
      columns: [
        { key: '#', label: 'م', width: '35px' },
        { key: 'deptName', label: 'القسم', align: 'right' },
        { key: 'count', label: 'البرامج المقيّمة' },
        { key: 'avg', label: 'المعدل التراكمي', isScore: true },
        { key: 'grade', label: 'التقدير المؤسسي' },
      ],
      rows: clubStats.deptBreakdown.map((d) => {
        const gr = d.count > 0 ? getGradeInfo(d.avg) : { label: 'قيد التقييم' };
        return {
          deptName: d.dept.name,
          count: d.count,
          avg: d.count > 0 ? d.avg : null,
          grade: gr.label,
        };
      }),
      notes: 'يشمل التقرير جميع التقييمات المعتمدة للأقسام وتكليفات الإشراف اليومي والتواجد الميداني.',
    });
  };

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Top Banner & Title */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(0,165,155,0.08), rgba(140,194,64,0.07))',
          borderColor: 'rgba(0,165,155,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'var(--brand-teal)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Award size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                  نظام التقييم الشامل والمتابعة الميدانية
                </h2>
                <span className="version-badge">الموقع المرجعي الموحد</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                تقييم موحد للبرامج والفقرات الفرعية (↳) والإشراف اليومي والتكليفات الميدانية وفق الهوية المعتمدة
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              صلاحية التقييم: <strong style={{ color: 'var(--brand-teal)' }}>{evalMe?.canEvaluate ? 'مفوّض بالتقييم' : 'للقراءة والمشاهدة'}</strong>
            </div>
          </div>
        </div>

        {bannerMsg && (
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.6rem 0.9rem',
              borderRadius: 8,
              background: 'rgba(22,163,74,0.1)',
              border: '1px solid #86efac',
              color: '#166534',
              fontSize: '0.82rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={15} />
              <span>{bannerMsg}</span>
            </div>
            <button type="button" className="icon-btn" onClick={() => setBannerMsg(null)}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Main Navigation Tabs */}
      <div className="tabs-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'supervision_platform' ? 'active' : ''}`}
          onClick={() => setActiveTab('supervision_platform')}
        >
          <Eye size={15} />
          <span>👁️ تقييم الإشراف اليومي (نموذج القيادات)</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'my_evals' ? 'active' : ''}`}
          onClick={() => setActiveTab('my_evals')}
        >
          <User size={15} />
          <span>تقييماتي ({myEvaluations.length})</span>
        </button>

        {canSeeDeptTab && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'dept_evals' ? 'active' : ''}`}
            onClick={() => setActiveTab('dept_evals')}
          >
            <Building2 size={15} />
            <span>تقييمات القسم ومتابعة البرامج ({deptEvaluations.length})</span>
            {unEvaluatedDeptPrograms.length > 0 && (
              <span className="nav-badge warn">{unEvaluatedDeptPrograms.length}</span>
            )}
          </button>
        )}

        {canSeeClubTab && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'club_analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('club_analytics')}
          >
            <BarChart3 size={15} />
            <span>مؤشرات النادي والتقارير المقارنة</span>
          </button>
        )}

        {canSeeSettingsTab && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'admin_settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin_settings')}
          >
            <ShieldCheck size={15} />
            <span>إدارة المعايير والصلاحيات والتدقيق</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: SUPERVISION LEADERSHIP PLATFORM (GAS Match) */}
      {/* ========================================================================= */}
      {activeTab === 'supervision_platform' && (
        <SupervisionLeadershipPlatform
          onOpenEvaluationModal={onOpenEvaluationModal}
          canEditSupervision={isAdmin || isClubDirector}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 1: تقييماتي (My Evaluations Dashboard) */}
      {/* ========================================================================= */}
      {activeTab === 'my_evals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Personal KPI Scorecards */}
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-label">معدل أدائي العام المعتمد</div>
              <div className="kpi-value" style={{ color: getGradeInfo(myStats.avg).color }}>
                {myStats.count > 0 ? `${myStats.avg}%` : '—'}
              </div>
              <div className="kpi-sub">
                {myStats.count > 0 ? `التقدير العام: ${getGradeInfo(myStats.avg).label}` : 'لا توجد تقييمات مرصودة بعد'}
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">إجمالي التقييمات المرصودة</div>
              <div className="kpi-value" style={{ color: 'var(--brand-teal)' }}>{myStats.count}</div>
              <div className="kpi-sub">عبر جميع البرامج والأنشطة والإشراف</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">برامج وفعاليات قدتها</div>
              <div className="kpi-value" style={{ color: '#6366f1' }}>{myStats.ledCount}</div>
              <div className="kpi-sub">تقييم البرنامج العام كمسؤول مباشر</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">مشاركات وتكليفات وإشراف</div>
              <div className="kpi-value" style={{ color: '#8CC240' }}>{myStats.partCount + myStats.supCount}</div>
              <div className="kpi-sub">{myStats.supCount} تكليف إشراف ميداني + {myStats.partCount} مشاركة</div>
            </div>
          </div>

          {/* Strengths & Development Opportunities Insights */}
          {(myAggregatedStrengths.length > 0 || myAggregatedImprovements.length > 0) && (
            <div className="comparison-grid">
              <div className="card" style={{ borderColor: '#86efac', background: 'rgba(22,163,74,0.03)' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#16a34a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} />
                  <span>أبرز نقاط القوة والتميز التي رصدها المقيمون:</span>
                </div>
                {myAggregatedStrengths.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>لا توجد نقاط قوة مدونة بعد.</div>
                ) : (
                  <ul style={{ paddingRight: '1.2rem', margin: 0, fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {myAggregatedStrengths.slice(0, 5).map((txt, idx) => (
                      <li key={idx}>"{txt}"</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card" style={{ borderColor: '#fde68a', background: 'rgba(217,119,6,0.03)' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#d97706', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={16} />
                  <span>فرص التحسين والتوصيات المهنية المقترحة:</span>
                </div>
                {myAggregatedImprovements.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>لا توجد ملاحظات تحسين مدونة بعد.</div>
                ) : (
                  <ul style={{ paddingRight: '1.2rem', margin: 0, fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {myAggregatedImprovements.slice(0, 5).map((txt, idx) => (
                      <li key={idx}>"{txt}"</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* List of Personal Evaluations */}
          <div className="card">
            <div
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={17} color="var(--brand-teal)" />
                <span>سجل التقييمات التفصيلية الخاصة بي ({myEvaluations.length}):</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleExportMyEvalsExcel}
                  title="تصدير تقييماتي الشخصية إلى ملف إكسل"
                >
                  <Download size={14} />
                  <span>تصدير إكسل (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handlePrintMyEvalsPdf}
                  title="طباعة التقرير الشخصي أو حفظه كملف PDF"
                >
                  <Printer size={14} />
                  <span>طباعة / PDF</span>
                </button>
              </div>
            </div>

            {/* Bulk Selection Bar for Personal Evaluations */}
            {canDeleteEvals && myEvaluations.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-muted, #f8fafc)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  marginBottom: 10,
                  fontSize: '0.82rem',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={myEvaluations.length > 0 && myEvaluations.every((ev) => selectedEvalIds.includes(ev.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEvalIds((prev) => [...new Set([...prev, ...myEvaluations.map((ev) => ev.id)])]);
                      } else {
                        const myIds = new Set(myEvaluations.map((ev) => ev.id));
                        setSelectedEvalIds((prev) => prev.filter((id) => !myIds.has(id)));
                      }
                    }}
                  />
                  <span>تحديد كل تقييماتي ({myEvaluations.length})</span>
                </label>

                {myEvaluations.some((ev) => selectedEvalIds.includes(ev.id)) && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#dc2626', color: '#fff', padding: '4px 10px', fontSize: '0.78rem' }}
                    onClick={() => handleBulkDeleteClick(myEvaluations)}
                  >
                    <Trash2 size={13} />
                    <span>حذف المحدد ({myEvaluations.filter((ev) => selectedEvalIds.includes(ev.id)).length})</span>
                  </button>
                )}
              </div>
            )}

            {myEvaluations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                لم يتم رصد تقييمات مسجلة باسمك حتى الآن.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myEvaluations.map((ev) => {
                  const gr = getGradeInfo(ev.percent);
                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: '1rem',
                        borderRadius: 12,
                        background: 'var(--bg)',
                        border: selectedEvalIds.includes(ev.id) ? '1.5px solid #dc2626' : '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {canDeleteEvals && (
                            <input
                              type="checkbox"
                              checked={selectedEvalIds.includes(ev.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEvalIds((prev) => [...prev, ev.id]);
                                } else {
                                  setSelectedEvalIds((prev) => prev.filter((id) => id !== ev.id));
                                }
                              }}
                              title="تحديد للحذف"
                            />
                          )}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong style={{ fontSize: '0.92rem' }}>{ev.programName || ev.targetTitle}</strong>
                              {ev.subProgramName && (
                                <span className="status-badge badge-pending" style={{ fontSize: '0.7rem' }}>
                                  ↳ الفقرة: {ev.subProgramName}
                                </span>
                              )}
                              <DepartmentPill deptId={ev.departmentId} deptName={ev.departmentName} departments={state.departments} />
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              التاريخ: <strong>{ev.execDate || ev.evaluationDate}</strong> {ev.dayName ? `(${ev.dayName})` : ''} • الفترة: {ev.periodName || ev.periodKey || '—'} • الموقع: {ev.venueName || ev.location || '—'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: gr.color }}>
                              {ev.percent}%
                            </div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: gr.color }}>
                              {gr.label}
                            </div>
                          </div>
                          {canDeleteEvals && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ color: '#dc2626' }}
                              onClick={() => handleSingleDelete(ev)}
                              title="حذف هذا التقييم"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Criteria scores breakdown */}
                      {ev.scores && ev.scores.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {ev.scores.map((sc, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border)',
                                fontSize: '0.73rem',
                              }}
                            >
                              {sc.name}: <strong>{sc.score}</strong>/{sc.max}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes & Feedback */}
                      {(ev.strengths || ev.improvements || ev.recommendations || ev.notes) && (
                        <div style={{ fontSize: '0.79rem', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {ev.strengths && (
                            <div>
                              <strong style={{ color: '#16a34a' }}>• نقاط القوة:</strong> {ev.strengths}
                            </div>
                          )}
                          {ev.improvements && (
                            <div>
                              <strong style={{ color: '#d97706' }}>• فرص التحسين:</strong> {ev.improvements}
                            </div>
                          )}
                          {ev.recommendations && (
                            <div>
                              <strong style={{ color: 'var(--brand-teal)' }}>• التوصيات:</strong> {ev.recommendations}
                            </div>
                          )}
                          {ev.notes && (
                            <div style={{ color: 'var(--text-muted)' }}>
                              <strong>• ملاحظات:</strong> {ev.notes}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attachment URL if available */}
                      {ev.attachmentUrl && (
                        <div style={{ marginTop: 4 }}>
                          <a
                            href={ev.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          >
                            <ExternalLink size={12} />
                            <span>عرض المرفق / الشاهد ({ev.attachmentName || 'رابط المرفق'})</span>
                          </a>
                        </div>
                      )}

                      <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>المقيّم: {ev.evaluatorName} ({ev.evaluatorRoleLabel})</span>
                        <span>{formatDateTimeAr(ev.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: تقييمات القسم ومتابعة البرامج (Department Evaluations) */}
      {/* ========================================================================= */}
      {activeTab === 'dept_evals' && canSeeDeptTab && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Department Selector (for Club Director & Admin) */}
          {(isAdmin || isClubDirector) && (
            <div className="card" style={{ padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={18} color="var(--brand-teal)" />
                <span style={{ fontWeight: 800 }}>اختيار القسم للمعاينة والتقييم:</span>
              </div>
              <select
                className="form-select"
                style={{ width: 280 }}
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
              >
                <option value="all">جميع الأقسام الأربعة بالنادي</option>
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Department KPI Banner */}
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-label">متوسط تقييم القسم</div>
              <div className="kpi-value" style={{ color: getGradeInfo(deptStats.avg).color }}>
                {deptStats.count > 0 ? `${deptStats.avg}%` : '—'}
              </div>
              <div className="kpi-sub">التقدير: {getGradeInfo(deptStats.avg).label}</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">التقييمات المرصودة بالقسم</div>
              <div className="kpi-value" style={{ color: 'var(--brand-teal)' }}>{deptStats.count}</div>
              <div className="kpi-sub">برامج وفقرات فرعية ومشاركات</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">برامج منفذة لم تُقيّم بعد</div>
              <div className="kpi-value" style={{ color: unEvaluatedDeptPrograms.length > 0 ? '#d97706' : '#16a34a' }}>
                {unEvaluatedDeptPrograms.length}
              </div>
              <div className="kpi-sub">تتطلب استكمال التقييم من المسؤول</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">البرامج الممتازة (≥ 90%)</div>
              <div className="kpi-value" style={{ color: '#16a34a' }}>{deptStats.excellent}</div>
              <div className="kpi-sub">تحقق أعلى معايير الجودة</div>
            </div>
          </div>

          {/* Alert: Un-Evaluated Executed Programs (Actionable Callout) */}
          {unEvaluatedDeptPrograms.length > 0 && (
            <div
              className="card"
              style={{
                borderColor: '#fde68a',
                background: 'rgba(217,119,6,0.06)',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertCircle size={18} color="#d97706" />
                <strong style={{ color: '#b45309', fontSize: '0.92rem' }}>
                  تنبيه تشغيلي: يوجد ({unEvaluatedDeptPrograms.length}) برامج منفذة بالقسم لم يتم تقييمها بعد!
                </strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                {unEvaluatedDeptPrograms.map((prog) => (
                  <div
                    key={prog.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 10,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>{prog.programName}</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                        {prog.executionDate} ({prog.day}) • {prog.departmentName}
                      </div>
                    </div>
                    {onOpenEvaluationModal && (
                      <button
                        type="button"
                        className="btn btn-sm btn-teal"
                        onClick={() => onOpenEvaluationModal({ target: prog, initialLevel: 'program' })}
                      >
                        <Sparkles size={13} />
                        <span>تقييم الآن</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department Staff Ranking & Performance Cards */}
          <div className="card">
            <div
              style={{
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={17} color="var(--brand-teal)" />
                <span>مؤشرات أداء موظفي القسم ({deptStaffScores.length} موظفًا):</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={handleExportDeptStaffExcel}
                title="تصدير ترتيب وأداء موظفي القسم إلى ملف إكسل"
              >
                <Download size={14} />
                <span>تصدير إكسل (.xlsx)</span>
              </button>
            </div>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>المسمى الوظيفي</th>
                    <th>القسم</th>
                    <th>عدد التقييمات</th>
                    <th>المعدل العام</th>
                    <th>التقدير</th>
                  </tr>
                </thead>
                <tbody>
                  {deptStaffScores.map(({ employee, evalCount, avgScore }) => {
                    const gr = avgScore !== null ? getGradeInfo(avgScore) : null;
                    return (
                      <tr key={employee.id}>
                        <td style={{ fontWeight: 800 }}>{employee.name}</td>
                        <td>{employee.jobTitle}</td>
                        <td>{employee.departmentName}</td>
                        <td>{evalCount}</td>
                        <td style={{ fontWeight: 900, color: gr ? gr.color : 'var(--text-muted)' }}>
                          {avgScore !== null ? `${avgScore}%` : '—'}
                        </td>
                        <td>
                          {gr ? (
                            <span className="status-badge" style={{ background: gr.bg, color: gr.color, fontWeight: 800 }}>
                              {gr.label}
                            </span>
                          ) : (
                            <span className="status-badge badge-muted">لا يوجد تقييم</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Department Evaluation History */}
          <div className="card">
            <div
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={17} color="var(--brand-teal)" />
                <span>سجل تقييمات برامج وأنشطة القسم ({deptEvaluations.length}):</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleExportDeptEvalsExcel}
                  title="تصدير تقييمات القسم إلى ملف إكسل"
                >
                  <Download size={14} />
                  <span>تصدير إكسل (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handlePrintDeptReportPdf}
                  title="طباعة التقرير الشامل للقسم أو حفظه كملف PDF"
                >
                  <Printer size={14} />
                  <span>طباعة / PDF</span>
                </button>
              </div>
            </div>

            {/* Bulk Selection Bar for Department Evaluations */}
            {canDeleteEvals && deptEvaluations.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-muted, #f8fafc)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  marginBottom: 10,
                  fontSize: '0.82rem',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={deptEvaluations.length > 0 && deptEvaluations.every((ev) => selectedEvalIds.includes(ev.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEvalIds((prev) => [...new Set([...prev, ...deptEvaluations.map((ev) => ev.id)])]);
                      } else {
                        const dIds = new Set(deptEvaluations.map((ev) => ev.id));
                        setSelectedEvalIds((prev) => prev.filter((id) => !dIds.has(id)));
                      }
                    }}
                  />
                  <span>تحديد كل تقييمات القسم ({deptEvaluations.length})</span>
                </label>

                {deptEvaluations.some((ev) => selectedEvalIds.includes(ev.id)) && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#dc2626', color: '#fff', padding: '4px 10px', fontSize: '0.78rem' }}
                    onClick={() => handleBulkDeleteClick(deptEvaluations)}
                  >
                    <Trash2 size={13} />
                    <span>حذف المحدد ({deptEvaluations.filter((ev) => selectedEvalIds.includes(ev.id)).length})</span>
                  </button>
                )}
              </div>
            )}

            {deptEvaluations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                لا توجد تقييمات مرصودة لهذا القسم بعد.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deptEvaluations.map((ev) => {
                  const gr = getGradeInfo(ev.percent);
                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: 10,
                        background: 'var(--bg)',
                        border: selectedEvalIds.includes(ev.id) ? '1.5px solid #dc2626' : '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {canDeleteEvals && (
                          <input
                            type="checkbox"
                            checked={selectedEvalIds.includes(ev.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEvalIds((prev) => [...prev, ev.id]);
                              } else {
                                setSelectedEvalIds((prev) => prev.filter((id) => id !== ev.id));
                              }
                            }}
                            title="تحديد للحذف"
                          />
                        )}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: '0.88rem' }}>{ev.programName || ev.targetTitle}</strong>
                            {ev.subProgramName && (
                              <span className="status-badge badge-pending" style={{ fontSize: '0.68rem' }}>
                                ↳ الفقرة: {ev.subProgramName}
                              </span>
                            )}
                            <span className="status-badge badge-approved" style={{ fontSize: '0.68rem' }}>
                              {ev.evalLevel === 'program' ? 'مستوى البرنامج' : `أداء: ${ev.evaluatedEmployeeName || 'الموظف'}`}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {ev.departmentName} • {ev.execDate || ev.evaluationDate} • المقيّم: {ev.evaluatorName} ({ev.evaluatorRoleLabel || 'مقيّم'})
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          className="status-badge"
                          style={{
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            padding: '4px 10px',
                            background: gr.bg,
                            color: gr.color,
                          }}
                        >
                          {ev.percent}% — {gr.label}
                        </span>
                        {canDeleteEvals && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleSingleDelete(ev)}
                            title="حذف هذا التقييم"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: مؤشرات النادي والتقارير المقارنة (Club Analytics) */}
      {/* ========================================================================= */}
      {activeTab === 'club_analytics' && canSeeClubTab && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Top Club KPI Grid */}
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-label">المعدل التراكمي العام لنادي تراؤف</div>
              <div className="kpi-value" style={{ color: getGradeInfo(clubStats.avg).color }}>
                {clubStats.count > 0 ? `${clubStats.avg}%` : '—'}
              </div>
              <div className="kpi-sub">التقدير المؤسسي العام: {getGradeInfo(clubStats.avg).label}</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">إجمالي التقييمات بالنادي</div>
              <div className="kpi-value" style={{ color: 'var(--brand-teal)' }}>{clubStats.count}</div>
              <div className="kpi-sub">عبر جميع الأقسام الأربعة والتكليفات</div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">مؤشر الانضباط والتواجد الميداني الإشرافي</div>
              <div className="kpi-value" style={{ color: '#8CC240' }}>
                {supervisionPresenceAnalytics.total > 0 ? `${supervisionPresenceAnalytics.complianceRate}%` : '100%'}
              </div>
              <div className="kpi-sub">
                {supervisionPresenceAnalytics.active} فاعل + {supervisionPresenceAnalytics.inactive} بدون فاعلية
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-label">الأقسام المشمولة</div>
              <div className="kpi-value" style={{ color: '#6366f1' }}>4</div>
              <div className="kpi-sub">البناء التربوي، الدعم العلمي، التحفيز، المواهب</div>
            </div>
          </div>

          {/* Department Comparison Cards (Inter-Department Benchmarking) */}
          <div className="card">
            <div
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={18} color="var(--brand-teal)" />
                <span>المقارنة المعيارية الشاملة بين أقسام النادي:</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleExportClubAnalyticsExcel}
                  title="تصدير مقارنة الأقسام إلى ملف إكسل"
                >
                  <Download size={14} />
                  <span>تصدير إكسل (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handlePrintClubAnalyticsPdf}
                  title="طباعة التقرير التحليلي المؤسسي أو حفظه كملف PDF"
                >
                  <Printer size={14} />
                  <span>طباعة / PDF</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {clubStats.deptBreakdown.map(({ dept, count, avg }) => {
                const gr = count > 0 ? getGradeInfo(avg) : { label: 'قيد التقييم', color: 'var(--text-muted)', bg: 'var(--bg)' };
                return (
                  <div
                    key={dept.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 12,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{dept.name}</strong>
                      <DepartmentPill deptId={dept.id} departments={state.departments} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: '1.6rem', fontWeight: 900, color: gr.color }}>
                        {count > 0 ? `${avg}%` : '—'}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: gr.color }}>
                        ({gr.label})
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      البرامج والأنشطة المقيّمة: <strong>{count}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Supervision Presence Breakdown (Reference Site Alignment) */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={18} color="var(--brand-teal)" />
              <span>تحليل حالات التواجد في الإشراف اليومي (حسب الموقع المرجعي):</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(22,163,74,0.06)', border: '1px solid #86efac' }}>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700 }}>موجود بفاعلية (100%)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#16a34a', marginTop: 2 }}>
                  {supervisionPresenceAnalytics.active}
                </div>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(217,119,6,0.06)', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 700 }}>موجود دون فاعلية (60%)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#d97706', marginTop: 2 }}>
                  {supervisionPresenceAnalytics.inactive}
                </div>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid #fca5a5' }}>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700 }}>غير موجود / غياب (0%)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#dc2626', marginTop: 2 }}>
                  {supervisionPresenceAnalytics.absent}
                </div>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>في إجازة / مستأذن</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--brand-ink)', marginTop: 2 }}>
                  {supervisionPresenceAnalytics.excused}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: إدارة المعايير والصلاحيات والتدقيق (Admin Settings) */}
      {/* ========================================================================= */}
      {activeTab === 'admin_settings' && canSeeSettingsTab && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Section 1: Evaluation Criteria Catalog Management */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Award size={18} color="var(--brand-teal)" />
                  <span>دليل معايير التقييم القابلة للإدارة والتحكم ({evalCriteria.length} معيار):</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  تحديد المعايير المعتمدة، درجاتها القصوى، إلزاميتها، والمستويات التي تنطبق عليها (البرنامج / الموظف)
                </div>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  setCriterionModal({
                    id: '',
                    name: '',
                    description: '',
                    maxScore: 10,
                    isRequired: false,
                    levels: ['program'],
                    kinds: [],
                    programTypes: [],
                    sortOrder: evalCriteria.length + 1,
                  })
                }
              >
                <Plus size={14} />
                <span>إضافة معيار جديد</span>
              </button>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>م</th>
                    <th>اسم المعيار</th>
                    <th>الوصف</th>
                    <th>الدرجة القصوى</th>
                    <th>المستوى المطبق</th>
                    <th>الإلزامية</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {evalCriteria.map((crit, idx) => (
                    <tr key={crit.id}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 800 }}>{crit.name}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{crit.description}</td>
                      <td style={{ fontWeight: 800, color: 'var(--brand-teal)' }}>{crit.maxScore} درجة</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {crit.levels?.map((lvl) => (
                            <span key={lvl} className="status-badge badge-approved" style={{ fontSize: '0.68rem' }}>
                              {lvl === 'program' ? 'مستوى البرنامج' : 'أداء الموظف'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {crit.isRequired ? (
                          <span className="status-badge" style={{ background: '#fef2f2', color: '#dc2626', fontWeight: 800 }}>
                            إلزامي
                          </span>
                        ) : (
                          <span className="status-badge badge-muted">اختياري</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setCriterionModal({ ...crit })}
                            title="تعديل المعيار"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleDeleteCriterion(crit)}
                            title="حذف المعيار"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Employee Evaluation Authority & Access Scopes */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={18} color="var(--brand-teal)" />
              <span>مصفوفة صلاحيات التقييم ونطاقات الرؤية لجميع موظفي النادي ({evalAccessList.length || state.employees.length}):</span>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>القسم</th>
                    <th>الدور</th>
                    <th>نطاق الرؤية</th>
                    <th>صلاحية التقييم</th>
                    <th>إدارة النظام</th>
                    <th>تعديل</th>
                  </tr>
                </thead>
                <tbody>
                  {(evalAccessList.length > 0
                    ? evalAccessList
                    : state.employees.map((e) => ({
                        employee_id: e.id,
                        full_name: e.name,
                        department_name: e.departmentName,
                        role_key: e.role,
                        view_scope: e.accessScope || 'self',
                        can_evaluate: ['full_admin', 'custom_admin', 'club_director', 'dept_head'].includes(e.role),
                        can_manage: e.isAdmin,
                      }))
                  ).map((acc) => (
                    <tr key={acc.employee_id}>
                      <td style={{ fontWeight: 800 }}>{acc.full_name}</td>
                      <td>{acc.department_name}</td>
                      <td>{acc.role_key}</td>
                      <td>
                        <span className="status-badge badge-approved">
                          {acc.view_scope === 'system'
                            ? 'كامل النظام'
                            : acc.view_scope === 'club'
                            ? 'جميع تقييمات النادي'
                            : acc.view_scope === 'department'
                            ? 'تقييمات القسم'
                            : 'تقييماتي فقط'}
                        </span>
                      </td>
                      <td>
                        {acc.can_evaluate ? (
                          <span className="status-badge" style={{ background: '#dcfce7', color: '#166534', fontWeight: 800 }}>
                            نعم (مقيّم)
                          </span>
                        ) : (
                          <span className="status-badge badge-muted">لا</span>
                        )}
                      </td>
                      <td>
                        {acc.can_manage ? (
                          <span className="status-badge badge-admin">مدير تقييم</span>
                        ) : (
                          <span className="status-badge badge-muted">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() =>
                            setAccessModal({
                              employeeId: acc.employee_id,
                              fullName: acc.full_name,
                              view_scope: acc.view_scope,
                              can_evaluate: acc.can_evaluate,
                              can_manage: acc.can_manage,
                            })
                          }
                          title="تعديل الصلاحيات"
                        >
                          <Edit3 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Immutable Evaluation Audit Trail */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={18} color="var(--brand-teal)" />
              <span>سجل التدقيق غير القابل للتعديل لإجراءات التقييم (Audit Trail):</span>
            </div>

            {evalAuditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                لم يتم تسجيل إجراءات تدقيق بعد.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 350, overflowY: 'auto' }}>
                {evalAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: 8,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      <span>{log.actor_name} ({log.actor_role_key})</span>
                      <span>{formatDateTimeAr(log.created_at)}</span>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--brand-ink)', marginTop: 2 }}>{log.action_type}</div>
                    <div>{log.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Criterion Modal */}
      {criterionModal && (
        <div className="modal-backdrop" onClick={() => setCriterionModal(null)}>
          <div className="modal-panel" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>{criterionModal.id ? 'تعديل معيار تقييم' : 'إضافة معيار تقييم جديد'}</h3>
              <button type="button" className="icon-btn" onClick={() => setCriterionModal(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveCriterion}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">اسم المعيار *</label>
                  <input
                    className="form-input"
                    required
                    value={criterionModal.name}
                    onChange={(e) => setCriterionModal({ ...criterionModal, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">الوصف التفصيلي للمعيار</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={criterionModal.description || ''}
                    onChange={(e) => setCriterionModal({ ...criterionModal, description: e.target.value })}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">الدرجة القصوى *</label>
                    <input
                      type="number"
                      className="form-input"
                      required
                      min={1}
                      max={100}
                      value={criterionModal.maxScore}
                      onChange={(e) => setCriterionModal({ ...criterionModal, maxScore: Number(e.target.value) })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">ترتيب العرض</label>
                    <input
                      type="number"
                      className="form-input"
                      value={criterionModal.sortOrder || 1}
                      onChange={(e) => setCriterionModal({ ...criterionModal, sortOrder: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">المستويات المطبق عليها المعيار:</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
                      <input
                        type="checkbox"
                        checked={criterionModal.levels?.includes('program')}
                        onChange={(e) => {
                          const current = criterionModal.levels || [];
                          const updated = e.target.checked
                            ? [...current, 'program']
                            : current.filter((x) => x !== 'program');
                          setCriterionModal({ ...criterionModal, levels: updated });
                        }}
                      />
                      <span>تقييم البرنامج العام ككل</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
                      <input
                        type="checkbox"
                        checked={criterionModal.levels?.includes('employee')}
                        onChange={(e) => {
                          const current = criterionModal.levels || [];
                          const updated = e.target.checked
                            ? [...current, 'employee']
                            : current.filter((x) => x !== 'employee');
                          setCriterionModal({ ...criterionModal, levels: updated });
                        }}
                      />
                      <span>تقييم أداء الموظف</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
                    <input
                      type="checkbox"
                      checked={criterionModal.isRequired}
                      onChange={(e) => setCriterionModal({ ...criterionModal, isRequired: e.target.checked })}
                    />
                    <strong>معيار إلزامي (لا يمكن إتمام التقييم بدونه)</strong>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCriterionModal(null)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingCriterion}>
                  {savingCriterion ? 'جاري الحفظ...' : 'حفظ المعيار في الإعدادات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Authority Modal */}
      {accessModal && (
        <div className="modal-backdrop" onClick={() => setAccessModal(null)}>
          <div className="modal-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>تعديل صلاحية التقييم للموظف ({accessModal.fullName})</h3>
              <button type="button" className="icon-btn" onClick={() => setAccessModal(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveAccess}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">نطاق رؤية التقييمات *</label>
                  <select
                    className="form-select"
                    value={accessModal.view_scope}
                    onChange={(e) => setAccessModal({ ...accessModal, view_scope: e.target.value })}
                  >
                    <option value="self">تقييماتي فقط (نطاق الموظف الشخصي)</option>
                    <option value="department">تقييمات موظفي وبرامج القسم</option>
                    <option value="club">جميع تقييمات النادي (مدير النادي)</option>
                    <option value="system">كامل صلاحيات النظام (مدير النظام)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
                    <input
                      type="checkbox"
                      checked={accessModal.can_evaluate}
                      onChange={(e) => setAccessModal({ ...accessModal, can_evaluate: e.target.checked })}
                    />
                    <strong>منح صلاحية إجراء التقييم (مقيّم)</strong>
                  </label>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
                    <input
                      type="checkbox"
                      checked={accessModal.can_manage}
                      onChange={(e) => setAccessModal({ ...accessModal, can_manage: e.target.checked })}
                    />
                    <strong>صلاحية إدارة وتعديل إعدادات التقييم والمعايير (Admin)</strong>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAccessModal(null)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingAccess}>
                  {savingAccess ? 'جاري الحفظ...' : 'حفظ وتطبيق الصلاحية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal for Evaluations */}
      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget || bulkDeleteItems)}
        title={
          bulkDeleteItems
            ? `حذف (${bulkDeleteItems.length}) سجلات تقييم محددة`
            : `حذف ${deleteTarget?.entityTitle || 'التقييم'}`
        }
        itemCount={bulkDeleteItems ? bulkDeleteItems.length : 1}
        itemTitles={
          bulkDeleteItems
            ? bulkDeleteItems.map((i) => i.entityTitle)
            : [deleteTarget?.entityTitle].filter(Boolean)
        }
        entityTypeLabel="سجل تقييم ومتابعة ميدانية"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setBulkDeleteItems(null);
        }}
      />
    </div>
  );
}
