import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Radio,
  User,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  Table2,
  Sparkles,
  Users,
  Layers,
  MapPin,
  Shield,
  Search,
  BarChart3,
  Clock,
  AlertOctagon,
  Upload,
  Settings,
  Bell,
  History,
  LogOut,
  Moon,
  Sun,
  Menu,
  Plus,
  Copy,
  KeyRound,
  Trash2,
  GraduationCap,
  Award,
  Activity,
  MessageSquareWarning,
  RefreshCw,
} from 'lucide-react';
import { useOps } from './engine/store';
import { hasPermission, canAccessDepartment } from './engine/permissions';
import { setDiagnosticsContext } from './engine/diagnostics';
import {
  PageErrorBoundary,
  ReportIssueModal,
  SystemHealthPanel,
} from './components/ErrorBoundaryAndHealth';
import LoginScreen from './components/LoginScreen';
import ScheduleProgramModal from './components/ScheduleProgramModal';
import ProgramDetailModal from './components/ProgramDetailModal';
import EvaluationModal from './components/EvaluationModal';

import DashboardView from './views/DashboardView';
import LiveOpsCenterView from './views/LiveOpsCenterView';
import MyDayView from './views/MyDayView';
import WeeklyProgramsView from './views/WeeklyProgramsView';
import MonthlyCalendarView from './views/MonthlyCalendarView';
import MasterScheduleView from './views/MasterScheduleView';
import ExceptionsCenterView from './views/ExceptionsCenterView';
import ResourcesViews from './views/ResourcesViews';
import SearchAndReportsView from './views/SearchAndReportsView';
import AdminAndAuditViews from './views/AdminAndAuditViews';
import EvaluationsView from './views/EvaluationsView';

export default function App() {
  const {
    state,
    currentUser,
    userOrgContext,
    submissionWindow,
    logout,
    darkMode,
    setDarkMode,
    cloudStatus,
    lastSyncedAt,
    syncError,
    manualRefreshCloud,
    notifications,
    auditLogs,
  } = useOps();

  const [activeRoute, setActiveRoute] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedExceptionId, setSelectedExceptionId] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [refreshingCloud, setRefreshingCloud] = useState(false);

  useEffect(() => {
    setDiagnosticsContext({ route: activeRoute });
  }, [activeRoute]);

  // Global Schedule / New / Clone Modal
  const [scheduleModal, setScheduleModal] = useState({
    isOpen: false,
    mode: 'schedule_planned',
    occurrence: null,
    execution: null,
    defaultGlobalWeek: null,
  });

  // Global Program Detail Card Modal
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    occurrence: null,
    execution: null,
  });

  // Global Unified Evaluation Modal (v3.0)
  const [evalModal, setEvalModal] = useState({
    isOpen: false,
    target: null,
    initialLevel: null,
    initialEmployeeId: null,
  });

  const openEvaluationModal = ({
    target = null,
    initialLevel = null,
    initialEmployeeId = null,
  }) => {
    setEvalModal({
      isOpen: true,
      target,
      initialLevel,
      initialEmployeeId,
    });
  };

  // Clone picker quick modal
  const [clonePickerOpen, setClonePickerOpen] = useState(false);

  const unreadNotifications = useMemo(() => {
    const uid = currentUser?.id || 'guest';
    return notifications.filter((n) => !(n.readBy || []).includes(uid)).length;
  }, [notifications, currentUser]);

  const unscheduledThisWeekCount = useMemo(() => {
    if (!currentUser) return 0;
    const allDepts = hasPermission(currentUser, 'view_all_club_programs') || currentUser.isAdmin;
    return state.plannedOccurrences.filter(
      (o) =>
        o.plannedGlobalWeek === state.meta.currentGlobalWeek &&
        !o.linkedExecution &&
        (allDepts || canAccessDepartment(currentUser, o.departmentId))
    ).length;
  }, [state.plannedOccurrences, state.meta.currentGlobalWeek, currentUser]);

  const activeExceptionsCount = useMemo(() => {
    return state.exceptionRequests.filter(
      (r) =>
        r.status === 'بانتظار إبداء الرأي' ||
        r.status === 'بانتظار الاعتماد' ||
        (r.status === 'معتمد باستثناء' && !r.allAffectedResolved)
    ).length;
  }, [state.exceptionRequests]);

  const openDiscrepanciesCount = useMemo(
    () => state.dataDiscrepancies.filter((d) => d.status === 'تعارض بيانات يحتاج مراجعة').length,
    [state.dataDiscrepancies]
  );

  const activeTrashCount = useMemo(
    () => (state.deletedItems || []).filter((item) => !item.restoredAt).length,
    [state.deletedItems]
  );

  if (!currentUser) {
    return (
      <LoginScreen
        onLoggedIn={() => {
          setActiveRoute('dashboard');
        }}
      />
    );
  }

  const navigate = (route, extraExId = null) => {
    if (extraExId) setSelectedExceptionId(extraExId);
    setActiveRoute(route);
    setSidebarOpen(false);
  };

  const openScheduleModal = ({
    mode = 'schedule_planned',
    occurrence = null,
    execution = null,
    defaultGlobalWeek = null,
  }) => {
    setScheduleModal({
      isOpen: true,
      mode,
      occurrence,
      execution,
      defaultGlobalWeek,
    });
  };

  const openDetailModal = ({ occurrence = null, execution = null }) => {
    setDetailModal({
      isOpen: true,
      occurrence,
      execution,
    });
  };

  // Granular Permission Flags (Req #4, #44-#48)
  const canCreateNewProgram = hasPermission(currentUser, 'create_program');
  const canSeeWeeklyScheduling =
    hasPermission(currentUser, 'view_dept_programs') ||
    hasPermission(currentUser, 'view_all_club_programs') ||
    hasPermission(currentUser, 'schedule_planned_program');
  const canSeeExceptions =
    hasPermission(currentUser, 'view_exceptions') ||
    hasPermission(currentUser, 'give_opinion') ||
    hasPermission(currentUser, 'approve_exception') ||
    hasPermission(currentUser, 'submit_exception');
  const canSeeEmployees =
    hasPermission(currentUser, 'view_employees') ||
    hasPermission(currentUser, 'edit_employees') ||
    hasPermission(currentUser, 'manage_permissions');
  const canSeeResourcesCatalog =
    hasPermission(currentUser, 'view_dept_programs') ||
    hasPermission(currentUser, 'view_all_club_programs') ||
    hasPermission(currentUser, 'create_resource');
  const canSeeReports = hasPermission(currentUser, 'view_reports');
  const canManagePermissions = hasPermission(currentUser, 'manage_permissions');
  const canViewAdminSettings =
    hasPermission(currentUser, 'view_admin_settings') ||
    hasPermission(currentUser, 'edit_timetable') ||
    hasPermission(currentUser, 'edit_org_structure');
  const canEditPlan = hasPermission(currentUser, 'edit_plan') || canViewAdminSettings;
  const canViewAudit = hasPermission(currentUser, 'view_audit_logs');
  const canViewTrash =
    hasPermission(currentUser, 'view_trash') || hasPermission(currentUser, 'restore_deleted');

  // Guard activeRoute against unauthorized access (Req #48)
  const isRouteAllowed = (r) => {
    if (['dashboard', 'my-day', 'live-ops', 'evaluations', 'monthly-plan', 'master-schedule', 'supervision', 'notifications'].includes(r)) {
      return true;
    }
    if ((r === 'this-week' || r === 'next-week') && canSeeWeeklyScheduling) return true;
    if (r === 'exceptions' && canSeeExceptions) return true;
    if (r === 'employees' && canSeeEmployees) return true;
    if (['students', 'scopes', 'venues'].includes(r) && canSeeResourcesCatalog) return true;
    if ((r === 'search-reports' || r === 'ops-reports') && canSeeReports) return true;
    if (r === 'permissions' && canManagePermissions) return true;
    if (['periods', 'settings', 'discrepancies'].includes(r) && canViewAdminSettings) return true;
    if (r === 'import' && canEditPlan) return true;
    if (r === 'audit' && canViewAudit) return true;
    if (r === 'trash' && canViewTrash) return true;
    if (r === 'system-health' && (canManagePermissions || currentUser.isAdmin)) return true;
    return false;
  };

  const effectiveRoute = isRouteAllowed(activeRoute) ? activeRoute : 'dashboard';

  const routeTitles = {
    dashboard: 'الرئيسية ولوحات القيادة التفاعلية والنبض التشغيلي',
    'live-ops': 'مركز التشغيل الميداني اللحظي (الآن والتالي)',
    'my-day': 'جدولي الدراسي واليومي الشخصي',
    evaluations: 'نظام التقييم الشامل والمتابعة الميدانية',
    'this-week': 'برامج هذا الأسبوع واستكمال الجدولة',
    'next-week': 'برامج الأسبوع القادم (التنسيق المبكر)',
    'monthly-plan': 'الخطة المعتمدة والتقويم التخطيطي الشهري',
    'master-schedule': 'الجدول التشغيلي العام للنادي والأقسام',
    exceptions: 'مركز طلبات الاستثناء والآراء والاعتماد',
    employees: 'إدارة الموظفين والحسابات والصلاحيات',
    students: 'قاعدة بيانات الطلاب والاستهداف المباشر',
    scopes: 'إدارة الفئات والنطاقات الطلابية',
    venues: 'إدارة القاعات والمواقع التشغيلية',
    supervision: 'جدول الإشراف اليومي المعتمد',
    'search-reports': 'البحث الشامل والتصفية المتقدمة',
    'ops-reports': 'التقارير التشغيلية وقياس الالتزام بالخطة',
    permissions: 'إدارة الصلاحيات ومنح صلاحية Admin',
    periods: 'الفترات والأوقات وسلوك التعارض',
    discrepancies: 'مراجعة اختلافات البيانات بين الملفات',
    import: 'استيراد وتحديث الجداول وفحص الفروقات',
    settings: 'الهيكل التنظيمي والأقسام وإصدار الخطة المعتمدة',
    notifications: 'مركز الإشعارات والتنبيهات',
    audit: 'سجل الإجراءات وسجل الحذف (Audit Log)',
    trash: 'سلة المحذوفات والاسترجاع الآمن',
    'system-health': 'سلامة المنصة والمراقبة التقنية وبلاغات المستخدمين',
  };

  return (
    <div className="app-shell">
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="logo-area">
          <img src="./logo.png" alt="تراؤف - منافذ" />
          <div className="brand-platform-title">منصة منافذ التشغيلية</div>
          <span className="version-badge">نادي تراؤف للبنين — نظام موحد</span>
        </div>

        <div className="sidebar-profile">
          <div className="sidebar-profile-avatar">
            {currentUser.name?.slice(0, 2)}
          </div>
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name" title={currentUser.name}>
              {currentUser.name}
            </div>
            <span className="sidebar-profile-role">
              {currentUser.roleLabel} • {userOrgContext?.departmentName || currentUser.departmentName}
            </span>
          </div>
        </div>

        <div className="nav-scroll">
          {/* Group 1: Personal Portal & General Club Pulse (Visible to All Employees — Req #5-#11) */}
          <div className="nav-group">
            <div className="nav-label">بوابتي والنبض اليومي للنادي</div>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigate('dashboard')}
            >
              <span className="nav-icon-box"><LayoutDashboard size={17} /></span>
              <span>الرئيسية (بوابتي والنبض)</span>
            </button>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'my-day' ? 'active' : ''}`}
              onClick={() => navigate('my-day')}
            >
              <span className="nav-icon-box"><User size={17} /></span>
              <span>جدولي الدراسي واليومي</span>
            </button>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'live-ops' ? 'active' : ''}`}
              onClick={() => navigate('live-ops')}
            >
              <span className="nav-icon-box"><Radio size={17} /></span>
              <span>الآن والتالي (مركز التشغيل)</span>
            </button>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'evaluations' ? 'active' : ''}`}
              onClick={() => navigate('evaluations')}
            >
              <span className="nav-icon-box"><Award size={17} /></span>
              <span>التقييمات والمتابعة</span>
            </button>
          </div>

          {/* Group 2: Approved Plan & Operational Schedules */}
          <div className="nav-group">
            <div className="nav-label">الخطة المعتمدة والجدول التشغيلي</div>
            {canSeeWeeklyScheduling && (
              <>
                <button
                  type="button"
                  className={`nav-item ${effectiveRoute === 'this-week' ? 'active' : ''}`}
                  onClick={() => navigate('this-week')}
                >
                  <span className="nav-icon-box"><CalendarCheck size={17} /></span>
                  <span>برامج هذا الأسبوع</span>
                  {unscheduledThisWeekCount > 0 && (
                    <span className="nav-badge warn">{unscheduledThisWeekCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`nav-item ${effectiveRoute === 'next-week' ? 'active' : ''}`}
                  onClick={() => navigate('next-week')}
                >
                  <span className="nav-icon-box"><CalendarClock size={17} /></span>
                  <span>برامج الأسبوع القادم</span>
                </button>
              </>
            )}
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'monthly-plan' ? 'active' : ''}`}
              onClick={() => navigate('monthly-plan')}
            >
              <span className="nav-icon-box"><CalendarRange size={17} /></span>
              <span>الخطة المعتمدة والتقويم</span>
            </button>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'master-schedule' ? 'active' : ''}`}
              onClick={() => navigate('master-schedule')}
            >
              <span className="nav-icon-box"><Table2 size={17} /></span>
              <span>الجدول التشغيلي العام</span>
            </button>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'supervision' ? 'active' : ''}`}
              onClick={() => navigate('supervision')}
            >
              <span className="nav-icon-box"><Shield size={17} /></span>
              <span>الإشراف اليومي المعتمد</span>
            </button>
          </div>

          {/* Group 3: Conflicts & Exceptions (Authorized Users Only) */}
          {canSeeExceptions && (
            <div className="nav-group">
              <div className="nav-label">التعارضات وطلبات الاستثناء</div>
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'exceptions' ? 'active' : ''}`}
                onClick={() => navigate('exceptions')}
              >
                <span className="nav-icon-box"><Sparkles size={17} /></span>
                <span>مركز الاستثناءات والاعتماد</span>
                {activeExceptionsCount > 0 && (
                  <span className="nav-badge danger">{activeExceptionsCount}</span>
                )}
              </button>
            </div>
          )}

          {/* Group 4: Staff, Students, Scopes & Venues (Authorized Users Only) */}
          {(canSeeEmployees || canSeeResourcesCatalog) && (
            <div className="nav-group">
              <div className="nav-label">الموارد البشرية والطلاب والقاعات</div>
              {canSeeEmployees && (
                <button
                  type="button"
                  className={`nav-item ${effectiveRoute === 'employees' ? 'active' : ''}`}
                  onClick={() => navigate('employees')}
                >
                  <span className="nav-icon-box"><Users size={17} /></span>
                  <span>الموظفون والحسابات</span>
                </button>
              )}
              {canSeeResourcesCatalog && (
                <>
                  <button
                    type="button"
                    className={`nav-item ${effectiveRoute === 'students' ? 'active' : ''}`}
                    onClick={() => navigate('students')}
                  >
                    <span className="nav-icon-box"><GraduationCap size={17} /></span>
                    <span>قاعدة بيانات الطلاب</span>
                  </button>
                  <button
                    type="button"
                    className={`nav-item ${effectiveRoute === 'scopes' ? 'active' : ''}`}
                    onClick={() => navigate('scopes')}
                  >
                    <span className="nav-icon-box"><Layers size={17} /></span>
                    <span>الفئات والنطاقات</span>
                  </button>
                  <button
                    type="button"
                    className={`nav-item ${effectiveRoute === 'venues' ? 'active' : ''}`}
                    onClick={() => navigate('venues')}
                  >
                    <span className="nav-icon-box"><MapPin size={17} /></span>
                    <span>القاعات والمواقع</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Group 5: Search & Reports (Authorized Users Only) */}
          {canSeeReports && (
            <div className="nav-group">
              <div className="nav-label">البحث والتقارير والالتزام</div>
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'search-reports' ? 'active' : ''}`}
                onClick={() => navigate('search-reports')}
              >
                <span className="nav-icon-box"><Search size={17} /></span>
                <span>البحث والتصفية الشاملة</span>
              </button>
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'ops-reports' ? 'active' : ''}`}
                onClick={() => navigate('ops-reports')}
              >
                <span className="nav-icon-box"><BarChart3 size={17} /></span>
                <span>التقارير والالتزام بالخطة</span>
              </button>
            </div>
          )}

          {/* Group 6: Notifications, Permissions, Governance, Audit & Recycle Bin */}
          <div className="nav-group">
            <div className="nav-label">التنبيهات والحوكمة والإدارة</div>
            <button
              type="button"
              className={`nav-item ${effectiveRoute === 'notifications' ? 'active' : ''}`}
              onClick={() => navigate('notifications')}
            >
              <span className="nav-icon-box"><Bell size={17} /></span>
              <span>مركز الإشعارات</span>
              {unreadNotifications > 0 && (
                <span className="nav-badge">{unreadNotifications}</span>
              )}
            </button>

            {canManagePermissions && (
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'permissions' ? 'active' : ''}`}
                onClick={() => navigate('permissions')}
              >
                <span className="nav-icon-box"><KeyRound size={17} /></span>
                <span>الصلاحيات ومنح Admin</span>
              </button>
            )}

            {canViewAdminSettings && (
              <>
                <button
                  type="button"
                  className={`nav-item ${effectiveRoute === 'settings' ? 'active' : ''}`}
                  onClick={() => navigate('settings')}
                >
                  <span className="nav-icon-box"><Settings size={17} /></span>
                  <span>الهيكل التنظيمي والخطة</span>
                </button>
                <button
                  type="button"
                  className={`nav-item ${effectiveRoute === 'periods' ? 'active' : ''}`}
                  onClick={() => navigate('periods')}
                >
                  <span className="nav-icon-box"><Clock size={17} /></span>
                  <span>الفترات وسلوك التعارض</span>
                </button>
                <button
                  type="button"
                  className={`nav-item ${effectiveRoute === 'discrepancies' ? 'active' : ''}`}
                  onClick={() => navigate('discrepancies')}
                >
                  <span className="nav-icon-box"><AlertOctagon size={17} /></span>
                  <span>اختلافات البيانات</span>
                  {openDiscrepanciesCount > 0 && (
                    <span className="nav-badge danger">{openDiscrepanciesCount}</span>
                  )}
                </button>
              </>
            )}

            {canEditPlan && (
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'import' ? 'active' : ''}`}
                onClick={() => navigate('import')}
              >
                <span className="nav-icon-box"><Upload size={17} /></span>
                <span>استيراد وتحديث الجداول</span>
              </button>
            )}

            {canViewAudit && (
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'audit' ? 'active' : ''}`}
                onClick={() => navigate('audit')}
              >
                <span className="nav-icon-box"><History size={17} /></span>
                <span>سجل الإجراءات والحذف ({auditLogs.length})</span>
              </button>
            )}

            {canViewTrash && (
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'trash' ? 'active' : ''}`}
                onClick={() => navigate('trash')}
              >
                <span className="nav-icon-box"><Trash2 size={17} /></span>
                <span>سلة المحذوفات والاسترجاع</span>
                {activeTrashCount > 0 && (
                  <span className="nav-badge warn">{activeTrashCount}</span>
                )}
              </button>
            )}

            {(canManagePermissions || currentUser.isAdmin) && (
              <button
                type="button"
                className={`nav-item ${effectiveRoute === 'system-health' ? 'active' : ''}`}
                onClick={() => navigate('system-health')}
              >
                <span className="nav-icon-box"><Activity size={17} /></span>
                <span>سلامة المنصة</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        <header className="top-header">
          <div className="header-right">
            <button
              type="button"
              className="icon-btn mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="header-title-block">
              <h1>{routeTitles[effectiveRoute] || 'منصة منافذ التشغيلية'}</h1>
              <div className="header-subtitle">
                <span>{userOrgContext?.administration?.name || 'نادي تراؤف للبنين'}</span>
                <span>•</span>
                <span>{userOrgContext?.departmentName || currentUser.departmentName}</span>
                {submissionWindow && (
                  <>
                    <span>•</span>
                    <span
                      style={{
                        color: submissionWindow.isOpen ? 'var(--brand-teal)' : '#b45309',
                        fontWeight: 700,
                      }}
                    >
                      {submissionWindow.isOpen
                        ? `نافذة رفع البرامج الجديدة متاحة (اليوم ${submissionWindow.dayOfMonth} من 15)`
                        : `نافذة رفع البرامج الجديدة مغلقة (اليوم ${submissionWindow.dayOfMonth})`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="header-actions">
            {/* Cloud Sync Status + Manual Refresh */}
            <div
              className="cloud-pill"
              title={
                syncError
                  ? `تنبيه مزامنة: ${syncError}`
                  : lastSyncedAt
                  ? `آخر مزامنة ناجحة: ${new Date(lastSyncedAt).toLocaleTimeString('ar-SA')}`
                  : 'حالة المزامنة السحابية لقاعدة البيانات الموحدة'
              }
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <span className={`cloud-dot ${cloudStatus === 'online' ? '' : 'local'}`} />
              <span>{cloudStatus === 'online' ? 'متصل سحابيًا' : 'مزامنة محلية'}</span>
              <button
                type="button"
                onClick={async () => {
                  setRefreshingCloud(true);
                  await manualRefreshCloud();
                  setRefreshingCloud(false);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: 2,
                  color: 'var(--brand-teal)',
                }}
                title="تحديث البيانات الفوري من السحابة"
              >
                <RefreshCw size={12} className={refreshingCloud ? 'spin' : ''} />
              </button>
            </div>

            {/* Report Issue Button (Available to All Users — Section 7) */}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setReportModalOpen(true)}
              title="الإبلاغ عن مشكلة تقنية أو تشغيلية في هذه الصفحة"
              style={{ borderColor: 'rgba(217,119,6,0.35)', color: '#b45309' }}
            >
              <MessageSquareWarning size={14} />
              <span>الإبلاغ عن مشكلة</span>
            </button>

            {/* Quick Add / Copy Program Buttons (Authorized Creators Only) */}
            {canCreateNewProgram && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setClonePickerOpen(true)}
                  title="نسخ برنامج سابق بسرعة"
                >
                  <Copy size={14} />
                  <span>نسخ برنامج سابق</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => openScheduleModal({ mode: 'new_program' })}
                >
                  <Plus size={14} />
                  <span>برنامج جديد</span>
                </button>
              </>
            )}

            {/* Authenticated Personal Account Badge (Strictly ZERO manual role switching — Req #3) */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.32rem 0.7rem',
                borderRadius: 999,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: 'var(--text)',
              }}
              title={`الحساب النشط: @${currentUser.username || ''} — النطاق: ${userOrgContext?.scopeLabel || ''}`}
            >
              <User size={13} color="var(--brand-teal)" />
              <span>{currentUser.name}</span>
              <span style={{ color: 'var(--brand-teal)', fontWeight: 800 }}>({currentUser.roleLabel})</span>
            </div>

            {/* Notifications Bell */}
            <button
              type="button"
              className="icon-btn"
              onClick={() => navigate('notifications')}
              title="مركز الإشعارات"
            >
              <Bell size={17} />
              {unreadNotifications > 0 && <span className="ntf-dot">{unreadNotifications}</span>}
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setDarkMode(!darkMode)}
              title="الوضع الليلي / النهاري"
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Logout */}
            <button
              type="button"
              className="icon-btn"
              onClick={logout}
              title="تسجيل الخروج"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Active View Router Protected by Centralized PageErrorBoundary (Section 1.2) */}
        <main className="page-container">
          <PageErrorBoundary
            routeKey={effectiveRoute}
            onResetToHome={() => navigate('dashboard')}
            isAdmin={Boolean(currentUser?.isAdmin || canManagePermissions)}
            onOpenReportModal={() => setReportModalOpen(true)}
          >
            {effectiveRoute === 'dashboard' && (
              <DashboardView
                onNavigate={navigate}
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
                onOpenEvaluationModal={openEvaluationModal}
              />
            )}

            {effectiveRoute === 'live-ops' && (
              <LiveOpsCenterView
                onOpenDetailModal={openDetailModal}
                onOpenScheduleModal={openScheduleModal}
              />
            )}

            {effectiveRoute === 'my-day' && (
              <MyDayView onOpenDetailModal={openDetailModal} />
            )}

            {effectiveRoute === 'this-week' && (
              <WeeklyProgramsView
                initialTarget="this-week"
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {effectiveRoute === 'next-week' && (
              <WeeklyProgramsView
                initialTarget="next-week"
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {effectiveRoute === 'monthly-plan' && (
              <MonthlyCalendarView
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {effectiveRoute === 'master-schedule' && (
              <MasterScheduleView
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {effectiveRoute === 'exceptions' && (
              <ExceptionsCenterView
                initialSelectedExceptionId={selectedExceptionId}
                onOpenScheduleModal={openScheduleModal}
              />
            )}

            {['employees', 'students', 'scopes', 'venues', 'supervision'].includes(effectiveRoute) && (
              <ResourcesViews
                activeSubTab={effectiveRoute}
                onOpenDetailModal={openDetailModal}
                onOpenEvaluation={openEvaluationModal}
              />
            )}

            {effectiveRoute === 'search-reports' && (
              <SearchAndReportsView
                initialSubTab="search"
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {effectiveRoute === 'ops-reports' && (
              <SearchAndReportsView
                initialSubTab="reports"
                onOpenScheduleModal={openScheduleModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {effectiveRoute === 'evaluations' && (
              <EvaluationsView
                onOpenEvaluationModal={openEvaluationModal}
                onOpenDetailModal={openDetailModal}
              />
            )}

            {['permissions', 'periods', 'discrepancies', 'import', 'settings', 'notifications', 'audit', 'trash'].includes(
              effectiveRoute
            ) && <AdminAndAuditViews activeSubTab={effectiveRoute} />}

            {effectiveRoute === 'system-health' && (
              <SystemHealthPanel onNavigate={navigate} />
            )}
          </PageErrorBoundary>
        </main>
      </div>

      {/* Global Problem Reporting Modal (Section 7) */}
      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        currentRoute={effectiveRoute}
        currentRouteTitle={routeTitles[effectiveRoute] || effectiveRoute}
      />

      {/* Global Smart Scheduling & Zero-ReEntry Exception Modal */}
      <ScheduleProgramModal
        isOpen={scheduleModal.isOpen}
        onClose={() => setScheduleModal((s) => ({ ...s, isOpen: false }))}
        mode={scheduleModal.mode}
        occurrence={scheduleModal.occurrence}
        execution={scheduleModal.execution}
        defaultGlobalWeek={scheduleModal.defaultGlobalWeek}
        onCompleted={(res) => {
          if (res?.exceptionRecord) {
            navigate('exceptions', res.exceptionRecord.id);
          }
        }}
      />

      {/* Global Program Detail Card Modal */}
      <ProgramDetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal((d) => ({ ...d, isOpen: false }))}
        occurrence={detailModal.occurrence}
        execution={detailModal.execution}
        onOpenEvaluation={openEvaluationModal}
        onScheduleOrEdit={(occ, ex) =>
          openScheduleModal({
            mode: ex ? 'edit_execution' : 'schedule_planned',
            occurrence: occ,
            execution: ex,
          })
        }
        onClone={(srcObj) =>
          openScheduleModal({
            mode: 'clone_program',
            execution: srcObj.executionDate ? srcObj : null,
            occurrence: srcObj.executionDate ? null : srcObj,
          })
        }
        onNavigateExceptions={(exId) => navigate('exceptions', exId)}
      />

      {/* Global Unified Evaluation Modal (v3.0) */}
      <EvaluationModal
        isOpen={evalModal.isOpen}
        onClose={() => setEvalModal((s) => ({ ...s, isOpen: false }))}
        target={evalModal.target}
        initialLevel={evalModal.initialLevel}
        initialEmployeeId={evalModal.initialEmployeeId}
        onSubmitted={() => {}}
      />

      {/* Copy Previous Program Picker Modal (Req #29) */}
      {clonePickerOpen && (
        <div className="modal-backdrop" onClick={() => setClonePickerOpen(false)}>
          <div className="modal-panel" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>نسخ برنامج سابق إلى موعد أو فئة جديدة</h3>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setClonePickerOpen(false)}>
                إغلاق
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(state.scheduledExecutions.length > 0
                ? state.scheduledExecutions
                : state.plannedOccurrences.slice(0, 40)
              ).map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>{item.programName}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {item.departmentName} • {item.initiative || 'عام'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-teal"
                    onClick={() => {
                      setClonePickerOpen(false);
                      openScheduleModal({
                        mode: 'clone_program',
                        execution: item.executionDate ? item : null,
                        occurrence: item.executionDate ? null : item,
                      });
                    }}
                  >
                    <Copy size={13} />
                    <span>نسخ وتعديل الموعد</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

