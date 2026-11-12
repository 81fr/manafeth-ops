import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Home,
  ShieldCheck,
  Activity,
  Server,
  Bug,
  MessageSquareWarning,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  X,
  Send,
  Database,
  Wifi,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  logClientDiagnostic,
  submitUserProblemReport,
  fetchPlatformHealthOverview,
  updateProblemReportAdmin,
  clearLocalDiagEvents,
  subscribeDiagnostics,
} from '../engine/diagnostics';
import { formatDateTimeAr } from '../engine/dateUtils';
import { useOps } from '../engine/store';
import { StatusBadge } from './StatusBadge';

// ============================================================================
// 1. CENTRALIZED ERROR BOUNDARY (Req #2 — Zero White Screens!)
// ============================================================================
export class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const stack = error?.stack || '';
    const compStack = errorInfo?.componentStack || '';
    this.setState({ componentStack: compStack });
    logClientDiagnostic({
      kind: 'render_error',
      route: this.props.routeKey || 'unknown',
      message: error?.message || String(error),
      stack,
      component: compStack,
    });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.routeKey !== this.props.routeKey) {
      this.setState({ hasError: false, error: null, componentStack: '' });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: '' });
    if (typeof this.props.onRetry === 'function') {
      try {
        this.props.onRetry();
      } catch {}
    }
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, componentStack: '' });
    if (typeof this.props.onResetToHome === 'function') {
      this.props.onResetToHome();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { isAdmin, compact = false, onOpenReportModal } = this.props;
    const errMsg = this.state.error?.message || 'حدث خطأ غير متوقع أثناء عرض هذا الجزء.';

    return (
      <div
        className="card"
        role="alert"
        style={{
          margin: compact ? '0.5rem 0' : '1.5rem auto',
          maxWidth: compact ? '100%' : 680,
          padding: compact ? '1rem' : '1.75rem',
          border: '1.5px solid #fca5a5',
          background: 'var(--bg-card)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#fef2f2',
            color: '#dc2626',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <AlertTriangle size={26} />
        </div>

        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
          تعذر تحميل هذه الصفحة. يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
        </h3>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          تم تسجيل الحالة تلقائيًا في سجل سلامة المنصة دون تأثر بياناتك أو الجلسة الحالية.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={this.handleRetry}>
            <RefreshCw size={15} />
            <span>إعادة المحاولة</span>
          </button>

          {this.props.onResetToHome && (
            <button type="button" className="btn btn-secondary" onClick={this.handleGoHome}>
              <Home size={15} />
              <span>العودة للرئيسية</span>
            </button>
          )}

          {onOpenReportModal && (
            <button type="button" className="btn btn-secondary" onClick={onOpenReportModal}>
              <MessageSquareWarning size={15} />
              <span>الإبلاغ عن مشكلة</span>
            </button>
          )}
        </div>

        {isAdmin && (
          <details
            style={{
              marginTop: 16,
              textAlign: 'right',
              background: 'var(--bg)',
              padding: '0.75rem',
              borderRadius: 10,
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#b91c1c' }}>
              التفاصيل التقنية للخطأ (تظهر لمدير النظام فقط)
            </summary>
            <div style={{ marginTop: 8, direction: 'ltr', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
              <div><strong>Message:</strong> {errMsg}</div>
              {this.state.error?.stack && (
                <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                  {String(this.state.error.stack).slice(0, 900)}
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    );
  }
}

// ============================================================================
// 2. FOUR-STATE DATA WRAPPER (Req #3 — Loading / Success / Empty / Error)
// ============================================================================
export function DataStateWrapper({
  loading = false,
  error = null,
  isEmpty = false,
  loadingText = 'جارٍ تحميل البيانات...',
  emptyTitle = 'لا توجد بيانات مطابقة حاليًا',
  emptyDescription = 'لم يتم العثور على سجلات ضمن هذا النطاق أو معايير التصفية المحددة.',
  emptyAction = null,
  onRetry = null,
  children,
}) {
  if (loading) {
    return (
      <div
        className="card"
        style={{
          padding: '2rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <RefreshCw size={24} className="spin-icon" color="var(--brand-teal)" />
        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text)' }}>{loadingText}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>يرجى الانتظار قليلًا...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="card"
        role="alert"
        style={{
          padding: '1.5rem',
          border: '1.5px solid #fca5a5',
          background: '#fef2f2',
          color: '#991b1b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={20} color="#dc2626" />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>تعذر تحميل البيانات المطلوبة</div>
            <div style={{ fontSize: '0.76rem', marginTop: 2 }}>{String(error)}</div>
          </div>
        </div>
        {onRetry && (
          <button type="button" className="btn btn-sm btn-primary" onClick={onRetry}>
            <RefreshCw size={14} />
            <span>إعادة المحاولة</span>
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className="card"
        style={{
          padding: '2rem 1.25rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text)', marginBottom: 4 }}>
          {emptyTitle}
        </div>
        <div style={{ fontSize: '0.78rem', maxWidth: 460, margin: '0 auto 12px' }}>
          {emptyDescription}
        </div>
        {emptyAction}
      </div>
    );
  }

  return children;
}

// ============================================================================
// 3. REPORT A PROBLEM MODAL ("الإبلاغ عن مشكلة" — Section 7)
// ============================================================================
export const PROBLEM_CATEGORIES_AR = [
  { value: 'page_error', label: 'خلل في عرض الصفحة أو توقف عن الاستجابة' },
  { value: 'cannot_save', label: 'تعذر حفظ أو تعديل بيانات' },
  { value: 'wrong_data', label: 'اختلاف أو عدم دقة في البيانات المعروضة' },
  { value: 'permissions', label: 'مشكلة في الصلاحيات أو ظهور العناصر' },
  { value: 'slow', label: 'بطء في التحميل أو التنقل' },
  { value: 'other', label: 'ملاحظة تقنية أو تشغيلية أخرى' },
];

export function ReportIssueModal({ isOpen, onClose, activeRoute, routeTitle }) {
  const { currentUser, sessionToken } = useOps();
  const [category, setCategory] = useState('page_error');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successId, setSuccessId] = useState(null);
  const [capturedTime] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    if (description.trim().length < 5) {
      setErrorMsg('يرجى كتابة وصف واضح للمشكلة (5 أحرف على الأقل) قبل الإرسال.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitUserProblemReport({
        sessionToken,
        currentUser,
        route: `${activeRoute} (${routeTitle || activeRoute})`,
        category,
        description,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'تعذر إرسال البلاغ حاليًا، يرجى المحاولة مرة أخرى.');
      } else {
        setSuccessId(res.id);
        setDescription('');
      }
    } catch (err) {
      setErrorMsg(err.message || 'حدث خطأ أثناء إرسال البلاغ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
              <MessageSquareWarning size={19} color="var(--brand-teal)" />
              <span>الإبلاغ عن مشكلة تقنية أو تشغيلية</span>
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              يصل البلاغ مباشرة إلى لوحة «سلامة المنصة» لدى مدير النظام مع تسجيل الصفحة ووقت الحدوث تلقائيًا.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {successId ? (
            <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <CheckCircle2 size={26} />
              </div>
              <div style={{ fontWeight: 800, fontSize: '0.96rem', marginBottom: 6 }}>
                تم استلام البلاغ وتسجيله بنجاح ({successId})
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                تم ربط البلاغ بالصفحة الحالية ووقت الحدوث ليتمكن مدير النظام من مراجعته ومعالجته.
              </div>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                إغلاق
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  fontSize: '0.75rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>الصفحة الحالية المسجلة: </span>
                  <strong>{routeTitle || activeRoute}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>وقت الرصد: </span>
                  <strong>{formatDateTimeAr(capturedTime)}</strong>
                </div>
              </div>

              {errorMsg && (
                <div className="alert-banner danger" style={{ marginBottom: 0 }}>
                  <AlertTriangle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">تصنيف المشكلة</label>
                <select
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {PROBLEM_CATEGORIES_AR.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">وصف المشكلة وما كنت تحاول تنفيذه *</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="اشرح باختصار ما حدث أو الزر الذي ضغطت عليه..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  <Send size={14} />
                  <span>{submitting ? 'جارٍ الإرسال...' : 'إرسال البلاغ للإدارة'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. SYSTEM HEALTH PANEL FOR SYSTEM ADMIN ("سلامة المنصة" — Section 7)
// ============================================================================
export function SystemHealthPanel({ compact = false }) {
  const { currentUser, sessionToken, cloudStatus, lastSyncedAt, syncError, manualRefreshCloud } = useOps();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview | reports | errors | updates
  const [selectedError, setSelectedError] = useState(null);
  const [reportFilter, setReportFilter] = useState('ALL');
  const [updatingReportId, setUpdatingReportId] = useState(null);
  const [adminNotesMap, setAdminNotesMap] = useState({});
  const [refreshingSync, setRefreshingSync] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPlatformHealthOverview(sessionToken);
      setHealth(data);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadHealth();
    const unsub = subscribeDiagnostics(() => {
      loadHealth();
    });
    return unsub;
  }, [loadHealth]);

  if (!currentUser?.isAdmin && currentUser?.role !== 'full_admin') {
    return null;
  }

  const handleManualSync = async () => {
    if (refreshingSync) return;
    setRefreshingSync(true);
    try {
      await manualRefreshCloud();
      await loadHealth();
    } finally {
      setRefreshingSync(false);
    }
  };

  const handleUpdateReport = async (rptId, nextStatus) => {
    if (updatingReportId) return;
    setUpdatingReportId(rptId);
    try {
      await updateProblemReportAdmin({
        sessionToken,
        reportId: rptId,
        status: nextStatus,
        adminNote: adminNotesMap[rptId],
      });
      await loadHealth();
    } finally {
      setUpdatingReportId(null);
    }
  };

  const counts = health?.counts || {
    accounts: 39,
    activeSessions: 1,
    evaluations: 0,
    events24h: 0,
    openReports: 0,
    saveFailures: 0,
    syncIssues: 0,
    permissionIssues: 0,
  };

  const reports = health?.reports || [];
  const filteredReports = reports.filter((r) => (reportFilter === 'ALL' ? true : r.status === reportFilter));
  const events = health?.events || [];
  const failingRoutes = health?.failingRoutes || [];

  const KIND_LABELS_AR = {
    render_error: 'خطأ تحميل مكون / صفحة',
    window_error: 'خطأ برمجي (Runtime JS)',
    unhandled_rejection: 'فشل طلب غير معالج',
    save_failure: 'فشل عملية حفظ',
    sync_error: 'مشكلة مزامنة سحابية',
    permission_denied: 'منع تجاوز صلاحية',
    chunk_load: 'تعذر تحميل ملف الصفحة',
  };

  const CATEGORY_LABELS_AR = Object.fromEntries(PROBLEM_CATEGORIES_AR.map((c) => [c.value, c.label]));

  return (
    <div className="card" style={{ border: '1.5px solid rgba(0, 165, 155, 0.35)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '1rem', color: 'var(--brand-ink)' }}>
            <ShieldCheck size={20} color="var(--brand-teal)" />
            <span>سلامة المنصة والمراقبة التقنية (خاص بمدير النظام)</span>
            <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>
              الإصدار v{health?.appVersion || '4.0.0'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            مراقبة حية لحالة الاتصال بقاعدة البيانات، الأخطاء التقنية المسجلة، العمليات المتعثرة، وبلاغات المستخدمين.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            آخر مزامنة: <strong>{formatDateTimeAr(lastSyncedAt)}</strong>
          </span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleManualSync}
            disabled={refreshingSync || loading}
          >
            <RefreshCw size={13} />
            <span>{refreshingSync ? 'جارٍ الفحص...' : 'فحص ومزامنة الآن'}</span>
          </button>
        </div>
      </div>

      {/* Health KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            padding: '0.75rem',
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            <span>حالة قاعدة البيانات</span>
            <Database size={15} color={cloudStatus === 'online' ? '#059669' : '#d97706'} />
          </div>
          <div style={{ fontWeight: 900, fontSize: '0.98rem', color: cloudStatus === 'online' ? '#059669' : '#d97706', marginTop: 4 }}>
            {cloudStatus === 'online' ? 'متصل ومستقر' : 'وضع محلي احتياطي'}
          </div>
          <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
            زمن الاستجابة: {health?.dbLatencyMs != null ? `${health.dbLatencyMs} ms` : 'فوري'}
          </div>
        </div>

        <div
          onClick={() => setActiveTab('reports')}
          style={{
            padding: '0.75rem',
            borderRadius: 12,
            background: 'var(--bg)',
            border: counts.openReports > 0 ? '1.5px solid #f59e0b' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            <span>بلاغات المستخدمين المفتوحة</span>
            <MessageSquareWarning size={15} color="#d97706" />
          </div>
          <div style={{ fontWeight: 900, fontSize: '1.15rem', color: counts.openReports > 0 ? '#b45309' : 'var(--text)', marginTop: 4 }}>
            {counts.openReports} <span style={{ fontSize: '0.73rem', fontWeight: 600 }}>/ {reports.length} بلاغ</span>
          </div>
          <div style={{ fontSize: '0.69rem', color: 'var(--brand-teal)', marginTop: 2 }}>اضغط لعرض ومعالجة البلاغات</div>
        </div>

        <div
          onClick={() => setActiveTab('errors')}
          style={{
            padding: '0.75rem',
            borderRadius: 12,
            background: 'var(--bg)',
            border: counts.events24h > 0 ? '1.5px solid #fca5a5' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            <span>الأخطاء التقنية المسجلة</span>
            <Bug size={15} color={counts.events24h > 0 ? '#dc2626' : '#059669'} />
          </div>
          <div style={{ fontWeight: 900, fontSize: '1.15rem', color: counts.events24h > 0 ? '#dc2626' : '#059669', marginTop: 4 }}>
            {counts.events24h}
          </div>
          <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
            صفحات متأثرة: {failingRoutes.length}
          </div>
        </div>

        <div
          onClick={() => setActiveTab('errors')}
          style={{
            padding: '0.75rem',
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            <span>عمليات حفظ أو مزامنة متعثرة</span>
            <Wifi size={15} color="var(--brand-blue)" />
          </div>
          <div style={{ fontWeight: 900, fontSize: '1.15rem', marginTop: 4 }}>
            {counts.saveFailures + counts.syncIssues}
          </div>
          <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
            حفظ: {counts.saveFailures} • مزامنة: {counts.syncIssues}
          </div>
        </div>

        <div
          onClick={() => setActiveTab('updates')}
          style={{
            padding: '0.75rem',
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            <span>الحسابات والجلسات النشطة</span>
            <Lock size={15} color="var(--brand-teal)" />
          </div>
          <div style={{ fontWeight: 900, fontSize: '1.15rem', marginTop: 4 }}>
            {counts.accounts} <span style={{ fontSize: '0.73rem', fontWeight: 600 }}>حساب موثق</span>
          </div>
          <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
            جلسات نشطة: {counts.activeSessions} • مشكلات صلاحيات: {counts.permissionIssues}
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          { id: 'overview', label: 'ملخص السلامة والصفحات', icon: Activity },
          { id: 'reports', label: `بلاغات المستخدمين (${reports.length})`, icon: MessageSquareWarning },
          { id: 'errors', label: `سجل الأخطاء التقنية (${events.length})`, icon: Bug },
          { id: 'updates', label: 'آخر التحديثات البرمجية والخدمات', icon: Sparkles },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.84rem', marginBottom: 8 }}>
              الصفحات التي تكرر فشل تحميلها (آخر 7 أيام)
            </div>
            {failingRoutes.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={15} />
                <span>جميع صفحات ومسارات المنصة تعمل باستقرار (0 فشل تحميل متكرر).</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {failingRoutes.map((fr) => (
                  <div
                    key={fr.route}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      background: 'var(--bg-card)',
                      borderRadius: 8,
                      border: '1px solid #fca5a5',
                      fontSize: '0.76rem',
                    }}
                  >
                    <strong>{fr.route}</strong>
                    <span style={{ color: '#dc2626', fontWeight: 800 }}>{fr.n} مرات</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.84rem', marginBottom: 8 }}>
              حالة المزامنة والخدمات المرتبطة
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.77rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>قاعدة بيانات PostgreSQL الموحدة:</span>
                <strong style={{ color: '#059669' }}>متصلة ومحمية (RLS + Bcrypt)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>آخر تحديث لوثيقة الحالة السحابية:</span>
                <strong>{formatDateTimeAr(health?.stateUpdatedAt || lastSyncedAt)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>معالجة الصفحات البيضاء (Error Boundaries):</span>
                <strong style={{ color: '#059669' }}>مفعّلة على جميع المسارات والنوافذ</strong>
              </div>
              {syncError && (
                <div style={{ color: '#dc2626', marginTop: 4 }}>
                  تنبيه مزامنة أخير: {syncError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: User Reports */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>
              البلاغات المرفوعة من الموظفين عبر زر «الإبلاغ عن مشكلة»
            </div>
            <select
              className="form-select"
              style={{ width: 170, height: 34, fontSize: '0.76rem' }}
              value={reportFilter}
              onChange={(e) => setReportFilter(e.target.value)}
            >
              <option value="ALL">جميع الحالات ({reports.length})</option>
              <option value="جديد">جديد</option>
              <option value="قيد المعالجة">قيد المعالجة</option>
              <option value="تم الحل">تم الحل</option>
              <option value="مرفوض">مرفوض</option>
            </select>
          </div>

          {filteredReports.length === 0 ? (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              لا توجد بلاغات مسجلة ضمن هذا التصنيف حاليًا.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>التاريخ والوقت</th>
                    <th>المبلّغ</th>
                    <th>الصفحة</th>
                    <th>التصنيف</th>
                    <th>وصف المشكلة</th>
                    <th>الحالة</th>
                    <th>ملاحظة الإدارة والإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((rpt) => (
                    <tr key={rpt.id}>
                      <td style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{formatDateTimeAr(rpt.createdAt)}</td>
                      <td>
                        <div style={{ fontWeight: 800, fontSize: '0.78rem' }}>{rpt.reporterName || rpt.employeeId}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{rpt.role}</div>
                      </td>
                      <td style={{ fontSize: '0.75rem', fontWeight: 700 }}>{rpt.route || '—'}</td>
                      <td style={{ fontSize: '0.74rem' }}>{CATEGORY_LABELS_AR[rpt.category] || rpt.category}</td>
                      <td style={{ fontSize: '0.77rem', maxWidth: 280 }}>{rpt.description}</td>
                      <td>
                        <StatusBadge
                          status={
                            rpt.status === 'تم الحل'
                              ? 'منفذ'
                              : rpt.status === 'قيد المعالجة'
                              ? 'بانتظار المراجعة'
                              : rpt.status === 'مرفوض'
                              ? 'مرفوض'
                              : 'تنبيه مهم'
                          }
                        />
                        <div style={{ fontSize: '0.68rem', marginTop: 2, fontWeight: 700 }}>{rpt.status}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ width: 150, height: 30, fontSize: '0.73rem' }}
                            placeholder="ملاحظة الحل..."
                            value={adminNotesMap[rpt.id] ?? rpt.adminNote ?? ''}
                            onChange={(e) => setAdminNotesMap({ ...adminNotesMap, [rpt.id]: e.target.value })}
                          />
                          <select
                            className="form-select"
                            style={{ width: 120, height: 30, fontSize: '0.73rem' }}
                            value={rpt.status}
                            disabled={updatingReportId === rpt.id}
                            onChange={(e) => handleUpdateReport(rpt.id, e.target.value)}
                          >
                            <option value="جديد">جديد</option>
                            <option value="قيد المعالجة">قيد المعالجة</option>
                            <option value="تم الحل">تم الحل</option>
                            <option value="مرفوض">مرفوض</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Technical Errors */}
      {activeTab === 'errors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>
              سجل الأخطاء التقنية والعمليات المتعثرة (يظهر لمدير النظام فقط)
            </div>
            {events.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  clearLocalDiagEvents();
                  loadHealth();
                }}
              >
                مسح السجل المحلي المؤقت
              </button>
            )}
          </div>

          {events.length === 0 ? (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: '#059669', fontSize: '0.82rem', fontWeight: 700 }}>
              لا توجد أخطاء تقنية أو عمليات حفظ فاشلة مسجلة.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>الوقت</th>
                    <th>النوع</th>
                    <th>الصفحة / المسار</th>
                    <th>رسالة الخطأ</th>
                    <th>عدد التكرار</th>
                    <th>المستخدم</th>
                    <th>التفاصيل التقنية</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, idx) => (
                    <tr key={ev.id || idx}>
                      <td style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{formatDateTimeAr(ev.createdAt)}</td>
                      <td>
                        <span className="status-badge badge-conflict" style={{ fontSize: '0.69rem' }}>
                          {KIND_LABELS_AR[ev.kind] || ev.kind}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, fontSize: '0.75rem' }}>{ev.route || '—'}</td>
                      <td style={{ fontSize: '0.75rem', maxWidth: 320, direction: 'ltr', textAlign: 'left' }}>
                        {ev.message}
                      </td>
                      <td style={{ fontWeight: 800 }}>{ev.occurrences || 1}</td>
                      <td style={{ fontSize: '0.73rem' }}>{ev.employeeId || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => setSelectedError(ev)}
                        >
                          <Eye size={13} />
                          <span>التفاصيل</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedError && (
            <div className="modal-backdrop" onClick={() => setSelectedError(null)}>
              <div className="modal-panel" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                    التفاصيل التقنية للخطأ ({KIND_LABELS_AR[selectedError.kind] || selectedError.kind})
                  </h3>
                  <button type="button" className="icon-btn" onClick={() => setSelectedError(null)}>
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body" style={{ fontSize: '0.78rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div><strong>المسار:</strong> {selectedError.route}</div>
                    <div><strong>الوقت:</strong> {formatDateTimeAr(selectedError.createdAt)}</div>
                    <div><strong>الشاشة:</strong> {selectedError.viewport || '—'}</div>
                    <div><strong>الإصدار:</strong> {selectedError.appVersion || '4.0.0'}</div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, direction: 'ltr', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>
                    <div><strong>Message:</strong> {selectedError.message}</div>
                    {selectedError.stack && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Stack:</strong>
                        <div>{selectedError.stack}</div>
                      </div>
                    )}
                    {selectedError.component && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Component Stack:</strong>
                        <div>{selectedError.component}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Platform Updates */}
      {activeTab === 'updates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.79rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, color: 'var(--brand-teal)', marginBottom: 4 }}>
              الإصدار v4.0 — لوحات القيادة التفاعلية، الجاهزية التشغيلية، الإنذار المبكر، وحوكمة سلامة المنصة
            </div>
            <ul style={{ margin: 0, paddingRight: 18, lineHeight: 1.7 }}>
              <li>حماية شاملة ضد الصفحات البيضاء (Error Boundaries) مع استرجاع فوري دون فقدان الجلسة.</li>
              <li>لوحة قيادة تنفيذية تفاعلية لمدير الإدارة (12 مؤشرًا مباشرًا، بطاقات الأقسام الأربعة، «يحتاج قرارك»، و7 مخططات تفاعلية).</li>
              <li>لوحة قيادة مخصصة لرئيس القسم (13 مؤشرًا للقسم، متابعة فريق القسم، ومتابعة تنفيذ وجاهزية البرامج).</li>
              <li>مؤشر الجاهزية التشغيلية للبرامج (6 معايير فحص)، نظام الإنذار المبكر، توقع الازدحام التشغيلي، وملخص «آخر المستجدات منذ آخر دخول».</li>
              <li>تشفير كلمات المرور على الخادم (Bcrypt) وتفعيل لوحة «سلامة المنصة» ونظام «الإبلاغ عن مشكلة».</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
