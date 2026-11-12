import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Layers,
  MapPin,
  Shield,
  Plus,
  CheckCircle2,
  X,
  Eye,
  Edit3,
  Sparkles,
  Trash2,
  KeyRound,
  ShieldCheck,
  Power,
  GraduationCap,
  ArrowRightLeft,
  CheckSquare,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { WORK_DAYS_AR, getDatesForGlobalWeek, formatTime12Ar } from '../engine/dateUtils';
import {
  getEmployeeSupervisionBlocks,
  getEmployeeDailyChronologicalSchedule,
  getVenuesAvailability,
} from '../engine/conflictEngine';
import {
  ROLES_META,
  ACCESS_SCOPES,
  PERMISSIONS_GROUPS,
  ALL_PERMISSION_KEYS,
  buildPresetPermissions,
  hasPermission,
  canAccessDepartment,
  canDeleteEntity,
} from '../engine/permissions';
import { StatusBadge, DepartmentPill } from '../components/StatusBadge';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { OperationalFileCard } from '../components/OperationalFilesToolbar';
import SupervisionLeadershipPlatform from '../components/SupervisionLeadershipPlatform';

/**
 * Unified Operational Resources, Employee Accounts & Permissions, Students DB & Daily Supervision (v2.0)
 */
export default function ResourcesViews({ activeSubTab = 'employees', onOpenDetailModal = null, onOpenEvaluation = null }) {
  const {
    state,
    activeGlobalWeek,
    currentUser,
    manageEmployeeAccount,
    saveStudent,
    saveResourceEntity,
    softDeleteEntity,
    bulkSoftDeleteEntities,
  } = useOps();

  const canViewEmployees = hasPermission(currentUser, 'view_employees');
  const canCreateEmployee = hasPermission(currentUser, 'create_employee');
  const canEditEmployees = hasPermission(currentUser, 'edit_employees');
  const canManagePermissions = hasPermission(currentUser, 'manage_permissions');
  const canCreateResource = hasPermission(currentUser, 'create_resource');
  const canEditTimetable = hasPermission(currentUser, 'edit_timetable');
  const canEditSupervision = hasPermission(currentUser, 'edit_supervision');
  const canViewStudents =
    hasPermission(currentUser, 'view_dept_programs') ||
    hasPermission(currentUser, 'view_all_club_programs') ||
    canCreateResource;

  const resolveDefaultTab = (requested) => {
    if (requested === 'employees' && !canViewEmployees) return 'supervision';
    if (requested === 'students' && !canViewStudents) return 'supervision';
    return requested || (canViewEmployees ? 'employees' : 'supervision');
  };

  const [subTab, setSubTab] = useState(() => resolveDefaultTab(activeSubTab));

  useEffect(() => {
    setSubTab(resolveDefaultTab(activeSubTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, canViewEmployees, canViewStudents]);

  const [bannerMsg, setBannerMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteItems, setBulkDeleteItems] = useState(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedScopeIds, setSelectedScopeIds] = useState([]);
  const [selectedVenueIds, setSelectedVenueIds] = useState([]);
  const [selectedSupIds, setSelectedSupIds] = useState([]);

  // ---- Employee List & Unified Card Modal State ----
  const [empSearch, setEmpSearch] = useState('');
  const [empDeptFilter, setEmpDeptFilter] = useState('all');
  const [empStatusFilter, setEmpStatusFilter] = useState('all');
  const [cardEmpId, setCardEmpId] = useState(null);
  const [cardInnerTab, setCardInnerTab] = useState('schedule'); // 'schedule' | 'account'
  const [acctForm, setAcctForm] = useState(null);
  const [savingAccount, setSavingAccount] = useState(false);

  // New / Edit Employee Modal State
  const [newEmpModal, setNewEmpModal] = useState(null);

  // ---- Students DB State (Req #28–#30) ----
  const [studentSearch, setStudentSearch] = useState('');
  const [studentScopeFilter, setStudentScopeFilter] = useState('all');
  const [editingStudent, setEditingStudent] = useState(null);

  // ---- Scopes State ----
  const [selectedScopeId, setSelectedScopeId] = useState(state.scopes[0]?.id || 'SCP-01');
  const [editingScope, setEditingScope] = useState(null);

  // ---- Venues State ----
  const [selectedVenueId, setSelectedVenueId] = useState(state.venues[0]?.id || 'VEN-01');
  const [venueCheckDay, setVenueCheckDay] = useState('الاثنين');
  const [venueCheckPeriod, setVenueCheckPeriod] = useState('P1');
  const [editingVenue, setEditingVenue] = useState(null);

  // ---- Supervision State ----
  const [supFloorFilter, setSupFloorFilter] = useState('all');
  const [supSearch, setSupSearch] = useState('');
  const [editingSup, setEditingSup] = useState(null);

  const weekDates = useMemo(() => getDatesForGlobalWeek(activeGlobalWeek), [activeGlobalWeek]);
  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);

  const cardEmp = useMemo(
    () => (cardEmpId ? state.employees.find((e) => e.id === cardEmpId) || null : null),
    [cardEmpId, state.employees]
  );

  // Build account/permissions form whenever cardEmp opens or updates
  const openEmployeeCard = (emp, initialTab = 'schedule') => {
    setCardEmpId(emp.id);
    setCardInnerTab(initialTab);
    const roleKey = emp.role || emp.systemRole || 'employee';
    const isAdminBool = Boolean(emp.isAdmin || roleKey === 'full_admin' || roleKey === 'custom_admin');
    setAcctForm({
      id: emp.id,
      name: emp.name || '',
      username: emp.username || '',
      newPassword: '',
      jobTitle: emp.jobTitle || '',
      departmentId: emp.departmentId || '',
      role: roleKey,
      isAdmin: isAdminBool,
      adminLevel: emp.adminLevel || (roleKey === 'full_admin' ? 'full_admin' : 'custom_admin'),
      accessScope: emp.accessScope || ROLES_META[roleKey]?.defaultScope || 'self',
      accountStatus: emp.accountStatus || 'نشط',
      assignAsDeptHead: false,
      permissions: {
        ...buildPresetPermissions(roleKey),
        ...(emp.permissions || {}),
      },
      reason: '',
    });
  };

  // Scope-aware Employees list (Dept Head sees own department; Club Director & Admin see all)
  const visibleDepartments = useMemo(() => {
    if (
      currentUser?.isAdmin ||
      currentUser?.accessScope === 'system' ||
      currentUser?.accessScope === 'club'
    ) {
      return state.departments;
    }
    return state.departments.filter((d) => canAccessDepartment(currentUser, d.id));
  }, [state.departments, currentUser]);

  const filteredEmployees = useMemo(() => {
    return state.employees.filter((e) => {
      if (
        !currentUser?.isAdmin &&
        currentUser?.accessScope === 'department' &&
        e.departmentId !== currentUser?.departmentId
      ) {
        return false;
      }
      if (empDeptFilter !== 'all' && e.departmentId !== empDeptFilter) return false;
      if (empStatusFilter !== 'all' && (e.accountStatus || 'نشط') !== empStatusFilter) return false;
      if (
        empSearch.trim() &&
        !`${e.name} ${e.username || ''} ${e.jobTitle || ''} ${e.customRoleLabel || ''} ${e.supervisionRole || ''}`
          .toLowerCase()
          .includes(empSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [state.employees, currentUser, empDeptFilter, empStatusFilter, empSearch]);

  const filteredStudents = useMemo(() => {
    const list = state.students || [];
    return list.filter((st) => {
      if (studentScopeFilter !== 'all' && st.scopeId !== studentScopeFilter) return false;
      if (
        studentSearch.trim() &&
        !`${st.name} ${st.scopeName || ''} ${st.id}`.toLowerCase().includes(studentSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [state.students, studentScopeFilter, studentSearch]);

  const unusedHalls = useMemo(
    () => state.venues.filter((v) => (v.occupiedPeriodsInClassTable || 0) === 0),
    [state.venues]
  );

  const liveVenueSplit = useMemo(
    () =>
      getVenuesAvailability(
        {
          day: venueCheckDay,
          executionDate: weekDates[venueCheckDay],
          periodId: venueCheckPeriod,
        },
        state
      ),
    [venueCheckDay, venueCheckPeriod, weekDates, state]
  );

  const myPersonalSupervisionBlocks = useMemo(() => {
    if (!currentUser?.employeeId) return [];
    return getEmployeeSupervisionBlocks(currentUser.employeeId, state, { forDisplay: true });
  }, [currentUser, state]);

  const filteredSupervision = useMemo(() => {
    return state.supervisionDuties.filter((s) => {
      if (supFloorFilter !== 'all' && s.floor !== supFloorFilter) return false;
      const supName = s.supervisor || s.supervisorName || '';
      const sysName = s.systemSup || s.systemSupervisorName || '';
      const recLoc = s.reception || s.receptionLocation || '';
      const asrLoc = s.asrHall || s.asrPrayer?.location || '';
      if (
        supSearch.trim() &&
        !`${supName} ${s.generalSup || ''} ${sysName} ${recLoc} ${asrLoc}`.includes(supSearch.trim())
      ) {
        return false;
      }
      return true;
    });
  }, [state.supervisionDuties, supFloorFilter, supSearch]);

  // Handlers
  const handleToggleAccountStatusQuick = async (emp) => {
    if (!canEditEmployees && !canManagePermissions) return;
    if (emp.id === currentUser?.employeeId) {
      setBannerMsg({ type: 'warn', text: 'لا يمكنك تعطيل حسابك الشخصي الحالي أثناء تسجيل الدخول.' });
      return;
    }
    const nextStatus = (emp.accountStatus || 'نشط') === 'نشط' ? 'غير نشط' : 'نشط';
    const res = await manageEmployeeAccount({
      ...emp,
      accountStatus: nextStatus,
      reason: nextStatus === 'غير نشط' ? 'تعطيل الحساب من سجل الموظفين' : 'إعادة تفعيل الحساب من سجل الموظفين',
    });
    if (res?.ok) {
      setBannerMsg({
        type: 'teal',
        text: `تم تحديث حالة حساب «${emp.name}» إلى (${nextStatus}) بنجاح.`,
      });
    } else if (res?.error) {
      setBannerMsg({ type: 'warn', text: res.error });
    }
  };

  const handleSaveCardAccount = async (e) => {
    e.preventDefault();
    if (!acctForm) return;
    setSavingAccount(true);
    try {
      const effectiveRole = acctForm.isAdmin ? acctForm.adminLevel || 'custom_admin' : acctForm.role;
      const res = await manageEmployeeAccount({
        ...acctForm,
        role: effectiveRole,
      });
      if (res?.ok) {
        setBannerMsg({
          type: 'teal',
          text: `تم حفظ إعدادات الحساب والصلاحيات للموظف «${res.employee.name}» (@${res.employee.username}) وتطبيقها فورًا.`,
        });
        openEmployeeCard(res.employee, 'account');
      } else {
        setBannerMsg({ type: 'warn', text: res?.error || 'تعذر حفظ الحساب.' });
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveNewEmployeeModal = async (e) => {
    e.preventDefault();
    if (!newEmpModal?.name?.trim() || !newEmpModal?.username?.trim()) {
      setBannerMsg({ type: 'warn', text: 'يرجى إدخال اسم الموظف واسم المستخدم.' });
      return;
    }
    setSavingAccount(true);
    try {
      const effectiveRole = newEmpModal.isAdmin ? newEmpModal.adminLevel || 'custom_admin' : newEmpModal.role;
      const res = await manageEmployeeAccount({
        ...newEmpModal,
        role: effectiveRole,
        permissions: buildPresetPermissions(effectiveRole),
      });
      if (res?.ok) {
        setBannerMsg({
          type: 'teal',
          text: `تم إنشاء حساب الموظف «${res.employee.name}» (@${res.employee.username}) بنجاح.`,
        });
        setNewEmpModal(null);
      } else {
        setBannerMsg({ type: 'warn', text: res?.error || 'تعذر حفظ الموظف.' });
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const handleConfirmDelete = async (reason) => {
    if (bulkDeleteItems?.length > 0) {
      const res = await bulkSoftDeleteEntities(bulkDeleteItems, reason);
      if (res?.ok) {
        setBannerMsg({
          type: 'teal',
          text: `تم حذف (${res.count}) عناصر محددة بأمان وحفظ نسخ كاملة قابلة للاسترجاع في سلة المحذوفات.`,
        });
        setSelectedEmpIds([]);
        setSelectedStudentIds([]);
        setSelectedScopeIds([]);
        setSelectedVenueIds([]);
        setSelectedSupIds([]);
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
      if (deleteTarget.entityType === 'employee' && cardEmpId === deleteTarget.entityId) {
        setCardEmpId(null);
      }
      setBannerMsg({
        type: 'teal',
        text: `تم حذف «${deleteTarget.entityTitle}» بأمان وحفظ نسخة كاملة في سلة المحذوفات وسجل الإجراءات.`,
      });
    } else if (res?.error) {
      setBannerMsg({ type: 'warn', text: res.error });
    }
    setDeleteTarget(null);
  };

  const deletableEmployees = useMemo(
    () =>
      filteredEmployees.filter(
        (emp) => emp.id !== currentUser?.employeeId && canDeleteEntity(currentUser, 'employee', emp.departmentId)
      ),
    [filteredEmployees, currentUser]
  );
  const allEmpsSelected =
    deletableEmployees.length > 0 && deletableEmployees.every((e) => selectedEmpIds.includes(e.id));

  const canDeleteStudents = canDeleteEntity(currentUser, 'student');
  const allStudentsSelected =
    canDeleteStudents &&
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedStudentIds.includes(s.id));

  const canDeleteScopes = canDeleteEntity(currentUser, 'scope');
  const allScopesSelected =
    canDeleteScopes &&
    state.scopes.length > 0 &&
    state.scopes.every((sc) => selectedScopeIds.includes(sc.id));

  const canDeleteVenues = canDeleteEntity(currentUser, 'venue');
  const allVenuesSelected =
    canDeleteVenues &&
    state.venues.length > 0 &&
    state.venues.every((v) => selectedVenueIds.includes(v.id));

  const canDeleteSup = canDeleteEntity(currentUser, 'supervision');
  const allSupsSelected =
    canDeleteSup &&
    filteredSupervision.length > 0 &&
    filteredSupervision.every((sr) => selectedSupIds.includes(sr.id));

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Top Sub-Navigation */}
      <div className="card" style={{ padding: '0.85rem 1.15rem' }}>
        <div className="tabs-bar" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          {canViewEmployees && (
            <button
              type="button"
              className={`tab-btn ${subTab === 'employees' ? 'active' : ''}`}
              onClick={() => setSubTab('employees')}
            >
              <Users size={15} />
              <span>الموظفون والحسابات ({filteredEmployees.length})</span>
            </button>
          )}
          {canViewStudents && (
            <button
              type="button"
              className={`tab-btn ${subTab === 'students' ? 'active' : ''}`}
              onClick={() => setSubTab('students')}
            >
              <GraduationCap size={15} />
              <span>قاعدة بيانات الطلاب ({(state.students || []).length})</span>
            </button>
          )}
          <button
            type="button"
            className={`tab-btn ${subTab === 'scopes' ? 'active' : ''}`}
            onClick={() => setSubTab('scopes')}
          >
            <Layers size={15} />
            <span>الفئات والنطاقات ({state.scopes.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${subTab === 'venues' ? 'active' : ''}`}
            onClick={() => setSubTab('venues')}
          >
            <MapPin size={15} />
            <span>القاعات والمواقع ({state.venues.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${subTab === 'supervision' ? 'active' : ''}`}
            onClick={() => setSubTab('supervision')}
          >
            <Shield size={15} />
            <span>الإشراف اليومي المعتمد ({state.supervisionDuties.length})</span>
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className={`alert-banner ${bannerMsg.type === 'warn' ? 'warn' : 'teal'}`} style={{ marginBottom: 0 }}>
          <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>{bannerMsg.text}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setBannerMsg(null)}>
            إغلاق
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. EMPLOYEES, ACCOUNTS & PERMISSIONS (Req #2, #4, #36–#44)        */}
      {/* ================================================================= */}
      {subTab === 'employees' && canViewEmployees && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <select
              className="form-select"
              style={{ width: 215 }}
              value={empDeptFilter}
              onChange={(e) => setEmpDeptFilter(e.target.value)}
            >
              <option value="all">جميع الأقسام المتاحة ({filteredEmployees.length})</option>
              {visibleDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: 155 }}
              value={empStatusFilter}
              onChange={(e) => setEmpStatusFilter(e.target.value)}
            >
              <option value="all">كل حالات الحساب</option>
              <option value="نشط">حساب نشط</option>
              <option value="غير نشط">حساب غير نشط</option>
            </select>

            <input
              type="text"
              className="form-input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="بحث باسم الموظف أو اسم المستخدم (@username) أو الوظيفة أو الدور..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
            />

            {deletableEmployees.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ fontWeight: 800 }}
                  onClick={() =>
                    setSelectedEmpIds(allEmpsSelected ? [] : deletableEmployees.map((e) => e.id))
                  }
                >
                  <CheckSquare size={14} color="var(--brand-teal)" />
                  <span>
                    {allEmpsSelected
                      ? `إلغاء تحديد الكل (${deletableEmployees.length})`
                      : `تحديد الكل (${deletableEmployees.length})`}
                  </span>
                </button>
                {selectedEmpIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() =>
                      setBulkDeleteItems(
                        deletableEmployees
                          .filter((e) => selectedEmpIds.includes(e.id))
                          .map((e) => ({
                            entityType: 'employee',
                            entityId: e.id,
                            entityTitle: `${e.name} (@${e.username || e.id})`,
                          }))
                      )
                    }
                  >
                    <Trash2 size={14} />
                    <span>حذف المحدد ({selectedEmpIds.length})</span>
                  </button>
                )}
              </div>
            )}

            {canCreateEmployee && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  setNewEmpModal({
                    name: '',
                    username: '',
                    newPassword: '',
                    departmentId: visibleDepartments[0]?.id || 'dept_tarbawi',
                    jobTitle: 'أخصائي برامج',
                    role: 'employee',
                    isAdmin: false,
                    adminLevel: 'custom_admin',
                    accessScope: 'self',
                    accountStatus: 'نشط',
                  })
                }
              >
                <Plus size={15} />
                <span>+ إضافة موظف وإنشاء حساب</span>
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    {deletableEmployees.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allEmpsSelected}
                        onChange={() =>
                          setSelectedEmpIds(allEmpsSelected ? [] : deletableEmployees.map((e) => e.id))
                        }
                        title="تحديد الكل / إلغاء تحديد الكل"
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand-teal)' }}
                      />
                    )}
                  </th>
                  <th>الرقم</th>
                  <th>اسم الموظف واسم المستخدم</th>
                  <th>القسم</th>
                  <th>المسمى الوظيفي</th>
                  <th>الدور ونطاق الصلاحية</th>
                  <th>حالة الحساب</th>
                  <th>الالتزامات الأسبوعية</th>
                  <th>إجراءات الموظف والحساب</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  const classCount = state.weeklyCommitments.filter((w) => w.leadEmployeeId === emp.id).length;
                  const execCount = state.scheduledExecutions.filter(
                    (ex) => ex.leadEmployeeId === emp.id || (ex.participatingEmployeeIds || []).includes(emp.id)
                  ).length;
                  const roleMeta = ROLES_META[emp.role] || ROLES_META.employee;
                  const scopeMeta = ACCESS_SCOPES[emp.accessScope] || ACCESS_SCOPES.self;
                  const canDeleteThisEmp =
                    emp.id !== currentUser?.employeeId &&
                    canDeleteEntity(currentUser, 'employee', emp.departmentId);
                  const isEmpSelected = selectedEmpIds.includes(emp.id);

                  return (
                    <tr
                      key={emp.id}
                      style={isEmpSelected ? { background: 'rgba(239, 68, 68, 0.06)' } : undefined}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {canDeleteThisEmp && (
                          <input
                            type="checkbox"
                            checked={isEmpSelected}
                            onChange={() =>
                              setSelectedEmpIds((prev) =>
                                prev.includes(emp.id) ? prev.filter((id) => id !== emp.id) : [...prev, emp.id]
                              )
                            }
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                        )}
                      </td>
                      <td style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{emp.id}</td>
                      <td>
                        <div style={{ fontWeight: 800, color: 'var(--brand-ink)' }}>{emp.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--brand-teal)', fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>
                          @{emp.username || emp.id.toLowerCase()}
                        </div>
                      </td>
                      <td>
                        {emp.departmentId ? (
                          <DepartmentPill
                            deptId={emp.departmentId}
                            deptName={emp.departmentName}
                            departments={state.departments}
                          />
                        ) : (
                          <span className="status-badge badge-muted" style={{ fontSize: '0.69rem' }}>
                            {emp.departmentName || 'الإدارة العامة'}
                          </span>
                        )}
                      </td>
                      <td>{emp.jobTitle}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <span
                            style={{
                              background: `${roleMeta.badgeColor}18`,
                              color: roleMeta.badgeColor,
                              border: `1px solid ${roleMeta.badgeColor}44`,
                              borderRadius: 999,
                              padding: '2px 9px',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                            }}
                          >
                            {emp.customRoleLabel || roleMeta.label}
                          </span>
                          {emp.isAdmin && (
                            <span className="status-badge badge-approved" style={{ fontSize: '0.66rem' }}>
                              Admin
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          النطاق: {scopeMeta.label}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={emp.accountStatus || 'نشط'} size="sm" />
                      </td>
                      <td style={{ fontSize: '0.76rem' }}>
                        <strong>{classCount}</strong> حصة {execCount > 0 ? `+ ${execCount} برنامج` : ''}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-teal"
                            onClick={() => openEmployeeCard(emp, 'schedule')}
                            title="عرض الجدول والإشراف والبرامج"
                          >
                            <Eye size={13} />
                            <span>البطاقة</span>
                          </button>

                          {(canEditEmployees || canManagePermissions) && (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => openEmployeeCard(emp, 'account')}
                              title="الحساب وكلمة المرور ونقل القسم والصلاحيات ومنح Admin"
                            >
                              <ShieldCheck size={13} />
                              <span>الحساب والصلاحيات</span>
                            </button>
                          )}

                          {(canEditEmployees || canManagePermissions) && emp.id !== currentUser?.employeeId && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{
                                color: (emp.accountStatus || 'نشط') === 'نشط' ? '#d97706' : '#059669',
                              }}
                              onClick={() => handleToggleAccountStatusQuick(emp)}
                              title={(emp.accountStatus || 'نشط') === 'نشط' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              <Power size={14} />
                            </button>
                          )}

                          {canDeleteThisEmp && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ color: '#dc2626' }}
                              title="حذف الموظف (حذف آمن قابل للاسترجاع)"
                              onClick={() =>
                                setDeleteTarget({
                                  entityType: 'employee',
                                  entityId: emp.id,
                                  entityTypeLabel: 'موظف وحساب مستخدم',
                                  entityTitle: `${emp.name} (@${emp.username})`,
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. STUDENTS DATABASE TAB (Req #28–#30)                            */}
      {/* ================================================================= */}
      {subTab === 'students' && canViewStudents && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="alert-banner teal" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: '0.81rem' }}>
              <strong>قاعدة بيانات الطلاب المستهدفين بالبرامج النوعية والخاصة:</strong> تتيح اختيار طلاب محددين بالاسم عند جدولة أي برنامج، مع كشف تعارض الطالب آليًا إذا كان مسجلًا في برنامجين متزامنين في نفس الوقت.
            </div>
            {canCreateResource && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  setEditingStudent({
                    id: '',
                    name: '',
                    scopeId: state.scopes[0]?.id || '',
                    grade: 'المرحلة المتوسطة',
                    guardianPhone: '',
                    status: 'نشط',
                  })
                }
              >
                <Plus size={14} />
                <span>+ إضافة طالب جديد</span>
              </button>
            )}
          </div>

          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <select
              className="form-select"
              style={{ width: 220 }}
              value={studentScopeFilter}
              onChange={(e) => setStudentScopeFilter(e.target.value)}
            >
              <option value="all">جميع الفئات والنطاقات ({(state.students || []).length})</option>
              {state.scopes.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              className="form-input"
              style={{ flex: 1 }}
              placeholder="بحث باسم الطالب أو رقمه أو الفئة..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            {canDeleteStudents && filteredStudents.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ fontWeight: 800 }}
                  onClick={() =>
                    setSelectedStudentIds(allStudentsSelected ? [] : filteredStudents.map((s) => s.id))
                  }
                >
                  <CheckSquare size={14} color="var(--brand-teal)" />
                  <span>
                    {allStudentsSelected
                      ? `إلغاء تحديد الكل (${filteredStudents.length})`
                      : `تحديد الكل (${filteredStudents.length})`}
                  </span>
                </button>
                {selectedStudentIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() =>
                      setBulkDeleteItems(
                        filteredStudents
                          .filter((s) => selectedStudentIds.includes(s.id))
                          .map((s) => ({
                            entityType: 'student',
                            entityId: s.id,
                            entityTitle: s.name,
                          }))
                      )
                    }
                  >
                    <Trash2 size={14} />
                    <span>حذف المحدد ({selectedStudentIds.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    {canDeleteStudents && filteredStudents.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allStudentsSelected}
                        onChange={() =>
                          setSelectedStudentIds(allStudentsSelected ? [] : filteredStudents.map((s) => s.id))
                        }
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand-teal)' }}
                      />
                    )}
                  </th>
                  <th>الرقم</th>
                  <th>اسم الطالب</th>
                  <th>النطاق / الفئة</th>
                  <th>المرحلة</th>
                  <th>البرامج المجدول بها بالاسم</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st) => {
                  const linkedProgs = state.scheduledExecutions.filter(
                    (ex) => ex.status !== 'ملغي' && (ex.studentIds || []).includes(st.id)
                  );
                  const isStuSelected = selectedStudentIds.includes(st.id);
                  return (
                    <tr
                      key={st.id}
                      style={isStuSelected ? { background: 'rgba(239, 68, 68, 0.06)' } : undefined}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {canDeleteStudents && (
                          <input
                            type="checkbox"
                            checked={isStuSelected}
                            onChange={() =>
                              setSelectedStudentIds((prev) =>
                                prev.includes(st.id) ? prev.filter((id) => id !== st.id) : [...prev, st.id]
                              )
                            }
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                        )}
                      </td>
                      <td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{st.id}</td>
                      <td style={{ fontWeight: 800, color: 'var(--brand-ink)' }}>{st.name}</td>
                      <td>{scopeMap[st.scopeId] || st.scopeName || '—'}</td>
                      <td>{st.grade || '—'}</td>
                      <td style={{ fontSize: '0.75rem' }}>
                        {linkedProgs.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)' }}>ضمن برامج فئته العامة</span>
                        ) : (
                          linkedProgs.map((lp) => lp.programName).join(' • ')
                        )}
                      </td>
                      <td>
                        <StatusBadge status={st.status || 'نشط'} size="sm" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {canCreateResource && (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => setEditingStudent({ ...st })}
                            >
                              <Edit3 size={13} />
                              <span>تعديل</span>
                            </button>
                          )}
                          {canDeleteEntity(currentUser, 'student') && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ color: '#dc2626' }}
                              title="حذف الطالب"
                              onClick={() =>
                                setDeleteTarget({
                                  entityType: 'student',
                                  entityId: st.id,
                                  entityTypeLabel: 'طالب من قاعدة البيانات',
                                  entityTitle: st.name,
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. SCOPES / STUDENT BENEFICIARY GROUPS                            */}
      {/* ================================================================= */}
      {subTab === 'scopes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '1rem', alignItems: 'start' }}>
          <div className="card" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '0.86rem' }}>الفئات والنطاقات ({state.scopes.length})</span>
              {canCreateResource && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setEditingScope({ id: '', name: '', stage: 'المرحلة المتوسطة', sourceFile: 'إضافة عبر المنصة' })}
                >
                  <Plus size={13} />
                  <span>إضافة فئة</span>
                </button>
              )}
            </div>
            {canDeleteScopes && state.scopes.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ fontSize: '0.72rem', fontWeight: 800, flex: 1 }}
                  onClick={() =>
                    setSelectedScopeIds(allScopesSelected ? [] : state.scopes.map((sc) => sc.id))
                  }
                >
                  <CheckSquare size={13} color="var(--brand-teal)" />
                  <span>{allScopesSelected ? 'إلغاء تحديد الكل' : `تحديد الكل (${state.scopes.length})`}</span>
                </button>
                {selectedScopeIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() =>
                      setBulkDeleteItems(
                        state.scopes
                          .filter((sc) => selectedScopeIds.includes(sc.id))
                          .map((sc) => ({
                            entityType: 'scope',
                            entityId: sc.id,
                            entityTitle: sc.name,
                          }))
                      )
                    }
                  >
                    <Trash2 size={13} />
                    <span>حذف ({selectedScopeIds.length})</span>
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 540, overflowY: 'auto' }}>
              {state.scopes.map((sc) => {
                const isScSelected = selectedScopeIds.includes(sc.id);
                return (
                  <div
                    key={sc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0.6rem 0.75rem',
                      borderRadius: 10,
                      border: isScSelected
                        ? '1.5px solid #dc2626'
                        : selectedScopeId === sc.id
                        ? '2px solid var(--brand-teal)'
                        : '1px solid var(--border)',
                      background: isScSelected
                        ? 'rgba(239,68,68,0.06)'
                        : selectedScopeId === sc.id
                        ? 'rgba(0,165,155,0.09)'
                        : 'var(--bg)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedScopeId(sc.id)}
                  >
                    {canDeleteScopes && (
                      <input
                        type="checkbox"
                        checked={isScSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() =>
                          setSelectedScopeIds((prev) =>
                            prev.includes(sc.id) ? prev.filter((id) => id !== sc.id) : [...prev, sc.id]
                          )
                        }
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--brand-ink)' }}>{sc.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sc.stage}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            {(() => {
              const sc = state.scopes.find((x) => x.id === selectedScopeId) || state.scopes[0];
              if (!sc) return null;
              return (
                <>
                  <div className="card-header">
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                        جدول ارتباطات الفئة / النطاق: «{sc.name}» ({sc.stage})
                      </h3>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        يمنع النظام آليًا إسناد نفس الفئة لنشاطين متزامنين في الوقت نفسه حتى لو اختلف القسم أو المعلم أو القاعة.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(canCreateResource || canEditTimetable) && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingScope({ ...sc })}>
                          <Edit3 size={13} />
                          <span>تعديل الفئة</span>
                        </button>
                      )}
                      {canDeleteEntity(currentUser, 'scope') && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() =>
                            setDeleteTarget({
                              entityType: 'scope',
                              entityId: sc.id,
                              entityTypeLabel: 'نطاق / فئة طلابية',
                              entityTitle: sc.name,
                            })
                          }
                        >
                          <Trash2 size={13} />
                          <span>حذف الفئة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>اليوم</th>
                          <th>الفترة الأولى</th>
                          <th>الفترة الثانية</th>
                          <th>الفترة الثالثة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WORK_DAYS_AR.map((dayAr) => (
                          <tr key={dayAr}>
                            <td style={{ fontWeight: 800, background: 'var(--bg)' }}>{dayAr}</td>
                            {['P1', 'P2', 'P3'].map((pid) => {
                              const wItems = state.weeklyCommitments.filter(
                                (w) => w.day === dayAr && w.periodId === pid && (w.scopeIds || []).includes(sc.id)
                              );
                              const exItems = state.scheduledExecutions.filter((ex) => {
                                if (ex.status === 'ملغي' || ex.status === 'مرفوض' || ex.status === 'مسودة') return false;
                                const cov = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
                                return ex.day === dayAr && cov.includes(pid) && (ex.scopeIds || []).includes(sc.id);
                              });
                              return (
                                <td key={pid}>
                                  {wItems.length === 0 && exItems.length === 0 ? (
                                    <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>
                                      متاحة للبرامج
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {wItems.map((w) => (
                                        <div key={w.id} style={{ fontSize: '0.76rem' }}>
                                          <strong>{w.title || w.activityTitle}</strong>
                                          <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                                            {empMap[w.leadEmployeeId || w.employeeId] || w.employeeName} • {venueMap[w.venueId] || w.venueName || 'بدون قاعة'}
                                          </div>
                                        </div>
                                      ))}
                                      {exItems.map((ex) => (
                                        <div key={ex.id} style={{ fontSize: '0.76rem', color: 'var(--brand-teal)', fontWeight: 800 }}>
                                          [برنامج قسم] {ex.programName} ({ex.departmentName})
                                        </div>
                                      ))}
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
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. VENUES & OPERATIONAL SITES                                     */}
      {/* ================================================================= */}
      {subTab === 'venues' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="alert-banner teal" style={{ marginBottom: 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} color="var(--brand-teal)" />
                <span>قاعات ومرافق غير مشغولة بحصص دراسية ثابتة في «جدول القاعات» ومقترحة لبرامج الأقسام ({unusedHalls.length} قاعة ومرفق):</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {unusedHalls.map((uh) => (
                  <span key={uh.id} className="status-badge badge-approved">
                    {uh.name} ({uh.type})
                  </span>
                ))}
              </div>
            </div>
            {canCreateResource && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  setEditingVenue({
                    id: '',
                    name: '',
                    fullName: '',
                    type: 'قاعة متخصصة',
                    status: 'متاح',
                    notes: '',
                    sourceFile: 'إضافة عبر المنصة',
                  })
                }
              >
                <Plus size={14} />
                <span>إضافة قاعة / موقع</span>
              </button>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: '0.85rem' }}>
              <div className="card-title">
                <span>فاحص القاعات المتاحة مقابل المشغولة حسب اليوم والفترة</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="form-select" style={{ width: 140 }} value={venueCheckDay} onChange={(e) => setVenueCheckDay(e.target.value)}>
                  {WORK_DAYS_AR.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select className="form-select" style={{ width: 170 }} value={venueCheckPeriod} onChange={(e) => setVenueCheckPeriod(e.target.value)}>
                  {state.periods.filter((p) => p.category === 'program_period').map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="comparison-grid">
              <div style={{ background: 'var(--bg)', padding: '0.85rem', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 800, color: 'var(--approved-text)', marginBottom: 8 }}>
                  القاعات المتاحة ({liveVenueSplit.availableVenues.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {liveVenueSplit.availableVenues.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setSelectedVenueId(v.id)}
                    >
                      <CheckCircle2 size={13} color="#00A59B" />
                      <span>{v.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--bg)', padding: '0.85rem', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 800, color: 'var(--conflict-text)', marginBottom: 8 }}>
                  القاعات المشغولة وتفاصيل إشغالها ({liveVenueSplit.occupiedVenues.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 210, overflowY: 'auto' }}>
                  {liveVenueSplit.occupiedVenues.map(({ venue, occupancies }) => (
                    <div
                      key={venue.id}
                      onClick={() => setSelectedVenueId(venue.id)}
                      style={{ fontSize: '0.76rem', padding: '5px 8px', background: 'var(--card-bg)', borderRadius: 8, border: '1px solid #fecaca', cursor: 'pointer' }}
                    >
                      <strong style={{ color: '#b91c1c' }}>{venue.name}</strong>:{' '}
                      {occupancies.map((o) => `${o.programName} | ${o.departmentName} | الفئة: ${o.scopeName} | ${o.timeRange}`).join(' ، ')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800 }}>الجدول الأسبوعي للقاعة المختارة:</span>
                <select className="form-select" style={{ width: 250 }} value={selectedVenueId} onChange={(e) => setSelectedVenueId(e.target.value)}>
                  {state.venues.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.type} — {v.status})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {canDeleteVenues && state.venues.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ fontWeight: 800 }}
                      onClick={() =>
                        setSelectedVenueIds(allVenuesSelected ? [] : state.venues.map((v) => v.id))
                      }
                    >
                      <CheckSquare size={13} color="var(--brand-teal)" />
                      <span>
                        {allVenuesSelected
                          ? `إلغاء تحديد الكل (${state.venues.length})`
                          : `تحديد كل القاعات (${state.venues.length})`}
                      </span>
                    </button>
                    {selectedVenueIds.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          setBulkDeleteItems(
                            state.venues
                              .filter((v) => selectedVenueIds.includes(v.id))
                              .map((v) => ({
                                entityType: 'venue',
                                entityId: v.id,
                                entityTitle: v.name,
                              }))
                          )
                        }
                      >
                        <Trash2 size={13} />
                        <span>حذف المحدد ({selectedVenueIds.length})</span>
                      </button>
                    )}
                  </>
                )}
                {(canCreateResource || canEditTimetable) && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      const v = state.venues.find((x) => x.id === selectedVenueId);
                      if (v) setEditingVenue({ ...v });
                    }}
                  >
                    <Edit3 size={13} />
                    <span>تعديل حالة / بيانات القاعة</span>
                  </button>
                )}
                {canDeleteEntity(currentUser, 'venue') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      const v = state.venues.find((x) => x.id === selectedVenueId);
                      if (!v) return;
                      setDeleteTarget({
                        entityType: 'venue',
                        entityId: v.id,
                        entityTypeLabel: 'قاعة أو موقع',
                        entityTitle: v.name,
                      });
                    }}
                  >
                    <Trash2 size={13} />
                    <span>حذف القاعة</span>
                  </button>
                )}
              </div>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>اليوم</th>
                    <th>الفترة الأولى</th>
                    <th>الفترة الثانية</th>
                    <th>الفترة الثالثة</th>
                  </tr>
                </thead>
                <tbody>
                  {WORK_DAYS_AR.map((dAr) => (
                    <tr key={dAr}>
                      <td style={{ fontWeight: 800, background: 'var(--bg)' }}>{dAr}</td>
                      {['P1', 'P2', 'P3'].map((pid) => {
                        const wItems = state.weeklyCommitments.filter(
                          (w) => w.day === dAr && w.periodId === pid && w.venueId === selectedVenueId
                        );
                        const exItems = state.scheduledExecutions.filter((ex) => {
                          if (ex.status === 'ملغي' || ex.status === 'مرفوض' || ex.status === 'مسودة') return false;
                          const cov = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
                          return ex.day === dAr && cov.includes(pid) && ex.venueId === selectedVenueId;
                        });
                        return (
                          <td key={pid}>
                            {wItems.length === 0 && exItems.length === 0 ? (
                              <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>شاغرة ومتاحة</span>
                            ) : (
                              <div>
                                {wItems.map((w) => (
                                  <div key={w.id} style={{ fontSize: '0.76rem' }}>
                                    <strong>{w.title || w.activityTitle}</strong> ({(w.scopeIds || []).map((s) => scopeMap[s]).filter(Boolean).join('، ') || (w.scopeNames || []).join('، ')}) — {empMap[w.leadEmployeeId || w.employeeId] || w.employeeName}
                                  </div>
                                ))}
                                {exItems.map((ex) => (
                                  <div key={ex.id} style={{ fontSize: '0.76rem', color: 'var(--brand-teal)', fontWeight: 800 }}>
                                    [برنامج مجدول] {ex.programName} ({ex.departmentName})
                                  </div>
                                ))}
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
        </div>
      )}

      {/* ================================================================= */}
      {/* 5. GENERAL APPROVED DAILY SUPERVISION (Leadership Platform v6) */}
      {/* ================================================================= */}
      {subTab === 'supervision' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SupervisionLeadershipPlatform
            onOpenEvaluationModal={onOpenEvaluation}
            canEditSupervision={canEditSupervision}
          />
        </div>
      )}

      {/* ================================================================= */}
      {/* FULL UNIFIED EMPLOYEE CARD MODAL (Tab 1: Schedule | Tab 2: Account & Permissions — Req #36, #44) */}
      {/* ================================================================= */}
      {cardEmp && (
        <div className="modal-backdrop" onClick={() => setCardEmpId(null)}>
          <div className="modal-panel modal-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>بطاقة الموظف الشاملة: {cardEmp.name}</h2>
                  {cardEmp.departmentId && (
                    <DepartmentPill
                      deptId={cardEmp.departmentId}
                      deptName={cardEmp.departmentName}
                      departments={state.departments}
                    />
                  )}
                  <StatusBadge status={cardEmp.accountStatus || 'نشط'} size="sm" />
                  {cardEmp.isAdmin && <span className="status-badge badge-approved">Admin</span>}
                </div>
                <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  اسم المستخدم: <strong>@{cardEmp.username}</strong> • الوظيفة: {cardEmp.jobTitle} • الدور: {cardEmp.customRoleLabel || ROLES_META[cardEmp.role]?.label} • الرقم: {cardEmp.id}
                </p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCardEmpId(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Inner Tabs inside Employee Card */}
              <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${cardInnerTab === 'schedule' ? 'btn-teal' : 'btn-secondary'}`}
                  onClick={() => setCardInnerTab('schedule')}
                >
                  <Eye size={14} />
                  <span>الجدول الأسبوعي والإشراف والبرامج</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${cardInnerTab === 'account' ? 'btn-teal' : 'btn-secondary'}`}
                  onClick={() => setCardInnerTab('account')}
                >
                  <ShieldCheck size={14} />
                  <span>الحساب والصلاحيات (إدارة الدخول ومنح Admin)</span>
                </button>
              </div>

              {cardInnerTab === 'schedule' ? (
                <>
                  <div className="card" style={{ padding: '0.9rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 6 }}>
                      1. مهام الإشراف اليومي الثابتة (استقبال، صلوات، انصراف وحافلات):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {getEmployeeSupervisionBlocks(cardEmp.id, state, { forDisplay: true }).length === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>لا توجد مهام إشراف يومي مسجلة لهذا الموظف.</span>
                      ) : (
                        getEmployeeSupervisionBlocks(cardEmp.id, state, { forDisplay: true }).map((sb) => (
                          <span key={sb.id} className="status-badge badge-executed" style={{ fontSize: '0.73rem' }}>
                            {formatTime12Ar(sb.startTime)}-{formatTime12Ar(sb.endTime)}: {sb.title}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '0.9rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 8 }}>
                      2. الجدول الأسبوعي الموحد للموظف (حصص + أنشطة + برامج أقسام + الفترات الفارغة):
                    </div>
                    <div className="table-wrap">
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>اليوم</th>
                            <th>الفترة الأولى</th>
                            <th>الفترة الثانية</th>
                            <th>الفترة الثالثة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {WORK_DAYS_AR.map((dAr) => {
                            const sched = getEmployeeDailyChronologicalSchedule(cardEmp.id, dAr, weekDates[dAr], state);
                            return (
                              <tr key={dAr}>
                                <td style={{ fontWeight: 800, background: 'var(--bg)' }}>{dAr}</td>
                                {['P1', 'P2', 'P3'].map((pid) => {
                                  const slotItems = sched.filter((x) => x.periodId === pid);
                                  return (
                                    <td key={pid}>
                                      {slotItems.length === 0 ? (
                                        <span className="status-badge badge-approved" style={{ fontSize: '0.7rem' }}>متاح للتكليف</span>
                                      ) : (
                                        slotItems.map((si) => (
                                          <div key={si.id} style={{ fontSize: '0.76rem', marginBottom: 3 }}>
                                            <strong>{si.title}</strong> ({si.location}) {si.scopeLabel ? `— ${si.scopeLabel}` : ''}
                                          </div>
                                        ))
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                /* TAB 2: الحساب والصلاحيات (Req #2, #4, #36, #38, #39, #44–#46) */
                acctForm && (
                  <form onSubmit={handleSaveCardAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <KeyRound size={16} color="var(--brand-teal)" />
                        <span>بيانات الحساب، القسم، كلمة المرور، وحالة التفعيل</span>
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="form-label">اسم الموظف *</label>
                          <input
                            className="form-input"
                            disabled={!canEditEmployees && !canManagePermissions}
                            value={acctForm.name}
                            onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">اسم المستخدم (لتسجيل الدخول) *</label>
                          <input
                            className="form-input"
                            style={{ direction: 'ltr', textAlign: 'right' }}
                            disabled={!canEditEmployees && !canManagePermissions}
                            value={acctForm.username}
                            onChange={(e) => setAcctForm({ ...acctForm, username: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">تعيين كلمة مرور جديدة (اتركه فارغًا للإبقاء على الحالية)</label>
                          <input
                            type="password"
                            className="form-input"
                            style={{ direction: 'ltr', textAlign: 'right' }}
                            disabled={!canEditEmployees && !canManagePermissions}
                            placeholder="أدخل كلمة مرور جديدة عند الرغبة بالتغيير..."
                            value={acctForm.newPassword}
                            onChange={(e) => setAcctForm({ ...acctForm, newPassword: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">حالة الحساب *</label>
                          <select
                            className="form-select"
                            disabled={(!canEditEmployees && !canManagePermissions) || cardEmp.id === currentUser?.employeeId}
                            value={acctForm.accountStatus}
                            onChange={(e) => setAcctForm({ ...acctForm, accountStatus: e.target.value })}
                          >
                            <option value="نشط">نشط (يسمح بتسجيل الدخول)</option>
                            <option value="غير نشط">غير نشط (موقوف)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <ArrowRightLeft size={13} />
                            <span>القسم (نقل الموظف بين الأقسام)</span>
                          </label>
                          <select
                            className="form-select"
                            disabled={!canEditEmployees && !canManagePermissions}
                            value={acctForm.departmentId || ''}
                            onChange={(e) => setAcctForm({ ...acctForm, departmentId: e.target.value || null })}
                          >
                            <option value="">الإدارة العامة للنادي</option>
                            {state.departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">المسمى الوظيفي</label>
                          <input
                            className="form-input"
                            disabled={!canEditEmployees && !canManagePermissions}
                            value={acctForm.jobTitle}
                            onChange={(e) => setAcctForm({ ...acctForm, jobTitle: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Granting Admin + Role + Access Scope (Req #4, #45, #46) */}
                    <div className="card" style={{ padding: '1rem', border: acctForm.isAdmin ? '1.5px solid var(--brand-teal)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--brand-ink)' }}>
                            منح صلاحية Admin وتحديد الدور ونطاق الصلاحية
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            يمكن منح أي موظف صلاحية Admin (مدير نظام كامل أو مدير بصلاحيات محددة) دون إنشاء حساب منفصل.
                          </div>
                        </div>

                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 14px',
                            borderRadius: 999,
                            background: acctForm.isAdmin ? 'rgba(0,165,155,0.14)' : 'var(--bg)',
                            border: '1px solid var(--brand-teal)',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            cursor: canManagePermissions ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={!canManagePermissions}
                            checked={acctForm.isAdmin}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const nextRole = checked ? 'custom_admin' : 'employee';
                              setAcctForm({
                                ...acctForm,
                                isAdmin: checked,
                                adminLevel: checked ? 'custom_admin' : null,
                                role: nextRole,
                                accessScope: ROLES_META[nextRole].defaultScope,
                                permissions: buildPresetPermissions(nextRole),
                              });
                            }}
                          />
                          <span>صلاحية Admin: {acctForm.isAdmin ? 'نعم (ممنوحة)' : 'لا'}</span>
                        </label>
                      </div>

                      <div className="form-grid">
                        {acctForm.isAdmin ? (
                          <div className="form-group">
                            <label className="form-label">مستوى صلاحية Admin *</label>
                            <select
                              className="form-select"
                              disabled={!canManagePermissions}
                              value={acctForm.adminLevel || 'custom_admin'}
                              onChange={(e) => {
                                const lvl = e.target.value;
                                setAcctForm({
                                  ...acctForm,
                                  adminLevel: lvl,
                                  role: lvl,
                                  accessScope: lvl === 'full_admin' ? 'system' : acctForm.accessScope,
                                  permissions: buildPresetPermissions(lvl),
                                });
                              }}
                            >
                              <option value="full_admin">مدير نظام كامل (صلاحية شاملة على كامل المنصة)</option>
                              <option value="custom_admin">مدير بصلاحيات محددة (قابلة للتخصيص أدناه)</option>
                            </select>
                          </div>
                        ) : (
                          <div className="form-group">
                            <label className="form-label">الدور الوظيفي في المنصة *</label>
                            <select
                              className="form-select"
                              disabled={!canManagePermissions}
                              value={acctForm.role}
                              onChange={(e) => {
                                const rk = e.target.value;
                                setAcctForm({
                                  ...acctForm,
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
                            disabled={!canManagePermissions || acctForm.adminLevel === 'full_admin'}
                            value={acctForm.accessScope}
                            onChange={(e) => setAcctForm({ ...acctForm, accessScope: e.target.value })}
                          >
                            {Object.values(ACCESS_SCOPES).map((sc) => (
                              <option key={sc.key} value={sc.key}>
                                {sc.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Granular 38 Permissions Matrix (View, Create, Edit, Approve, Separate Delete + Restore) */}
                    <div className="card" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                          مصفوفة الصلاحيات التفصيلية القابلة للتخصيص (صلاحية الحذف مستقلة تمامًا عن التعديل):
                        </div>
                        {canManagePermissions && acctForm.adminLevel !== 'full_admin' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-teal"
                              onClick={() =>
                                setAcctForm({
                                  ...acctForm,
                                  permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])),
                                })
                              }
                            >
                              <CheckSquare size={13} />
                              <span>تحديد كل الصلاحيات</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() =>
                                setAcctForm({
                                  ...acctForm,
                                  permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false])),
                                })
                              }
                            >
                              <span>إلغاء تحديد الكل</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.85rem' }}>
                        {PERMISSIONS_GROUPS.map((grp) => {
                          const allGrpChecked = grp.items.every((it) =>
                            acctForm.adminLevel === 'full_admin' ? true : Boolean(acctForm.permissions?.[it.key])
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
                              {canManagePermissions && acctForm.adminLevel !== 'full_admin' && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  style={{ padding: '1px 7px', fontSize: '0.67rem' }}
                                  onClick={() => {
                                    const nextPerms = { ...acctForm.permissions };
                                    grp.items.forEach((it) => {
                                      nextPerms[it.key] = !allGrpChecked;
                                    });
                                    setAcctForm({ ...acctForm, permissions: nextPerms });
                                  }}
                                >
                                  {allGrpChecked ? 'إلغاء المجموعة' : 'تحديد المجموعة'}
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {grp.items.map((item) => {
                                const checked =
                                  acctForm.adminLevel === 'full_admin'
                                    ? true
                                    : Boolean(acctForm.permissions?.[item.key]);
                                return (
                                  <label
                                    key={item.key}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      fontSize: '0.75rem',
                                      cursor: canManagePermissions && acctForm.adminLevel !== 'full_admin' ? 'pointer' : 'default',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!canManagePermissions || acctForm.adminLevel === 'full_admin'}
                                      checked={checked}
                                      onChange={(e) =>
                                        setAcctForm({
                                          ...acctForm,
                                          permissions: {
                                            ...acctForm.permissions,
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

                    {(canEditEmployees || canManagePermissions) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {cardEmp.id !== currentUser?.employeeId &&
                        canDeleteEntity(currentUser, 'employee', cardEmp.departmentId) ? (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() =>
                              setDeleteTarget({
                                entityType: 'employee',
                                entityId: cardEmp.id,
                                entityTypeLabel: 'موظف وحساب مستخدم',
                                entityTitle: `${cardEmp.name} (@${cardEmp.username})`,
                              })
                            }
                          >
                            <Trash2 size={15} />
                            <span>حذف الموظف</span>
                          </button>
                        ) : (
                          <div />
                        )}
                        <button type="submit" className="btn btn-primary" disabled={savingAccount}>
                          <CheckCircle2 size={16} />
                          <span>{savingAccount ? 'جاري الحفظ...' : 'حفظ بيانات الحساب والصلاحيات وتطبيقها فورًا'}</span>
                        </button>
                      </div>
                    )}
                  </form>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create New Employee + Account Modal */}
      {newEmpModal && (
        <div className="modal-backdrop" onClick={() => setNewEmpModal(null)}>
          <div className="modal-panel" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>إضافة موظف وإنشاء حساب مستخدم خاص به</h3>
              <button type="button" className="icon-btn" onClick={() => setNewEmpModal(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveNewEmployeeModal}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">اسم الموظف الثلاثي / الرباعي *</label>
                    <input
                      className="form-input"
                      required
                      value={newEmpModal.name}
                      onChange={(e) => setNewEmpModal({ ...newEmpModal, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">اسم المستخدم لتسجيل الدخول *</label>
                    <input
                      className="form-input"
                      required
                      style={{ direction: 'ltr', textAlign: 'right' }}
                      placeholder="مثال: khaled2026"
                      value={newEmpModal.username}
                      onChange={(e) => setNewEmpModal({ ...newEmpModal, username: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">كلمة المرور *</label>
                    <input
                      type="password"
                      className="form-input"
                      required
                      style={{ direction: 'ltr', textAlign: 'right' }}
                      placeholder="أدخل كلمة مرور الحساب"
                      value={newEmpModal.newPassword}
                      onChange={(e) => setNewEmpModal({ ...newEmpModal, newPassword: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">القسم *</label>
                    <select
                      className="form-select"
                      value={newEmpModal.departmentId}
                      onChange={(e) => setNewEmpModal({ ...newEmpModal, departmentId: e.target.value })}
                    >
                      {state.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">المسمى الوظيفي</label>
                    <input
                      className="form-input"
                      value={newEmpModal.jobTitle}
                      onChange={(e) => setNewEmpModal({ ...newEmpModal, jobTitle: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">الدور الوظيفي</label>
                    <select
                      className="form-select"
                      value={newEmpModal.role}
                      onChange={(e) => {
                        const rk = e.target.value;
                        setNewEmpModal({
                          ...newEmpModal,
                          role: rk,
                          isAdmin: rk === 'full_admin' || rk === 'custom_admin',
                          adminLevel: rk === 'full_admin' || rk === 'custom_admin' ? rk : null,
                          accessScope: ROLES_META[rk]?.defaultScope || 'self',
                        });
                      }}
                    >
                      <option value="employee">موظف عادي</option>
                      <option value="dept_head">رئيس قسم</option>
                      <option value="opinion_giver">صاحب رأي</option>
                      <option value="approver">صاحب اعتماد</option>
                      {canManagePermissions && <option value="custom_admin">مدير بصلاحيات محددة (Admin)</option>}
                      {canManagePermissions && <option value="full_admin">مدير نظام كامل (Admin)</option>}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">حالة الحساب</label>
                    <select
                      className="form-select"
                      value={newEmpModal.accountStatus}
                      onChange={(e) => setNewEmpModal({ ...newEmpModal, accountStatus: e.target.value })}
                    >
                      <option value="نشط">نشط</option>
                      <option value="غير نشط">غير نشط</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setNewEmpModal(null)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingAccount}>
                  إنشاء الحساب وحفظ الموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Student Modal */}
      {editingStudent && (
        <div className="modal-backdrop" onClick={() => setEditingStudent(null)}>
          <div className="modal-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>{editingStudent.id ? 'تعديل بيانات طالب' : 'إضافة طالب جديد لقاعدة البيانات'}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditingStudent(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">اسم الطالب الثلاثي / الرباعي *</label>
                <input
                  className="form-input"
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">الفئة / النطاق *</label>
                <select
                  className="form-select"
                  value={editingStudent.scopeId}
                  onChange={(e) => setEditingStudent({ ...editingStudent, scopeId: e.target.value })}
                >
                  {state.scopes.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">المرحلة الدراسية</label>
                <input
                  className="form-input"
                  value={editingStudent.grade || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, grade: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingStudent(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!editingStudent.name.trim()) return;
                  saveStudent(editingStudent);
                  setEditingStudent(null);
                }}
              >
                حفظ الطالب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Scope Modal */}
      {editingScope && (
        <div className="modal-backdrop" onClick={() => setEditingScope(null)}>
          <div className="modal-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>إضافة / تعديل فئة أو نطاق</h3>
              <button type="button" className="icon-btn" onClick={() => setEditingScope(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">اسم الفئة / النطاق *</label>
                <input
                  className="form-input"
                  value={editingScope.name}
                  onChange={(e) => setEditingScope({ ...editingScope, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">المرحلة</label>
                <input
                  className="form-input"
                  value={editingScope.stage}
                  onChange={(e) => setEditingScope({ ...editingScope, stage: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingScope(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!editingScope.name.trim()) return;
                  saveResourceEntity('scopes', editingScope, 'فئة / نطاق');
                  setEditingScope(null);
                }}
              >
                حفظ الفئة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Venue Modal */}
      {editingVenue && (
        <div className="modal-backdrop" onClick={() => setEditingVenue(null)}>
          <div className="modal-panel" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>{editingVenue.id ? 'تعديل القاعة / الموقع' : 'إضافة قاعة أو موقع تشغيلي'}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditingVenue(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">اسم القاعة / الموقع *</label>
                <input
                  className="form-input"
                  value={editingVenue.name}
                  onChange={(e) => setEditingVenue({ ...editingVenue, name: e.target.value, fullName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">نوع القاعة</label>
                <select
                  className="form-select"
                  value={editingVenue.type}
                  onChange={(e) => setEditingVenue({ ...editingVenue, type: e.target.value })}
                >
                  <option value="قاعة متخصصة">قاعة متخصصة</option>
                  <option value="قاعة كبرى / مصلى">قاعة كبرى / مصلى</option>
                  <option value="قاعة دراسية">قاعة دراسية</option>
                  <option value="مرفق رياضي / مصلى">مرفق رياضي / مصلى</option>
                  <option value="ساحة وموقع عام">ساحة وموقع عام</option>
                  <option value="مرفق خدمي وتشغيلي">مرفق خدمي وتشغيلي</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">حالة الجاهزية</label>
                <select
                  className="form-select"
                  value={editingVenue.status}
                  onChange={(e) => setEditingVenue({ ...editingVenue, status: e.target.value })}
                >
                  <option value="متاح">متاح</option>
                  <option value="صيانة">صيانة (يمنع الحجز التلقائي)</option>
                  <option value="خارج الخدمة">خارج الخدمة</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingVenue(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!editingVenue.name.trim()) return;
                  saveResourceEntity('venues', editingVenue, 'قاعة / موقع');
                  setEditingVenue(null);
                }}
              >
                حفظ القاعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Supervision Row Modal */}
      {editingSup && (
        <div className="modal-backdrop" onClick={() => setEditingSup(null)}>
          <div className="modal-panel" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800 }}>تعديل تكليف الإشراف اليومي ({editingSup.supervisor})</h3>
              <button type="button" className="icon-btn" onClick={() => setEditingSup(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">المشرف الميداني</label>
                  <input
                    className="form-input"
                    value={editingSup.supervisor || ''}
                    onChange={(e) => setEditingSup({ ...editingSup, supervisor: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">موقع الاستقبال</label>
                  <input
                    className="form-input"
                    value={editingSup.reception || ''}
                    onChange={(e) => setEditingSup({ ...editingSup, reception: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">مصلى العصر</label>
                  <input
                    className="form-input"
                    value={editingSup.asrHall || ''}
                    onChange={(e) => setEditingSup({ ...editingSup, asrHall: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">مصلى المغرب</label>
                  <input
                    className="form-input"
                    value={editingSup.maghribHall || ''}
                    onChange={(e) => setEditingSup({ ...editingSup, maghribHall: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">مصلى العشاء</label>
                  <input
                    className="form-input"
                    value={editingSup.ishaHall || ''}
                    onChange={(e) => setEditingSup({ ...editingSup, ishaHall: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">موقع الصرف</label>
                  <input
                    className="form-input"
                    value={editingSup.dismissal || ''}
                    onChange={(e) => setEditingSup({ ...editingSup, dismissal: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSup(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  saveResourceEntity('supervisionDuties', editingSup, 'تكليف إشراف يومي');
                  setEditingSup(null);
                }}
              >
                حفظ التعديل وتطبيقه في حساب الموظف
              </button>
            </div>
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
