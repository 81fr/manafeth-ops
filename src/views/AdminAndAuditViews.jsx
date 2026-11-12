import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  AlertOctagon,
  Upload,
  Settings,
  Bell,
  History,
  CheckCircle2,
  Plus,
  ShieldCheck,
  FileSpreadsheet,
  Trash2,
  RotateCcw,
  Building2,
  UserCog,
  FileCheck2,
  KeyRound,
  CheckSquare,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { formatDateTimeAr } from '../engine/dateUtils';
import { CONFLICT_BEHAVIOR_OPTIONS } from '../engine/conflictEngine';
import { parseAndCompareActivitiesExcel } from '../engine/excelImporter';
import { OperationalFileCard } from '../components/OperationalFilesToolbar';
import {
  ROLES_META,
  ACCESS_SCOPES,
  PERMISSIONS_GROUPS,
  ALL_PERMISSION_KEYS,
  buildPresetPermissions,
  hasPermission,
  canDeleteEntity,
} from '../engine/permissions';
import { StatusBadge } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

/**
 * Unified Administration, Permissions, Org Structure, 4-Level Conflict Behavior,
 * Plan Version Publishing, Notifications, Deletion Audit Log & Full System Admin Restore (v2.0)
 */
export default function AdminAndAuditViews({ activeSubTab = 'periods' }) {
  const {
    state,
    currentUser,
    auditLogs,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    updatePeriodTiming,
    updateConflictRuleBehavior,
    manageEmployeeAccount,
    saveAdministration,
    addOrUpdateDepartment,
    publishApprovedPlanVersion,
    resolveDiscrepancy,
    applyReviewedActivitiesDiff,
    softDeleteEntity,
    bulkSoftDeleteEntities,
    restoreDeletedItem,
    bulkRestoreDeletedItems,
  } = useOps();

  const canViewAdminSettings =
    hasPermission(currentUser, 'view_admin_settings') ||
    hasPermission(currentUser, 'edit_timetable') ||
    hasPermission(currentUser, 'edit_org_structure');
  const canManagePermissions = hasPermission(currentUser, 'manage_permissions');
  const canEditPlan = hasPermission(currentUser, 'edit_plan') || canViewAdminSettings;
  const canApprovePlanVersion =
    hasPermission(currentUser, 'approve_plan_version') || canViewAdminSettings;
  const canViewAuditLogs = hasPermission(currentUser, 'view_audit_logs');
  const canViewTrash =
    hasPermission(currentUser, 'view_trash') || hasPermission(currentUser, 'restore_deleted');

  const resolveSafeTab = (requested) => {
    if (requested === 'notifications') return 'notifications';
    if (requested === 'permissions' && canManagePermissions) return 'permissions';
    if (requested === 'audit' && canViewAuditLogs) return 'audit';
    if (requested === 'trash' && canViewTrash) return 'trash';
    if (requested === 'import' && canEditPlan) return 'import';
    if (canViewAdminSettings && ['periods', 'settings', 'discrepancies'].includes(requested)) {
      return requested;
    }
    if (canManagePermissions) return 'permissions';
    if (canViewAdminSettings) return 'periods';
    if (canViewAuditLogs) return 'audit';
    if (canViewTrash) return 'trash';
    return 'notifications';
  };

  const [subTab, setSubTab] = useState(() => resolveSafeTab(activeSubTab));
  useEffect(() => {
    setSubTab(resolveSafeTab(activeSubTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, canViewAdminSettings, canManagePermissions, canViewAuditLogs, canViewTrash]);

  const [feedbackBanner, setFeedbackBanner] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteItems, setBulkDeleteItems] = useState(null);
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);

  // ---- 1. Periods & 4-Level Conflict Behavior State (Req #25–#27) ----
  const [periodEdits, setPeriodEdits] = useState({});
  const [newPeriodForm, setNewPeriodForm] = useState({
    name: '',
    category: 'program_period',
    approvedStart: '17:10',
    approvedEnd: '17:50',
    showInSchedule: true,
    conflictBehavior: 'actual_conflict',
  });

  // ---- 2. Dedicated Permissions & Grant Admin State (Req #4, #38–#39, #44–#46) ----
  const [permEmpSearch, setPermEmpSearch] = useState('');
  const [permRoleFilter, setPermRoleFilter] = useState('all');
  const [selectedPermEmpId, setSelectedPermEmpId] = useState(state.employees[0]?.id || 'EMP-01');
  const [permDraft, setPermDraft] = useState(null);
  const [savingPerm, setSavingPerm] = useState(false);

  const selectedPermEmp = useMemo(
    () => state.employees.find((e) => e.id === selectedPermEmpId) || state.employees[0] || null,
    [state.employees, selectedPermEmpId]
  );

  useEffect(() => {
    if (!selectedPermEmp) return;
    const rk = selectedPermEmp.role || selectedPermEmp.systemRole || 'employee';
    const isAdminBool = Boolean(selectedPermEmp.isAdmin || rk === 'full_admin' || rk === 'custom_admin');
    setPermDraft({
      id: selectedPermEmp.id,
      name: selectedPermEmp.name,
      username: selectedPermEmp.username || '',
      newPassword: '',
      departmentId: selectedPermEmp.departmentId || '',
      jobTitle: selectedPermEmp.jobTitle || '',
      role: rk,
      isAdmin: isAdminBool,
      adminLevel: selectedPermEmp.adminLevel || (rk === 'full_admin' ? 'full_admin' : 'custom_admin'),
      accessScope: selectedPermEmp.accessScope || ROLES_META[rk]?.defaultScope || 'self',
      accountStatus: selectedPermEmp.accountStatus || 'نشط',
      permissions: {
        ...buildPresetPermissions(rk),
        ...(selectedPermEmp.permissions || {}),
      },
    });
  }, [selectedPermEmp]);

  const filteredPermEmployees = useMemo(() => {
    return state.employees.filter((e) => {
      if (permRoleFilter === 'admins' && !e.isAdmin) return false;
      if (permRoleFilter === 'leaders' && !['club_director', 'dept_head'].includes(e.role)) return false;
      if (permRoleFilter === 'employees' && e.role !== 'employee') return false;
      if (
        permEmpSearch.trim() &&
        !`${e.name} ${e.username || ''} ${e.departmentName || ''}`
          .toLowerCase()
          .includes(permEmpSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [state.employees, permRoleFilter, permEmpSearch]);

  // ---- 3. Org Structure, Departments & Approved Plan Version State (Req #7, #13–#16, #49) ----
  const [newAdminForm, setNewAdminForm] = useState({ name: '', code: '', directorEmployeeId: '' });
  const [newDept, setNewDept] = useState({
    name: '',
    code: '',
    color: '#0ea5e9',
    description: '',
    headEmployeeId: '',
  });
  const [planVersionForm, setPlanVersionForm] = useState({
    versionNumber: '',
    title: 'الخطة التشغيلية المعتمدة المحدثة — نادي تراؤف للبنين',
    notes: '',
  });

  // ---- 4. Discrepancies & Excel Re-import State ----
  const [discNotes, setDiscNotes] = useState({});
  const [discCustomVal, setDiscCustomVal] = useState({});
  const [importLoading, setImportLoading] = useState(false);
  const [diffReport, setDiffReport] = useState(null);
  const [importOpts, setImportOpts] = useState({ applyNew: true, applyChanged: true, applyRemoved: false });
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  // ---- 5. Audit & Deletion Log Filter State (Req #41, #43) ----
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState('all'); // 'all' | 'deletions' | 'permissions' | 'ops' | 'auth'

  // ---- 6. Recycle Bin / Restore State (Req #42 + System Admin Restore!) ----
  const [trashFilterStatus, setTrashFilterStatus] = useState('active'); // 'active' | 'restored' | 'all'
  const [trashEntityFilter, setTrashEntityFilter] = useState('all');

  const scopedNotifications = useMemo(() => {
    if (currentUser?.isAdmin || currentUser?.accessScope === 'system' || currentUser?.accessScope === 'club') {
      return notifications;
    }
    return notifications.filter(
      (n) =>
        n.targetEmployeeId === currentUser?.employeeId ||
        (n.targetDeptId && n.targetDeptId === currentUser?.departmentId) ||
        n.targetRole === 'all'
    );
  }, [notifications, currentUser]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      if (auditCategory === 'deletions') {
        if (!`${l.actionType}`.includes('حذف') && !`${l.actionType}`.includes('استرجاع')) return false;
      } else if (auditCategory === 'permissions') {
        if (
          !`${l.actionType}`.includes('Admin') &&
          !`${l.actionType}`.includes('صلاحيات') &&
          !`${l.actionType}`.includes('حساب') &&
          !`${l.actionType}`.includes('نقل') &&
          !`${l.actionType}`.includes('كلمة مرور')
        ) {
          return false;
        }
      } else if (auditCategory === 'auth') {
        if (l.entityType !== 'auth_session' && !`${l.actionType}`.includes('تسجيل')) return false;
      } else if (auditCategory === 'ops') {
        if (l.entityType === 'auth_session') return false;
      }

      if (auditSearch.trim()) {
        const q = auditSearch.trim().toLowerCase();
        const hay = `${l.actorName} ${l.actorUsername || ''} ${l.actionType} ${l.entityTitle} ${l.summary} ${l.reason || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, auditCategory, auditSearch]);

  const filteredDeletedItems = useMemo(() => {
    const list = state.deletedItems || [];
    return list.filter((it) => {
      if (trashFilterStatus === 'active' && it.isRestored) return false;
      if (trashFilterStatus === 'restored' && !it.isRestored) return false;
      if (trashEntityFilter !== 'all' && it.entityType !== trashEntityFilter) return false;
      return true;
    });
  }, [state.deletedItems, trashFilterStatus, trashEntityFilter]);

  const activeTrashCount = useMemo(
    () => (state.deletedItems || []).filter((it) => !it.isRestored).length,
    [state.deletedItems]
  );

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportSuccessMsg('');
    try {
      const report = await parseAndCompareActivitiesExcel(
        file,
        state.programsCatalog,
        state.departments
      );
      setDiffReport(report);
    } catch (err) {
      setFeedbackBanner({
        type: 'warn',
        text: 'تعذر قراءة ملف Excel. يرجى التأكد من أن الملف بصيغة .xlsx المعتمدة: ' + err.message,
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleSavePermissionsSubmit = async (e) => {
    e.preventDefault();
    if (!permDraft) return;
    setSavingPerm(true);
    try {
      const effectiveRole = permDraft.isAdmin ? permDraft.adminLevel || 'custom_admin' : permDraft.role;
      const res = await manageEmployeeAccount({
        ...permDraft,
        role: effectiveRole,
      });
      if (res?.ok) {
        setFeedbackBanner({
          type: 'teal',
          text: `تم حفظ الصلاحيات وإعدادات الحساب للموظف «${res.employee.name}» (@${res.employee.username}) وتطبيقها فورًا في النظام.`,
        });
      } else {
        setFeedbackBanner({ type: 'warn', text: res?.error || 'تعذر حفظ الصلاحيات.' });
      }
    } finally {
      setSavingPerm(false);
    }
  };

  const handleConfirmDelete = async (reason) => {
    if (bulkDeleteItems?.length > 0) {
      const res = await bulkSoftDeleteEntities(bulkDeleteItems, reason);
      if (res?.ok) {
        setFeedbackBanner({
          type: 'teal',
          text: `تم حذف (${res.count}) عناصر محددة بأمان وحفظها في سلة المحذوفات وسجل الحذف.`,
        });
        setSelectedDeptIds([]);
      } else if (res?.error) {
        setFeedbackBanner({ type: 'warn', text: res.error });
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
      setFeedbackBanner({
        type: 'teal',
        text: `تم حذف «${deleteTarget.entityTitle}» بأمان وحفظه في سلة المحذوفات وسجل الحذف.`,
      });
    } else if (res?.error) {
      setFeedbackBanner({ type: 'warn', text: res.error });
    }
    setDeleteTarget(null);
  };

  const handleRestoreItem = async (item) => {
    const res = await restoreDeletedItem(item.id);
    if (res?.ok) {
      setFeedbackBanner({
        type: 'teal',
        text: `تم استرجاع العنصر المحذوف «${item.entityTitle}» (${item.entityTypeLabel}) إلى مكانه الأصلي بنجاح!`,
      });
    } else if (res?.error) {
      setFeedbackBanner({ type: 'warn', text: res.error });
    }
  };

  const handleBulkRestoreTrash = async () => {
    if (selectedTrashIds.length === 0) return;
    const res = await bulkRestoreDeletedItems(selectedTrashIds);
    if (res?.ok) {
      setFeedbackBanner({
        type: 'teal',
        text: `تم استرجاع (${res.count}) عناصر محذوفة محددة إلى أماكنها الأصلية بنجاح!`,
      });
      setSelectedTrashIds([]);
    }
  };

  const hasAnyAdminTab = canViewAdminSettings || canManagePermissions || canEditPlan || canViewAuditLogs || canViewTrash;

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Sub-navigation (Strictly hides administrative tabs from regular employees — Req #48) */}
      {hasAnyAdminTab && (
        <div className="card" style={{ padding: '0.85rem 1.15rem' }}>
          <div className="tabs-bar" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            {canManagePermissions && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'permissions' ? 'active' : ''}`}
                onClick={() => setSubTab('permissions')}
              >
                <UserCog size={14} />
                <span>الصلاحيات ومنح Admin</span>
              </button>
            )}
            {canViewAdminSettings && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'periods' ? 'active' : ''}`}
                onClick={() => setSubTab('periods')}
              >
                <Clock size={14} />
                <span>الفترات وسلوك التعارض</span>
              </button>
            )}
            {canViewAdminSettings && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'settings' ? 'active' : ''}`}
                onClick={() => setSubTab('settings')}
              >
                <Settings size={14} />
                <span>الهيكل التنظيمي والأقسام والخطة</span>
              </button>
            )}
            {canViewAdminSettings && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'discrepancies' ? 'active' : ''}`}
                onClick={() => setSubTab('discrepancies')}
              >
                <AlertOctagon size={14} />
                <span>
                  اختلافات البيانات ({state.dataDiscrepancies.filter((d) => d.status === 'تعارض بيانات يحتاج مراجعة').length})
                </span>
              </button>
            )}
            {canEditPlan && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'import' ? 'active' : ''}`}
                onClick={() => setSubTab('import')}
              >
                <Upload size={14} />
                <span>استيراد وتحديث الجداول</span>
              </button>
            )}
            <button
              type="button"
              className={`tab-btn ${subTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setSubTab('notifications')}
            >
              <Bell size={14} />
              <span>مركز الإشعارات ({scopedNotifications.length})</span>
            </button>
            {canViewAuditLogs && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'audit' ? 'active' : ''}`}
                onClick={() => setSubTab('audit')}
              >
                <History size={14} />
                <span>سجل الإجراءات والحذف ({auditLogs.length})</span>
              </button>
            )}
            {canViewTrash && (
              <button
                type="button"
                className={`tab-btn ${subTab === 'trash' ? 'active' : ''}`}
                onClick={() => setSubTab('trash')}
              >
                <RotateCcw size={14} />
                <span>سلة المحذوفات والاسترجاع ({activeTrashCount})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {feedbackBanner && (
        <div className={`alert-banner ${feedbackBanner.type === 'warn' ? 'warn' : 'teal'}`} style={{ marginBottom: 0 }}>
          <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>{feedbackBanner.text}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setFeedbackBanner(null)}>
            إغلاق
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. PERMISSIONS & GRANT ADMIN PAGE (Req #4, #38–#39, #44–#46)       */}
      {/* ================================================================= */}
      {subTab === 'permissions' && canManagePermissions && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Employee Picker Sidebar */}
          <div className="card" style={{ padding: '0.9rem' }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 8 }}>
              اختر موظفًا لإدارة صلاحياته أو منحه Admin:
            </div>
            <input
              type="text"
              className="form-input"
              style={{ marginBottom: 8 }}
              placeholder="بحث باسم الموظف أو @username..."
              value={permEmpSearch}
              onChange={(e) => setPermEmpSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                { k: 'all', lbl: 'الكل' },
                { k: 'admins', lbl: 'Admin' },
                { k: 'leaders', lbl: 'رؤساء ومدير' },
                { k: 'employees', lbl: 'موظفون' },
              ].map((fl) => (
                <button
                  key={fl.k}
                  type="button"
                  onClick={() => setPermRoleFilter(fl.k)}
                  className={`btn btn-sm ${permRoleFilter === fl.k ? 'btn-teal' : 'btn-secondary'}`}
                  style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                >
                  {fl.lbl}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 560, overflowY: 'auto' }}>
              {filteredPermEmployees.map((emp) => {
                const active = selectedPermEmpId === emp.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setSelectedPermEmpId(emp.id)}
                    style={{
                      textAlign: 'right',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 10,
                      border: active ? '2px solid var(--brand-teal)' : '1px solid var(--border)',
                      background: active ? 'rgba(0,165,155,0.1)' : 'var(--bg)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--brand-ink)' }}>{emp.name}</strong>
                      {emp.isAdmin && (
                        <span className="status-badge badge-approved" style={{ fontSize: '0.63rem' }}>
                          Admin
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      @{emp.username} • {emp.customRoleLabel || ROLES_META[emp.role]?.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Selected Employee Role, Admin Grant, Scope & 37 Permissions */}
          {permDraft && (
            <form onSubmit={handleSavePermissionsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ padding: '1rem', border: permDraft.isAdmin ? '1.5px solid var(--brand-teal)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--brand-ink)' }}>
                      تخصيص صلاحيات الموظف: {permDraft.name} (@{permDraft.username})
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      من هنا يمكنك منح أي موظف صلاحية Admin (كامل أو مخصص)، أو تعيين دوره ونطاق صلاحياته وتعديل كل صلاحية بشكل مستقل.
                    </p>
                  </div>

                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 15px',
                      borderRadius: 999,
                      background: permDraft.isAdmin ? 'rgba(0,165,155,0.15)' : 'var(--bg)',
                      border: '1.5px solid var(--brand-teal)',
                      fontWeight: 800,
                      fontSize: '0.83rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={permDraft.isAdmin}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const nextRole = checked ? 'custom_admin' : 'employee';
                        setPermDraft({
                          ...permDraft,
                          isAdmin: checked,
                          adminLevel: checked ? 'custom_admin' : null,
                          role: nextRole,
                          accessScope: ROLES_META[nextRole].defaultScope,
                          permissions: buildPresetPermissions(nextRole),
                        });
                      }}
                    />
                    <span>منح صلاحية Admin لهذا الموظف</span>
                  </label>
                </div>

                <div className="form-grid">
                  {permDraft.isAdmin ? (
                    <div className="form-group">
                      <label className="form-label">نوع صلاحية Admin *</label>
                      <select
                        className="form-select"
                        value={permDraft.adminLevel || 'custom_admin'}
                        onChange={(e) => {
                          const lvl = e.target.value;
                          setPermDraft({
                            ...permDraft,
                            adminLevel: lvl,
                            role: lvl,
                            accessScope: lvl === 'full_admin' ? 'system' : permDraft.accessScope,
                            permissions: buildPresetPermissions(lvl),
                          });
                        }}
                      >
                        <option value="full_admin">مدير نظام كامل (كامل الصلاحيات والاسترجاع)</option>
                        <option value="custom_admin">مدير بصلاحيات محددة (تخصيص الصلاحيات أدناه)</option>
                      </select>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">الدور الأساسي للموظف *</label>
                      <select
                        className="form-select"
                        value={permDraft.role}
                        onChange={(e) => {
                          const rk = e.target.value;
                          setPermDraft({
                            ...permDraft,
                            role: rk,
                            isAdmin: rk === 'full_admin' || rk === 'custom_admin',
                            adminLevel: rk === 'full_admin' || rk === 'custom_admin' ? rk : null,
                            accessScope: ROLES_META[rk]?.defaultScope || 'self',
                            permissions: buildPresetPermissions(rk),
                          });
                        }}
                      >
                        <option value="employee">موظف عادي</option>
                        <option value="dept_head">رئيس قسم</option>
                        <option value="club_director">مدير النادي</option>
                        <option value="approver">صاحب اعتماد</option>
                        <option value="opinion_giver">صاحب رأي</option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">نطاق الصلاحية (Scope) *</label>
                    <select
                      className="form-select"
                      disabled={permDraft.adminLevel === 'full_admin'}
                      value={permDraft.accessScope}
                      onChange={(e) => setPermDraft({ ...permDraft, accessScope: e.target.value })}
                    >
                      {Object.values(ACCESS_SCOPES).map((sc) => (
                        <option key={sc.key} value={sc.key}>
                          {sc.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">حالة الحساب</label>
                    <select
                      className="form-select"
                      disabled={permDraft.id === currentUser?.employeeId}
                      value={permDraft.accountStatus}
                      onChange={(e) => setPermDraft({ ...permDraft, accountStatus: e.target.value })}
                    >
                      <option value="نشط">نشط</option>
                      <option value="غير نشط">غير نشط</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <KeyRound size={13} />
                      <span>تغيير كلمة المرور (اختياري)</span>
                    </label>
                    <input
                      type="password"
                      className="form-input"
                      style={{ direction: 'ltr', textAlign: 'right' }}
                      placeholder="اتركه فارغًا للإبقاء على الحالية"
                      value={permDraft.newPassword}
                      onChange={(e) => setPermDraft({ ...permDraft, newPassword: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    الصلاحيات القابلة للتخصيص ({ALL_PERMISSION_KEYS.length} صلاحية مستقلة للعرض، الإنشاء، التعديل، الاعتماد، والحذف المنفصل):
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {permDraft.adminLevel !== 'full_admin' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-teal"
                          onClick={() =>
                            setPermDraft({
                              ...permDraft,
                              permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])),
                            })
                          }
                        >
                          <CheckSquare size={14} />
                          <span>تحديد كل الصلاحيات</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setPermDraft({
                              ...permDraft,
                              permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false])),
                            })
                          }
                        >
                          <span>إلغاء تحديد الكل</span>
                        </button>
                      </>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={savingPerm}>
                      <CheckCircle2 size={15} />
                      <span>{savingPerm ? 'جاري الحفظ...' : 'حفظ وتطبيق الصلاحيات فورًا'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))', gap: '0.85rem' }}>
                  {PERMISSIONS_GROUPS.map((grp) => {
                    const allGrpChecked = grp.items.every((it) =>
                      permDraft.adminLevel === 'full_admin' ? true : Boolean(permDraft.permissions?.[it.key])
                    );
                    return (
                    <div
                      key={grp.groupKey}
                      style={{
                        background: 'var(--bg)',
                        border: grp.groupKey === 'delete' ? '1px solid #fca5a5' : '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          color: grp.groupKey === 'delete' ? '#b91c1c' : 'var(--brand-teal)',
                          marginBottom: 6,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>{grp.groupTitle}</span>
                        {permDraft.adminLevel !== 'full_admin' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ padding: '1px 7px', fontSize: '0.67rem' }}
                            onClick={() => {
                              const nextPerms = { ...permDraft.permissions };
                              grp.items.forEach((it) => {
                                nextPerms[it.key] = !allGrpChecked;
                              });
                              setPermDraft({ ...permDraft, permissions: nextPerms });
                            }}
                          >
                            {allGrpChecked ? 'إلغاء المجموعة' : 'تحديد المجموعة'}
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {grp.items.map((item) => {
                          const checked =
                            permDraft.adminLevel === 'full_admin'
                              ? true
                              : Boolean(permDraft.permissions?.[item.key]);
                          return (
                            <label
                              key={item.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.75rem',
                                cursor: permDraft.adminLevel === 'full_admin' ? 'default' : 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                disabled={permDraft.adminLevel === 'full_admin'}
                                checked={checked}
                                onChange={(e) =>
                                  setPermDraft({
                                    ...permDraft,
                                    permissions: {
                                      ...permDraft.permissions,
                                      [item.key]: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. PERIODS, FIXED EVENTS & 4-LEVEL CONFLICT BEHAVIOR (Req #25–#27) */}
      {/* ================================================================= */}
      {subTab === 'periods' && canViewAdminSettings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <OperationalFileCard fileType="periods" />

          <div className="alert-banner teal" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: '0.81rem' }}>
              <strong>الجدول الزمني المعتمد للفترات (تحديث 8-11-2026م):</strong> يمكنك تنزيل ملف معاينة للتعبئة أو تصدير الفترات أو رفع ملف جديد، كما يمكنك ضبط وقت البداية والنهاية وإظهار الفترة في الجدول وسلوك التعارض لكل فترة بشكل مستقل.
            </div>
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>م</th>
                  <th>اسم الفترة / الحدث الثابت</th>
                  <th>الوقت المعتمد</th>
                  <th>التصنيف</th>
                  <th>وقت البداية (24س)</th>
                  <th>وقت النهاية (24س)</th>
                  <th>إظهار في الجدول؟</th>
                  <th>سلوك التعارض (4 مستويات)</th>
                  <th>حفظ واعتماد</th>
                </tr>
              </thead>
              <tbody>
                {state.periods.map((p) => {
                  const ed = periodEdits[p.id] || {
                    start: p.approvedStart || p.startTime || '15:15',
                    end: p.approvedEnd || p.endTime || '15:30',
                    showInSchedule: p.showInSchedule !== false && p.visibleInSchedule !== false,
                    conflictBehavior: p.conflictBehavior || 'actual_conflict',
                  };
                  return (
                    <tr key={p.id}>
                      <td>{p.order}</td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{p.name}</div>
                        <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>{p.eventType}</div>
                      </td>
                      <td dir="ltr" style={{ fontWeight: 800, color: 'var(--brand-teal)', textAlign: 'right' }}>
                        {p.displayTime || `${ed.start} - ${ed.end}`}
                      </td>
                      <td>
                        <span className="status-badge badge-muted" style={{ fontSize: '0.68rem' }}>
                          {p.category === 'program_period' ? 'فترة برامج' : 'حدث ثابت'}
                        </span>
                      </td>
                      <td>
                        <input
                          type="time"
                          className="form-input"
                          style={{ width: 115 }}
                          value={ed.start}
                          onChange={(e) =>
                            setPeriodEdits({ ...periodEdits, [p.id]: { ...ed, start: e.target.value } })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          className="form-input"
                          style={{ width: 115 }}
                          value={ed.end}
                          onChange={(e) =>
                            setPeriodEdits({ ...periodEdits, [p.id]: { ...ed, end: e.target.value } })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ width: 115 }}
                          value={ed.showInSchedule ? 'yes' : 'no'}
                          onChange={(e) =>
                            setPeriodEdits({
                              ...periodEdits,
                              [p.id]: { ...ed, showInSchedule: e.target.value === 'yes' },
                            })
                          }
                        >
                          <option value="yes">نعم (يظهر)</option>
                          <option value="no">لا (مخفي)</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ width: 185 }}
                          value={ed.conflictBehavior}
                          onChange={(e) =>
                            setPeriodEdits({
                              ...periodEdits,
                              [p.id]: { ...ed, conflictBehavior: e.target.value },
                            })
                          }
                        >
                          {CONFLICT_BEHAVIOR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-teal"
                          onClick={() => {
                            updatePeriodTiming(p.id, {
                              approvedStart: ed.start,
                              approvedEnd: ed.end,
                              showInSchedule: ed.showInSchedule,
                              conflictBehavior: ed.conflictBehavior,
                            });
                            setFeedbackBanner({
                              type: 'teal',
                              text: `تم اعتماد إعدادات «${p.name}» وتحديث سلوك التعارض في جميع الجداول فورًا.`,
                            });
                          }}
                        >
                          اعتماد
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add New Period */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 8 }}>
              إضافة فترة تشغيلية أو وقت ثابت جديد:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 125px 125px 1fr auto', gap: 8, alignItems: 'end' }}>
              <input
                className="form-input"
                placeholder="اسم الفترة الجديدة..."
                value={newPeriodForm.name}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
              />
              <select
                className="form-select"
                value={newPeriodForm.category}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, category: e.target.value })}
              >
                <option value="program_period">فترة برامج قابلة للجدولة</option>
                <option value="fixed_event">وقت تشغيلي ثابت (صلاة/وجبة/انصراف)</option>
              </select>
              <input
                type="time"
                className="form-input"
                value={newPeriodForm.approvedStart}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, approvedStart: e.target.value })}
              />
              <input
                type="time"
                className="form-input"
                value={newPeriodForm.approvedEnd}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, approvedEnd: e.target.value })}
              />
              <select
                className="form-select"
                value={newPeriodForm.conflictBehavior}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, conflictBehavior: e.target.value })}
              >
                {CONFLICT_BEHAVIOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!newPeriodForm.name.trim()) return;
                  updatePeriodTiming(null, { addNewPeriod: newPeriodForm });
                  setNewPeriodForm({
                    name: '',
                    category: 'program_period',
                    approvedStart: '17:10',
                    approvedEnd: '17:50',
                    showInSchedule: true,
                    conflictBehavior: 'actual_conflict',
                  });
                }}
              >
                <Plus size={14} />
                <span>إضافة فترة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. ORG STRUCTURE, DEPARTMENTS, PLAN VERSION & CONFLICT RULES      */}
      {/* ================================================================= */}
      {subTab === 'settings' && canViewAdminSettings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* A. Administrations (نادي تراؤف للبنين — عبد الرزاق محمد العنزي — Req #13, #14, #49) */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.95rem', marginBottom: 10 }}>
              <Building2 size={18} color="var(--brand-teal)" />
              <span>الإدارات والأندية المعتمدة بالهيكل التنظيمي ({(state.administrations || []).length})</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10, marginBottom: 12 }}>
              {(state.administrations || []).map((adm) => (
                <div
                  key={adm.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 12,
                    border: '1.5px solid rgba(0,165,155,0.35)',
                    background: 'var(--bg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--brand-ink)' }}>{adm.name}</strong>
                    {canDeleteEntity(currentUser, 'administration') && (state.administrations || []).length > 1 && (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ color: '#dc2626' }}
                        onClick={() =>
                          setDeleteTarget({
                            entityType: 'administration',
                            entityId: adm.id,
                            entityTypeLabel: 'إدارة / نادي',
                            entityTitle: adm.name,
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.73rem' }}>
                      مدير النادي / الإدارة المعتمد (يتحدث تلقائيًا في حسابات جميع الموظفين):
                    </label>
                    <select
                      className="form-select"
                      value={adm.directorEmployeeId || ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        saveAdministration({
                          ...adm,
                          directorEmployeeId: e.target.value,
                        });
                      }}
                    >
                      <option value="" disabled>-- اختر مدير النادي --</option>
                      {state.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} (@{emp.username})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 1.2fr auto', gap: 8, alignItems: 'end' }}>
              <input
                className="form-input"
                placeholder="إضافة إدارة / نادٍ مستقبلي..."
                value={newAdminForm.name}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, name: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="الرمز"
                value={newAdminForm.code}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, code: e.target.value })}
              />
              <select
                className="form-select"
                value={newAdminForm.directorEmployeeId}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, directorEmployeeId: e.target.value })}
              >
                <option value="">اختر مدير الإدارة</option>
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (!newAdminForm.name.trim()) return;
                  saveAdministration(newAdminForm);
                  setNewAdminForm({ name: '', code: '', directorEmployeeId: '' });
                }}
              >
                <Plus size={14} />
                <span>إضافة إدارة</span>
              </button>
            </div>
          </div>

          {/* B. Operational Departments & Their Approved Heads (Req #13, #15, #49) */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                الأقسام التشغيلية ورؤساء الأقسام المعتمدون ({state.departments.length} أقسام — تحديث رئيس القسم ينعكس فورًا في حسابات موظفيه):
              </div>
              {canDeleteEntity(currentUser, 'department') && state.departments.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontWeight: 800 }}
                    onClick={() =>
                      setSelectedDeptIds(
                        selectedDeptIds.length === state.departments.length
                          ? []
                          : state.departments.map((d) => d.id)
                      )
                    }
                  >
                    <CheckSquare size={13} color="var(--brand-teal)" />
                    <span>
                      {selectedDeptIds.length === state.departments.length
                        ? 'إلغاء تحديد الأقسام'
                        : `تحديد الكل (${state.departments.length})`}
                    </span>
                  </button>
                  {selectedDeptIds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        setBulkDeleteItems(
                          state.departments
                            .filter((d) => selectedDeptIds.includes(d.id))
                            .map((d) => ({
                              entityType: 'department',
                              entityId: d.id,
                              entityTitle: d.name,
                            }))
                        )
                      }
                    >
                      <Trash2 size={13} />
                      <span>حذف المحدد ({selectedDeptIds.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(265px, 1fr))', gap: 10, marginBottom: 12 }}>
              {state.departments.map((d) => {
                const isDeptSelected = selectedDeptIds.includes(d.id);
                return (
                <div
                  key={d.id}
                  style={{
                    padding: '0.8rem 0.95rem',
                    borderRadius: 11,
                    border: isDeptSelected ? '1.5px solid #dc2626' : `1.5px solid ${d.color}55`,
                    background: isDeptSelected ? 'rgba(239,68,68,0.05)' : 'var(--bg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {canDeleteEntity(currentUser, 'department') && (
                        <input
                          type="checkbox"
                          checked={isDeptSelected}
                          onChange={() =>
                            setSelectedDeptIds((prev) =>
                              prev.includes(d.id) ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                            )
                          }
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                        />
                      )}
                      <strong style={{ color: d.color, fontSize: '0.9rem' }}>{d.name}</strong>
                    </div>
                    {canDeleteEntity(currentUser, 'department') && (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ color: '#dc2626' }}
                        title="حذف القسم"
                        onClick={() =>
                          setDeleteTarget({
                            entityType: 'department',
                            entityId: d.id,
                            entityTypeLabel: 'قسم تشغيلي',
                            entityTitle: d.name,
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.description}</div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.71rem', marginBottom: 3 }}>
                      رئيس القسم المعتمد:
                    </label>
                    <select
                      className="form-select"
                      style={{ height: 34, fontSize: '0.77rem' }}
                      value={d.headEmployeeId || ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        addOrUpdateDepartment({
                          ...d,
                          headEmployeeId: e.target.value,
                        });
                      }}
                    >
                      <option value="" disabled>-- اختر رئيس القسم --</option>
                      {state.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} (@{emp.username})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 95px 75px 1.2fr 1.2fr auto', gap: 8, alignItems: 'end' }}>
              <input
                className="form-input"
                placeholder="اسم القسم الجديد..."
                value={newDept.name}
                onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="الرمز"
                value={newDept.code}
                onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
              />
              <input
                type="color"
                className="form-input"
                style={{ height: 39, padding: 4 }}
                value={newDept.color}
                onChange={(e) => setNewDept({ ...newDept, color: e.target.value })}
              />
              <select
                className="form-select"
                value={newDept.headEmployeeId}
                onChange={(e) => setNewDept({ ...newDept, headEmployeeId: e.target.value })}
              >
                <option value="">اختر رئيس القسم</option>
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              <input
                className="form-input"
                placeholder="وصف اختصاص القسم..."
                value={newDept.description}
                onChange={(e) => setNewDept({ ...newDept, description: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!newDept.name.trim()) return;
                  addOrUpdateDepartment(newDept);
                  setNewDept({ name: '', code: '', color: '#0ea5e9', description: '', headEmployeeId: '' });
                }}
              >
                <Plus size={14} />
                <span>إضافة قسم</span>
              </button>
            </div>
          </div>

          {/* C. Approved Plan Version Publisher (Req #7) */}
          {canApprovePlanVersion && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.94rem', marginBottom: 8 }}>
                <FileCheck2 size={17} color="var(--brand-teal)" />
                <span>إدارة واعتماد إصدار الخطة المعتمدة (الإصدار الحالي: {state.approvedPlanVersion?.versionNumber || 'v1.0'})</span>
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                عند اعتماد إصدار جديد، يظهر الإصدار المعتمد مباشرة للقراءة في حسابات جميع الموظفين المرتبطين، مع بقاء المسودات مخفية عن غير المخولين.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1.4fr 1.4fr auto', gap: 8, alignItems: 'end' }}>
                <input
                  className="form-input"
                  placeholder="رقم الإصدار (v2.0)"
                  value={planVersionForm.versionNumber}
                  onChange={(e) => setPlanVersionForm({ ...planVersionForm, versionNumber: e.target.value })}
                />
                <input
                  className="form-input"
                  placeholder="عنوان الإصدار المعتمد"
                  value={planVersionForm.title}
                  onChange={(e) => setPlanVersionForm({ ...planVersionForm, title: e.target.value })}
                />
                <input
                  className="form-input"
                  placeholder="ملاحظات الاعتماد..."
                  value={planVersionForm.notes}
                  onChange={(e) => setPlanVersionForm({ ...planVersionForm, notes: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-teal"
                  onClick={() => {
                    publishApprovedPlanVersion(planVersionForm);
                    setPlanVersionForm({
                      versionNumber: '',
                      title: 'الخطة التشغيلية المعتمدة المحدثة — نادي تراؤف للبنين',
                      notes: '',
                    });
                    setFeedbackBanner({
                      type: 'teal',
                      text: 'تم نشر واعتماد الإصدار الجديد للخطة المعتمدة وإشعار الموظفين.',
                    });
                  }}
                >
                  اعتماد ونشر الخطة
                </button>
              </div>
            </div>
          )}

          {/* D. 4-Level Conflict Engine Rules (Req #25–#27) */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '0.94rem', marginBottom: 8 }}>
              قواعد محرك كشف التعارضات وسلوك التعارض الرباعي القابل للضبط:
            </div>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>قاعدة التعارض</th>
                    <th>الوصف</th>
                    <th>سلوك التعارض (4 مستويات)</th>
                    <th>تفعيل القاعدة</th>
                  </tr>
                </thead>
                <tbody>
                  {state.conflictRules.map((rule) => (
                    <tr key={rule.id}>
                      <td style={{ fontWeight: 800 }}>{rule.name || rule.label}</td>
                      <td style={{ fontSize: '0.76rem' }}>{rule.description || '—'}</td>
                      <td>
                        <select
                          className="form-select"
                          style={{ width: 200 }}
                          value={rule.conflictBehavior || 'actual_conflict'}
                          onChange={(e) =>
                            updateConflictRuleBehavior(rule.id, {
                              conflictBehavior: e.target.value,
                            })
                          }
                        >
                          {CONFLICT_BEHAVIOR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={rule.isActive !== false}
                          onChange={(e) =>
                            updateConflictRuleBehavior(rule.id, {
                              isActive: e.target.checked,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. CROSS-FILE DATA DISCREPANCIES REVIEW                           */}
      {/* ================================================================= */}
      {subTab === 'discrepancies' && canViewAdminSettings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="alert-banner warn" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: '0.81rem' }}>
              <strong>سجل اختلافات البيانات المرصودة بين الملفات الستة:</strong> يعرض النظام كل اختلاف بين الملفات بشفافية تامة مع حفظ القيمتين والمصدرين، ويتيح اعتماد القيمة الصحيحة وتوثيقها في السجل.
            </div>
          </div>

          {state.dataDiscrepancies.map((disc) => (
            <div key={disc.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--brand-teal)' }}>
                    {disc.id} • {disc.category}
                  </span>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>{disc.entityName}</h3>
                </div>
                <StatusBadge status={disc.status} />
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>{disc.notes}</p>

              <div className="comparison-grid" style={{ marginBottom: 10 }}>
                <div style={{ padding: '0.75rem', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>المصدر الأول: {disc.sourceAFile}</div>
                  <div style={{ fontWeight: 800, marginTop: 3 }}>{disc.sourceAValue}</div>
                  <button
                    type="button"
                    className="btn btn-sm btn-teal"
                    style={{ marginTop: 8 }}
                    onClick={() => resolveDiscrepancy(disc.id, disc.sourceAValue, discNotes[disc.id] || 'اعتماد قيمة المصدر الأول')}
                  >
                    اعتماد قيمة المصدر الأول
                  </button>
                </div>

                <div style={{ padding: '0.75rem', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>المصدر الثاني: {disc.sourceBFile}</div>
                  <div style={{ fontWeight: 800, marginTop: 3 }}>{disc.sourceBValue}</div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => resolveDiscrepancy(disc.id, disc.sourceBValue, discNotes[disc.id] || 'اعتماد قيمة المصدر الثاني')}
                  >
                    اعتماد قيمة المصدر الثاني
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ maxWidth: 300 }}
                  placeholder="أو أدخل صيغة معتمدة مخصصة..."
                  value={discCustomVal[disc.id] || ''}
                  onChange={(e) => setDiscCustomVal({ ...discCustomVal, [disc.id]: e.target.value })}
                />
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, minWidth: 220 }}
                  placeholder="ملاحظة قرار المراجعة..."
                  value={discNotes[disc.id] || ''}
                  onChange={(e) => setDiscNotes({ ...discNotes, [disc.id]: e.target.value })}
                />
                {discCustomVal[disc.id] && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => resolveDiscrepancy(disc.id, discCustomVal[disc.id], discNotes[disc.id])}
                  >
                    اعتماد القيمة المخصصة
                  </button>
                )}
              </div>

              {disc.selectedValue && (
                <div style={{ marginTop: 8, fontSize: '0.78rem', fontWeight: 800, color: 'var(--approved-text)' }}>
                  القيمة المعتمدة حاليًا: «{disc.selectedValue}» — بواسطة {disc.resolvedBy} ({formatDateTimeAr(disc.resolvedAt)})
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ================================================================= */}
      {/* 5. RE-IMPORT & UPDATE SCHEDULES WITH DIFF & SNAPSHOT              */}
      {/* ================================================================= */}
      {subTab === 'import' && canEditPlan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="alert-banner teal" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: '0.82rem' }}>
              <strong>مركز استيراد وتصدير ومعاينة الملفات التشغيلية المعتمدة:</strong> يمكنك لكل ملف من الملفات الثلاثة (الجدول الزمني للفترات، جدول المعلمين والقاعات الأسبوعي، وجدول الإشراف اليومي) تنزيل ملف معاينة قابل للتعبئة (.xlsx) بنفس الهيكل والتعبئة، أو تصدير البيانات الحالية، أو رفع ملف جديد لاستبدال البيانات السابقة فوراً.
            </div>
          </div>

          <OperationalFileCard fileType="periods" />
          <OperationalFileCard fileType="schedule" />
          <OperationalFileCard fileType="supervision" />

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
                  استيراد نسخة محدثة من ملف الأنشطة والمؤشرات (.xlsx) مع فحص الفروقات
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  يقرأ النظام الخلايا الخضراء (#DFF0D8) كمواعيد مخططة، ويستبعد البيانات المالية وأنشطة الرواتب والبدلات آليًا، ويعرض الفروقات للمراجعة قبل التطبيق مع حفظ نسخة أرشيفية من الحالة السابقة.
                </p>
              </div>
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                <FileSpreadsheet size={16} />
                <span>{importLoading ? 'جاري تحليل الملف...' : 'رفع ملف أنشطة محدث (.xlsx)'}</span>
                <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleExcelUpload} />
              </label>
            </div>

            {importSuccessMsg && (
              <div className="alert-banner teal" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>{importSuccessMsg}</strong>
              </div>
            )}

            {diffReport && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 12, border: '1px solid var(--brand-teal)', background: 'var(--bg)' }}>
                <div style={{ fontWeight: 800, fontSize: '0.94rem', marginBottom: 8 }}>
                  نتيجة مقارنة الملف المرفوع ({diffReport.fileName}):
                </div>
                <div className="stats-grid">
                  <div className="stat-card" style={{ '--stat-color': '#00A59B' }}>
                    <div>
                      <div className="stat-value">{diffReport.newPrograms.length}</div>
                      <div className="stat-label">برامج جديدة مضافة</div>
                    </div>
                  </div>
                  <div className="stat-card" style={{ '--stat-color': '#f59e0b' }}>
                    <div>
                      <div className="stat-value">{diffReport.changedPrograms.length}</div>
                      <div className="stat-label">برامج تغيرت مواعيدها الخضراء</div>
                    </div>
                  </div>
                  <div className="stat-card" style={{ '--stat-color': '#ef4444' }}>
                    <div>
                      <div className="stat-value">{diffReport.disappearedPrograms.length}</div>
                      <div className="stat-label">برامج اختفت في النسخة الجديدة</div>
                    </div>
                  </div>
                  <div className="stat-card" style={{ '--stat-color': '#64748b' }}>
                    <div>
                      <div className="stat-value">{diffReport.excludedItems.length}</div>
                      <div className="stat-label">رواتب/بدلات مستبعدة آليًا</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: '0.82rem', fontWeight: 700 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={importOpts.applyNew} onChange={(e) => setImportOpts({ ...importOpts, applyNew: e.target.checked })} />
                    <span>إدراج البرامج الجديدة ({diffReport.newPrograms.length})</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={importOpts.applyChanged} onChange={(e) => setImportOpts({ ...importOpts, applyChanged: e.target.checked })} />
                    <span>تحديث البرامج المتغيرة ({diffReport.changedPrograms.length})</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={importOpts.applyRemoved} onChange={(e) => setImportOpts({ ...importOpts, applyRemoved: e.target.checked })} />
                    <span>إخفاء البرامج المختفية ({diffReport.disappearedPrograms.length})</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      applyReviewedActivitiesDiff(diffReport, importOpts);
                      setImportSuccessMsg(`تم اعتماد تحديث الملف (${diffReport.fileName}) بنجاح مع حفظ نسخة أرشيفية من الحالة السابقة!`);
                      setDiffReport(null);
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>اعتماد وتطبيق التحديث مع حفظ النسخة السابقة</span>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setDiffReport(null)}>
                    إلغاء المعاينة
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 8 }}>
              سجل دفعات الاستيراد والنسخ المحفوظة ({state.importBatches.length}):
            </div>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>الدفعة</th>
                    <th>اسم الملف المصدر</th>
                    <th>تاريخ التحديث بالملف</th>
                    <th>عدد السجلات المستوردة</th>
                    <th>المستبعدات</th>
                    <th>حالة المراجعة</th>
                  </tr>
                </thead>
                <tbody>
                  {state.importBatches.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td style={{ fontWeight: 800 }}>{b.fileName}</td>
                      <td>{b.fileUpdatedAt}</td>
                      <td>{b.recordsImported} سجل</td>
                      <td style={{ fontSize: '0.75rem' }}>{b.excludedReason || '—'}</td>
                      <td>
                        <StatusBadge status="تم الاعتماد والمراجعة" size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 6. NOTIFICATIONS CENTER (Scoped for User)                         */}
      {/* ================================================================= */}
      {subTab === 'notifications' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Bell size={18} color="var(--brand-teal)" />
              <span>مركز الإشعارات والتنبيهات التشغيلية ({scopedNotifications.length})</span>
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={markAllNotificationsRead}>
              تحديد الكل كمقروء
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scopedNotifications.map((ntf) => {
              const isRead = ntf.readBy?.includes(currentUser?.id || 'guest');
              return (
                <div
                  key={ntf.id}
                  onClick={() => markNotificationRead(ntf.id)}
                  style={{
                    padding: '0.8rem 1rem',
                    borderRadius: 11,
                    border: isRead ? '1px solid var(--border)' : '1.5px solid var(--brand-teal)',
                    background: isRead ? 'var(--bg)' : 'rgba(0,165,155,0.06)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--brand-teal)' }}>{ntf.type}</strong>
                    <span>{formatDateTimeAr(ntf.createdAt)}</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', marginTop: 3 }}>{ntf.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text)', marginTop: 2 }}>{ntf.message}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 7. IMMUTABLE AUDIT LOG & DELETION LOG (Req #41, #43)              */}
      {/* ================================================================= */}
      {subTab === 'audit' && canViewAuditLogs && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="card-title">
                <ShieldCheck size={18} color="var(--brand-teal)" />
                <span>سجل الإجراءات وسجل الحذف غير القابل للمسح ({filteredAuditLogs.length} عملية موثقة)</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                يوثق من نفذ الإجراء أو الحذف (`تم الحذف بواسطة: [اسم الموظف]`)، اسم المستخدم، التاريخ والوقت، نوع العنصر، والحالة السابقة والجديدة.
              </p>
            </div>
            <input
              type="text"
              className="form-input"
              style={{ width: 260 }}
              placeholder="بحث بالموظف أو الإجراء أو العنصر..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { k: 'all', lbl: 'جميع الإجراءات' },
              { k: 'deletions', lbl: 'سجل الحذف والاسترجاع' },
              { k: 'permissions', lbl: 'الصلاحيات والحسابات ونقل الأقسام' },
              { k: 'ops', lbl: 'الجدولة والاستثناءات والتشغيل' },
              { k: 'auth', lbl: 'تسجيل الدخول والخروج' },
            ].map((cat) => (
              <button
                key={cat.k}
                type="button"
                onClick={() => setAuditCategory(cat.k)}
                className={`btn btn-sm ${auditCategory === cat.k ? 'btn-teal' : 'btn-secondary'}`}
              >
                {cat.lbl}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>التاريخ والوقت</th>
                  <th>المنفذ واسم المستخدم</th>
                  <th>نوع الإجراء</th>
                  <th>العنصر المرتبط</th>
                  <th>التفاصيل (تم الحذف بواسطة / التغيير)</th>
                  <th>السبب</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map((log) => {
                  const isDel = `${log.actionType}`.includes('حذف');
                  return (
                    <tr key={log.id} style={isDel ? { background: 'rgba(239,68,68,0.05)' } : undefined}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.74rem' }}>{formatDateTimeAr(log.timestamp)}</td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{log.actorName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {log.actorUsername ? `@${log.actorUsername} • ` : ''}
                          {log.actorRole}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={isDel ? 'ملغي' : 'معتمد'} size="sm" />{' '}
                        <strong style={{ fontSize: '0.78rem', color: isDel ? '#b91c1c' : undefined }}>
                          {log.actionType}
                        </strong>
                      </td>
                      <td style={{ fontWeight: 700 }}>{log.entityTitle || log.entityId}</td>
                      <td style={{ fontSize: '0.76rem', maxWidth: 400 }}>
                        {isDel && (
                          <div style={{ fontWeight: 800, color: '#b91c1c', marginBottom: 2 }}>
                            تم الحذف بواسطة: {log.actorName} {log.actorUsername ? `(@${log.actorUsername})` : ''}
                          </div>
                        )}
                        <div>{log.summary}</div>
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>{log.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 8. RECYCLE BIN & FULL SYSTEM ADMIN RESTORE (Req #42 + Restore!)   */}
      {/* ================================================================= */}
      {subTab === 'trash' && canViewTrash && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="alert-banner teal" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: '0.82rem' }}>
              <strong>سلة المحذوفات والاسترجاع الكامل لمدير النظام:</strong> كل عنصر يُحذف في النظام يُحفظ هنا بنسخته الكاملة مع اسم الموظف الذي نفذ الحذف ووقته وسببه، ويمكن لمدير النظام استرجاع أي عنصر محذوف بضغطة زر واحدة إلى مكانه الأصلي دون فقدان أي بيانات.
            </div>
          </div>

          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {[
                { k: 'active', lbl: `قابلة للاسترجاع (${activeTrashCount})` },
                { k: 'restored', lbl: 'تم استرجاعها سابقًا' },
                { k: 'all', lbl: `الكل (${(state.deletedItems || []).length})` },
              ].map((st) => (
                <button
                  key={st.k}
                  type="button"
                  onClick={() => setTrashFilterStatus(st.k)}
                  className={`btn btn-sm ${trashFilterStatus === st.k ? 'btn-teal' : 'btn-secondary'}`}
                >
                  {st.lbl}
                </button>
              ))}
            </div>

            <select
              className="form-select"
              style={{ width: 220 }}
              value={trashEntityFilter}
              onChange={(e) => setTrashEntityFilter(e.target.value)}
            >
              <option value="all">جميع أنواع العناصر</option>
              <option value="employee">موظف وحساب مستخدم</option>
              <option value="program_execution">برنامج تنفيذي مجدول</option>
              <option value="subprogram">برنامج فرعي / فقرة</option>
              <option value="planned_occurrence">موعد مخطط في الخطة</option>
              <option value="task">مهمة وظيفية</option>
              <option value="department">قسم تشغيلي</option>
              <option value="venue">قاعة أو موقع</option>
              <option value="scope">نطاق أو فئة</option>
              <option value="student">طالب</option>
              <option value="supervision">تكليف إشراف يومي</option>
            </select>

            {hasPermission(currentUser, 'restore_deleted') &&
              filteredDeletedItems.some((it) => !it.isRestored) && (
                <div style={{ display: 'flex', gap: 6, marginRight: 'auto' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontWeight: 800 }}
                    onClick={() => {
                      const restorableIds = filteredDeletedItems
                        .filter((it) => !it.isRestored)
                        .map((it) => it.id);
                      setSelectedTrashIds(
                        selectedTrashIds.length === restorableIds.length ? [] : restorableIds
                      );
                    }}
                  >
                    <CheckSquare size={14} color="var(--brand-teal)" />
                    <span>
                      تحديد الكل ({filteredDeletedItems.filter((it) => !it.isRestored).length})
                    </span>
                  </button>
                  {selectedTrashIds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleBulkRestoreTrash}
                    >
                      <RotateCcw size={14} />
                      <span>استرجاع المحدد ({selectedTrashIds.length})</span>
                    </button>
                  )}
                </div>
              )}
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }} />
                  <th>نوع العنصر</th>
                  <th>اسم / عنوان العنصر المحذوف</th>
                  <th>تم الحذف بواسطة</th>
                  <th>تاريخ ووقت الحذف</th>
                  <th>سبب الحذف</th>
                  <th>الحالة / الاسترجاع</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeletedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '1.8rem', color: 'var(--text-muted)' }}>
                      لا توجد عناصر محذوفة مطابقة للفلتر الحالي.
                    </td>
                  </tr>
                ) : (
                  filteredDeletedItems.map((item) => {
                    const isTrSelected = selectedTrashIds.includes(item.id);
                    return (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center' }}>
                        {!item.isRestored && hasPermission(currentUser, 'restore_deleted') && (
                          <input
                            type="checkbox"
                            checked={isTrSelected}
                            onChange={() =>
                              setSelectedTrashIds((prev) =>
                                prev.includes(item.id)
                                  ? prev.filter((id) => id !== item.id)
                                  : [...prev, item.id]
                              )
                            }
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand-teal)' }}
                          />
                        )}
                      </td>
                      <td>
                        <span className="status-badge badge-muted">{item.entityTypeLabel || item.entityType}</span>
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--brand-ink)' }}>{item.entityTitle}</td>
                      <td>
                        <div style={{ fontWeight: 800, color: '#b91c1c' }}>
                          تم الحذف بواسطة: {item.deletedByName}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          @{item.deletedByUsername} • {item.deletedByRole}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>{formatDateTimeAr(item.deletedAt)}</td>
                      <td style={{ fontSize: '0.76rem' }}>{item.reason || '—'}</td>
                      <td>
                        {item.isRestored ? (
                          <div style={{ fontSize: '0.74rem', color: 'var(--approved-text)', fontWeight: 800 }}>
                            ✓ تم الاسترجاع بواسطة {item.restoredBy} ({formatDateTimeAr(item.restoredAt)})
                          </div>
                        ) : hasPermission(currentUser, 'restore_deleted') ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleRestoreItem(item)}
                          >
                            <RotateCcw size={14} />
                            <span>استرجاع العنصر المحذوف</span>
                          </button>
                        ) : (
                          <span className="status-badge badge-pending">بانتظار مدير النظام</span>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
