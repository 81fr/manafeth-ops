// Granular Decoupled Permissions, Roles, Access Scopes & Automatic Org Context Engine (v2.0)

export const ROLES_META = {
  full_admin: {
    key: 'full_admin',
    label: 'مدير نظام كامل',
    isAdmin: true,
    defaultScope: 'system',
    badgeColor: '#00A59B',
  },
  custom_admin: {
    key: 'custom_admin',
    label: 'مدير بصلاحيات محددة',
    isAdmin: true,
    defaultScope: 'club',
    badgeColor: '#0284c7',
  },
  club_director: {
    key: 'club_director',
    label: 'مدير النادي',
    isAdmin: false,
    defaultScope: 'club',
    badgeColor: '#0f766e',
  },
  dept_head: {
    key: 'dept_head',
    label: 'رئيس قسم',
    isAdmin: false,
    defaultScope: 'department',
    badgeColor: '#2563eb',
  },
  approver: {
    key: 'approver',
    label: 'صاحب اعتماد',
    isAdmin: false,
    defaultScope: 'club',
    badgeColor: '#7c3aed',
  },
  opinion_giver: {
    key: 'opinion_giver',
    label: 'صاحب رأي',
    isAdmin: false,
    defaultScope: 'club',
    badgeColor: '#ea580c',
  },
  employee: {
    key: 'employee',
    label: 'موظف عادي',
    isAdmin: false,
    defaultScope: 'self',
    badgeColor: '#475569',
  },
};

export const ACCESS_SCOPES = {
  self: { key: 'self', label: 'على نفسه فقط' },
  department: { key: 'department', label: 'على قسمه' },
  club: { key: 'club', label: 'على النادي' },
  system: { key: 'system', label: 'على النظام كاملًا' },
};

export const PERMISSIONS_GROUPS = [
  {
    groupKey: 'view',
    groupTitle: 'صلاحيات العرض والاطلاع',
    items: [
      { key: 'view_personal_portal', label: 'عرض صفحتي الشخصية (جدولي، مهامي، خطتي، تنبيهاتي)' },
      { key: 'view_club_general_ops', label: 'عرض المعلومات التشغيلية العامة للنادي (الآن، التالي، برامج اليوم، الإشراف المعتمد)' },
      { key: 'view_dept_programs', label: 'عرض برامج وخطة وموظفي القسم' },
      { key: 'view_all_club_programs', label: 'عرض برامج وخطط جميع أقسام النادي' },
      { key: 'view_drafts', label: 'عرض المسودات غير المعتمدة' },
      { key: 'view_conflicts', label: 'عرض التعارضات وتفاصيل الفحص' },
      { key: 'view_exceptions', label: 'عرض مركز طلبات الاستثناء والآراء' },
      { key: 'view_reports', label: 'عرض البحث الشامل والتقارير التشغيلية' },
      { key: 'view_employees', label: 'عرض سجل الموظفين وبطاقات الموظفين' },
      { key: 'view_admin_settings', label: 'عرض إعدادات النظام والفترات والأقسام' },
      { key: 'view_audit_logs', label: 'عرض سجل الإجراءات وسجل الحذف' },
      { key: 'view_trash', label: 'عرض سلة المحذوفات والاسترجاع' },
    ],
  },
  {
    groupKey: 'create',
    groupTitle: 'صلاحيات الإضافة والإنشاء',
    items: [
      { key: 'create_program', label: 'إنشاء برنامج جديد (خلال الفترة 1–15 من الشهر)' },
      { key: 'create_subprogram', label: 'إضافة فقرات وبرامج فرعية للبرنامج الرئيسي' },
      { key: 'schedule_planned_program', label: 'استكمال الجدولة التنفيذية للبرامج المخططة' },
      { key: 'create_task', label: 'إنشاء وإسناد مهام للموظفين' },
      { key: 'create_employee', label: 'إضافة موظف وإنشاء حساب مستخدم' },
      { key: 'create_resource', label: 'إضافة قاعات ونطاقات وطلاب وتكليفات إشراف' },
      { key: 'submit_exception', label: 'رفع طلب استثناء إلكتروني' },
    ],
  },
  {
    groupKey: 'edit',
    groupTitle: 'صلاحيات التعديل والإدارة',
    items: [
      { key: 'edit_program', label: 'تعديل البرامج والفقرات وتحديث حالتها التشغيلية' },
      { key: 'edit_timetable', label: 'تعديل الجداول والفترات والأوقات المعتمدة' },
      { key: 'edit_supervision', label: 'تعديل جدول الإشراف اليومي المعتمد' },
      { key: 'edit_plan', label: 'استيراد وتحديث الخطة وإصداراتها' },
      { key: 'edit_employees', label: 'تعديل بيانات الموظفين وحساباتهم ونقل الأقسام' },
      { key: 'edit_org_structure', label: 'تعديل الهيكل التنظيمي (الإدارات والأقسام ورؤساؤها)' },
      { key: 'manage_permissions', label: 'إدارة الصلاحيات ومنح/سحب صلاحية Admin' },
      { key: 'give_opinion', label: 'إبداء الرأي على طلبات الاستثناء' },
    ],
  },
  {
    groupKey: 'approve',
    groupTitle: 'صلاحيات الاعتماد النهائي',
    items: [
      { key: 'approve_program', label: 'اعتماد البرامج وإدراجها في الجدول التشغيلي' },
      { key: 'approve_exception', label: 'الاعتماد النهائي للاستثناءات ومعالجة البرامج المتأثرة' },
      { key: 'approve_plan_version', label: 'اعتماد إصدار جديد للخطة المعتمدة' },
    ],
  },
  {
    groupKey: 'delete',
    groupTitle: 'صلاحيات الحذف المنفصلة والتحديد الجماعي (مستقلة عن التعديل)',
    items: [
      { key: 'bulk_delete', label: 'تحديد الكل والحذف الجماعي للعناصر المحددة في الأقسام والأيقونات' },
      { key: 'delete_employee', label: 'حذف موظف' },
      { key: 'delete_program', label: 'حذف برنامج' },
      { key: 'delete_subprogram', label: 'حذف برنامج فرعي / فقرة' },
      { key: 'delete_task', label: 'حذف مهمة' },
      { key: 'delete_department', label: 'حذف قسم' },
      { key: 'delete_administration', label: 'حذف إدارة' },
      { key: 'delete_venue', label: 'حذف قاعة / موقع' },
      { key: 'delete_scope', label: 'حذف نطاق / فئة' },
      { key: 'delete_plan', label: 'حذف خطة / موعد مخطط' },
      { key: 'delete_exception', label: 'حذف طلب استثناء واعتماد' },
      { key: 'delete_evaluation', label: 'حذف سجل تقييم وملاحظة ميدانية' },
      { key: 'delete_operational_data', label: 'حذف بيانات تشغيلية (إشراف / طلاب / سجلات)' },
      { key: 'restore_deleted', label: 'استرجاع أي عنصر محذوف من سلة المحذوفات' },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export function buildPresetPermissions(roleKey) {
  const allFalse = Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false]));

  if (roleKey === 'full_admin') {
    return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true]));
  }

  if (roleKey === 'custom_admin') {
    return {
      ...allFalse,
      view_personal_portal: true,
      view_club_general_ops: true,
      view_dept_programs: true,
      view_all_club_programs: true,
      view_drafts: true,
      view_conflicts: true,
      view_exceptions: true,
      view_reports: true,
      view_employees: true,
      view_admin_settings: true,
      view_audit_logs: true,
      create_program: true,
      create_subprogram: true,
      schedule_planned_program: true,
      create_task: true,
      create_employee: true,
      create_resource: true,
      submit_exception: true,
      edit_program: true,
      edit_timetable: true,
      edit_supervision: true,
      edit_employees: true,
      give_opinion: true,
      approve_program: true,
      approve_exception: true,
      bulk_delete: true,
      delete_program: true,
      delete_subprogram: true,
      delete_task: true,
      delete_plan: true,
      delete_venue: true,
      delete_scope: true,
      delete_exception: true,
      delete_evaluation: true,
      delete_operational_data: true,
    };
  }

  if (roleKey === 'club_director') {
    return {
      ...allFalse,
      view_personal_portal: true,
      view_club_general_ops: true,
      view_dept_programs: true,
      view_all_club_programs: true,
      view_drafts: true,
      view_conflicts: true,
      view_exceptions: true,
      view_reports: true,
      view_employees: true,
      create_program: true,
      create_subprogram: true,
      schedule_planned_program: true,
      create_task: true,
      submit_exception: true,
      edit_program: true,
      give_opinion: true,
      approve_program: true,
      approve_exception: true,
      approve_plan_version: true,
      bulk_delete: true,
      delete_program: true,
      delete_subprogram: true,
      delete_task: true,
      delete_plan: true,
      delete_exception: true,
      delete_evaluation: true,
    };
  }

  if (roleKey === 'dept_head') {
    return {
      ...allFalse,
      view_personal_portal: true,
      view_club_general_ops: true,
      view_dept_programs: true,
      view_drafts: true,
      view_conflicts: true,
      view_exceptions: true,
      view_reports: true,
      view_employees: true,
      create_program: true,
      create_subprogram: true,
      schedule_planned_program: true,
      create_task: true,
      submit_exception: true,
      edit_program: true,
      give_opinion: true,
      approve_program: true,
      bulk_delete: true,
      delete_program: true,
      delete_subprogram: true,
      delete_task: true,
      delete_plan: true,
      delete_exception: true,
    };
  }

  if (roleKey === 'approver') {
    return {
      ...allFalse,
      view_personal_portal: true,
      view_club_general_ops: true,
      view_dept_programs: true,
      view_all_club_programs: true,
      view_conflicts: true,
      view_exceptions: true,
      view_reports: true,
      give_opinion: true,
      approve_program: true,
      approve_exception: true,
    };
  }

  if (roleKey === 'opinion_giver') {
    return {
      ...allFalse,
      view_personal_portal: true,
      view_club_general_ops: true,
      view_dept_programs: true,
      view_conflicts: true,
      view_exceptions: true,
      give_opinion: true,
    };
  }

  // Regular Employee ('employee') — strictly personal + general club operational view!
  return {
    ...allFalse,
    view_personal_portal: true,
    view_club_general_ops: true,
  };
}

export function hasPermission(user, permKey) {
  if (!user) return false;
  if (user.role === 'full_admin' || user.adminLevel === 'full_admin') return true;
  if (user.permissions && typeof user.permissions[permKey] === 'boolean') {
    return user.permissions[permKey];
  }
  const fallback = buildPresetPermissions(user.role || 'employee');
  return Boolean(fallback[permKey]);
}

export function canAccessDepartment(user, deptId) {
  if (!user) return false;
  if (user.role === 'full_admin' || user.accessScope === 'system' || user.accessScope === 'club') {
    return true;
  }
  if (user.accessScope === 'department') {
    return Boolean(deptId && user.departmentId === deptId);
  }
  return Boolean(deptId && user.departmentId === deptId && hasPermission(user, 'view_dept_programs'));
}

export function canEditProgram(user, progOrExec) {
  if (!user || !progOrExec) return false;
  if (user.role === 'full_admin' || user.adminLevel === 'full_admin') return true;
  if (!hasPermission(user, 'edit_program') && !hasPermission(user, 'schedule_planned_program')) {
    return false;
  }
  if (user.accessScope === 'system' || user.accessScope === 'club') return true;
  if (user.accessScope === 'department') {
    return progOrExec.departmentId === user.departmentId;
  }
  return progOrExec.leadEmployeeId === user.employeeId && hasPermission(user, 'edit_program');
}

export const ENTITY_DELETE_PERMISSION_MAP = {
  employee: 'delete_employee',
  program_execution: 'delete_program',
  program_catalog: 'delete_program',
  subprogram: 'delete_subprogram',
  task: 'delete_task',
  department: 'delete_department',
  administration: 'delete_administration',
  venue: 'delete_venue',
  scope: 'delete_scope',
  planned_occurrence: 'delete_plan',
  exception: 'delete_exception',
  evaluation: 'delete_evaluation',
  supervision: 'delete_operational_data',
  student: 'delete_operational_data',
  operational_data: 'delete_operational_data',
};

export const ENTITY_TYPE_LABELS_AR = {
  employee: 'موظف وحساب مستخدم',
  program_execution: 'برنامج تنفيذي مجدول',
  program_catalog: 'برنامج في دليل الخطة',
  subprogram: 'برنامج فرعي / فقرة',
  task: 'مهمة وظيفية',
  department: 'قسم تشغيلي',
  administration: 'إدارة / نادي',
  venue: 'قاعة أو موقع',
  scope: 'نطاق أو فئة طلابية',
  planned_occurrence: 'موعد مخطط في الخطة',
  exception: 'طلب استثناء واعتماد',
  evaluation: 'سجل تقييم ومتابعة ميدانية',
  supervision: 'تكليف إشراف يومي',
  student: 'سجل طالب',
  operational_data: 'بيانات تشغيلية',
};

export function canDeleteEntity(user, entityType, targetDeptId = null) {
  if (!user) return false;
  if (user.role === 'full_admin' || user.adminLevel === 'full_admin') return true;
  const reqPerm = ENTITY_DELETE_PERMISSION_MAP[entityType];
  const hasSpecificPerm = Boolean(reqPerm && hasPermission(user, reqPerm));
  const hasBulkPerm = hasPermission(user, 'bulk_delete');
  if (!hasSpecificPerm && !hasBulkPerm) return false;
  if (user.accessScope === 'system' || user.accessScope === 'club') return true;
  if (user.accessScope === 'department' && targetDeptId) {
    return user.departmentId === targetDeptId;
  }
  return user.accessScope === 'system' || user.accessScope === 'club';
}

export function canBulkDelete(user, entityType, targetDeptId = null) {
  if (!user) return false;
  if (user.role === 'full_admin' || user.adminLevel === 'full_admin') return true;
  if (!hasPermission(user, 'bulk_delete') && !canDeleteEntity(user, entityType, targetDeptId)) {
    return false;
  }
  return canDeleteEntity(user, entityType, targetDeptId);
}

export function buildUserSessionFromEmployeeRecord(emp, state) {
  if (!emp) return null;
  const roleKey = emp.role || emp.systemRole || 'employee';
  const normalizedRole =
    roleKey === 'admin'
      ? 'full_admin'
      : roleKey === 'dept_manager'
      ? 'dept_head'
      : ROLES_META[roleKey]
      ? roleKey
      : 'employee';

  const roleMeta = ROLES_META[normalizedRole] || ROLES_META.employee;
  const dept = (state?.departments || []).find((d) => d.id === emp.departmentId);
  const adminObj =
    (state?.administrations || []).find((a) => a.id === (emp.administrationId || dept?.administrationId || 'adm_traof_boys')) ||
    (state?.administrations || [])[0] || {
      id: 'adm_traof_boys',
      name: 'نادي تراؤف للبنين',
      directorName: 'عبد الرزاق محمد العنزي',
    };

  const mergedPermissions = {
    ...buildPresetPermissions(normalizedRole),
    ...(emp.permissions || {}),
  };

  return {
    id: `USR-${emp.id}`,
    employeeId: emp.id,
    username: emp.username || emp.id.toLowerCase(),
    name: emp.name,
    jobTitle: emp.jobTitle || 'موظف',
    administrationId: adminObj.id,
    administrationName: adminObj.name,
    departmentId: emp.departmentId || null,
    departmentName: dept?.name || emp.departmentName || adminObj.name,
    role: normalizedRole,
    roleLabel: emp.customRoleLabel || roleMeta.label,
    isAdmin: Boolean(emp.isAdmin || roleMeta.isAdmin),
    adminLevel: emp.adminLevel || (normalizedRole === 'full_admin' ? 'full_admin' : emp.isAdmin ? 'custom_admin' : null),
    accessScope: emp.accessScope || roleMeta.defaultScope,
    accountStatus: emp.accountStatus || 'نشط',
    permissions: mergedPermissions,
    isOpinionGiver: Boolean(emp.isOpinionGiver || mergedPermissions.give_opinion),
    isApprover: Boolean(emp.isApprover || mergedPermissions.approve_exception),
  };
}

/**
 * Automatically resolves full organizational identity for any logged-in user (Req #1, #13-#16)
 */
export function resolveUserOrgContext(user, state) {
  if (!user || !state) return null;
  const emp = state.employees.find((e) => e.id === user.employeeId) || user;
  const dept = state.departments.find((d) => d.id === emp.departmentId) || null;
  const adminObj =
    (state.administrations || []).find((a) => a.id === (emp.administrationId || dept?.administrationId || 'adm_traof_boys')) ||
    (state.administrations || [])[0] || {
      id: 'adm_traof_boys',
      name: 'نادي تراؤف للبنين',
      directorEmployeeId: 'EMP-37',
      directorName: 'عبد الرزاق محمد العنزي',
    };

  const clubDirectorEmp =
    state.employees.find((e) => e.id === adminObj.directorEmployeeId) || null;
  const deptHeadEmp =
    dept?.headEmployeeId ? state.employees.find((e) => e.id === dept.headEmployeeId) : null;

  const isClubDirector = adminObj.directorEmployeeId === emp.id || user.role === 'club_director';
  const isDeptHead = Boolean(dept && dept.headEmployeeId === emp.id) || user.role === 'dept_head';

  return {
    employee: emp,
    administration: adminObj,
    clubDirectorName: clubDirectorEmp?.name || adminObj.directorName || 'عبد الرزاق محمد العنزي',
    clubDirectorId: clubDirectorEmp?.id || adminObj.directorEmployeeId,
    department: dept,
    departmentName: dept?.name || emp.departmentName || 'الإدارة العامة للنادي',
    departmentHeadName: deptHeadEmp?.name || dept?.headName || '—',
    departmentHeadId: deptHeadEmp?.id || dept?.headEmployeeId || null,
    isClubDirector,
    isDeptHead,
    scopeLabel: ACCESS_SCOPES[user.accessScope]?.label || 'على نفسه فقط',
  };
}
