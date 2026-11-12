import React, { useState, useMemo } from 'react';
import {
  Shield,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  Filter,
  BarChart3,
  Building2,
  Calendar,
  Clock,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Send,
  MessageSquare,
  Sparkles,
  MapPin,
  RefreshCw,
  Award,
  Printer,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { OperationalFileCard } from './OperationalFilesToolbar';
import { exportEvaluationsToExcel, printEvaluationsReport } from '../engine/evaluationReportsIO';

const STATUS_OPTIONS_NORMAL = [
  { key: 'موجود بفاعلية', label: 'موجود بفاعلية', score: 100, color: '#16a34a', bg: '#e7f4ed', border: '#86efac' },
  { key: 'موجود دون فاعلية', label: 'موجود دون فاعلية', score: 60, color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  { key: 'غير موجود في موقع الإشراف', label: 'غير موجود في موقع الإشراف', score: 0, color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  { key: 'في إجازة / مستأذن', label: 'في إجازة / مستأذن', score: null, color: '#7c3aed', bg: '#f3e8ff', border: '#d8b4fe' },
  { key: 'متغيب عن العمل', label: 'متغيب عن العمل', score: 0, color: '#475467', bg: '#f2f4f7', border: '#cbd5e1' },
];

const STATUS_OPTIONS_SPORTS = [
  { key: 'متواجد ومتفاعل', label: 'متواجد ومتفاعل', score: 100, color: '#16a34a', bg: '#e7f4ed', border: '#86efac' },
  { key: 'متواجد غير متفاعل', label: 'متواجد غير متفاعل', score: -5, color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  { key: 'غير متواجد', label: 'غير متواجد', score: -5, color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  { key: 'بديل داخل الصف', label: 'بديل داخل الصف', score: null, color: '#7c3aed', bg: '#f3e8ff', border: '#d8b4fe' },
];

export default function SupervisionLeadershipPlatform({ onOpenEvaluationModal, canEditSupervision = false }) {
  const {
    state,
    currentUser,
    evaluations = [],
    submitEvaluation,
  } = useOps();

  // Active sub-view: 'evaluate' | 'stats' | 'manager' | 'table'
  const [activeTab, setActiveTab] = useState('evaluate');

  // Form State: Leader & Period selection
  const leadersList = state.supervisionLeaders || [
    'مدير النادي',
    'سعد عوض المطيري',
    'فهد زامل',
    'فيصل كساب العتيبي',
    'مشهور محمد',
  ];

  // Auto-select logged-in user if they are a leader
  const [selectedLeader, setSelectedLeader] = useState(() => {
    if (currentUser?.name && leadersList.includes(currentUser.name)) {
      return currentUser.name;
    }
    return '';
  });

  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedSportsStage, setSelectedSportsStage] = useState('secondary'); // 'secondary' | 'primary' | 'middle'

  // Evaluations in-progress (card-by-card)
  // map: { [supervisorName]: { status: string, note: string, showNote: boolean } }
  const [cardStates, setCardStates] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);

  // Stats tab filters
  const [statDateFrom, setStatDateFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [statDateTo, setStatDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statLeaderFilter, setStatLeaderFilter] = useState('all');
  const [statEmpFilter, setStatEmpFilter] = useState('all');

  // Manager tab observation form
  const [mgrObsType, setMgrObsType] = useState('normal'); // 'normal' | 'sports'
  const [mgrPeriod, setMgrPeriod] = useState('reception');
  const [mgrLocation, setMgrLocation] = useState('');
  const [mgrEmpName, setMgrEmpName] = useState('');
  const [mgrSportsStage, setMgrSportsStage] = useState('primary');
  const [mgrStatus, setMgrStatus] = useState('');
  const [mgrNote, setMgrNote] = useState('');

  // 1. Filtered supervisors for the Stacked Evaluation View
  const supervisorsForEvaluation = useMemo(() => {
    if (!selectedLeader || !selectedPeriod) return [];

    if (selectedPeriod === 'sports') {
      const sportsObj = state.supervisionSportsByStage || {};
      const list = sportsObj[selectedSportsStage] || [];
      return list.map((item, idx) => ({
        id: `sports_${selectedSportsStage}_${idx}`,
        name: item.name,
        className: item.className || 'المرحلة الرياضية',
        floor: 'الرياضي',
        location: item.sportsLabel || 'الصالة الرياضية',
        isSports: true,
      }));
    }

    // Normal period: Filter by leader for this specific period
    const byLeaderPeriod = state.supervisionByLeaderAndPeriod?.[selectedLeader]?.[selectedPeriod];
    if (byLeaderPeriod && Array.isArray(byLeaderPeriod) && byLeaderPeriod.length > 0) {
      return byLeaderPeriod.map((r, idx) => ({
        id: `sup_eval_${idx}`,
        name: r.name,
        className: r.className || '—',
        floor: r.floor || 'الدور الأرضي',
        location: r[selectedPeriod] || r.reception || 'موقع الإشراف',
        systemSupervisor: r.systemSupervisor || '',
      }));
    }

    // Fallback if byLeaderAndPeriod is not loaded: filter state.supervisionDuties directly
    const periodLeaderKey = `${selectedPeriod}Leader`;
    return state.supervisionDuties.filter((s) => {
      if (selectedLeader === 'مدير النادي') return true;
      return s[periodLeaderKey] === selectedLeader;
    }).map((s) => ({
      id: s.id,
      name: s.supervisor || s.name,
      className: s.className || '—',
      floor: s.floor || 'الدور الأرضي',
      location: s[selectedPeriod] || s.reception || 'موقع الإشراف',
      systemSupervisor: s.systemSupervisor || '',
    }));
  }, [selectedLeader, selectedPeriod, selectedSportsStage, state]);

  // Track progress
  const totalCount = supervisorsForEvaluation.length;
  const completedCount = useMemo(() => {
    return supervisorsForEvaluation.filter((s) => cardStates[s.name]?.status).length;
  }, [supervisorsForEvaluation, cardStates]);

  const handleSetStatus = (name, status) => {
    setCardStates((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || {}),
        status,
      },
    }));
  };

  const handleSetNote = (name, note) => {
    setCardStates((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || {}),
        note,
      },
    }));
  };

  const handleToggleNote = (name) => {
    setCardStates((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || {}),
        showNote: !prev[name]?.showNote,
      },
    }));
  };

  // Submit batch evaluation
  const handleSubmitBatch = async () => {
    if (totalCount === 0) return;

    if (selectedPeriod !== 'sports') {
      const missing = supervisorsForEvaluation.find((s) => !cardStates[s.name]?.status);
      if (missing) {
        setBannerMsg({
          type: 'error',
          text: `يوجد مشرف لم يتم تقييمه بعد: «${missing.name}». يرجى تحديد حالة جميع المشرفين قبل الإرسال.`,
        });
        const el = document.getElementById(`card-${missing.name}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    setSubmitting(true);
    setBannerMsg(null);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      let count = 0;

      for (const sup of supervisorsForEvaluation) {
        const cState = cardStates[sup.name];
        if (!cState?.status) continue; // For sports, skip unrated

        const stOption = (selectedPeriod === 'sports' ? STATUS_OPTIONS_SPORTS : STATUS_OPTIONS_NORMAL).find(
          (o) => o.key === cState.status
        );

        await submitEvaluation({
          evalLevel: 'employee',
          targetKind: 'supervision',
          targetId: `sup_${selectedPeriod}_${todayStr}_${sup.name}`,
          targetTitle: `إشراف: ${sup.name} (${selectedPeriod === 'sports' ? 'الرياضي' : selectedPeriod})`,
          evaluatedEmployeeName: sup.name,
          evaluatorName: selectedLeader,
          periodKey: selectedPeriod,
          supervisionStatus: cState.status,
          score: stOption?.score ?? 100,
          percent: typeof stOption?.score === 'number' && stOption.score >= 0 ? stOption.score : 0,
          notes: cState.note || '',
          evaluationDate: todayStr,
          stage: selectedPeriod === 'sports' ? selectedSportsStage : undefined,
          location: sup.location,
        });
        count++;
      }

      setBannerMsg({
        type: 'success',
        text: `تم حفظ وإرسال تقييمات (${count}) مشرفين للفترة بنجاح ✅`,
      });

      // Clear states
      setCardStates({});
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: 'حدث خطأ أثناء حفظ التقييمات: ' + (err?.message || String(err)),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Save Manager Observation
  const handleSaveManagerObs = async () => {
    if (!mgrStatus) {
      alert('يرجى تحديد حالة الرصد.');
      return;
    }
    const empName = mgrObsType === 'sports' ? mgrEmpName : mgrEmpName;
    if (!empName) {
      alert('يرجى اختيار المشرف.');
      return;
    }

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      await submitEvaluation({
        evalLevel: 'employee',
        targetKind: 'supervision',
        targetId: `mgr_obs_${todayStr}_${empName}_${Date.now()}`,
        targetTitle: `رصد مدير النادي: ${empName}`,
        evaluatedEmployeeName: empName,
        evaluatorName: 'مدير النادي',
        periodKey: mgrObsType === 'sports' ? 'sports' : mgrPeriod,
        supervisionStatus: mgrStatus,
        notes: mgrNote,
        evaluationDate: todayStr,
        location: mgrLocation || 'موقع الرصد',
      });
      alert('تم حفظ رصد مدير النادي بنجاح ✅');
      setMgrStatus('');
      setMgrNote('');
    } catch (err) {
      alert('تعذر حفظ الرصد: ' + err.message);
    }
  };

  // 2. Statistics calculations
  const statsList = useMemo(() => {
    const supEvals = evaluations.filter((e) => e.targetKind === 'supervision' && !e.isDeleted);
    // Group by employee name
    const map = {};
    for (const duty of state.supervisionDuties) {
      map[duty.supervisor] = { name: duty.supervisor, total: 0, rated: 0, sumScore: 0, evals: [] };
    }
    for (const ev of supEvals) {
      const name = ev.evaluatedEmployeeName || ev.targetTitle;
      if (!map[name]) map[name] = { name, total: 0, rated: 0, sumScore: 0, evals: [] };
      map[name].total++;
      if (typeof ev.percent === 'number') {
        map[name].rated++;
        map[name].sumScore += ev.percent;
      }
      map[name].evals.push(ev);
    }

    return Object.values(map).map((item) => ({
      ...item,
      percentage: item.rated > 0 ? Math.round((item.sumScore / item.rated) * 10) / 10 : null,
    })).sort((a, b) => {
      if (a.percentage === null) return 1;
      if (b.percentage === null) return -1;
      return b.percentage - a.percentage;
    });
  }, [evaluations, state.supervisionDuties]);

  const handleExportStatsExcel = () => {
    const rows = statsList.map((st, i) => ({
      'م': i + 1,
      'اسم الموظف': st.name,
      'عدد التقييمات المرصودة': st.total,
      'المقيم منها': st.rated,
      'النسبة المئوية العامة': st.percentage !== null ? `${st.percentage}%` : 'غير مقيّم',
      'التقدير':
        st.percentage >= 90
          ? 'ممتاز'
          : st.percentage >= 70
          ? 'جيد جدًا'
          : st.percentage !== null
          ? 'يحتاج تحسين'
          : '—',
    }));
    exportEvaluationsToExcel(rows, 'الأداء_الإشرافي', 'تقرير_الأداء_الإشرافي_اليومي.xlsx');
  };

  const handlePrintStatsPdf = () => {
    const rated = statsList.filter((s) => s.percentage !== null);
    const avg =
      rated.length > 0
        ? `${Math.round((rated.reduce((a, b) => a + b.percentage, 0) / rated.length) * 10) / 10}%`
        : '—';
    printEvaluationsReport({
      title: 'التقرير الشامل للأداء الإشرافي الميداني',
      subtitle: 'نادي تراؤف للبنين — منصة الإشراف اليومي للقيادات',
      stats: [
        { label: 'عدد المشرفين الميدانيين', value: statsList.length, color: '#183b50' },
        { label: 'المشرفون المقيمون', value: rated.length, color: '#16a34a' },
        { label: 'متوسط الأداء العام', value: avg, color: '#00A59B' },
      ],
      columns: [
        { key: '#', label: 'م', width: '40px' },
        { key: 'name', label: 'اسم المشرف الميداني', align: 'right' },
        { key: 'total', label: 'عدد التقييمات' },
        { key: 'percentage', label: 'النسبة العامة', isScore: true },
        { key: 'grade', label: 'التقدير' },
      ],
      rows: statsList.map((s) => ({
        name: s.name,
        total: s.total,
        percentage: s.percentage,
        grade:
          s.percentage >= 90
            ? 'ممتاز'
            : s.percentage >= 70
            ? 'جيد جدًا'
            : s.percentage !== null
            ? 'يحتاج تحسين'
            : '—',
      })),
      notes: 'النسبة العامة تشمل تقييمات الفترات الأربع الميدانية وخصومات الرياضي المعتمدة وفق الآلية الرسمية.',
    });
  };

  const handlePrintDutySchedulePdf = () => {
    printEvaluationsReport({
      title: 'جدول الإشراف اليومي المعتمد',
      subtitle: 'نادي تراؤف للبنين — توزيع المهام والمواقع لجميع القيادات والمشرفين',
      columns: [
        { key: 'rowNumber', label: 'م', width: '35px' },
        { key: 'className', label: 'الصف', width: '45px' },
        { key: 'floor', label: 'الدور' },
        { key: 'supervisor', label: 'المشرف الميداني', align: 'right' },
        { key: 'systemSupervisor', label: 'مشرف النظام' },
        { key: 'reception', label: 'موقع الاستقبال' },
        { key: 'receptionLeader', label: 'قائد الاستقبال' },
        { key: 'maghrib', label: 'المغرب' },
        { key: 'maghribLeader', label: 'قائد المغرب' },
        { key: 'isha', label: 'العشاء' },
        { key: 'ishaLeader', label: 'قائد العشاء' },
        { key: 'dismissal', label: 'الانصراف والحافلات' },
        { key: 'dismissalLeader', label: 'قائد الانصراف' },
      ],
      rows: state.supervisionDuties,
      notes: 'الجدول المعتمد وفق التحديث الرسمي 1448هـ - 2026م بنادي تراؤف للبنين.',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Top Header Card Matching GAS Web App */}
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '1.5rem 1rem',
          background: 'linear-gradient(135deg, #ffffff 0%, #f4f6f8 100%)',
          border: '1.5px solid var(--border)',
          borderRadius: 20,
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--brand-ink)', fontSize: '1.6rem', fontWeight: 800 }}>
          منصة الإشراف اليومي لقيادات نادي تراؤف للبنين
        </h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
          تسجيل ومتابعة تقييم الإشراف اليومي الميداني والرصد الذكي
        </p>
        <div
          style={{
            width: 80,
            height: 4,
            background: 'var(--brand-teal)',
            borderRadius: 99,
            margin: '12px auto 0',
          }}
        />
      </div>

      {/* Navigation Tabs Matching GAS Site (الإشراف اليومي | الإحصائيات | مدير النادي | جدول الإشراف) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'evaluate' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, minWidth: 140, fontWeight: 800, padding: '12px' }}
          onClick={() => setActiveTab('evaluate')}
        >
          <Eye size={17} />
          <span>👁️ تقييم الإشراف اليومي</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'stats' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, minWidth: 140, fontWeight: 800, padding: '12px' }}
          onClick={() => setActiveTab('stats')}
        >
          <BarChart3 size={17} />
          <span>📊 الإحصائيات</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'manager' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, minWidth: 140, fontWeight: 800, padding: '12px' }}
          onClick={() => setActiveTab('manager')}
        >
          <Building2 size={17} />
          <span>🏢 مدير النادي</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'table' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, minWidth: 140, fontWeight: 800, padding: '12px' }}
          onClick={() => setActiveTab('table')}
        >
          <FileText size={17} />
          <span>📋 جدول الإشراف والملفات</span>
        </button>
      </div>

      {bannerMsg && (
        <div
          className={`alert-banner ${bannerMsg.type === 'error' ? 'warn' : 'teal'}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>{bannerMsg.text}</span>
          <button type="button" className="icon-btn" onClick={() => setBannerMsg(null)}>×</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: STACKED EVALUATION FORM (Exact Match to User's Screenshots & GAS App) */}
      {/* ========================================================================= */}
      {activeTab === 'evaluate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 860, margin: '0 auto', width: '100%' }}>
          {/* Header Card: 👀 بيانات الإشراف */}
          <div
            className="card"
            style={{
              padding: '1.25rem',
              borderRadius: 20,
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                background: '#4b806c',
                color: 'white',
                padding: '10px 16px',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: '1.1rem',
                textAlign: 'center',
                marginBottom: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span>👀 بيانات الإشراف</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem', marginBottom: 6 }}>
                  اسم القائد <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <select
                  className="form-select"
                  style={{ height: 48, fontSize: '1rem', fontWeight: 700 }}
                  value={selectedLeader}
                  onChange={(e) => {
                    setSelectedLeader(e.target.value);
                    setCardStates({});
                  }}
                >
                  <option value="">— اختر القائد —</option>
                  {leadersList.map((ldr) => (
                    <option key={ldr} value={ldr}>{ldr}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem', marginBottom: 6 }}>
                  فترة الإشراف <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <select
                  className="form-select"
                  style={{ height: 48, fontSize: '1rem', fontWeight: 700 }}
                  value={selectedPeriod}
                  onChange={(e) => {
                    setSelectedPeriod(e.target.value);
                    setCardStates({});
                  }}
                >
                  <option value="">— اختر الفترة —</option>
                  <option value="reception">استقبال الطلاب</option>
                  <option value="maghrib">قبل صلاة المغرب</option>
                  <option value="isha">قبل صلاة العشاء</option>
                  <option value="dismissal">أثناء الانصراف</option>
                  <option value="sports">🏃 الرياضي</option>
                </select>
              </div>

              {selectedPeriod === 'sports' && (
                <div
                  style={{
                    padding: '1rem',
                    background: 'var(--bg)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <label style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    فترة الرياضي <span style={{ color: '#b91c1c' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    style={{ height: 46 }}
                    value={selectedSportsStage}
                    onChange={(e) => setSelectedSportsStage(e.target.value)}
                  >
                    <option value="secondary">الفترة الأولى - المرحلة الثانوية</option>
                    <option value="primary">الفترة الثانية - المرحلة الابتدائية</option>
                    <option value="middle">الفترة الثالثة - المرحلة المتوسطة</option>
                  </select>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    💡 في الرياضي يمكنك تقييم جميع الموظفين أو بعضهم فقط. الموظف الذي لا تختار له حالة لن يُسجل عليه أي تقييم أو خصم.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress Card Matching Screenshot */}
          {selectedLeader && selectedPeriod && totalCount > 0 && (
            <div
              className="card"
              style={{
                padding: '0.9rem 1.25rem',
                borderRadius: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'white',
              }}
            >
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--brand-ink)' }}>
                التقدم في التقييم:
              </span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  color: completedCount === totalCount ? '#16a34a' : 'var(--brand-teal)',
                }}
              >
                {completedCount} من {totalCount}
              </span>
            </div>
          )}

          {/* Prompt when not selected */}
          {(!selectedLeader || !selectedPeriod) && (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '2.5rem 1rem',
                color: 'var(--text-muted)',
                borderRadius: 16,
                border: '2px dashed var(--border)',
              }}
            >
              <UserCheck size={42} color="var(--brand-teal)" style={{ margin: '0 auto 12px', opacity: 0.7 }} />
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--brand-ink)' }}>
                اختر اسم القائد وفترة الإشراف
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                سيظهر لك مباشرة المشرفون التابعون لنطاق إشرافك في تلك الفترة لتقييمهم تحت بعض بكل سهولة.
              </p>
            </div>
          )}

          {/* Stacked Cards List (Matching Screenshot 1) */}
          {selectedLeader && selectedPeriod && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {supervisorsForEvaluation.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  لا يوجد مشرفون محددون لهذا القائد في هذه الفترة.
                </div>
              ) : (
                supervisorsForEvaluation.map((sup, idx) => {
                  const stateForCard = cardStates[sup.name] || {};
                  const currentStatus = stateForCard.status || '';
                  const showNote = stateForCard.showNote || Boolean(stateForCard.note);
                  const statusList = selectedPeriod === 'sports' ? STATUS_OPTIONS_SPORTS : STATUS_OPTIONS_NORMAL;

                  return (
                    <div
                      key={sup.id || sup.name}
                      id={`card-${sup.name}`}
                      className="card"
                      style={{
                        padding: '1.25rem',
                        borderRadius: 20,
                        border: currentStatus ? '1.5px solid var(--brand-teal)' : '1px solid var(--border)',
                        background: 'white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {/* Supervisor Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 99,
                              background: '#f1f5f9',
                              color: 'var(--brand-ink)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.9rem',
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '1.12rem', color: 'var(--brand-ink)' }}>
                            {sup.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          <span
                            style={{
                              fontSize: '0.74rem',
                              padding: '3px 8px',
                              borderRadius: 8,
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              fontWeight: 700,
                            }}
                          >
                            الدور: {sup.floor}
                          </span>
                          {sup.className && (
                            <span
                              style={{
                                fontSize: '0.74rem',
                                padding: '3px 8px',
                                borderRadius: 8,
                                background: 'var(--bg)',
                                border: '1px solid var(--border)',
                                fontWeight: 700,
                              }}
                            >
                              الصف: {sup.className}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Location Box Matching Screenshot */}
                      {sup.location && (
                        <div
                          style={{
                            background: '#f8fafc',
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1px solid #e2e8f0',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: '#334155',
                          }}
                        >
                          <MapPin size={15} color="#4b806c" />
                          <span>{sup.location}</span>
                        </div>
                      )}

                      {/* Status Selection Grid (2-column layout matching screenshot) */}
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--brand-ink)', marginBottom: 8 }}>
                          حالة التقييم:
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 8,
                          }}
                        >
                          {statusList.map((st) => {
                            const isSelected = currentStatus === st.key;
                            return (
                              <button
                                key={st.key}
                                type="button"
                                onClick={() => handleSetStatus(sup.name, st.key)}
                                style={{
                                  padding: '11px 12px',
                                  borderRadius: 12,
                                  background: isSelected ? st.bg : '#ffffff',
                                  border: isSelected ? `2.5px solid ${st.color}` : `1.5px solid ${st.border}`,
                                  color: st.color,
                                  fontWeight: 800,
                                  fontSize: '0.88rem',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'all 0.15s ease',
                                  boxShadow: isSelected ? `0 2px 6px ${st.bg}` : 'none',
                                }}
                              >
                                {st.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Expandable Note Section */}
                      <div>
                        {!showNote ? (
                          <button
                            type="button"
                            onClick={() => handleToggleNote(sup.name)}
                            style={{
                              width: '100%',
                              padding: '7px 12px',
                              background: '#f8fafc',
                              border: '1px dashed #cbd5e1',
                              borderRadius: 10,
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            + إضافة ملاحظة
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <textarea
                              className="form-input"
                              rows={2}
                              placeholder="اكتب الملاحظة إن وجدت..."
                              style={{ width: '100%', fontSize: '0.85rem' }}
                              value={stateForCard.note || ''}
                              onChange={(e) => handleSetNote(sup.name, e.target.value)}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: '#b91c1c', fontSize: '0.72rem', cursor: 'pointer' }}
                                onClick={() => {
                                  handleSetNote(sup.name, '');
                                  handleToggleNote(sup.name);
                                }}
                              >
                                إخفاء الملاحظة
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Bottom Sticky Submit Bar */}
              {supervisorsForEvaluation.length > 0 && (
                <div
                  style={{
                    position: 'sticky',
                    bottom: 12,
                    zIndex: 20,
                    background: 'white',
                    padding: '1rem',
                    borderRadius: 16,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    border: '1.5px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={20} color={completedCount === totalCount ? '#16a34a' : 'var(--brand-teal)'} />
                    <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                      تم تحديد ({completedCount}) من ({totalCount})
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ minWidth: 200, padding: '12px 24px', fontWeight: 800, fontSize: '1rem' }}
                    disabled={submitting}
                    onClick={handleSubmitBatch}
                  >
                    <Send size={16} />
                    <span>{submitting ? 'جاري الإرسال...' : 'إرسال تقييم الفترة'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STATISTICS & LEADER TRACKING (Matching ?page=stats) */}
      {/* ========================================================================= */}
      {activeTab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Summary Cards */}
          <div className="summary-grid">
            <div className="stat-card">
              <span className="stat-num">{statsList.length}</span>
              <span className="stat-label">عدد المشرفين الميدانيين</span>
            </div>
            <div className="stat-card">
              <span className="stat-num" style={{ color: '#16a34a' }}>
                {statsList.filter((s) => s.percentage !== null).length}
              </span>
              <span className="stat-label">المشرفون المقيمون</span>
            </div>
            <div className="stat-card">
              <span className="stat-num" style={{ color: 'var(--brand-teal)' }}>
                {(() => {
                  const rated = statsList.filter((s) => s.percentage !== null);
                  if (rated.length === 0) return '—';
                  const avg = rated.reduce((acc, c) => acc + c.percentage, 0) / rated.length;
                  return `${Math.round(avg * 10) / 10}%`;
                })()}
              </span>
              <span className="stat-label">متوسط الأداء العام</span>
            </div>
          </div>

          {/* Supervisors Performance Table */}
          <div className="card">
            <div
              className="card-title"
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>التقرير الشامل للأداء الإشرافي حسب الموظفين</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleExportStatsExcel}
                  title="تصدير بيانات الأداء إلى ملف إكسل"
                >
                  <Download size={14} />
                  <span>تصدير إكسل (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handlePrintStatsPdf}
                  title="طباعة التقرير أو حفظه كملف PDF"
                >
                  <Printer size={14} />
                  <span>طباعة / PDF</span>
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>م</th>
                    <th>اسم الموظف</th>
                    <th>عدد التقييمات المرصودة</th>
                    <th>النسبة العامة</th>
                  </tr>
                </thead>
                <tbody>
                  {statsList.map((st, i) => (
                    <tr key={st.name}>
                      <td style={{ fontWeight: 800, textAlign: 'center', width: 50 }}>{i + 1}</td>
                      <td style={{ fontWeight: 800 }}>{st.name}</td>
                      <td style={{ textAlign: 'center' }}>{st.total}</td>
                      <td style={{ textAlign: 'center' }}>
                        {st.percentage !== null ? (
                          <span
                            className="status-badge"
                            style={{
                              background: st.percentage >= 90 ? '#e7f4ed' : st.percentage >= 70 ? '#fff3d8' : '#fce7e6',
                              color: st.percentage >= 90 ? '#1f754d' : st.percentage >= 70 ? '#956700' : '#b42318',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              padding: '4px 12px',
                            }}
                          >
                            {st.percentage}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CLUB DIRECTOR DASHBOARD (Matching ?page=manager) */}
      {/* ========================================================================= */}
      {activeTab === 'manager' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 860, margin: '0 auto', width: '100%' }}>
          <div className="card" style={{ padding: '1.25rem', borderRadius: 20 }}>
            <div
              style={{
                background: '#4b806c',
                color: 'white',
                padding: '10px 16px',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: '1.1rem',
                textAlign: 'center',
                marginBottom: '1.2rem',
              }}
            >
              📝 رصد ملاحظة ميدانية لمدير النادي
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                  نوع الرصد <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <select
                  className="form-select"
                  value={mgrObsType}
                  onChange={(e) => setMgrObsType(e.target.value)}
                >
                  <option value="normal">الإشراف اليومي</option>
                  <option value="sports">🏃 الرياضي</option>
                </select>
              </div>

              {mgrObsType === 'normal' ? (
                <>
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                      فترة الإشراف <span style={{ color: '#b91c1c' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={mgrPeriod}
                      onChange={(e) => setMgrPeriod(e.target.value)}
                    >
                      <option value="reception">استقبال الطلاب</option>
                      <option value="maghrib">قبل صلاة المغرب</option>
                      <option value="isha">قبل صلاة العشاء</option>
                      <option value="dismissal">أثناء الانصراف</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                      المشرف <span style={{ color: '#b91c1c' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={mgrEmpName}
                      onChange={(e) => setMgrEmpName(e.target.value)}
                    >
                      <option value="">— اختر المشرف —</option>
                      {state.supervisionDuties.map((d) => (
                        <option key={d.id} value={d.supervisor}>
                          {d.supervisor} ({d[mgrPeriod] || d.floor})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                      فترة الرياضي <span style={{ color: '#b91c1c' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={mgrSportsStage}
                      onChange={(e) => setMgrSportsStage(e.target.value)}
                    >
                      <option value="primary">الفترة الأولى - المرحلة الابتدائية</option>
                      <option value="middle">الفترة الثانية - المرحلة المتوسطة</option>
                      <option value="secondary">الفترة الثالثة - المرحلة الثانوية</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                      المشرف <span style={{ color: '#b91c1c' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={mgrEmpName}
                      onChange={(e) => setMgrEmpName(e.target.value)}
                    >
                      <option value="">— اختر المشرف —</option>
                      {(state.supervisionSportsByStage?.[mgrSportsStage] || []).map((s, idx) => (
                        <option key={idx} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                  حالة الرصد <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {(mgrObsType === 'sports' ? STATUS_OPTIONS_SPORTS : STATUS_OPTIONS_NORMAL).map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setMgrStatus(st.key)}
                      style={{
                        padding: '10px',
                        borderRadius: 10,
                        background: mgrStatus === st.key ? st.bg : '#ffffff',
                        border: mgrStatus === st.key ? `2px solid ${st.color}` : `1px solid ${st.border}`,
                        color: st.color,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>
                  الملاحظة
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="اكتب الملاحظة هنا..."
                  value={mgrNote}
                  onChange={(e) => setMgrNote(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '12px', fontWeight: 800, fontSize: '1rem' }}
                onClick={handleSaveManagerObs}
              >
                حفظ الرصد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: MASTER SUPERVISION TABLE & EXCEL IMPORT/EXPORT */}
      {/* ========================================================================= */}
      {activeTab === 'table' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <OperationalFileCard fileType="supervision" />

          <div className="card">
            <div
              className="card-title"
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>جدول تكليفات الإشراف اليومي المعتمد ({state.supervisionDuties.length} تكليفًا وموقعًا)</span>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handlePrintDutySchedulePdf}
                title="طباعة أو تصدير جدول الإشراف إلى PDF"
              >
                <Printer size={14} />
                <span>طباعة جدول الإشراف / PDF</span>
              </button>
            </div>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>م</th>
                    <th>الصف</th>
                    <th>الدور</th>
                    <th>المشرف الميداني</th>
                    <th>مشرف النظام</th>
                    <th>الاستقبال</th>
                    <th>قائد الاستقبال</th>
                    <th>المغرب</th>
                    <th>قائد المغرب</th>
                    <th>العشاء</th>
                    <th>قائد العشاء</th>
                    <th>الانصراف والحافلات</th>
                    <th>قائد الانصراف</th>
                  </tr>
                </thead>
                <tbody>
                  {state.supervisionDuties.map((s, idx) => (
                    <tr key={s.id || idx}>
                      <td style={{ fontWeight: 800, textAlign: 'center' }}>{s.rowNumber || idx + 1}</td>
                      <td style={{ fontWeight: 800, textAlign: 'center' }}>{s.className || '—'}</td>
                      <td>{s.floor}</td>
                      <td style={{ fontWeight: 800, color: 'var(--brand-ink)' }}>{s.supervisor || s.name}</td>
                      <td>{s.systemSupervisor || '—'}</td>
                      <td>{s.reception}</td>
                      <td style={{ fontWeight: 700, color: 'var(--brand-teal)' }}>{s.receptionLeader}</td>
                      <td>{s.maghrib}</td>
                      <td style={{ fontWeight: 700, color: 'var(--brand-teal)' }}>{s.maghribLeader}</td>
                      <td>{s.isha}</td>
                      <td style={{ fontWeight: 700, color: 'var(--brand-teal)' }}>{s.ishaLeader}</td>
                      <td>{s.dismissal}</td>
                      <td style={{ fontWeight: 700, color: 'var(--brand-teal)' }}>{s.dismissalLeader}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
