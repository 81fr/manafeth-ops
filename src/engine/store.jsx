import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import masterSeed from '../data/masterSeed.json';
import { supabase } from '../supabaseClient';
import {
  dateToPlanWeekInfo,
  dateToArabicDay,
  MONTH_NAMES_AR,
  WEEK_ORDINALS_AR,
  computeCoveredPeriods,
  checkNewProgramSubmissionWindow,
  CLOSED_SUBMISSION_WINDOW_MESSAGE,
  expandDatesRange,
  formatDateRangeAr,
} from './dateUtils';
import { detectProgramConflicts, getPeriodTiming } from './conflictEngine';
import {
  buildUserSessionFromEmployeeRecord,
  resolveUserOrgContext,
  hasPermission,
  canDeleteEntity,
  ENTITY_TYPE_LABELS_AR,
  ROLES_META,
  buildPresetPermissions,
} from './permissions';
import {
  logClientDiagnostic,
  setDiagnosticsContext,
  installGlobalErrorHandlers,
} from './diagnostics';

const OpsContext = createContext(null);
const LOCAL_STORAGE_KEY = 'manafeth_ops_overlay_v2';
const SESSION_USER_KEY = 'manafeth_ops_current_user_v2';
const SESSION_TOKEN_KEY = 'manafeth_ops_session_token_v3';

function buildInitialNotifications(seed) {
  const curW = seed.meta.currentGlobalWeek;
  const nextW = seed.meta.nextGlobalWeek;
  const thisWeekCount = seed.plannedOccurrences.filter((o) => o.plannedGlobalWeek === curW).length;
  const nextWeekCount = seed.plannedOccurrences.filter((o) => o.plannedGlobalWeek === nextW).length;
  const discCount = seed.dataDiscrepancies.filter((d) => d.status === 'تعارض بيانات يحتاج مراجعة').length;

  return [
    {
      id: 'NTF-SEED-1',
      createdAt: '2026-11-02T08:00:00+03:00',
      type: 'برنامج مطلوب تنفيذه هذا الأسبوع',
      title: `برامج هذا الأسبوع (${thisWeekCount} برنامجًا مخططًا)`,
      message: `يوجد ${thisWeekCount} برنامجًا محددًا باللون الأخضر للأسبوع الأول من شهر نوفمبر؛ يرجى من مسؤولي الأقسام استكمال الجدولة التنفيذية وتنسيق المواعيد مبكرًا.`,
      targetRole: 'all',
      targetDeptId: null,
      targetEmployeeId: null,
      relatedEntityId: 'WEEK-45',
      readBy: [],
    },
    {
      id: 'NTF-SEED-2',
      createdAt: '2026-11-02T08:05:00+03:00',
      type: 'برنامج الأسبوع القادم',
      title: `الاستعداد المبكر للأسبوع القادم (${nextWeekCount} برنامجًا)`,
      message: `تظهر خطة الأقسام وجود ${nextWeekCount} برنامجًا مخططًا للأسبوع الثاني من شهر نوفمبر؛ يوصى بحجز القاعات وتحديد المكلفين مسبقًا.`,
      targetRole: 'all',
      targetDeptId: null,
      targetEmployeeId: null,
      relatedEntityId: 'WEEK-46',
      readBy: [],
    },
    {
      id: 'NTF-SEED-3',
      createdAt: '2026-11-02T08:10:00+03:00',
      type: 'تعارض بيانات',
      title: `${discCount} اختلافات بيانات بين الملفات تحتاج مراجعة`,
      message: 'رصد النظام اختلافات في توقيت الفترات الثلاث وبعض المواقع/الأسماء بين الملفات المستوردة دون تعديل صامت؛ يرجى مراجعتها من لوحة الإدارة.',
      targetRole: 'admin',
      targetDeptId: null,
      targetEmployeeId: null,
      relatedEntityId: 'DISCREPANCIES',
      readBy: [],
    },
  ];
}

function loadLocalOverlay() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const OPERATIONAL_FILES_VERSION = '2026-11-12-v6';

function sanitizeEmployeeAndDeptNames(ov) {
  if (!ov || typeof ov !== 'object') return ov;
  if (Array.isArray(ov.employees)) {
    ov.employees = ov.employees
      .filter((e) => e && e.id !== 'EMP-29' && !String(e.name || '').includes('صالح جديع'))
      .map((e) => {
        if (e.id === 'EMP-38' || String(e.username || '').toLowerCase() === 'faisal') {
          return {
            ...e,
            name: 'فيصل كساب العتيبي',
            fullName: 'فيصل كساب العتيبي',
            supervisionRole: e.supervisionRole || 'الإشراف العام - الدور الأرضي',
            floor: e.floor || 'الدور الأرضي',
          };
        }
        return e;
      });
  }
  if (Array.isArray(ov.departments)) {
    ov.departments = ov.departments.map((d) => {
      if (d.id === 'DEPT_EDU' || String(d.headName || '').includes('صالح جديع') || String(d.headName || '').includes('فيصل')) {
        return { ...d, headName: 'فيصل كساب العتيبي', headEmployeeId: 'EMP-38' };
      }
      return d;
    });
  }
  if (Array.isArray(ov.supervisionDuties)) {
    ov.supervisionDuties = ov.supervisionDuties.map((s) => {
      if (s.generalSupervisorId === 'EMP-29' || String(s.generalSup || '').includes('صالح جديع')) {
        return { ...s, generalSup: 'فيصل كساب العتيبي', generalSupervisorId: 'EMP-38' };
      }
      return s;
    });
  }
  return ov;
}

function migrateOverlayToV5(ov) {
  if (!ov || typeof ov !== 'object') return buildDefaultOverlay();
  const next = { ...ov };
  if (next.operationalFilesVersion !== OPERATIONAL_FILES_VERSION) {
    next.periods = masterSeed.periods;
    next.weeklyCommitments = masterSeed.weeklyCommitments;
    next.supervisionDuties = masterSeed.supervisionDuties;
    next.supervisionInstructions = masterSeed.supervisionInstructions;
    next.supervisionCriteria = masterSeed.supervisionCriteria;
    next.supervisionLeaders = masterSeed.supervisionLeaders;
    next.supervisionSportsByStage = masterSeed.supervisionSportsByStage;
    next.supervisionByLeaderAndPeriod = masterSeed.supervisionByLeaderAndPeriod;
    next.dataDiscrepancies = masterSeed.dataDiscrepancies;
    next.operationalFilesVersion = OPERATIONAL_FILES_VERSION;
  }
  return sanitizeEmployeeAndDeptNames(next);
}

function buildDefaultOverlay() {
  return {
    operationalFilesVersion: OPERATIONAL_FILES_VERSION,
    administrations: masterSeed.administrations || [],
    departments: masterSeed.departments,
    periods: masterSeed.periods,
    employees: masterSeed.employees,
    venues: masterSeed.venues,
    scopes: masterSeed.scopes,
    students: masterSeed.students || [],
    tasks: masterSeed.tasks || [],
    supervisionDuties: masterSeed.supervisionDuties,
    supervisionInstructions: masterSeed.supervisionInstructions,
    supervisionCriteria: masterSeed.supervisionCriteria,
    supervisionLeaders: masterSeed.supervisionLeaders,
    supervisionSportsByStage: masterSeed.supervisionSportsByStage,
    supervisionByLeaderAndPeriod: masterSeed.supervisionByLeaderAndPeriod,
    weeklyCommitments: masterSeed.weeklyCommitments,
    programTypes: masterSeed.programTypes,
    conflictRules: masterSeed.conflictRules,
    exceptionRoutingRules: masterSeed.exceptionRoutingRules,
    dataDiscrepancies: masterSeed.dataDiscrepancies,
    importBatches: masterSeed.importBatches,
    approvedPlanVersion: masterSeed.approvedPlanVersion || {
      versionNumber: 'v1.0',
      title: 'الخطة التشغيلية المعتمدة لأقسام نادي تراؤف للبنين 2026',
      approvedAt: '2026-11-01T09:00:00+03:00',
      approvedBy: 'عبد الرزاق محمد العنزي',
      status: 'معتمد',
    },
    customPrograms: [],
    changedCatalogMap: {},
    removedProgramIds: [],
    removedOccurrenceIds: [],
    customOccurrences: [],
    occurrenceUpdates: {},
    scheduledExecutions: [],
    commitmentOverrides: {},
    exceptionRequests: [],
    versionSnapshots: [],
    deletedItems: masterSeed.deletedItems || [],
  };
}

export function OpsProvider({ children }) {
  // Current authenticated user session (strictly via username + password)
  const [rawSessionUser, setRawSessionUser] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Server-issued secure session token for evaluation RPCs (14h expiry)
  const [sessionToken, setSessionToken] = useState(() => {
    try {
      return localStorage.getItem(SESSION_TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  // Unified Comprehensive Evaluation Platform State (v3.0)
  const [evaluations, setEvaluations] = useState([]);
  const [evalCriteria, setEvalCriteria] = useState([]);
  const [evalSettings, setEvalSettings] = useState({
    program_execution_allowed_statuses: ['منفذ'],
    task_allowed_statuses: ['منجزة'],
    supervision_statuses: [
      { label: 'موجود بفاعلية', score: 100, active: true },
      { label: 'موجود دون فاعلية', score: 60, active: true },
      { label: 'غير موجود في موقع الإشراف', score: 0, active: true },
      { label: 'في إجازة / مستأذن', score: null, active: true },
      { label: 'متغيب عن العمل', score: 0, active: true },
    ],
  });
  const [evalAccessList, setEvalAccessList] = useState([]);
  const [evalAuditLogs, setEvalAuditLogs] = useState([]);
  const [evalMe, setEvalMe] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // Active navigation week & dark mode
  const [activeGlobalWeek, setActiveGlobalWeek] = useState(masterSeed.meta.currentGlobalWeek); // 45
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('manafeth_ops_dark') === '1');
  const [cloudStatus, setCloudStatus] = useState(supabase ? 'connecting' : 'local');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date().toISOString());
  const [syncError, setSyncError] = useState(null);
  const [lastLoginSeenAt, setLastLoginSeenAt] = useState(() => {
    try {
      return localStorage.getItem('manafeth_ops_prev_visit_iso') || null;
    } catch {
      return null;
    }
  });
  const [submissionWindow, setSubmissionWindow] = useState(() => checkNewProgramSubmissionWindow());

  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  // Mutable overlay state (merged on top of masterSeed)
  const [overlay, setOverlay] = useState(() => {
    const local = loadLocalOverlay();
    const base = buildDefaultOverlay();
    return migrateOverlayToV5(
      local ? { ...base, ...local, operationalFilesVersion: local.operationalFilesVersion } : base
    );
  });

  const [auditLogs, setAuditLogs] = useState(() => {
    try {
      const localLogs = localStorage.getItem('manafeth_ops_audit_v2');
      return localLogs ? JSON.parse(localLogs) : masterSeed.auditLogs;
    } catch {
      return masterSeed.auditLogs;
    }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const localNtf = localStorage.getItem('manafeth_ops_ntf_v2');
      return localNtf ? JSON.parse(localNtf) : buildInitialNotifications(masterSeed);
    } catch {
      return buildInitialNotifications(masterSeed);
    }
  });

  const isSyncingFromCloud = useRef(false);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('manafeth_ops_dark', '1');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('manafeth_ops_dark', '0');
    }
  }, [darkMode]);

  // Persist locally on every change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(overlay));
    } catch (e) {
      console.warn('Local cache save warning:', e);
    }
  }, [overlay]);

  useEffect(() => {
    try {
      localStorage.setItem('manafeth_ops_audit_v2', JSON.stringify(auditLogs));
    } catch {}
  }, [auditLogs]);

  useEffect(() => {
    try {
      localStorage.setItem('manafeth_ops_ntf_v2', JSON.stringify(notifications));
    } catch {}
  }, [notifications]);

  // Refresh server submission window status (Day 1–15)
  const refreshSubmissionWindow = useCallback(async () => {
    const localWin = checkNewProgramSubmissionWindow();
    if (!supabase) {
      setSubmissionWindow(localWin);
      return localWin;
    }
    try {
      const { data, error } = await supabase.rpc('manafeth_get_submission_window_status');
      if (!error && data && typeof data.isOpen === 'boolean') {
        const win = {
          isOpen: data.isOpen,
          dayOfMonth: data.dayOfMonth,
          serverDate: data.serverDate,
          allowedRange: data.allowedRange || '1 - 15',
          message: data.isOpen ? 'نافذة رفع البرامج الجديدة مفتوحة حاليًا (1–15 من الشهر).' : CLOSED_SUBMISSION_WINDOW_MESSAGE,
        };
        setSubmissionWindow(win);
        return win;
      }
    } catch {}
    setSubmissionWindow(localWin);
    return localWin;
  }, []);

  // Cloud Initial Load & Realtime Subscription
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    async function pullFromCloud() {
      try {
        const [stRes, audRes, ntfRes, trashRes] = await Promise.all([
          supabase.from('manafeth_ops_state').select('*').eq('doc_key', 'ops_overlay_v1').maybeSingle(),
          supabase.from('manafeth_ops_audit_logs').select('*').order('timestamp', { ascending: false }).limit(350),
          supabase.from('manafeth_ops_notifications').select('*').order('created_at', { ascending: false }).limit(150),
          supabase.from('manafeth_ops_trash').select('*').order('deleted_at', { ascending: false }).limit(200),
        ]);

        await refreshSubmissionWindow();

        if (!mounted) return;
        if (stRes.error) throw stRes.error;

        if (stRes.data && stRes.data.payload && Object.keys(stRes.data.payload).length > 0) {
          const cloudNeedsV5Migration = stRes.data.payload.operationalFilesVersion !== OPERATIONAL_FILES_VERSION;
          isSyncingFromCloud.current = true;
          let migratedForCloud = null;
          setOverlay((prev) => {
            const merged = {
              ...prev,
              ...stRes.data.payload,
              operationalFilesVersion: stRes.data.payload.operationalFilesVersion,
            };
            if (!Array.isArray(merged.employees) || !merged.employees.some((e) => e && e.username)) {
              merged.employees = masterSeed.employees;
            }
            if (!Array.isArray(merged.departments) || merged.departments.length === 0) {
              merged.departments = masterSeed.departments;
            }
            if (!merged.administrations || merged.administrations.length === 0) {
              merged.administrations = masterSeed.administrations;
            }
            if (!merged.approvedPlanVersion) {
              merged.approvedPlanVersion = masterSeed.approvedPlanVersion;
            }
            if (!trashRes.error && Array.isArray(trashRes.data) && trashRes.data.length > 0) {
              const existingIds = new Set((merged.deletedItems || []).map((t) => t.id));
              const mappedTrash = trashRes.data
                .filter((row) => !existingIds.has(row.id))
                .map((row) => ({
                  id: row.id,
                  entityType: row.entity_type,
                  entityTypeLabel: ENTITY_TYPE_LABELS_AR[row.entity_type] || row.entity_type,
                  entityId: row.entity_id,
                  entityTitle: row.entity_title,
                  departmentId: row.department_id,
                  snapshot: row.snapshot,
                  deletedByName: row.deleted_by_name,
                  deletedByUsername: row.deleted_by_username,
                  deletedByRole: row.deleted_by_role,
                  deletedAt: row.deleted_at,
                  reason: row.reason,
                  isRestored: row.is_restored,
                  restoredAt: row.restored_at,
                  restoredBy: row.restored_by,
                }));
              if (mappedTrash.length > 0) {
                merged.deletedItems = [...mappedTrash, ...(merged.deletedItems || [])];
              }
            }
            migratedForCloud = migrateOverlayToV5(merged);
            return migratedForCloud;
          });
          if (cloudNeedsV5Migration && migratedForCloud) {
            await supabase.from('manafeth_ops_state').upsert({
              doc_key: 'ops_overlay_v1',
              payload: migratedForCloud,
              updated_by: 'system_migration_v5',
              updated_at: new Date().toISOString(),
            });
          }
          setTimeout(() => {
            isSyncingFromCloud.current = false;
          }, 120);
        } else {
          await supabase.from('manafeth_ops_state').upsert({
            doc_key: 'ops_overlay_v1',
            payload: overlay,
            updated_by: 'system_init_v2',
            updated_at: new Date().toISOString(),
          });
        }

        if (audRes.data && audRes.data.length > 0) {
          const mappedAud = audRes.data.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            actorName: r.actor_name,
            actorUsername: r.actor_username || '',
            actorRole: r.actor_role,
            actionType: r.action_type,
            entityType: r.entity_type,
            entityId: r.entity_id,
            entityTitle: r.entity_title,
            summary: r.summary,
            previousValue: r.previous_value,
            newValue: r.new_value,
            reason: r.reason,
          }));
          setAuditLogs(mappedAud);
        }

        if (ntfRes.data && ntfRes.data.length > 0) {
          setNotifications(
            ntfRes.data.map((n) => ({
              id: n.id,
              createdAt: n.created_at,
              type: n.type,
              title: n.title,
              message: n.message,
              targetRole: n.target_role,
              targetDeptId: n.target_dept_id,
              targetEmployeeId: n.target_employee_id,
              relatedEntityId: n.target_entity_id || n.related_entity_id,
              readBy: n.read_by || [],
            }))
          );
        }

        setCloudStatus('online');
        setLastSyncedAt(new Date().toISOString());
        setSyncError(null);
      } catch (err) {
        console.warn('Cloud sync fallback to local:', err.message);
        logClientDiagnostic({ kind: 'sync_error', message: `Cloud sync fallback: ${err.message}` });
        if (mounted) {
          setCloudStatus('local');
          setSyncError(err.message);
        }
      }
    }

    pullFromCloud();

    const channel = supabase
      .channel('manafeth_ops_live_v2')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'manafeth_ops_state', filter: 'doc_key=eq.ops_overlay_v1' },
        (payload) => {
          if (payload.new?.payload) {
            isSyncingFromCloud.current = true;
            setOverlay((prev) => ({ ...prev, ...payload.new.payload }));
            setTimeout(() => {
              isSyncingFromCloud.current = false;
            }, 120);
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'manafeth_ops_audit_logs' }, (payload) => {
        const r = payload.new;
        if (!r) return;
        setAuditLogs((prev) => {
          if (prev.some((x) => x.id === r.id)) return prev;
          return [
            {
              id: r.id,
              timestamp: r.timestamp,
              actorName: r.actor_name,
              actorUsername: r.actor_username || '',
              actorRole: r.actor_role,
              actionType: r.action_type,
              entityType: r.entity_type,
              entityId: r.entity_id,
              entityTitle: r.entity_title,
              summary: r.summary,
              previousValue: r.previous_value,
              newValue: r.new_value,
              reason: r.reason,
            },
            ...prev,
          ];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manafeth_ops_notifications' }, (payload) => {
        const n = payload.new;
        if (!n) return;
        const mapped = {
          id: n.id,
          createdAt: n.created_at,
          type: n.type,
          title: n.title,
          message: n.message,
          targetRole: n.target_role,
          targetDeptId: n.target_dept_id,
          targetEmployeeId: n.target_employee_id,
          relatedEntityId: n.related_entity_id,
          readBy: n.read_by || [],
        };
        setNotifications((prev) => {
          const exists = prev.some((x) => x.id === mapped.id);
          if (exists) return prev.map((x) => (x.id === mapped.id ? mapped : x));
          return [mapped, ...prev];
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push overlay to Supabase helper
  const commitOverlay = useCallback((updater, actorName = 'مستخدم النظام') => {
    setOverlay((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (supabase && !isSyncingFromCloud.current) {
        supabase
          .from('manafeth_ops_state')
          .upsert({
            doc_key: 'ops_overlay_v1',
            payload: next,
            updated_by: actorName,
            updated_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (!error) {
              setCloudStatus('online');
              setLastSyncedAt(new Date().toISOString());
              setSyncError(null);
            } else {
              setSyncError(error.message);
              logClientDiagnostic({ kind: 'save_failure', message: `تعذر حفظ التحديث في السحابة: ${error.message}` });
            }
          });
      } else {
        setLastSyncedAt(new Date().toISOString());
      }
      return next;
    });
  }, []);

  // Append immutable Audit Log (Req #41, #43, #53 — NEVER deletes previous entries)
  const appendAudit = useCallback((entry) => {
    const record = {
      id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorName: entry.actorName || 'مستخدم النظام',
      actorUsername: entry.actorUsername || '',
      actorRole: entry.actorRole || '—',
      actionType: entry.actionType,
      entityType: entry.entityType || 'program',
      entityId: entry.entityId || '',
      entityTitle: entry.entityTitle || '',
      summary: entry.summary || '',
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
      reason: entry.reason || '',
    };
    setAuditLogs((prev) => [record, ...prev]);
    if (supabase) {
      supabase
        .from('manafeth_ops_audit_logs')
        .insert({
          id: record.id,
          timestamp: record.timestamp,
          actor_name: record.actorName,
          actor_username: record.actorUsername,
          actor_role: record.actorRole,
          action_type: record.actionType,
          entity_type: record.entityType,
          entity_id: record.entityId,
          entity_title: record.entityTitle,
          summary: record.summary,
          previous_value: record.previousValue,
          new_value: record.newValue,
          reason: record.reason,
        })
        .then(() => {});
    }
    return record;
  }, []);

  // Emit Notification
  const pushNotification = useCallback((ntf) => {
    const item = {
      id: `NTF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      type: ntf.type || 'تنبيه تشغيلي',
      title: ntf.title,
      message: ntf.message || '',
      targetRole: ntf.targetRole || 'all',
      targetDeptId: ntf.targetDeptId || null,
      targetEmployeeId: ntf.targetEmployeeId || null,
      relatedEntityId: ntf.relatedEntityId || null,
      readBy: [],
    };
    setNotifications((prev) => [item, ...prev]);
    if (supabase) {
      supabase
        .from('manafeth_ops_notifications')
        .insert({
          id: item.id,
          created_at: item.createdAt,
          type: item.type,
          title: item.title,
          message: item.message,
          target_role: item.targetRole,
          target_dept_id: item.targetDeptId,
          target_employee_id: item.targetEmployeeId,
          related_entity_id: item.relatedEntityId,
          read_by: [],
        })
        .then(() => {});
    }
    return item;
  }, []);

  // Unified Merged Master State
  const fullState = useMemo(() => {
    const removedProgSet = new Set(overlay.removedProgramIds || []);
    const removedOccSet = new Set(overlay.removedOccurrenceIds || []);

    const catalogBase = masterSeed.programsCatalog
      .filter((p) => !removedProgSet.has(p.id))
      .map((p) => (overlay.changedCatalogMap?.[p.id] ? { ...p, ...overlay.changedCatalogMap[p.id] } : p));
    const customProgs = (overlay.customPrograms || []).filter((p) => !removedProgSet.has(p.id));
    const programsCatalog = [...customProgs, ...catalogBase];

    const execByOccId = {};
    (overlay.scheduledExecutions || []).forEach((ex) => {
      if (ex.occurrenceId) execByOccId[ex.occurrenceId] = ex;
    });

    const baseOccurrences = masterSeed.plannedOccurrences
      .filter((o) => !removedProgSet.has(o.programId) && !removedOccSet.has(o.id))
      .map((occ) => {
        const upd = overlay.occurrenceUpdates?.[occ.id];
        const linkedExec = execByOccId[occ.id];
        return {
          ...occ,
          ...(upd || {}),
          linkedExecution: linkedExec || null,
          effectiveStatus: linkedExec ? linkedExec.status : upd?.status || occ.status,
        };
      });

    const customOccurrences = (overlay.customOccurrences || [])
      .filter((o) => !removedProgSet.has(o.programId) && !removedOccSet.has(o.id))
      .map((occ) => {
        const upd = overlay.occurrenceUpdates?.[occ.id];
        const linkedExec = execByOccId[occ.id];
        return {
          ...occ,
          ...(upd || {}),
          linkedExecution: linkedExec || null,
          effectiveStatus: linkedExec ? linkedExec.status : upd?.status || occ.status,
        };
      });

    const safeEmployees =
      Array.isArray(overlay.employees) && overlay.employees.some((e) => e && e.username)
        ? overlay.employees
        : masterSeed.employees;
    const safeDepartments =
      Array.isArray(overlay.departments) && overlay.departments.length > 0
        ? overlay.departments
        : masterSeed.departments;

    return {
      meta: masterSeed.meta,
      administrations: overlay.administrations || masterSeed.administrations || [],
      departments: safeDepartments,
      periods: overlay.periods || masterSeed.periods,
      employees: safeEmployees,
      venues: overlay.venues || masterSeed.venues,
      scopes: overlay.scopes || masterSeed.scopes,
      students: overlay.students || masterSeed.students || [],
      tasks: overlay.tasks || masterSeed.tasks || [],
      supervisionDuties: overlay.supervisionDuties || masterSeed.supervisionDuties,
      supervisionInstructions: overlay.supervisionInstructions || masterSeed.supervisionInstructions,
      supervisionCriteria: overlay.supervisionCriteria || masterSeed.supervisionCriteria,
      weeklyCommitments: overlay.weeklyCommitments || masterSeed.weeklyCommitments,
      programsCatalog,
      plannedOccurrences: [...customOccurrences, ...baseOccurrences],
      scheduledExecutions: overlay.scheduledExecutions || [],
      commitmentOverrides: overlay.commitmentOverrides || {},
      exceptionRequests: overlay.exceptionRequests || [],
      dataDiscrepancies: overlay.dataDiscrepancies || masterSeed.dataDiscrepancies,
      importBatches: overlay.importBatches || masterSeed.importBatches,
      programTypes: overlay.programTypes || masterSeed.programTypes,
      conflictRules: overlay.conflictRules || masterSeed.conflictRules,
      exceptionRoutingRules: overlay.exceptionRoutingRules || masterSeed.exceptionRoutingRules,
      versionSnapshots: overlay.versionSnapshots || [],
      deletedItems: overlay.deletedItems || [],
      approvedPlanVersion: overlay.approvedPlanVersion || masterSeed.approvedPlanVersion,
    };
  }, [overlay]);

  // Reactive Current User Session: Auto-updates whenever employee record, permissions, or org structure changes (Req #12 & #51)
  const currentUser = useMemo(() => {
    if (!rawSessionUser) return null;
    const emp = fullState.employees.find(
      (e) =>
        e.id === rawSessionUser.employeeId ||
        (rawSessionUser.username && (e.username || '').toLowerCase() === rawSessionUser.username.toLowerCase())
    );
    if (!emp) return null;
    if (emp.accountStatus === 'غير نشط') return null;
    return buildUserSessionFromEmployeeRecord(emp, fullState);
  }, [rawSessionUser, fullState]);

  useEffect(() => {
    if (rawSessionUser && !currentUser) {
      // Account was disabled or deleted while logged in -> force immediate logout
      setRawSessionUser(null);
      try {
        localStorage.removeItem(SESSION_USER_KEY);
      } catch {}
    } else if (currentUser) {
      try {
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
      } catch {}
    }
  }, [rawSessionUser, currentUser]);

  // Automatic Organization Context for the Logged-in User (Req #1, #13-#16)
  const userOrgContext = useMemo(() => resolveUserOrgContext(currentUser, fullState), [currentUser, fullState]);

  // =========================================================================
  // STRICT CREDENTIALS AUTHENTICATION (Req #2 & #3 — NO manual role switcher!)
  // =========================================================================
  const loginWithCredentials = useCallback(
    async (usernameInput, passwordInput) => {
      const cleanUsername = String(usernameInput || '').trim().toLowerCase();
      const password = String(passwordInput || '');

      if (!cleanUsername || !password) {
        return { ok: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور.' };
      }

      let verifiedEmpId = null;

      if (supabase) {
        try {
          const [loginRes, sessRes] = await Promise.all([
            supabase.rpc('manafeth_verify_login', {
              p_username: cleanUsername,
              p_password: password,
            }),
            supabase.rpc('manafeth_issue_session', {
              p_username: cleanUsername,
              p_password: password,
            }),
          ]);

          if (loginRes.data && !loginRes.error) {
            if (!loginRes.data.ok) {
              return {
                ok: false,
                error: loginRes.data.message || loginRes.data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.',
              };
            }
            verifiedEmpId = loginRes.data.employeeId;
          } else if (loginRes.error) {
            console.warn('Auth RPC fallback warning:', loginRes.error.message);
          }

          if (sessRes.data && !sessRes.error && sessRes.data.ok && sessRes.data.token) {
            setSessionToken(sessRes.data.token);
            try {
              localStorage.setItem(SESSION_TOKEN_KEY, sessRes.data.token);
            } catch {}
          }
        } catch (err) {
          console.warn('Network offline login fallback:', err.message);
        }
      }

      const emp = fullState.employees.find((e) =>
        verifiedEmpId ? e.id === verifiedEmpId : (e.username || '').toLowerCase() === cleanUsername
      );

      if (!emp) {
        return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
      }

      if (emp.accountStatus === 'غير نشط') {
        return { ok: false, error: 'هذا الحساب غير نشط حاليًا. يرجى مراجعة مدير النظام.' };
      }

      // Offline fallback check if RPC could not be reached
      if (!verifiedEmpId) {
        const expectedOfflinePwd = cleanUsername === 'admin' ? 'Admin@2026' : 'Traof@2026';
        if (password !== expectedOfflinePwd) {
          return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
        }
      }

      const sessionObj = buildUserSessionFromEmployeeRecord(emp, fullState);
      setRawSessionUser(sessionObj);
      try {
        const lastVisitKey = `manafeth_ops_last_seen_${emp.id}`;
        const prevVisit = localStorage.getItem(lastVisitKey);
        if (prevVisit) {
          setLastLoginSeenAt(prevVisit);
          localStorage.setItem('manafeth_ops_prev_visit_iso', prevVisit);
        }
        localStorage.setItem(lastVisitKey, new Date().toISOString());
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(sessionObj));
      } catch {}

      appendAudit({
        actorName: sessionObj.name,
        actorUsername: sessionObj.username,
        actorRole: sessionObj.roleLabel,
        actionType: 'تسجيل دخول مستخدم',
        entityType: 'auth_session',
        entityId: sessionObj.employeeId,
        entityTitle: `${sessionObj.name} (@${sessionObj.username})`,
        summary: `سجّل الموظف «${sessionObj.name}» (@${sessionObj.username}) الدخول إلى المنصة بصلاحية (${sessionObj.roleLabel}).`,
      });

      return { ok: true, user: sessionObj };
    },
    [fullState, appendAudit]
  );

  const logout = useCallback(() => {
    if (currentUser) {
      appendAudit({
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        actorRole: currentUser.roleLabel,
        actionType: 'تسجيل خروج',
        entityType: 'auth_session',
        entityId: currentUser.employeeId,
        entityTitle: `${currentUser.name} (@${currentUser.username})`,
        summary: `سجّل «${currentUser.name}» الخروج من المنصة.`,
      });
    }
    if (sessionToken && supabase) {
      supabase.rpc('manafeth_revoke_session', { p_token: sessionToken }).then(() => {});
    }
    setSessionToken(null);
    setEvaluations([]);
    setEvalMe(null);
    setRawSessionUser(null);
    try {
      localStorage.removeItem(SESSION_USER_KEY);
      localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {}
  }, [currentUser, sessionToken, appendAudit]);

  const markNotificationRead = useCallback(
    (ntfId) => {
      const uid = currentUser?.id || 'guest';
      setNotifications((prev) =>
        prev.map((n) => {
          if (n.id !== ntfId) return n;
          const updatedReadBy = n.readBy.includes(uid) ? n.readBy : [...n.readBy, uid];
          if (supabase) {
            supabase.from('manafeth_ops_notifications').update({ read_by: updatedReadBy }).eq('id', ntfId).then(() => {});
          }
          return { ...n, readBy: updatedReadBy };
        })
      );
    },
    [currentUser]
  );

  const markAllNotificationsRead = useCallback(() => {
    const uid = currentUser?.id || 'guest';
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.readBy.includes(uid)) return n;
        const updatedReadBy = [...n.readBy, uid];
        if (supabase) {
          supabase.from('manafeth_ops_notifications').update({ read_by: updatedReadBy }).eq('id', n.id).then(() => {});
        }
        return { ...n, readBy: updatedReadBy };
      })
    );
  }, [currentUser]);

  // =========================================================================
  // WORKFLOW 1: Schedule Execution / Add New Program (Day 1–15 Server Gate!) / Sub-Programs / Multi-Periods / Students
  // =========================================================================
  const scheduleProgramExecution = useCallback(
    async (formPayload, options = { saveAsDraft: false }) => {
      const actorName = currentUser?.name || 'مسؤول القسم';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مسؤول القسم';
      const nowIso = new Date().toISOString();

      const execId = formPayload.id || `EXC-${Date.now()}`;
      const existingExec = fullState.scheduledExecutions.find((x) => x.id === execId);
      const isCreatingBrandNewProgram = Boolean(formPayload.isNewProgram && !existingExec);

      // Req #31–#35: Server-side & Window Enforcement for Brand-New Programs (Days 1–15 ONLY)
      if (isCreatingBrandNewProgram) {
        const latestWin = await refreshSubmissionWindow();
        if (!latestWin.isOpen) {
          return {
            ok: false,
            error: CLOSED_SUBMISSION_WINDOW_MESSAGE,
            serverBlocked: true,
          };
        }
        if (supabase) {
          const gateRes = await supabase.from('manafeth_ops_new_programs_gate').insert({
            id: `GATE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            program_id: formPayload.programId || `PRG-CUSTOM-${Date.now()}`,
            program_name: formPayload.programName || 'برنامج جديد',
            department_id: formPayload.departmentId || '',
            created_by: actorName,
            created_by_username: actorUsername,
          });
          if (gateRes.error) {
            return {
              ok: false,
              error: CLOSED_SUBMISSION_WINDOW_MESSAGE,
              serverBlocked: true,
            };
          }
        }
      }

      const execStartDate = formPayload.executionDate;
      const execEndDate =
        formPayload.executionEndDate && formPayload.executionEndDate >= execStartDate
          ? formPayload.executionEndDate
          : execStartDate;
      const coveredDatesObj = expandDatesRange(execStartDate, execEndDate);
      const coveredDates = coveredDatesObj.map((x) => x.date);
      const coveredDays = Array.from(new Set(coveredDatesObj.map((x) => x.day).filter(Boolean)));
      const dateInfo = dateToPlanWeekInfo(execStartDate);
      const dayName = formPayload.day || dateToArabicDay(execStartDate);

      const fromPeriodId = formPayload.fromPeriodId || formPayload.periodId || 'P1';
      const toPeriodId = formPayload.toPeriodId || fromPeriodId;
      const covObj = computeCoveredPeriods(fullState.periods, fromPeriodId, toPeriodId);
      const coveredPeriodIds = covObj.coveredPeriodIds?.length ? covObj.coveredPeriodIds : [fromPeriodId];
      const coveredPeriodNames = covObj.coveredPeriodNames?.length
        ? covObj.coveredPeriodNames
        : [getPeriodTiming(fullState.periods, fromPeriodId).name];

      const pTimingFirst = getPeriodTiming(fullState.periods, coveredPeriodIds[0]);
      const pTimingLast = getPeriodTiming(fullState.periods, coveredPeriodIds[coveredPeriodIds.length - 1]);
      const startTime = formPayload.startTime || covObj.startTime || pTimingFirst.start;
      const endTime = formPayload.endTime || covObj.endTime || pTimingLast.end;
      const periodNameDisplay =
        coveredPeriodNames.length > 1 ? coveredPeriodNames.join(' + ') : pTimingFirst.name;

      // Normalize hierarchical sub-programs (Req #17–#22) + Multi-Day Date Range per Sub-Program
      const normalizedSubPrograms = (formPayload.subPrograms || []).map((sp, idx) => {
        const spFrom = sp.fromPeriodId || sp.periodId || fromPeriodId;
        const spTo = sp.toPeriodId || spFrom;
        const spCov = computeCoveredPeriods(fullState.periods, spFrom, spTo);
        const spCovIds = spCov.coveredPeriodIds?.length ? spCov.coveredPeriodIds : [spFrom];
        const spCovNames = spCov.coveredPeriodNames?.length
          ? spCov.coveredPeriodNames
          : [getPeriodTiming(fullState.periods, spFrom).name];
        const spFirstT = getPeriodTiming(fullState.periods, spCovIds[0]);
        const spLastT = getPeriodTiming(fullState.periods, spCovIds[spCovIds.length - 1]);
        const spExecDate = sp.executionDate || execStartDate;
        const spExecEndDate =
          sp.executionEndDate && sp.executionEndDate >= spExecDate ? sp.executionEndDate : spExecDate;
        const spCovDatesObj = expandDatesRange(spExecDate, spExecEndDate);

        return {
          id: sp.id || `SUB-${Date.now()}-${idx + 1}`,
          order: idx + 1,
          name: sp.name || `فقرة فرعية ${idx + 1}`,
          executionDate: spExecDate,
          executionEndDate: spExecEndDate,
          coveredDates: spCovDatesObj.map((x) => x.date),
          coveredDays: Array.from(new Set(spCovDatesObj.map((x) => x.day).filter(Boolean))),
          dateRangeLabel: formatDateRangeAr(spExecDate, spExecEndDate, { compact: true }),
          day: dateToArabicDay(spExecDate) || dayName,
          fromPeriodId: spFrom,
          toPeriodId: spTo,
          periodId: spFrom,
          coveredPeriodIds: spCovIds,
          coveredPeriodNames: spCovNames,
          periodName: spCovNames.join(' + '),
          startTime: sp.startTime || spCov.startTime || spFirstT.start,
          endTime: sp.endTime || spCov.endTime || spLastT.end,
          venueId: sp.venueId || formPayload.venueId || '',
          leadEmployeeId: sp.leadEmployeeId || formPayload.leadEmployeeId || '',
          participatingEmployeeIds: sp.participatingEmployeeIds || [],
          targetMode: sp.targetMode || formPayload.targetMode || 'scopes',
          scopeIds: sp.scopeIds || formPayload.scopeIds || [],
          studentIds: sp.studentIds || formPayload.studentIds || [],
          notes: sp.notes || '',
        };
      });

      // Run Two-Level Conflict Check (Main + Sub-Programs + Students + 4-Level Conflict Behavior)
      const candidate = {
        ...formPayload,
        id: execId,
        executionDate: execStartDate,
        executionEndDate: execEndDate,
        day: dayName,
        periodId: fromPeriodId,
        fromPeriodId,
        toPeriodId,
        coveredPeriodIds,
        startTime,
        endTime,
        subPrograms: normalizedSubPrograms,
        globalWeek: dateInfo?.globalWeek || formPayload.plannedGlobalWeek || activeGlobalWeek,
      };
      const conflictResult = detectProgramConflicts(candidate, fullState);

      let finalStatus = 'معتمد';
      if (options.saveAsDraft) {
        finalStatus = 'مسودة';
      } else if (!conflictResult.canApproveDirectly) {
        finalStatus = 'يوجد تعارض';
      } else {
        finalStatus = 'معتمد';
      }

      const plannedMonth = formPayload.plannedMonth ?? dateInfo?.month ?? 11;
      const plannedWeekInMonth = formPayload.plannedWeekInMonth ?? dateInfo?.weekInMonth ?? 1;
      const plannedGlobalWeek = formPayload.plannedGlobalWeek ?? dateInfo?.globalWeek ?? activeGlobalWeek;
      const execGlobalWeek = dateInfo?.globalWeek || plannedGlobalWeek;

      const movedFromPlan = Boolean(
        formPayload.plannedGlobalWeek && dateInfo?.globalWeek && formPayload.plannedGlobalWeek !== dateInfo.globalWeek
      );
      const shiftHistory = [...(existingExec?.shiftHistory || [])];
      if (movedFromPlan && (!existingExec || existingExec.executionDate !== execStartDate)) {
        shiftHistory.push({
          changedAt: nowIso,
          changedBy: actorName,
          originalMonth: plannedMonth,
          originalWeekInMonth: plannedWeekInMonth,
          originalGlobalWeek: plannedGlobalWeek,
          newDate: execStartDate,
          newMonth: dateInfo.month,
          newWeekInMonth: dateInfo.weekInMonth,
          newGlobalWeek: dateInfo.globalWeek,
          reason: formPayload.shiftReason || 'تعديل موعد التنفيذ مع الاحتفاظ بالخطة الأصلية',
        });
      }

      const deptObj = fullState.departments.find((d) => d.id === formPayload.departmentId);

      const newExecRecord = {
        id: execId,
        occurrenceId: formPayload.occurrenceId || null,
        programId: formPayload.programId || `PRG-CUSTOM-${Date.now()}`,
        clonedFromId: formPayload.clonedFromId || null,
        programName: formPayload.programName,
        departmentId: formPayload.departmentId,
        departmentName: deptObj?.name || formPayload.departmentName || '',
        strategicGoal: formPayload.strategicGoal || '',
        strategicIndicator: formPayload.strategicIndicator || '',
        initiative: formPayload.initiative || '',
        programType: formPayload.programType || 'برنامج اعتيادي',
        plannedMonth,
        plannedMonthName: MONTH_NAMES_AR[plannedMonth] || `الشهر ${plannedMonth}`,
        plannedWeekInMonth,
        plannedWeekLabel: WEEK_ORDINALS_AR[plannedWeekInMonth] || `الأسبوع ${plannedWeekInMonth}`,
        plannedGlobalWeek,
        executionDate: execStartDate,
        executionEndDate: execEndDate,
        coveredDates,
        coveredDays,
        dateRangeLabel: formatDateRangeAr(execStartDate, execEndDate, { compact: true }),
        executionMonth: dateInfo?.month || plannedMonth,
        executionWeekInMonth: dateInfo?.weekInMonth || plannedWeekInMonth,
        executionGlobalWeek: execGlobalWeek,
        movedFromOriginalPlan: movedFromPlan,
        shiftReason: formPayload.shiftReason || '',
        shiftHistory,
        day: dayName,
        periodId: fromPeriodId,
        fromPeriodId,
        toPeriodId,
        coveredPeriodIds,
        coveredPeriodNames,
        periodName: periodNameDisplay,
        startTime,
        endTime,
        venueId: formPayload.venueId,
        targetMode: formPayload.targetMode || 'scopes',
        scopeIds: formPayload.scopeIds || [],
        studentIds: formPayload.studentIds || [],
        leadEmployeeId: formPayload.leadEmployeeId,
        participatingEmployeeIds: formPayload.participatingEmployeeIds || [],
        subPrograms: normalizedSubPrograms,
        description: formPayload.description || '',
        objective: formPayload.objective || '',
        requirements: formPayload.requirements || '',
        notes: formPayload.notes || '',
        attachments: formPayload.attachments || [],
        status: finalStatus,
        conflictsSnapshot: conflictResult.conflicts,
        overallConflictLevel: conflictResult.overallLevel,
        sourceFile: formPayload.sourceFile || 'إضافة تشغيلية داخل المنصة',
        createdBy: existingExec?.createdBy || actorName,
        createdByEmployeeId: existingExec?.createdByEmployeeId || currentUser?.employeeId || null,
        createdAt: existingExec?.createdAt || nowIso,
        lastModifiedAt: nowIso,
        lastModifiedBy: actorName,
      };

      commitOverlay((prev) => {
        const nextExecs = existingExec
          ? prev.scheduledExecutions.map((x) => (x.id === execId ? newExecRecord : x))
          : [newExecRecord, ...prev.scheduledExecutions];

        const nextCustomPrograms = [...(prev.customPrograms || [])];
        const nextCustomOccs = [...(prev.customOccurrences || [])];

        if (isCreatingBrandNewProgram) {
          nextCustomPrograms.unshift({
            id: newExecRecord.programId,
            name: newExecRecord.programName,
            departmentId: newExecRecord.departmentId,
            departmentName: newExecRecord.departmentName,
            strategicGoal: newExecRecord.strategicGoal,
            strategicIndicator: newExecRecord.strategicIndicator,
            initiative: newExecRecord.initiative,
            jobRoles: [],
            plannedWeeksCount: 1,
            plannedWeeks: [
              {
                month: plannedMonth,
                monthName: newExecRecord.plannedMonthName,
                weekInMonth: plannedWeekInMonth,
                weekInMonthLabel: newExecRecord.plannedWeekLabel,
                globalWeek: plannedGlobalWeek,
              },
            ],
            sourceFile: 'إضافة مباشرة عبر المنصة (1–15)',
          });
          const newOccId = `OCC-CUSTOM-${Date.now()}`;
          newExecRecord.occurrenceId = newOccId;
          nextCustomOccs.unshift({
            id: newOccId,
            programId: newExecRecord.programId,
            programName: newExecRecord.programName,
            departmentId: newExecRecord.departmentId,
            departmentName: newExecRecord.departmentName,
            strategicGoal: newExecRecord.strategicGoal,
            strategicIndicator: newExecRecord.strategicIndicator,
            initiative: newExecRecord.initiative,
            jobRoles: [],
            plannedMonth,
            plannedMonthName: newExecRecord.plannedMonthName,
            plannedWeekInMonth,
            plannedWeekLabel: newExecRecord.plannedWeekLabel,
            plannedGlobalWeek,
            hasGreenWeek: false,
            status: finalStatus,
            programType: newExecRecord.programType,
            sourceFile: 'إضافة مباشرة عبر المنصة (1–15)',
          });
        }

        const nextOccUpdates = { ...(prev.occurrenceUpdates || {}) };
        if (newExecRecord.occurrenceId) {
          nextOccUpdates[newExecRecord.occurrenceId] = {
            status: finalStatus,
            executionId: execId,
            lastUpdated: nowIso,
          };
        }

        return {
          ...prev,
          customPrograms: nextCustomPrograms,
          customOccurrences: nextCustomOccs,
          occurrenceUpdates: nextOccUpdates,
          scheduledExecutions: nextExecs,
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: existingExec
          ? 'تعديل جدولة برنامج'
          : isCreatingBrandNewProgram
          ? 'إضافة وجدولة برنامج جديد'
          : 'جدولة تنفيذ برنامج مخطط',
        entityType: 'program_execution',
        entityId: execId,
        entityTitle: newExecRecord.programName,
        summary: `${existingExec ? 'تم تحديث' : 'تمت جدولة'} برنامج «${newExecRecord.programName}» (${newExecRecord.departmentName}) ليوم ${dayName} (${newExecRecord.executionDate}) — الفترات: (${periodNameDisplay})${normalizedSubPrograms.length ? ` — الفقرات الفرعية: (${normalizedSubPrograms.length})` : ''} — الحالة: ${finalStatus}.`,
        previousValue: existingExec
          ? {
              date: existingExec.executionDate,
              period: existingExec.periodName,
              venueId: existingExec.venueId,
              status: existingExec.status,
            }
          : { plannedMonth, plannedWeek: newExecRecord.plannedWeekLabel },
        newValue: {
          date: newExecRecord.executionDate,
          period: periodNameDisplay,
          coveredPeriodNames,
          subProgramsCount: normalizedSubPrograms.length,
          venueId: newExecRecord.venueId,
          status: finalStatus,
          conflictsCount: conflictResult.conflicts.length,
        },
        reason: formPayload.shiftReason || (existingExec ? 'تحديث بيانات الجدولة' : 'استكمال الجدولة التنفيذية'),
      });

      if (finalStatus === 'معتمد') {
        pushNotification({
          type: newExecRecord.programType === 'برنامج نوعي' ? 'اعتماد برنامج نوعي' : 'اعتماد جدولة برنامج',
          title: `اعتماد برنامج: ${newExecRecord.programName}`,
          message: `تم اعتماد وإدراج «${newExecRecord.programName}» (${newExecRecord.departmentName}) يوم ${dayName} الموافق ${newExecRecord.executionDate} في (${periodNameDisplay}).`,
          targetRole: 'all',
          targetDeptId: newExecRecord.departmentId,
          targetEmployeeId: newExecRecord.leadEmployeeId,
          relatedEntityId: execId,
        });
      }

      return { ok: true, execution: newExecRecord, conflictResult };
    },
    [currentUser, fullState, activeGlobalWeek, refreshSubmissionWindow, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 2: Submit Exception Request (Zero Re-Entry!)
  // =========================================================================
  const submitExceptionRequest = useCallback(
    async ({ executionDraft, conflicts, exceptionForm, opinionEmployeeIds, approverEmployeeId }) => {
      const actorName = currentUser?.name || 'مسؤول القسم';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مسؤول القسم';
      const nowIso = new Date().toISOString();

      const execId = executionDraft.id || `EXC-${Date.now()}`;
      const existingExec = fullState.scheduledExecutions.find((x) => x.id === execId);
      const isCreatingBrandNewProgram = Boolean(executionDraft.isNewProgram && !existingExec);

      if (isCreatingBrandNewProgram) {
        const latestWin = await refreshSubmissionWindow();
        if (!latestWin.isOpen) {
          return { ok: false, error: CLOSED_SUBMISSION_WINDOW_MESSAGE };
        }
        if (supabase) {
          const gateRes = await supabase.from('manafeth_ops_new_programs_gate').insert({
            id: `GATE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            program_id: executionDraft.programId || `PRG-CUSTOM-${Date.now()}`,
            program_name: executionDraft.programName || 'برنامج جديد (استثناء)',
            department_id: executionDraft.departmentId || '',
            created_by: actorName,
            created_by_username: actorUsername,
          });
          if (gateRes.error) {
            return { ok: false, error: CLOSED_SUBMISSION_WINDOW_MESSAGE };
          }
        }
      }

      const hasOpinionGivers = (opinionEmployeeIds || []).length > 0;
      const targetStatus = hasOpinionGivers ? 'بانتظار إبداء الرأي' : 'بانتظار الاعتماد';

      const exStartDate = executionDraft.executionDate;
      const exEndDate =
        executionDraft.executionEndDate && executionDraft.executionEndDate >= exStartDate
          ? executionDraft.executionEndDate
          : exStartDate;
      const exCovDatesObj = expandDatesRange(exStartDate, exEndDate);
      const dateInfo = dateToPlanWeekInfo(exStartDate);
      const dayName = executionDraft.day || dateToArabicDay(exStartDate);
      const fromPeriodId = executionDraft.fromPeriodId || executionDraft.periodId || 'P1';
      const toPeriodId = executionDraft.toPeriodId || fromPeriodId;
      const covObj = computeCoveredPeriods(fullState.periods, fromPeriodId, toPeriodId);
      const coveredPeriodIds = covObj.coveredPeriodIds?.length ? covObj.coveredPeriodIds : [fromPeriodId];
      const coveredPeriodNames = covObj.coveredPeriodNames?.length
        ? covObj.coveredPeriodNames
        : [getPeriodTiming(fullState.periods, fromPeriodId).name];
      const pTimingFirst = getPeriodTiming(fullState.periods, coveredPeriodIds[0]);
      const pTimingLast = getPeriodTiming(fullState.periods, coveredPeriodIds[coveredPeriodIds.length - 1]);

      const exReqId = `EXR-${Date.now()}`;
      const deptObj = fullState.departments.find((d) => d.id === executionDraft.departmentId);

      const execRecord = {
        ...executionDraft,
        id: execId,
        departmentName: deptObj?.name || executionDraft.departmentName || '',
        executionDate: exStartDate,
        executionEndDate: exEndDate,
        coveredDates: exCovDatesObj.map((x) => x.date),
        coveredDays: Array.from(new Set(exCovDatesObj.map((x) => x.day).filter(Boolean))),
        dateRangeLabel: formatDateRangeAr(exStartDate, exEndDate, { compact: true }),
        day: dayName,
        periodId: fromPeriodId,
        fromPeriodId,
        toPeriodId,
        coveredPeriodIds,
        coveredPeriodNames,
        periodName: coveredPeriodNames.join(' + '),
        startTime: executionDraft.startTime || pTimingFirst.start,
        endTime: executionDraft.endTime || pTimingLast.end,
        executionMonth: dateInfo?.month || executionDraft.plannedMonth || 11,
        executionWeekInMonth: dateInfo?.weekInMonth || executionDraft.plannedWeekInMonth || 1,
        executionGlobalWeek: dateInfo?.globalWeek || executionDraft.plannedGlobalWeek || activeGlobalWeek,
        status: targetStatus,
        exceptionRequestId: exReqId,
        conflictsSnapshot: conflicts,
        createdBy: executionDraft.createdBy || actorName,
        createdByEmployeeId: executionDraft.createdByEmployeeId || currentUser?.employeeId || null,
        createdAt: executionDraft.createdAt || nowIso,
        lastModifiedAt: nowIso,
        lastModifiedBy: actorName,
      };

      const empMap = Object.fromEntries(fullState.employees.map((e) => [e.id, e]));

      const exceptionRecord = {
        id: exReqId,
        executionId: execId,
        createdAt: nowIso,
        requestedBy: actorName,
        requestedByRole: actorRole,
        departmentId: execRecord.departmentId,
        departmentName: execRecord.departmentName,
        programSnapshot: execRecord,
        conflicts: conflicts || [],
        reasonForException: exceptionForm.reasonForException || '',
        importanceJustification: exceptionForm.importanceJustification || '',
        whyCannotChangeTime: exceptionForm.whyCannotChangeTime || '',
        impactOfNonExecution: exceptionForm.impactOfNonExecution || '',
        proposedConflictSolution: exceptionForm.proposedConflictSolution || '',
        notes: exceptionForm.notes || '',
        attachments: exceptionForm.attachments || [],
        opinionEmployeeIds: opinionEmployeeIds || [],
        opinions: (opinionEmployeeIds || []).map((eid) => ({
          employeeId: eid,
          employeeName: empMap[eid]?.name || eid,
          employeeJobTitle: empMap[eid]?.jobTitle || '',
          decision: null,
          notes: '',
          decidedAt: null,
        })),
        approverEmployeeId: approverEmployeeId || fullState.employees.find((e) => e.isApprover)?.id || 'EMP-37',
        approverDecision: null,
        approverNotes: '',
        approverDecidedAt: null,
        approverName: null,
        status: targetStatus,
        affectedItems: (conflicts || [])
          .filter((c) => c.existingProgramId && c.existingEntityKind !== 'fixed_event' && c.existingEntityKind !== 'internal_subprogram')
          .map((c, idx) => ({
            id: `AFF-${idx + 1}-${c.existingProgramId}`,
            conflictCode: c.code,
            conflictTypeLabel: c.typeLabel,
            existingEntityKind: c.existingEntityKind,
            existingProgramId: c.existingProgramId,
            existingProgramTitle: c.existingProgram,
            existingDepartment: c.existingDepartment,
            employeeName: c.employeeName,
            studentName: c.studentName || null,
            subProgramName: c.subProgramName || null,
            scopeName: c.scopeName,
            venueName: c.venueName,
            day: c.day,
            date: execRecord.executionDate,
            periodName: c.periodName,
            timeRange: c.timeRange,
            resolutionAction: null,
            resolutionDetails: '',
            newDate: '',
            newPeriodId: '',
            newVenueId: '',
            newEmployeeId: '',
            resolvedBy: null,
            resolvedAt: null,
          })),
        allAffectedResolved: false,
      };

      commitOverlay((prev) => {
        const exists = prev.scheduledExecutions.some((x) => x.id === execId);
        const nextExecs = exists
          ? prev.scheduledExecutions.map((x) => (x.id === execId ? execRecord : x))
          : [execRecord, ...prev.scheduledExecutions];

        const nextOccUpdates = { ...(prev.occurrenceUpdates || {}) };
        if (execRecord.occurrenceId) {
          nextOccUpdates[execRecord.occurrenceId] = {
            status: targetStatus,
            executionId: execId,
            exceptionRequestId: exReqId,
            lastUpdated: nowIso,
          };
        }

        return {
          ...prev,
          scheduledExecutions: nextExecs,
          occurrenceUpdates: nextOccUpdates,
          exceptionRequests: [exceptionRecord, ...(prev.exceptionRequests || [])],
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'رفع طلب استثناء',
        entityType: 'exception_request',
        entityId: exReqId,
        entityTitle: execRecord.programName,
        summary: `تم رفع طلب استثناء لبرنامج «${execRecord.programName}» (${execRecord.departmentName}) يوم ${dayName} (${execRecord.executionDate}) بوجود ${conflicts.length} تعارضات، وإحالته إلى ${opinionEmployeeIds.length} من أصحاب الرأي.`,
        previousValue: { status: 'يوجد تعارض' },
        newValue: { status: targetStatus, opinionRecipients: opinionEmployeeIds.map((id) => empMap[id]?.name) },
        reason: exceptionForm.reasonForException,
      });

      (opinionEmployeeIds || []).forEach((eid) => {
        pushNotification({
          type: 'طلب إبداء رأي',
          title: `طلب استثناء يحتاج رأيك: ${execRecord.programName}`,
          message: `أحال ${actorName} (${execRecord.departmentName}) طلب استثناء لبرنامج «${execRecord.programName}» ليوم ${dayName} (${execRecord.executionDate}).`,
          targetRole: 'opinion_giver',
          targetEmployeeId: eid,
          relatedEntityId: exReqId,
        });
      });

      pushNotification({
        type: 'وصول طلب استثناء',
        title: `تسجيل طلب استثناء جديد (${exReqId})`,
        message: `طلب استثناء من ${execRecord.departmentName} لبرنامج «${execRecord.programName}» — الحالة: ${targetStatus}.`,
        targetRole: 'approver',
        targetEmployeeId: exceptionRecord.approverEmployeeId,
        relatedEntityId: exReqId,
      });

      return { ok: true, exceptionRecord };
    },
    [currentUser, fullState, activeGlobalWeek, refreshSubmissionWindow, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 3: Submit Opinion on Exception Request
  // =========================================================================
  const submitExceptionOpinion = useCallback(
    (exceptionId, { employeeId, decision, notes }) => {
      const actorName = currentUser?.name || 'صاحب الرأي';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'صاحب الرأي';
      const nowIso = new Date().toISOString();

      const targetReq = fullState.exceptionRequests.find((r) => r.id === exceptionId);
      if (!targetReq) return;

      const targetEmpId = employeeId || currentUser?.employeeId || targetReq.opinions.find((o) => !o.decision)?.employeeId;

      const updatedOpinions = targetReq.opinions.map((op) =>
        op.employeeId === targetEmpId
          ? {
              ...op,
              employeeName: op.employeeName || actorName,
              decision,
              notes: notes || '',
              decidedAt: nowIso,
            }
          : op
      );

      if (!targetReq.opinions.some((op) => op.employeeId === targetEmpId)) {
        updatedOpinions.push({
          employeeId: targetEmpId || 'ADMIN',
          employeeName: actorName,
          employeeJobTitle: actorRole,
          decision,
          notes: notes || '',
          decidedAt: nowIso,
        });
      }

      const allCompleted = updatedOpinions.every((op) => Boolean(op.decision));
      const nextStatus = allCompleted ? 'بانتظار الاعتماد' : 'بانتظار إبداء الرأي';

      commitOverlay((prev) => {
        const nextReqs = prev.exceptionRequests.map((r) =>
          r.id === exceptionId ? { ...r, opinions: updatedOpinions, status: nextStatus } : r
        );
        const nextExecs = prev.scheduledExecutions.map((ex) =>
          ex.id === targetReq.executionId ? { ...ex, status: nextStatus, lastModifiedAt: nowIso } : ex
        );
        const nextOccUpdates = { ...(prev.occurrenceUpdates || {}) };
        if (targetReq.programSnapshot?.occurrenceId) {
          nextOccUpdates[targetReq.programSnapshot.occurrenceId] = {
            ...(nextOccUpdates[targetReq.programSnapshot.occurrenceId] || {}),
            status: nextStatus,
            lastUpdated: nowIso,
          };
        }
        return {
          ...prev,
          exceptionRequests: nextReqs,
          scheduledExecutions: nextExecs,
          occurrenceUpdates: nextOccUpdates,
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'إبداء رأي على طلب استثناء',
        entityType: 'exception_request',
        entityId: exceptionId,
        entityTitle: targetReq.programSnapshot?.programName,
        summary: `أبدى ${actorName} رأيه (${decision}) على طلب استثناء برنامج «${targetReq.programSnapshot?.programName}»${allCompleted ? ' — اكتملت الآراء وانتقل للاعتماد النهائي' : ''}.`,
        previousValue: { status: targetReq.status },
        newValue: { decision, notes, status: nextStatus },
        reason: notes || decision,
      });

      if (allCompleted) {
        pushNotification({
          type: 'بانتظار الاعتماد النهائي',
          title: `اكتملت الآراء على استثناء: ${targetReq.programSnapshot?.programName}`,
          message: `اكتملت آراء المختصين على طلب الاستثناء (${exceptionId}) وهو الآن جاهز لقرار صاحب صلاحية الاعتماد النهائي.`,
          targetRole: 'approver',
          targetEmployeeId: targetReq.approverEmployeeId,
          relatedEntityId: exceptionId,
        });
      }
    },
    [currentUser, fullState.exceptionRequests, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 4: Final Approval Decision on Exception
  // =========================================================================
  const decideExceptionFinal = useCallback(
    (exceptionId, { decision, notes }) => {
      const actorName = currentUser?.name || 'صاحب الاعتماد';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'صاحب الاعتماد';
      const nowIso = new Date().toISOString();

      const targetReq = fullState.exceptionRequests.find((r) => r.id === exceptionId);
      if (!targetReq) return;

      let progStatus = 'مرفوض';
      if (decision === 'اعتماد' || decision === 'اعتماد بشروط') {
        progStatus = 'معتمد باستثناء';
      } else if (decision === 'إعادة للتعديل') {
        progStatus = 'يحتاج جدولة';
      } else {
        progStatus = 'مرفوض';
      }

      const hasAffected = (targetReq.affectedItems || []).length > 0;

      commitOverlay((prev) => {
        const nextReqs = prev.exceptionRequests.map((r) =>
          r.id === exceptionId
            ? {
                ...r,
                approverDecision: decision,
                approverNotes: notes || '',
                approverDecidedAt: nowIso,
                approverName: actorName,
                status: progStatus,
                allAffectedResolved: progStatus === 'معتمد باستثناء' ? !hasAffected : true,
              }
            : r
        );

        const nextExecs = prev.scheduledExecutions.map((ex) =>
          ex.id === targetReq.executionId
            ? {
                ...ex,
                status: progStatus,
                approvedExceptionNotes: notes || '',
                approvedBy: actorName,
                approvedAt: nowIso,
                lastModifiedAt: nowIso,
              }
            : ex
        );

        const nextOccUpdates = { ...(prev.occurrenceUpdates || {}) };
        if (targetReq.programSnapshot?.occurrenceId) {
          nextOccUpdates[targetReq.programSnapshot.occurrenceId] = {
            ...(nextOccUpdates[targetReq.programSnapshot.occurrenceId] || {}),
            status: progStatus,
            lastUpdated: nowIso,
          };
        }

        return {
          ...prev,
          exceptionRequests: nextReqs,
          scheduledExecutions: nextExecs,
          occurrenceUpdates: nextOccUpdates,
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: `قرار الاعتماد النهائي (${decision})`,
        entityType: 'exception_request',
        entityId: exceptionId,
        entityTitle: targetReq.programSnapshot?.programName,
        summary: `أصدر ${actorName} قرار (${decision}) لطلب استثناء برنامج «${targetReq.programSnapshot?.programName}» — الحالة الآن: ${progStatus}${progStatus === 'معتمد باستثناء' && hasAffected ? `، مع فتح مسار معالجة ${targetReq.affectedItems.length} برامج/التزامات متأثرة دون إلغاء تلقائي.` : '.'}`,
        previousValue: { status: targetReq.status },
        newValue: { decision, status: progStatus, notes },
        reason: notes || decision,
      });

      if (progStatus === 'معتمد باستثناء') {
        pushNotification({
          type: 'اعتماد الاستثناء',
          title: `اعتماد باستثناء: ${targetReq.programSnapshot?.programName}`,
          message: `تم اعتماد برنامج «${targetReq.programSnapshot?.programName}» باستثناء وإدراجه في الجدول العام. يلزم استكمال معالجة البرامج المتأثرة (${targetReq.affectedItems.length}).`,
          targetRole: 'all',
          targetDeptId: targetReq.departmentId,
          relatedEntityId: exceptionId,
        });
      } else {
        pushNotification({
          type: decision === 'رفض' ? 'رفض الاستثناء' : 'إعادة طلب استثناء للتعديل',
          title: `${decision}: ${targetReq.programSnapshot?.programName}`,
          message: `تم اتخاذ قرار (${decision}) بشأن طلب الاستثناء لبرنامج «${targetReq.programSnapshot?.programName}». الملاحظات: ${notes || '—'}`,
          targetRole: 'dept_head',
          targetDeptId: targetReq.departmentId,
          relatedEntityId: exceptionId,
        });
      }
    },
    [currentUser, fullState.exceptionRequests, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 5: Post-Approval Affected Program Resolution
  // =========================================================================
  const resolveAffectedProgramItem = useCallback(
    (exceptionId, affectedItemId, resolution) => {
      const actorName = currentUser?.name || 'صاحب الصلاحية';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'صاحب الاعتماد';
      const nowIso = new Date().toISOString();

      const targetReq = fullState.exceptionRequests.find((r) => r.id === exceptionId);
      if (!targetReq) return;
      const targetAff = targetReq.affectedItems.find((a) => a.id === affectedItemId);
      if (!targetAff) return;

      const updatedAffList = targetReq.affectedItems.map((a) =>
        a.id === affectedItemId
          ? {
              ...a,
              resolutionAction: resolution.action,
              resolutionDetails: resolution.details || '',
              newDate: resolution.newDate || '',
              newPeriodId: resolution.newPeriodId || '',
              newVenueId: resolution.newVenueId || '',
              newEmployeeId: resolution.newEmployeeId || '',
              resolvedBy: actorName,
              resolvedAt: nowIso,
            }
          : a
      );

      const allDone = updatedAffList.every((a) => Boolean(a.resolutionAction));

      commitOverlay((prev) => {
        const nextReqs = prev.exceptionRequests.map((r) =>
          r.id === exceptionId ? { ...r, affectedItems: updatedAffList, allAffectedResolved: allDone } : r
        );

        let nextExecs = [...prev.scheduledExecutions];
        const nextCommOverrides = { ...(prev.commitmentOverrides || {}) };

        if (targetAff.existingEntityKind === 'scheduled_execution') {
          nextExecs = nextExecs.map((ex) => {
            if (ex.id !== targetAff.existingProgramId) return ex;
            const upd = { ...ex, lastModifiedAt: nowIso, lastModifiedBy: actorName };
            if (resolution.action === 'إلغاء البرنامج لذلك اليوم') upd.status = 'ملغي';
            else if (resolution.action === 'تأجيل البرنامج') upd.status = 'مؤجل';
            else if (resolution.action === 'تعليق التنفيذ لذلك اليوم') upd.status = 'مؤجل';
            if (resolution.newDate) {
              upd.executionDate = resolution.newDate;
              upd.day = dateToArabicDay(resolution.newDate);
            }
            if (resolution.newPeriodId) {
              const pT = getPeriodTiming(fullState.periods, resolution.newPeriodId);
              upd.periodId = resolution.newPeriodId;
              upd.fromPeriodId = resolution.newPeriodId;
              upd.toPeriodId = resolution.newPeriodId;
              upd.coveredPeriodIds = [resolution.newPeriodId];
              upd.coveredPeriodNames = [pT.name];
              upd.periodName = pT.name;
              upd.startTime = pT.start;
              upd.endTime = pT.end;
            }
            if (resolution.newVenueId) upd.venueId = resolution.newVenueId;
            if (resolution.newEmployeeId) upd.leadEmployeeId = resolution.newEmployeeId;
            upd.notes = `${upd.notes ? upd.notes + ' | ' : ''}معالجة تعارض استثناء: ${resolution.action} (${resolution.details || ''})`;
            return upd;
          });
        } else if (targetAff.existingEntityKind === 'weekly_commitment') {
          const ovKey = `${targetAff.existingProgramId}__${targetAff.date}`;
          nextCommOverrides[ovKey] = {
            action: resolution.action,
            note: resolution.details || '',
            cancelledForDate: resolution.action === 'إلغاء البرنامج لذلك اليوم',
            suspendedForDate: resolution.action === 'تعليق التنفيذ لذلك اليوم' || resolution.action === 'تأجيل البرنامج',
            newDay: resolution.newDate ? dateToArabicDay(resolution.newDate) : undefined,
            newPeriodId: resolution.newPeriodId || undefined,
            newVenueId: resolution.newVenueId || undefined,
            newLeadEmployeeId: resolution.newEmployeeId || undefined,
            updatedBy: actorName,
            updatedAt: nowIso,
          };
        }

        return {
          ...prev,
          exceptionRequests: nextReqs,
          scheduledExecutions: nextExecs,
          commitmentOverrides: nextCommOverrides,
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: `معالجة برنامج متأثر (${resolution.action})`,
        entityType: 'affected_program',
        entityId: targetAff.existingProgramId,
        entityTitle: targetAff.existingProgramTitle,
        summary: `تمت معالجة البرنامج المتأثر «${targetAff.existingProgramTitle}» (${targetAff.existingDepartment}) بإجراء: «${resolution.action}»${allDone ? ' — اكتملت معالجة جميع البرامج المتأثرة بالاستثناء.' : '.'}`,
        previousValue: { program: targetAff.existingProgramTitle, date: targetAff.date, period: targetAff.periodName },
        newValue: resolution,
        reason: resolution.details || resolution.action,
      });

      pushNotification({
        type:
          resolution.action.includes('إلغاء')
            ? 'إلغاء برنامج'
            : resolution.action.includes('موقع') || resolution.action.includes('القاعة')
            ? 'تغيير الموقع'
            : resolution.action.includes('الوقت') || resolution.action.includes('الفترة')
            ? 'تغيير الوقت'
            : 'إعادة جدولة',
        title: `معالجة برنامج متأثر: ${targetAff.existingProgramTitle}`,
        message: `تم اتخاذ إجراء «${resolution.action}» بشأن «${targetAff.existingProgramTitle}» ليوم ${targetAff.day} (${targetAff.date}). ${resolution.details || ''}`,
        targetRole: 'all',
        relatedEntityId: exceptionId,
      });
    },
    [currentUser, fullState.exceptionRequests, fullState.periods, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 6: Lifecycle Status Updates (منفذ / مكتمل / مؤجل / ملغي)
  // =========================================================================
  const updateProgramStatus = useCallback(
    (execId, newStatus, reason = '') => {
      const actorName = currentUser?.name || 'مسؤول القسم';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مسؤول القسم';
      const nowIso = new Date().toISOString();
      const target = fullState.scheduledExecutions.find((e) => e.id === execId);
      if (!target) return;

      commitOverlay((prev) => {
        const nextExecs = prev.scheduledExecutions.map((e) =>
          e.id === execId ? { ...e, status: newStatus, statusReason: reason || e.statusReason, lastModifiedAt: nowIso, lastModifiedBy: actorName } : e
        );
        const nextOccUpdates = { ...(prev.occurrenceUpdates || {}) };
        if (target.occurrenceId) {
          nextOccUpdates[target.occurrenceId] = {
            ...(nextOccUpdates[target.occurrenceId] || {}),
            status: newStatus,
            lastUpdated: nowIso,
          };
        }
        return { ...prev, scheduledExecutions: nextExecs, occurrenceUpdates: nextOccUpdates };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: `تغيير حالة البرنامج إلى (${newStatus})`,
        entityType: 'program_execution',
        entityId: execId,
        entityTitle: target.programName,
        summary: `تغيرت حالة برنامج «${target.programName}» من (${target.status}) إلى (${newStatus}).`,
        previousValue: { status: target.status },
        newValue: { status: newStatus },
        reason: reason || `تحديث الحالة إلى ${newStatus}`,
      });

      if (['مؤجل', 'ملغي'].includes(newStatus)) {
        pushNotification({
          type: newStatus === 'ملغي' ? 'إلغاء برنامج' : 'تعديل البرنامج',
          title: `${newStatus === 'ملغي' ? 'إلغاء' : 'تأجيل'} برنامج: ${target.programName}`,
          message: `تم تحديث حالة «${target.programName}» (${target.departmentName}) إلى (${newStatus}). السبب: ${reason || '—'}`,
          targetRole: 'all',
          targetDeptId: target.departmentId,
          relatedEntityId: execId,
        });
      }
    },
    [currentUser, fullState.scheduledExecutions, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 7: Employee Accounts, Passwords, Admin Grant, Permissions & Transfer (Req #2, #4, #36, #43, #44)
  // =========================================================================
  const manageEmployeeAccount = useCallback(
    async (payload) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      const existingEmp = fullState.employees.find((e) => e.id === payload.id);
      const cleanUsername = String(payload.username || existingEmp?.username || `emp${Date.now().toString().slice(-4)}`)
        .trim()
        .toLowerCase();

      // Prevent duplicate usernames across different employees
      const dupUser = fullState.employees.find(
        (e) => e.id !== payload.id && (e.username || '').toLowerCase() === cleanUsername
      );
      if (dupUser) {
        return { ok: false, error: `اسم المستخدم (${cleanUsername}) مستخدم بالفعل للموظف «${dupUser.name}».` };
      }

      const roleKey = payload.role || existingEmp?.role || 'employee';
      const roleMeta = ROLES_META[roleKey] || ROLES_META.employee;
      const isAdminFlag =
        typeof payload.isAdmin === 'boolean' ? payload.isAdmin : roleKey === 'full_admin' || roleKey === 'custom_admin';
      const adminLevel = isAdminFlag
        ? payload.adminLevel || (roleKey === 'full_admin' ? 'full_admin' : 'custom_admin')
        : null;
      const effectiveRole = isAdminFlag && !['full_admin', 'custom_admin'].includes(roleKey) ? adminLevel : roleKey;
      const effectiveRoleMeta = ROLES_META[effectiveRole] || roleMeta;

      const deptObj = fullState.departments.find((d) => d.id === payload.departmentId);
      const mergedPermissions = payload.permissions
        ? { ...buildPresetPermissions(effectiveRole), ...payload.permissions }
        : existingEmp && existingEmp.role === effectiveRole
        ? existingEmp.permissions || buildPresetPermissions(effectiveRole)
        : buildPresetPermissions(effectiveRole);

      const empRecord = {
        ...(existingEmp || {}),
        id: payload.id || `EMP-${Date.now().toString().slice(-4)}`,
        name: payload.name || existingEmp?.name || '',
        username: cleanUsername,
        jobTitle: payload.jobTitle || existingEmp?.jobTitle || 'موظف تشغيلي',
        administrationId: payload.administrationId || deptObj?.administrationId || existingEmp?.administrationId || 'adm_traof_boys',
        departmentId: payload.departmentId ?? existingEmp?.departmentId ?? null,
        departmentName: deptObj?.name || payload.departmentName || 'الإدارة العامة للنادي',
        role: effectiveRole,
        systemRole: effectiveRole,
        customRoleLabel: payload.customRoleLabel || effectiveRoleMeta.label,
        isAdmin: Boolean(isAdminFlag),
        adminLevel,
        accessScope: payload.accessScope || effectiveRoleMeta.defaultScope,
        accountStatus: payload.accountStatus || existingEmp?.accountStatus || 'نشط',
        isActive: (payload.accountStatus || existingEmp?.accountStatus || 'نشط') === 'نشط',
        permissions: mergedPermissions,
        isOpinionGiver: Boolean(mergedPermissions.give_opinion),
        isApprover: Boolean(mergedPermissions.approve_exception),
        assignedScopes: payload.assignedScopes || existingEmp?.assignedScopes || [],
        sourceFiles: existingEmp?.sourceFiles || ['إعدادات الموظفين والحسابات v2.0'],
        updatedAt: nowIso,
      };

      // Sync credentials to Supabase secure accounts table
      if (supabase) {
        const pwdToSet = payload.newPassword ? String(payload.newPassword) : !existingEmp ? 'Traof@2026' : null;
        const rpcRes = await supabase.rpc('manafeth_upsert_account', {
          p_employee_id: empRecord.id,
          p_username: cleanUsername,
          p_password: pwdToSet,
          p_status: empRecord.accountStatus,
          p_actor: actorName,
        });
        if (rpcRes.error) {
          return { ok: false, error: `تعذر تحديث بيانات الدخول على الخادم: ${rpcRes.error.message}` };
        }
      }

      commitOverlay((prev) => {
        const nextEmployees = existingEmp
          ? prev.employees.map((e) => (e.id === empRecord.id ? empRecord : e))
          : [empRecord, ...prev.employees];

        let nextDepartments = prev.departments;
        if (payload.assignAsDeptHead && empRecord.departmentId) {
          nextDepartments = prev.departments.map((d) =>
            d.id === empRecord.departmentId
              ? { ...d, headEmployeeId: empRecord.id, headName: empRecord.name }
              : d
          );
        }

        return {
          ...prev,
          employees: nextEmployees,
          departments: nextDepartments,
        };
      }, actorName);

      // Determine rich specific audit action type (Req #43)
      let actionType = existingEmp ? 'تعديل حساب وبيانات موظف' : 'إنشاء حساب موظف جديد';
      if (existingEmp) {
        if (!existingEmp.isAdmin && empRecord.isAdmin) actionType = 'منح صلاحية Admin';
        else if (existingEmp.isAdmin && !empRecord.isAdmin) actionType = 'سحب صلاحية Admin';
        else if (existingEmp.accountStatus !== empRecord.accountStatus) {
          actionType = empRecord.accountStatus === 'غير نشط' ? 'تعطيل حساب موظف' : 'تفعيل حساب موظف';
        } else if (existingEmp.departmentId !== empRecord.departmentId) {
          actionType = 'نقل موظف بين الأقسام';
        } else if (payload.newPassword) {
          actionType = 'تغيير كلمة مرور حساب موظف';
        } else if (payload.permissions) {
          actionType = 'تغيير صلاحيات مستخدم';
        }
      }

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType,
        entityType: 'employee',
        entityId: empRecord.id,
        entityTitle: `${empRecord.name} (@${empRecord.username})`,
        summary: `${actionType}: «${empRecord.name}» (@${empRecord.username}) — القسم: (${empRecord.departmentName}) — الدور: (${empRecord.customRoleLabel}) — الحالة: (${empRecord.accountStatus}).`,
        previousValue: existingEmp
          ? {
              username: existingEmp.username,
              departmentName: existingEmp.departmentName,
              role: existingEmp.role,
              isAdmin: existingEmp.isAdmin,
              accountStatus: existingEmp.accountStatus,
            }
          : null,
        newValue: {
          username: empRecord.username,
          departmentName: empRecord.departmentName,
          role: empRecord.role,
          isAdmin: empRecord.isAdmin,
          accessScope: empRecord.accessScope,
          accountStatus: empRecord.accountStatus,
          passwordChanged: Boolean(payload.newPassword),
        },
        reason: payload.reason || actionType,
      });

      return { ok: true, employee: empRecord };
    },
    [currentUser, fullState.employees, fullState.departments, commitOverlay, appendAudit]
  );

  // =========================================================================
  // WORKFLOW 8: Organizational Structure (Administrations & Departments — Req #13-#16, #49)
  // =========================================================================
  const saveAdministration = useCallback(
    (adminPayload) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';

      const existing = fullState.administrations.find((a) => a.id === adminPayload.id);
      const dirEmp = fullState.employees.find((e) => e.id === adminPayload.directorEmployeeId);

      const record = {
        id: adminPayload.id || `adm_${Date.now()}`,
        name: adminPayload.name,
        code: adminPayload.code || 'ADM',
        directorEmployeeId: adminPayload.directorEmployeeId || null,
        directorName: dirEmp?.name || adminPayload.directorName || '',
        directorRoleTitle: adminPayload.directorRoleTitle || `مدير ${adminPayload.name}`,
        isActive: adminPayload.isActive !== false,
      };

      commitOverlay((prev) => {
        const curList = prev.administrations || [];
        const nextAdmins = existing
          ? curList.map((a) => (a.id === record.id ? record : a))
          : [...curList, record];

        const nextEmployees = record.directorEmployeeId
          ? prev.employees.map((e) => {
              if (e.id === record.directorEmployeeId && e.role !== 'full_admin') {
                return {
                  ...e,
                  role: 'club_director',
                  systemRole: 'club_director',
                  customRoleLabel: record.directorRoleTitle,
                  accessScope: 'club',
                  permissions: { ...buildPresetPermissions('club_director'), ...(e.permissions || {}) },
                };
              }
              return e;
            })
          : prev.employees;

        return { ...prev, administrations: nextAdmins, employees: nextEmployees };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: existing ? 'تحديث بيانات إدارة / نادي' : 'إضافة إدارة جديدة',
        entityType: 'administration',
        entityId: record.id,
        entityTitle: record.name,
        summary: `${existing ? 'تم تحديث' : 'تمت إضافة'} الإدارة «${record.name}» — المدير المعتمد: «${record.directorName || '—'}».`,
        previousValue: existing || null,
        newValue: record,
      });
    },
    [currentUser, fullState.administrations, fullState.employees, commitOverlay, appendAudit]
  );

  const addOrUpdateDepartment = useCallback(
    (deptPayload) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const exists = fullState.departments.find((d) => d.id === deptPayload.id);
      const headEmp = fullState.employees.find((e) => e.id === (deptPayload.headEmployeeId ?? exists?.headEmployeeId));

      const deptNameVal = String(deptPayload.name || exists?.name || 'قسم تشغيلي').trim();
      const record = {
        ...(exists || {}),
        id: deptPayload.id || `dept_${Date.now()}`,
        administrationId: deptPayload.administrationId || exists?.administrationId || 'adm_traof_boys',
        administrationName: deptPayload.administrationName || exists?.administrationName || 'نادي تراؤف للبنين',
        code: deptPayload.code || exists?.code || 'DPT',
        name: deptNameVal,
        shortName: deptPayload.shortName || deptNameVal.replace('قسم ', ''),
        color: deptPayload.color || exists?.color || '#00A59B',
        description: deptPayload.description ?? exists?.description ?? '',
        isActive: deptPayload.isActive !== false,
        headRoleTitle: deptPayload.headRoleTitle || `رئيس ${deptNameVal}`,
        headEmployeeId: deptPayload.headEmployeeId !== undefined ? deptPayload.headEmployeeId : exists?.headEmployeeId || null,
        headName: headEmp?.name || deptPayload.headName || exists?.headName || '',
      };

      commitOverlay((prev) => {
        const nextDepartments = exists
          ? prev.departments.map((d) => (d.id === record.id ? record : d))
          : [...prev.departments, record];

        const nextEmployees = record.headEmployeeId
          ? prev.employees.map((e) => {
              if (e.id === record.headEmployeeId && e.role !== 'full_admin') {
                return {
                  ...e,
                  departmentId: record.id,
                  departmentName: record.name,
                  role: 'dept_head',
                  systemRole: 'dept_head',
                  customRoleLabel: record.headRoleTitle,
                  accessScope: e.accessScope === 'system' || e.accessScope === 'club' ? e.accessScope : 'department',
                  permissions: { ...buildPresetPermissions('dept_head'), ...(e.permissions || {}) },
                };
              }
              return e;
            })
          : prev.employees;

        return {
          ...prev,
          departments: nextDepartments,
          employees: Array.isArray(nextEmployees) ? nextEmployees : prev.employees,
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: exists ? 'تعديل بيانات قسم ورئاسته' : 'إضافة قسم جديد للمنصة',
        entityType: 'department',
        entityId: record.id,
        entityTitle: record.name,
        summary: `${exists ? 'تم تحديث' : 'تمت إضافة'} القسم «${record.name}» — رئيس القسم: «${record.headName || '—'}».`,
        previousValue: exists || null,
        newValue: record,
      });
    },
    [currentUser, fullState.departments, fullState.employees, commitOverlay, appendAudit]
  );

  // =========================================================================
  // WORKFLOW 9: Periods, 4-Level Conflict Behavior, Discrepancies, Tasks, Students & Plan Versions
  // =========================================================================
  const updatePeriodTiming = useCallback(
    (periodId, { approvedStart, approvedEnd, displayTime, showInSchedule, enterConflictEngine, conflictBehavior, addNewPeriod }) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      if (addNewPeriod) {
        const beh = addNewPeriod.conflictBehavior || 'actual_conflict';
        const newP = {
          id: `PER-CUSTOM-${Date.now()}`,
          order: fullState.periods.length + 1,
          name: addNewPeriod.name,
          category: addNewPeriod.category || 'program_period',
          eventType: addNewPeriod.eventType || 'فترة تشغيلية',
          approvedStart: addNewPeriod.approvedStart,
          approvedEnd: addNewPeriod.approvedEnd,
          displayTime: `${addNewPeriod.approvedStart} - ${addNewPeriod.approvedEnd}`,
          showInSchedule: addNewPeriod.showInSchedule !== false,
          enterConflictEngine: beh !== 'ignore',
          conflictBehavior: beh,
          affectsScheduling: beh !== 'ignore',
          hasDiscrepancy: false,
          reviewStatus: 'approved',
          sourceTimes: [
            {
              sourceFile: 'إعدادات مدير النظام',
              rawText: `${addNewPeriod.approvedStart} - ${addNewPeriod.approvedEnd}`,
              start: addNewPeriod.approvedStart,
              end: addNewPeriod.approvedEnd,
            },
          ],
        };
        commitOverlay((prev) => ({ ...prev, periods: [...prev.periods, newP] }), actorName);
        appendAudit({
          actorName,
          actorUsername,
          actorRole,
          actionType: 'إضافة فترة تشغيلية جديدة',
          entityType: 'period',
          entityId: newP.id,
          entityTitle: newP.name,
          summary: `تمت إضافة فترة «${newP.name}» (${newP.approvedStart} - ${newP.approvedEnd}) — سلوك التعارض: (${beh}).`,
          newValue: newP,
        });
        return;
      }

      const oldP = fullState.periods.find((p) => p.id === periodId);
      if (!oldP) return;

      const nextStart = approvedStart !== undefined ? approvedStart : oldP.approvedStart;
      const nextEnd = approvedEnd !== undefined ? approvedEnd : oldP.approvedEnd;
      const nextShow = showInSchedule !== undefined ? showInSchedule : oldP.showInSchedule !== false;
      const nextBeh = conflictBehavior !== undefined ? conflictBehavior : oldP.conflictBehavior || 'actual_conflict';
      const nextEnter = enterConflictEngine !== undefined ? enterConflictEngine : nextBeh !== 'ignore';

      commitOverlay((prev) => {
        const nextPeriods = prev.periods.map((p) =>
          p.id === periodId
            ? {
                ...p,
                approvedStart: nextStart,
                approvedEnd: nextEnd,
                displayTime:
                  displayTime ||
                  (nextStart && nextEnd ? `${nextStart} - ${nextEnd} (معتمد)` : p.displayTime),
                showInSchedule: nextShow,
                enterConflictEngine: nextEnter,
                conflictBehavior: nextBeh,
                affectsScheduling: nextEnter && nextBeh !== 'ignore',
                hasDiscrepancy: false,
                reviewStatus: 'approved',
                approvedBy: actorName,
                approvedAt: nowIso,
              }
            : p
        );
        const nextDiscs = prev.dataDiscrepancies.map((d) =>
          d.entityType === 'period' && d.entityId === periodId
            ? {
                ...d,
                status: 'تم الاعتماد والمراجعة',
                selectedValue: `${nextStart} - ${nextEnd}`,
                resolvedBy: actorName,
                resolvedAt: nowIso,
              }
            : d
        );
        return { ...prev, periods: nextPeriods, dataDiscrepancies: nextDiscs };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'تحديث إعدادات وتوقيت فترة تشغيلية / ثابتة',
        entityType: 'period',
        entityId: periodId,
        entityTitle: oldP.name,
        summary: `حدّث ${actorName} فترة «${oldP.name}»: الوقت (${nextStart} - ${nextEnd})، إظهار بالجدول: (${nextShow ? 'نعم' : 'لا'})، سلوك التعارض: (${nextBeh}).`,
        previousValue: {
          start: oldP.approvedStart,
          end: oldP.approvedEnd,
          showInSchedule: oldP.showInSchedule,
          conflictBehavior: oldP.conflictBehavior,
        },
        newValue: {
          approvedStart: nextStart,
          approvedEnd: nextEnd,
          showInSchedule: nextShow,
          conflictBehavior: nextBeh,
        },
        reason: 'اعتماد توقيت وسلوك تعارض الفترات',
      });
    },
    [currentUser, fullState.periods, commitOverlay, appendAudit]
  );

  const updateConflictRuleBehavior = useCallback(
    (ruleId, patch) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const oldRule = fullState.conflictRules.find((r) => r.id === ruleId);
      if (!oldRule) return;

      const nextBeh = patch.conflictBehavior || oldRule.conflictBehavior || 'actual_conflict';
      const updated = {
        ...oldRule,
        ...patch,
        conflictBehavior: nextBeh,
        blocksDirectApproval: nextBeh === 'actual_conflict' || nextBeh === 'important',
      };

      commitOverlay(
        (prev) => ({
          ...prev,
          conflictRules: prev.conflictRules.map((r) => (r.id === ruleId ? updated : r)),
        }),
        actorName
      );

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'تعديل قاعدة فحص التعارض',
        entityType: 'conflict_rule',
        entityId: ruleId,
        entityTitle: oldRule.label,
        summary: `تعديل قاعدة «${oldRule.label}» إلى سلوك التعارض: (${nextBeh}).`,
        previousValue: oldRule,
        newValue: updated,
      });
    },
    [currentUser, fullState.conflictRules, commitOverlay, appendAudit]
  );

  const saveTask = useCallback(
    (taskPayload) => {
      const actorName = currentUser?.name || 'رئيس القسم';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'رئيس القسم';
      const nowIso = new Date().toISOString();

      const existing = fullState.tasks.find((t) => t.id === taskPayload.id);
      const assignee = fullState.employees.find((e) => e.id === taskPayload.assignedEmployeeId);
      const dept = fullState.departments.find((d) => d.id === (taskPayload.departmentId || assignee?.departmentId));

      const record = {
        ...(existing || {}),
        id: taskPayload.id || `TSK-${Date.now()}`,
        title: taskPayload.title,
        description: taskPayload.description || '',
        assignedEmployeeId: taskPayload.assignedEmployeeId,
        assignedEmployeeName: assignee?.name || taskPayload.assignedEmployeeName || '',
        departmentId: dept?.id || taskPayload.departmentId || null,
        departmentName: dept?.name || taskPayload.departmentName || '',
        dueDate: taskPayload.dueDate || '2026-11-05',
        priority: taskPayload.priority || 'متوسطة',
        status: taskPayload.status || existing?.status || 'قيد التنفيذ',
        relatedProgramId: taskPayload.relatedProgramId || null,
        createdBy: existing?.createdBy || actorName,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      commitOverlay((prev) => {
        const cur = prev.tasks || [];
        const nextTasks = existing ? cur.map((t) => (t.id === record.id ? record : t)) : [record, ...cur];
        return { ...prev, tasks: nextTasks };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: existing ? 'تعديل مهمة وظيفية' : 'إسناد مهمة جديدة لموظف',
        entityType: 'task',
        entityId: record.id,
        entityTitle: record.title,
        summary: `${existing ? 'تم تحديث' : 'تم إسناد'} المهمة «${record.title}» للموظف «${record.assignedEmployeeName}» — الحالة: (${record.status}).`,
        previousValue: existing || null,
        newValue: record,
      });

      if (!existing && record.assignedEmployeeId) {
        pushNotification({
          type: 'تكليف مهمة جديدة',
          title: `مهمة جديدة مسندة إليك: ${record.title}`,
          message: `أسند إليك ${actorName} المهمة «${record.title}» بتاريخ استحقاق ${record.dueDate}.`,
          targetRole: 'employee',
          targetEmployeeId: record.assignedEmployeeId,
          relatedEntityId: record.id,
        });
      }

      return record;
    },
    [currentUser, fullState.tasks, fullState.employees, fullState.departments, commitOverlay, appendAudit, pushNotification]
  );

  const updateTaskStatus = useCallback(
    (taskId, newStatus) => {
      const target = fullState.tasks.find((t) => t.id === taskId);
      if (!target) return;
      saveTask({ ...target, status: newStatus });
    },
    [fullState.tasks, saveTask]
  );

  const saveStudent = useCallback(
    (studentPayload) => {
      const actorName = currentUser?.name || 'مسؤول النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مسؤول النظام';

      const existing = fullState.students.find((s) => s.id === studentPayload.id);
      const scopeObj = fullState.scopes.find((sc) => sc.id === studentPayload.scopeId);

      const record = {
        ...(existing || {}),
        id: studentPayload.id || `STD-${Date.now().toString().slice(-5)}`,
        name: String(studentPayload.name || '').trim(),
        scopeId: studentPayload.scopeId || '',
        scopeName: scopeObj?.name || studentPayload.scopeName || 'نطاق عام',
        grade: studentPayload.grade || scopeObj?.stage || '',
        guardianPhone: studentPayload.guardianPhone || '',
        status: studentPayload.status || 'نشط',
      };

      commitOverlay((prev) => {
        const cur = prev.students || [];
        const nextList = existing ? cur.map((s) => (s.id === record.id ? record : s)) : [record, ...cur];
        return { ...prev, students: nextList };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: existing ? 'تعديل بيانات طالب' : 'إضافة طالب لقاعدة البيانات',
        entityType: 'student',
        entityId: record.id,
        entityTitle: record.name,
        summary: `${existing ? 'تم تحديث' : 'تمت إضافة'} الطالب «${record.name}» ضمن فئة (${record.scopeName}).`,
        previousValue: existing || null,
        newValue: record,
      });

      return record;
    },
    [currentUser, fullState.students, fullState.scopes, commitOverlay, appendAudit]
  );

  const publishApprovedPlanVersion = useCallback(
    ({ versionNumber, title, notes }) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      const nextPlan = {
        versionNumber: versionNumber || `v${((fullState.versionSnapshots || []).length || 1) + 1}.0`,
        title: title || 'الخطة التشغيلية المعتمدة المحدثة — نادي تراؤف للبنين',
        notes: notes || '',
        approvedAt: nowIso,
        approvedBy: actorName,
        status: 'معتمد',
      };

      commitOverlay((prev) => ({ ...prev, approvedPlanVersion: nextPlan }), actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'اعتماد إصدار جديد للخطة المعتمدة',
        entityType: 'approved_plan',
        entityId: nextPlan.versionNumber,
        entityTitle: nextPlan.title,
        summary: `اعتمد ${actorName} الإصدار (${nextPlan.versionNumber}) للخطة المعتمدة وأصبح متاحًا تلقائيًا للموظفين المعنيين.`,
        previousValue: fullState.approvedPlanVersion,
        newValue: nextPlan,
        reason: notes || 'تحديث الخطة المعتمدة',
      });

      pushNotification({
        type: 'اعتماد تحديث الخطة',
        title: `صدور الإصدار (${nextPlan.versionNumber}) من الخطة المعتمدة`,
        message: `تم اعتماد «${nextPlan.title}» وتحديث خطط الأقسام المعتمدة مباشرة في حسابات الموظفين.`,
        targetRole: 'all',
      });
    },
    [currentUser, fullState.versionSnapshots, fullState.approvedPlanVersion, commitOverlay, appendAudit, pushNotification]
  );

  // =========================================================================
  // WORKFLOW 10: Safe Soft-Delete + Audit Log + Full System Admin Restore (Req #37-#43 + Restore!)
  // =========================================================================
  const softDeleteEntity = useCallback(
    async ({ entityType, entityId, parentId = null, reason = '' }) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      let snapshot = null;
      let entityTitle = entityId;
      let targetDeptId = null;

      if (entityType === 'employee') {
        if (entityId === currentUser?.employeeId) {
          return { ok: false, error: 'لا يمكنك حذف حسابك الشخصي المسجل الدخول به حاليًا.' };
        }
        snapshot = fullState.employees.find((e) => e.id === entityId);
        entityTitle = snapshot ? `${snapshot.name} (@${snapshot.username || snapshot.id})` : entityId;
        targetDeptId = snapshot?.departmentId || null;
      } else if (entityType === 'program_execution') {
        snapshot = fullState.scheduledExecutions.find((e) => e.id === entityId);
        entityTitle = snapshot?.programName || entityId;
        targetDeptId = snapshot?.departmentId || null;
      } else if (entityType === 'subprogram') {
        const parentExec = fullState.scheduledExecutions.find((e) => e.id === parentId);
        const subObj = (parentExec?.subPrograms || []).find((sp) => sp.id === entityId);
        snapshot = subObj ? { ...subObj, parentExecutionId: parentId, parentProgramName: parentExec?.programName } : null;
        entityTitle = subObj ? `${subObj.name} (ضمن: ${parentExec?.programName || ''})` : entityId;
        targetDeptId = parentExec?.departmentId || null;
      } else if (entityType === 'planned_occurrence') {
        snapshot = fullState.plannedOccurrences.find((o) => o.id === entityId);
        entityTitle = snapshot ? `${snapshot.programName} (${snapshot.plannedMonthName || ''} - ${snapshot.plannedWeekLabel || ''})` : entityId;
        targetDeptId = snapshot?.departmentId || null;
      } else if (entityType === 'program_catalog') {
        snapshot = fullState.programsCatalog.find((p) => p.id === entityId);
        entityTitle = snapshot?.name || entityId;
        targetDeptId = snapshot?.departmentId || null;
      } else if (entityType === 'task') {
        snapshot = fullState.tasks.find((t) => t.id === entityId);
        entityTitle = snapshot?.title || entityId;
        targetDeptId = snapshot?.departmentId || null;
      } else if (entityType === 'department') {
        snapshot = fullState.departments.find((d) => d.id === entityId);
        entityTitle = snapshot?.name || entityId;
        targetDeptId = entityId;
      } else if (entityType === 'administration') {
        snapshot = fullState.administrations.find((a) => a.id === entityId);
        entityTitle = snapshot?.name || entityId;
      } else if (entityType === 'venue') {
        snapshot = fullState.venues.find((v) => v.id === entityId);
        entityTitle = snapshot?.name || entityId;
      } else if (entityType === 'scope') {
        snapshot = fullState.scopes.find((s) => s.id === entityId);
        entityTitle = snapshot?.name || entityId;
      } else if (entityType === 'supervision') {
        snapshot = fullState.supervisionDuties.find((sv) => sv.id === entityId);
        entityTitle = snapshot ? `${snapshot.supervisor} — ${snapshot.day} (${snapshot.location})` : entityId;
      } else if (entityType === 'student') {
        snapshot = fullState.students.find((st) => st.id === entityId);
        entityTitle = snapshot?.name || entityId;
      } else if (entityType === 'exception') {
        snapshot = fullState.exceptionRequests.find((ex) => ex.id === entityId);
        entityTitle = snapshot ? `طلب استثناء: ${snapshot.programSnapshot?.programName || snapshot.id} (${snapshot.departmentName || ''})` : entityId;
        targetDeptId = snapshot?.departmentId || null;
      } else if (entityType === 'evaluation') {
        snapshot = (evaluations || []).find((ev) => ev.id === entityId);
        entityTitle = snapshot ? `تقييم: ${snapshot.evaluatedEmployeeName || snapshot.targetTitle}` : entityId;
        targetDeptId = snapshot?.departmentId || snapshot?.evaluatedDepartmentId || null;
      }

      if (!snapshot) {
        return { ok: false, error: 'العنصر المطلوب حذفه غير موجود.' };
      }

      if (!canDeleteEntity(currentUser, entityType, targetDeptId)) {
        return { ok: false, error: 'ليس لديك صلاحية حذف هذا العنصر.' };
      }

      const trashRecord = {
        id: `TRASH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        entityType,
        entityTypeLabel: ENTITY_TYPE_LABELS_AR[entityType] || entityType,
        entityId,
        parentId,
        entityTitle,
        departmentId: targetDeptId,
        snapshot,
        deletedByName: actorName,
        deletedByUsername: actorUsername,
        deletedByRole: actorRole,
        deletedAt: nowIso,
        reason: reason || 'حذف آمن مع الحفظ في سلة المحذوفات',
        isRestored: false,
        restoredAt: null,
        restoredBy: null,
      };

      if (entityType === 'employee' && supabase && snapshot.username) {
        await supabase.rpc('manafeth_upsert_account', {
          p_employee_id: snapshot.id,
          p_username: snapshot.username,
          p_password: null,
          p_status: 'غير نشط',
          p_actor: actorName,
        });
      }

      if (supabase) {
        supabase
          .from('manafeth_ops_trash')
          .insert({
            id: trashRecord.id,
            entity_type: trashRecord.entityType,
            entity_id: trashRecord.entityId,
            entity_title: trashRecord.entityTitle,
            department_id: trashRecord.departmentId,
            snapshot: trashRecord.snapshot,
            deleted_by_name: trashRecord.deletedByName,
            deleted_by_username: trashRecord.deletedByUsername,
            deleted_by_role: trashRecord.deletedByRole,
            deleted_at: trashRecord.deletedAt,
            reason: trashRecord.reason,
            is_restored: false,
          })
          .then(() => {});
      }

      commitOverlay((prev) => {
        const next = {
          ...prev,
          deletedItems: [trashRecord, ...(prev.deletedItems || [])],
        };

        if (entityType === 'employee') {
          next.employees = prev.employees.filter((e) => e.id !== entityId);
        } else if (entityType === 'program_execution') {
          next.scheduledExecutions = prev.scheduledExecutions.filter((e) => e.id !== entityId);
          if (snapshot.occurrenceId && next.occurrenceUpdates?.[snapshot.occurrenceId]) {
            const copyOccUpd = { ...next.occurrenceUpdates };
            delete copyOccUpd[snapshot.occurrenceId];
            next.occurrenceUpdates = copyOccUpd;
          }
        } else if (entityType === 'subprogram') {
          next.scheduledExecutions = prev.scheduledExecutions.map((e) =>
            e.id === parentId
              ? {
                  ...e,
                  subPrograms: (e.subPrograms || []).filter((sp) => sp.id !== entityId),
                  lastModifiedAt: nowIso,
                  lastModifiedBy: actorName,
                }
              : e
          );
        } else if (entityType === 'planned_occurrence') {
          next.removedOccurrenceIds = [...new Set([...(prev.removedOccurrenceIds || []), entityId])];
        } else if (entityType === 'program_catalog') {
          next.removedProgramIds = [...new Set([...(prev.removedProgramIds || []), entityId])];
        } else if (entityType === 'task') {
          next.tasks = (prev.tasks || []).filter((t) => t.id !== entityId);
        } else if (entityType === 'department') {
          next.departments = prev.departments.filter((d) => d.id !== entityId);
        } else if (entityType === 'administration') {
          next.administrations = (prev.administrations || []).filter((a) => a.id !== entityId);
        } else if (entityType === 'venue') {
          next.venues = prev.venues.filter((v) => v.id !== entityId);
        } else if (entityType === 'scope') {
          next.scopes = prev.scopes.filter((s) => s.id !== entityId);
        } else if (entityType === 'supervision') {
          next.supervisionDuties = prev.supervisionDuties.filter((sv) => sv.id !== entityId);
        } else if (entityType === 'student') {
          next.students = (prev.students || []).filter((st) => st.id !== entityId);
        } else if (entityType === 'exception') {
          next.exceptionRequests = (prev.exceptionRequests || []).filter((ex) => ex.id !== entityId);
        } else if (entityType === 'evaluation') {
          setEvaluations((prevEvals) => prevEvals.map((ev) => (ev.id === entityId ? { ...ev, isDeleted: true, deleteReason: reason } : ev)));
        }

        return next;
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: `حذف ${ENTITY_TYPE_LABELS_AR[entityType] || 'عنصر'}`,
        entityType,
        entityId,
        entityTitle,
        summary: `تم الحذف بواسطة: ${actorName} (@${actorUsername}) — العنصر: «${entityTitle}» (${ENTITY_TYPE_LABELS_AR[entityType] || entityType}) مع حفظ نسخة كاملة قابلة للاسترجاع.`,
        previousValue: snapshot,
        newValue: { archivedInTrashId: trashRecord.id },
        reason: trashRecord.reason,
      });

      return { ok: true, trashRecord };
    },
    [currentUser, fullState, commitOverlay, appendAudit]
  );

  // Bulk Soft-Delete ("تحديد الكل + حذف المحدد" دفعة واحدة مع أرشفة آمنة في سلة المحذوفات)
  const bulkSoftDeleteEntities = useCallback(
    async (items = [], reason = '') => {
      if (!Array.isArray(items) || items.length === 0) {
        return { ok: false, error: 'لم يتم تحديد أي عناصر للحذف.' };
      }

      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      const trashRecords = [];
      const skipped = [];

      for (let i = 0; i < items.length; i++) {
        const { entityType, entityId, parentId = null } = items[i] || {};
        if (!entityType || !entityId) continue;

        let snapshot = null;
        let entityTitle = entityId;
        let targetDeptId = null;

        if (entityType === 'employee') {
          if (entityId === currentUser?.employeeId) {
            skipped.push({ entityId, reason: 'حسابك الشخصي' });
            continue;
          }
          snapshot = fullState.employees.find((e) => e.id === entityId);
          entityTitle = snapshot ? `${snapshot.name} (@${snapshot.username || snapshot.id})` : entityId;
          targetDeptId = snapshot?.departmentId || null;
        } else if (entityType === 'program_execution') {
          snapshot = fullState.scheduledExecutions.find((e) => e.id === entityId);
          entityTitle = snapshot?.programName || entityId;
          targetDeptId = snapshot?.departmentId || null;
        } else if (entityType === 'subprogram') {
          const parentExec = fullState.scheduledExecutions.find((e) => e.id === parentId);
          const subObj = (parentExec?.subPrograms || []).find((sp) => sp.id === entityId);
          snapshot = subObj ? { ...subObj, parentExecutionId: parentId, parentProgramName: parentExec?.programName } : null;
          entityTitle = subObj ? `${subObj.name} (ضمن: ${parentExec?.programName || ''})` : entityId;
          targetDeptId = parentExec?.departmentId || null;
        } else if (entityType === 'planned_occurrence') {
          snapshot = fullState.plannedOccurrences.find((o) => o.id === entityId);
          entityTitle = snapshot ? `${snapshot.programName} (${snapshot.plannedMonthName || ''} - ${snapshot.plannedWeekLabel || ''})` : entityId;
          targetDeptId = snapshot?.departmentId || null;
        } else if (entityType === 'program_catalog') {
          snapshot = fullState.programsCatalog.find((p) => p.id === entityId);
          entityTitle = snapshot?.name || entityId;
          targetDeptId = snapshot?.departmentId || null;
        } else if (entityType === 'task') {
          snapshot = fullState.tasks.find((t) => t.id === entityId);
          entityTitle = snapshot?.title || entityId;
          targetDeptId = snapshot?.departmentId || null;
        } else if (entityType === 'department') {
          snapshot = fullState.departments.find((d) => d.id === entityId);
          entityTitle = snapshot?.name || entityId;
          targetDeptId = entityId;
        } else if (entityType === 'administration') {
          snapshot = fullState.administrations.find((a) => a.id === entityId);
          entityTitle = snapshot?.name || entityId;
        } else if (entityType === 'venue') {
          snapshot = fullState.venues.find((v) => v.id === entityId);
          entityTitle = snapshot?.name || entityId;
        } else if (entityType === 'scope') {
          snapshot = fullState.scopes.find((s) => s.id === entityId);
          entityTitle = snapshot?.name || entityId;
        } else if (entityType === 'supervision') {
          snapshot = fullState.supervisionDuties.find((sv) => sv.id === entityId);
          entityTitle = snapshot ? `${snapshot.supervisor} — ${snapshot.day} (${snapshot.location})` : entityId;
        } else if (entityType === 'student') {
          snapshot = fullState.students.find((st) => st.id === entityId);
          entityTitle = snapshot?.name || entityId;
        } else if (entityType === 'exception') {
          snapshot = fullState.exceptionRequests.find((ex) => ex.id === entityId);
          entityTitle = snapshot ? `طلب استثناء: ${snapshot.programSnapshot?.programName || snapshot.id}` : entityId;
          targetDeptId = snapshot?.departmentId || null;
        } else if (entityType === 'evaluation') {
          snapshot = (evaluations || []).find((ev) => ev.id === entityId);
          entityTitle = snapshot ? `تقييم: ${snapshot.evaluatedEmployeeName || snapshot.targetTitle}` : entityId;
          targetDeptId = snapshot?.departmentId || snapshot?.evaluatedDepartmentId || null;
        }

        if (!snapshot) continue;
        if (!canDeleteEntity(currentUser, entityType, targetDeptId)) {
          skipped.push({ entityId, entityTitle, reason: 'نطاق الصلاحية' });
          continue;
        }

        trashRecords.push({
          id: `TRASH-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          entityType,
          entityTypeLabel: ENTITY_TYPE_LABELS_AR[entityType] || entityType,
          entityId,
          parentId,
          entityTitle,
          departmentId: targetDeptId,
          snapshot,
          deletedByName: actorName,
          deletedByUsername: actorUsername,
          deletedByRole: actorRole,
          deletedAt: nowIso,
          reason: reason || `حذف جماعي آمن (${items.length} عناصر)`,
          isRestored: false,
          restoredAt: null,
          restoredBy: null,
        });
      }

      if (trashRecords.length === 0) {
        return { ok: false, error: 'ليس لديك صلاحية لحذف العناصر المحددة أو أنها غير موجودة.' };
      }

      if (supabase) {
        for (const rec of trashRecords) {
          if (rec.entityType === 'employee' && rec.snapshot?.username) {
            supabase
              .rpc('manafeth_upsert_account', {
                p_employee_id: rec.snapshot.id,
                p_username: rec.snapshot.username,
                p_password: null,
                p_status: 'غير نشط',
                p_actor: actorName,
              })
              .then(() => {});
          }
        }
        supabase
          .from('manafeth_ops_trash')
          .insert(
            trashRecords.map((tr) => ({
              id: tr.id,
              entity_type: tr.entityType,
              entity_id: tr.entityId,
              entity_title: tr.entityTitle,
              department_id: tr.departmentId,
              snapshot: tr.snapshot,
              deleted_by_name: tr.deletedByName,
              deleted_by_username: tr.deletedByUsername,
              deleted_by_role: tr.deletedByRole,
              deleted_at: tr.deletedAt,
              reason: tr.reason,
              is_restored: false,
            }))
          )
          .then(() => {});
      }

      commitOverlay((prev) => {
        const next = {
          ...prev,
          deletedItems: [...trashRecords, ...(prev.deletedItems || [])],
        };

        const delByType = (type) => new Set(trashRecords.filter((r) => r.entityType === type).map((r) => r.entityId));

        const empIds = delByType('employee');
        if (empIds.size > 0) {
          next.employees = prev.employees.filter((e) => !empIds.has(e.id));
        }

        const execIds = delByType('program_execution');
        if (execIds.size > 0) {
          next.scheduledExecutions = (next.scheduledExecutions || prev.scheduledExecutions).filter((e) => !execIds.has(e.id));
          const copyOccUpd = { ...(prev.occurrenceUpdates || {}) };
          trashRecords
            .filter((r) => r.entityType === 'program_execution' && r.snapshot?.occurrenceId)
            .forEach((r) => {
              delete copyOccUpd[r.snapshot.occurrenceId];
            });
          next.occurrenceUpdates = copyOccUpd;
        }

        const subRecs = trashRecords.filter((r) => r.entityType === 'subprogram');
        if (subRecs.length > 0) {
          const byParent = {};
          subRecs.forEach((r) => {
            if (!byParent[r.parentId]) byParent[r.parentId] = new Set();
            byParent[r.parentId].add(r.entityId);
          });
          next.scheduledExecutions = (next.scheduledExecutions || prev.scheduledExecutions).map((e) =>
            byParent[e.id]
              ? {
                  ...e,
                  subPrograms: (e.subPrograms || []).filter((sp) => !byParent[e.id].has(sp.id)),
                  lastModifiedAt: nowIso,
                  lastModifiedBy: actorName,
                }
              : e
          );
        }

        const occIds = delByType('planned_occurrence');
        if (occIds.size > 0) {
          next.removedOccurrenceIds = [...new Set([...(prev.removedOccurrenceIds || []), ...occIds])];
        }

        const catIds = delByType('program_catalog');
        if (catIds.size > 0) {
          next.removedProgramIds = [...new Set([...(prev.removedProgramIds || []), ...catIds])];
        }

        const taskIds = delByType('task');
        if (taskIds.size > 0) {
          next.tasks = (prev.tasks || []).filter((t) => !taskIds.has(t.id));
        }

        const deptIds = delByType('department');
        if (deptIds.size > 0) {
          next.departments = prev.departments.filter((d) => !deptIds.has(d.id));
        }

        const admIds = delByType('administration');
        if (admIds.size > 0) {
          next.administrations = (prev.administrations || []).filter((a) => !admIds.has(a.id));
        }

        const venueIds = delByType('venue');
        if (venueIds.size > 0) {
          next.venues = prev.venues.filter((v) => !venueIds.has(v.id));
        }

        const scopeIds = delByType('scope');
        if (scopeIds.size > 0) {
          next.scopes = prev.scopes.filter((s) => !scopeIds.has(s.id));
        }

        const supIds = delByType('supervision');
        if (supIds.size > 0) {
          next.supervisionDuties = prev.supervisionDuties.filter((sv) => !supIds.has(sv.id));
        }

        const stuIds = delByType('student');
        if (stuIds.size > 0) {
          next.students = (prev.students || []).filter((st) => !stuIds.has(st.id));
        }

        const excIds = delByType('exception');
        if (excIds.size > 0) {
          next.exceptionRequests = (prev.exceptionRequests || []).filter((ex) => !excIds.has(ex.id));
        }

        const evalIds = delByType('evaluation');
        if (evalIds.size > 0) {
          setEvaluations((prevEvals) => prevEvals.map((ev) => (evalIds.has(ev.id) ? { ...ev, isDeleted: true, deleteReason: reason } : ev)));
        }

        return next;
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: `حذف جماعي (${trashRecords.length} عناصر)`,
        entityType: trashRecords[0].entityType,
        entityId: trashRecords.map((r) => r.entityId).join(','),
        entityTitle: trashRecords.map((r) => r.entityTitle).slice(0, 4).join('، ') + (trashRecords.length > 4 ? ` (+${trashRecords.length - 4})` : ''),
        summary: `تم الحذف الجماعي لعدد (${trashRecords.length}) عناصر بواسطة: ${actorName} (@${actorUsername}) مع حفظ نسخ كاملة قابلة للاسترجاع في سلة المحذوفات.`,
        previousValue: { count: trashRecords.length, titles: trashRecords.map((r) => r.entityTitle) },
        newValue: { archivedTrashIds: trashRecords.map((r) => r.id) },
        reason: trashRecords[0].reason,
      });

      return { ok: true, count: trashRecords.length, trashRecords, skipped };
    },
    [currentUser, fullState, commitOverlay, appendAudit]
  );

  // Full System Admin Restore of ANY Deleted Item ('مدير النظام يمكنه أسترجاع اي شي محذوف')
  const restoreDeletedItem = useCallback(
    async (trashId) => {
      if (!hasPermission(currentUser, 'restore_deleted')) {
        return { ok: false, error: 'صلاحية استرجاع المحذوفات متاحة لمدير النظام فقط.' };
      }

      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      const item = fullState.deletedItems.find((t) => t.id === trashId);
      if (!item || item.isRestored) {
        return { ok: false, error: 'العنصر غير موجود أو تم استرجاعه مسبقًا.' };
      }

      const { entityType, entityId, snapshot } = item;

      if (entityType === 'employee' && supabase && snapshot?.username) {
        await supabase.rpc('manafeth_upsert_account', {
          p_employee_id: snapshot.id,
          p_username: snapshot.username,
          p_password: null,
          p_status: snapshot.accountStatus || 'نشط',
          p_actor: actorName,
        });
      }

      if (supabase) {
        supabase
          .from('manafeth_ops_trash')
          .update({
            is_restored: true,
            restored_at: nowIso,
            restored_by: actorName,
          })
          .eq('id', trashId)
          .then(() => {});
      }

      commitOverlay((prev) => {
        const next = {
          ...prev,
          deletedItems: (prev.deletedItems || []).map((t) =>
            t.id === trashId ? { ...t, isRestored: true, restoredAt: nowIso, restoredBy: actorName } : t
          ),
        };

        const putBackUnique = (arr = [], obj) => {
          if (arr.some((x) => x.id === obj.id)) return arr.map((x) => (x.id === obj.id ? obj : x));
          return [obj, ...arr];
        };

        if (entityType === 'employee') {
          next.employees = putBackUnique(prev.employees, snapshot);
        } else if (entityType === 'program_execution') {
          next.scheduledExecutions = putBackUnique(prev.scheduledExecutions, snapshot);
          if (snapshot.occurrenceId) {
            next.occurrenceUpdates = {
              ...(prev.occurrenceUpdates || {}),
              [snapshot.occurrenceId]: {
                status: snapshot.status,
                executionId: snapshot.id,
                lastUpdated: nowIso,
              },
            };
          }
        } else if (entityType === 'subprogram') {
          const pId = item.parentId || snapshot.parentExecutionId;
          const cleanSub = { ...snapshot };
          delete cleanSub.parentExecutionId;
          delete cleanSub.parentProgramName;
          next.scheduledExecutions = prev.scheduledExecutions.map((ex) =>
            ex.id === pId
              ? {
                  ...ex,
                  subPrograms: putBackUnique(ex.subPrograms || [], cleanSub).sort((a, b) => (a.order || 0) - (b.order || 0)),
                  lastModifiedAt: nowIso,
                  lastModifiedBy: actorName,
                }
              : ex
          );
        } else if (entityType === 'planned_occurrence') {
          next.removedOccurrenceIds = (prev.removedOccurrenceIds || []).filter((id) => id !== entityId);
        } else if (entityType === 'program_catalog') {
          next.removedProgramIds = (prev.removedProgramIds || []).filter((id) => id !== entityId);
        } else if (entityType === 'task') {
          next.tasks = putBackUnique(prev.tasks || [], snapshot);
        } else if (entityType === 'department') {
          next.departments = putBackUnique(prev.departments, snapshot);
        } else if (entityType === 'administration') {
          next.administrations = putBackUnique(prev.administrations || [], snapshot);
        } else if (entityType === 'venue') {
          next.venues = putBackUnique(prev.venues, snapshot);
        } else if (entityType === 'scope') {
          next.scopes = putBackUnique(prev.scopes, snapshot);
        } else if (entityType === 'supervision') {
          next.supervisionDuties = putBackUnique(prev.supervisionDuties, snapshot);
        } else if (entityType === 'student') {
          next.students = putBackUnique(prev.students || [], snapshot);
        } else if (entityType === 'exception') {
          next.exceptionRequests = putBackUnique(prev.exceptionRequests || [], snapshot);
        } else if (entityType === 'evaluation') {
          setEvaluations((prevEvals) => prevEvals.map((ev) => (ev.id === entityId ? { ...ev, isDeleted: false, deleteReason: null } : ev)));
        }

        return next;
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'استرجاع عنصر محذوف',
        entityType,
        entityId,
        entityTitle: item.entityTitle,
        summary: `استرجع مدير النظام (${actorName}) العنصر المحذوف «${item.entityTitle}» (${item.entityTypeLabel}) إلى مكانه الأصلي بنجاح.`,
        previousValue: { trashId, deletedBy: item.deletedByName, deletedAt: item.deletedAt },
        newValue: snapshot,
        reason: 'استرجاع من سلة المحذوفات بواسطة مدير النظام',
      });

      return { ok: true, restored: item };
    },
    [currentUser, fullState.deletedItems, commitOverlay, appendAudit]
  );

  const bulkRestoreDeletedItems = useCallback(
    async (trashIds = []) => {
      if (!hasPermission(currentUser, 'restore_deleted')) {
        return { ok: false, error: 'صلاحية استرجاع المحذوفات متاحة لمدير النظام فقط.' };
      }
      let restoredCount = 0;
      for (const tId of trashIds) {
        const res = await restoreDeletedItem(tId);
        if (res?.ok) restoredCount++;
      }
      return { ok: restoredCount > 0, count: restoredCount };
    },
    [currentUser, restoreDeletedItem]
  );

  // =========================================================================
  // ADMIN ACTIONS: Discrepancies, Generic Resources, Import Diff
  // =========================================================================
  const resolveDiscrepancy = useCallback(
    (discId, selectedValue, notes = '') => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();
      const disc = fullState.dataDiscrepancies.find((d) => d.id === discId);
      if (!disc) return;

      commitOverlay((prev) => {
        const nextDiscs = prev.dataDiscrepancies.map((d) =>
          d.id === discId
            ? {
                ...d,
                status: 'تم الاعتماد والمراجعة',
                selectedValue,
                resolutionNotes: notes,
                resolvedBy: actorName,
                resolvedAt: nowIso,
              }
            : d
        );
        return { ...prev, dataDiscrepancies: nextDiscs };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'حسم تعارض بيانات بين الملفات',
        entityType: 'data_discrepancy',
        entityId: discId,
        entityTitle: disc.entityName,
        summary: `حسم ${actorName} اختلاف البيانات في «${disc.entityName}» باختيار القيمة المعتمدة: (${selectedValue}) مع حفظ القيم السابقة في السجل.`,
        previousValue: { sourceA: disc.sourceAValue, sourceB: disc.sourceBValue },
        newValue: { selectedValue, notes },
        reason: notes || 'مراجعة واعتماد مدير النظام',
      });
    },
    [currentUser, fullState.dataDiscrepancies, commitOverlay, appendAudit]
  );

  const saveResourceEntity = useCallback(
    (collectionKey, recordPayload, entityLabelAr) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const list = fullState[collectionKey] || [];
      const exists = list.find((item) => item.id === recordPayload.id);
      const finalRecord = {
        ...(exists || {}),
        ...recordPayload,
        id: recordPayload.id || `${collectionKey.slice(0, 3).toUpperCase()}-${Date.now()}`,
      };

      commitOverlay((prev) => {
        const curList = prev[collectionKey] || [];
        const nextList = exists ? curList.map((x) => (x.id === finalRecord.id ? finalRecord : x)) : [finalRecord, ...curList];
        return { ...prev, [collectionKey]: nextList };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: exists ? `تعديل ${entityLabelAr}` : `إضافة ${entityLabelAr}`,
        entityType: collectionKey,
        entityId: finalRecord.id,
        entityTitle: finalRecord.name || finalRecord.supervisor || finalRecord.id,
        summary: `${exists ? 'تم تحديث' : 'تمت إضافة'} ${entityLabelAr}: «${finalRecord.name || finalRecord.supervisor || finalRecord.id}».`,
        previousValue: exists || null,
        newValue: finalRecord,
      });
    },
    [currentUser, fullState, commitOverlay, appendAudit]
  );

  const applyReviewedActivitiesDiff = useCallback(
    (diffReport, options = { applyNew: true, applyChanged: true, applyRemoved: false }) => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      commitOverlay((prev) => {
        const snapshot = {
          id: `SNAP-${Date.now()}`,
          archivedAt: nowIso,
          archivedBy: actorName,
          sourceFileReplacedBy: diffReport.fileName,
          previousCustomProgramsCount: (prev.customPrograms || []).length,
          previousOccurrencesCount: fullState.plannedOccurrences.length,
          summary: `نسخة محفوظة قبل تطبيق تحديث الملف (${diffReport.fileName})`,
        };

        const nextCustomPrograms = [...(prev.customPrograms || [])];
        const nextCustomOccurrences = [...(prev.customOccurrences || [])];
        const nextChangedCatalogMap = { ...(prev.changedCatalogMap || {}) };
        const nextRemovedIds = [...(prev.removedProgramIds || [])];

        if (options.applyNew) {
          diffReport.newPrograms.forEach((np) => {
            const newPid = `PRG-IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            nextCustomPrograms.push({ ...np, id: newPid });
            if (np.plannedWeeks.length === 0) {
              nextCustomOccurrences.push({
                id: `OCC-IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                programId: newPid,
                programName: np.name,
                departmentId: np.departmentId,
                departmentName: np.departmentName,
                strategicGoal: np.strategicGoal,
                strategicIndicator: np.strategicIndicator,
                initiative: np.initiative,
                jobRoles: np.jobRoles,
                plannedMonth: null,
                plannedMonthName: 'غير محدد في المصدر',
                plannedWeekInMonth: null,
                plannedWeekLabel: 'غير محدد',
                plannedGlobalWeek: null,
                hasGreenWeek: false,
                status: 'يحتاج جدولة',
                programType: 'برنامج اعتيادي',
                sourceFile: diffReport.fileName,
              });
            } else {
              np.plannedWeeks.forEach((pw, idx) => {
                nextCustomOccurrences.push({
                  id: `OCC-IMP-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
                  programId: newPid,
                  programName: np.name,
                  departmentId: np.departmentId,
                  departmentName: np.departmentName,
                  strategicGoal: np.strategicGoal,
                  strategicIndicator: np.strategicIndicator,
                  initiative: np.initiative,
                  jobRoles: np.jobRoles,
                  plannedMonth: pw.month,
                  plannedMonthName: pw.monthName,
                  plannedWeekInMonth: pw.weekInMonth,
                  plannedWeekLabel: pw.weekInMonthLabel,
                  plannedGlobalWeek: pw.globalWeek,
                  hasGreenWeek: true,
                  status: 'مخطط',
                  programType: 'برنامج اعتيادي',
                  sourceFile: diffReport.fileName,
                });
              });
            }
          });
        }

        if (options.applyChanged) {
          diffReport.changedPrograms.forEach(({ existing, incoming }) => {
            nextChangedCatalogMap[existing.id] = {
              strategicGoal: incoming.strategicGoal,
              strategicIndicator: incoming.strategicIndicator,
              jobRoles: incoming.jobRoles,
              plannedWeeks: incoming.plannedWeeks,
              plannedWeeksCount: incoming.plannedWeeksCount,
              lastImportedFile: diffReport.fileName,
              lastImportedAt: nowIso,
            };
          });
        }

        if (options.applyRemoved) {
          diffReport.disappearedPrograms.forEach((dp) => {
            if (!nextRemovedIds.includes(dp.id)) nextRemovedIds.push(dp.id);
          });
        }

        const newBatch = {
          id: `IMP-${Date.now()}`,
          fileName: diffReport.fileName,
          fileUpdatedAt: nowIso.slice(0, 10),
          importedAt: nowIso,
          importedBy: actorName,
          departmentsCovered: ['جميع الأقسام المرفوعة'],
          recordsImported: diffReport.newPrograms.length + diffReport.changedPrograms.length,
          programsCount: diffReport.parsedCount,
          excludedCount: diffReport.excludedItems.length,
          excludedReason: 'استبعاد البيانات المالية وأنشطة الرواتب والبدلات آليًا',
          reviewStatus: 'تمت المراجعة والاعتماد مع حفظ النسخة السابقة',
        };

        return {
          ...prev,
          customPrograms: nextCustomPrograms,
          customOccurrences: nextCustomOccurrences,
          changedCatalogMap: nextChangedCatalogMap,
          removedProgramIds: nextRemovedIds,
          importBatches: [newBatch, ...(prev.importBatches || [])],
          versionSnapshots: [snapshot, ...(prev.versionSnapshots || [])],
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'اعتماد استيراد تحديث ملف أنشطة',
        entityType: 'import_batch',
        entityId: diffReport.fileName,
        entityTitle: diffReport.fileName,
        summary: `تمت مراجعة واعتماد تحديث الملف (${diffReport.fileName}): جديد (${diffReport.newPrograms.length})، متغير (${diffReport.changedPrograms.length})، مع الاحتفاظ بالنسخة السابقة واستبعاد (${diffReport.excludedItems.length}) عناصر رواتب/مالية.`,
        newValue: {
          newCount: diffReport.newPrograms.length,
          changedCount: diffReport.changedPrograms.length,
          disappearedCount: diffReport.disappearedPrograms.length,
        },
        reason: 'تحديث الجداول المعتمد من مدير النظام',
      });
    },
    [currentUser, fullState.plannedOccurrences.length, commitOverlay, appendAudit]
  );

  const replacePeriodsFromImport = useCallback(
    (newPeriods, fileName = 'ملف الفترات الزمني') => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      commitOverlay((prev) => {
        const newBatch = {
          id: `IMP-PER-${Date.now()}`,
          fileName,
          fileUpdatedAt: nowIso.slice(0, 10),
          importedAt: nowIso,
          importedBy: actorName,
          departmentsCovered: ['الجدول الزمني للفترات'],
          recordsImported: newPeriods.length,
          programsCount: newPeriods.length,
          excludedCount: 0,
          excludedReason: 'استبدال مباشر لبيانات الفترات السابقة',
          reviewStatus: 'تم استبدال الفترات السابقة واعتماد الملف الجديد',
        };
        return {
          ...prev,
          periods: newPeriods,
          importBatches: [newBatch, ...(prev.importBatches || [])],
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'استيراد واستبدال الجدول الزمني للفترات',
        entityType: 'periods',
        entityId: fileName,
        entityTitle: fileName,
        summary: `قام ${actorName} بحذف بيانات الفترات السابقة واستيراد (${newPeriods.length}) فترة زمنية من الملف (${fileName}).`,
        newValue: { count: newPeriods.length, fileName },
        reason: 'تحديث الجدول الزمني للفترات من ملف خارجي',
      });
    },
    [currentUser, commitOverlay, appendAudit]
  );

  const replaceWeeklyCommitmentsFromImport = useCallback(
    (newCommitments, fileName = 'ملف جدول المعلمين الأسبوعي') => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      commitOverlay((prev) => {
        const newBatch = {
          id: `IMP-SCH-${Date.now()}`,
          fileName,
          fileUpdatedAt: nowIso.slice(0, 10),
          importedAt: nowIso,
          importedBy: actorName,
          departmentsCovered: ['الجدول الأسبوعي للمعلمين والقاعات والفئات'],
          recordsImported: newCommitments.length,
          programsCount: newCommitments.length,
          excludedCount: 0,
          excludedReason: 'استبدال مباشر لبيانات الجدول الأسبوعي السابقة',
          reviewStatus: 'تم استبدال الجدول السابق واعتماد الملف الجديد',
        };
        return {
          ...prev,
          weeklyCommitments: newCommitments,
          commitmentOverrides: {},
          importBatches: [newBatch, ...(prev.importBatches || [])],
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'استيراد واستبدال الجدول الأسبوعي للمعلمين',
        entityType: 'weekly_commitments',
        entityId: fileName,
        entityTitle: fileName,
        summary: `قام ${actorName} بحذف بيانات الجدول السابقة واستيراد (${newCommitments.length}) التزاماً/فترة أسبوعية من الملف (${fileName}).`,
        newValue: { count: newCommitments.length, fileName },
        reason: 'تحديث الجدول الأسبوعي للمعلمين والقاعات من ملف خارجي',
      });
    },
    [currentUser, commitOverlay, appendAudit]
  );

  const replaceSupervisionFromImport = useCallback(
    ({ supervisionDuties, supervisionInstructions, supervisionCriteria }, fileName = 'ملف جدول الإشراف اليومي') => {
      const actorName = currentUser?.name || 'مدير النظام';
      const actorUsername = currentUser?.username || '';
      const actorRole = currentUser?.roleLabel || 'مدير النظام';
      const nowIso = new Date().toISOString();

      commitOverlay((prev) => {
        const newBatch = {
          id: `IMP-SUP-${Date.now()}`,
          fileName,
          fileUpdatedAt: nowIso.slice(0, 10),
          importedAt: nowIso,
          importedBy: actorName,
          departmentsCovered: ['جدول الإشراف اليومي والتعليمات والمعايير'],
          recordsImported: (supervisionDuties || []).length,
          programsCount: (supervisionDuties || []).length,
          excludedCount: 0,
          excludedReason: 'استبدال مباشر لبيانات الإشراف السابقة',
          reviewStatus: 'تم استبدال جدول الإشراف السابق واعتماد الملف الجديد',
        };
        return {
          ...prev,
          supervisionDuties: supervisionDuties || prev.supervisionDuties,
          supervisionInstructions: supervisionInstructions?.length ? supervisionInstructions : prev.supervisionInstructions,
          supervisionCriteria: supervisionCriteria?.length ? supervisionCriteria : prev.supervisionCriteria,
          importBatches: [newBatch, ...(prev.importBatches || [])],
        };
      }, actorName);

      appendAudit({
        actorName,
        actorUsername,
        actorRole,
        actionType: 'استيراد واستبدال جدول الإشراف اليومي',
        entityType: 'supervision',
        entityId: fileName,
        entityTitle: fileName,
        summary: `قام ${actorName} بحذف بيانات الإشراف السابقة واستيراد (${(supervisionDuties || []).length}) تكليف إشراف يومي من الملف (${fileName}).`,
        newValue: { dutiesCount: (supervisionDuties || []).length, fileName },
        reason: 'تحديث جدول الإشراف اليومي من ملف خارجي',
      });
    },
    [currentUser, commitOverlay, appendAudit]
  );

  // =========================================================================
  // UNIFIED COMPREHENSIVE EVALUATION PLATFORM ENGINE (v3.0)
  // =========================================================================

  // Auto-sync evaluations whenever sessionToken or currentUser changes
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function syncEvalData() {
      let token = sessionToken;
      // If we have a logged-in user but no sessionToken yet, attempt auto-issuance
      if (!token && currentUser?.username) {
        try {
          const defaultPwd = currentUser.username.toLowerCase() === 'admin' ? 'Admin@2026' : 'Traof@2026';
          const { data, error } = await supabase.rpc('manafeth_issue_session', {
            p_username: currentUser.username,
            p_password: defaultPwd,
          });
          if (!error && data?.ok && data.token) {
            token = data.token;
            setSessionToken(token);
            try {
              localStorage.setItem(SESSION_TOKEN_KEY, token);
            } catch {}
          }
        } catch (e) {
          console.warn('Auto session issue warning:', e);
        }
      }

      if (!token) return;

      try {
        setEvalLoading(true);
        const [meRes, critRes, setRes, listRes] = await Promise.all([
          supabase.rpc('manafeth_eval_me', { p_token: token }),
          supabase.rpc('manafeth_eval_get_criteria', { p_token: token }),
          supabase.rpc('manafeth_eval_get_settings', { p_token: token }),
          supabase.rpc('manafeth_eval_list', { p_token: token, p_filters: {} }),
        ]);

        if (!active) return;

        if (meRes.data && !meRes.error) {
          setEvalMe(meRes.data);
          if (meRes.data.canManage) {
            const [accRes, audRes] = await Promise.all([
              supabase.rpc('manafeth_eval_admin_get_access', { p_token: token }),
              supabase.rpc('manafeth_eval_admin_audit', { p_token: token }),
            ]);
            if (active && accRes.data && !accRes.error) setEvalAccessList(accRes.data);
            if (active && audRes.data && !audRes.error) setEvalAuditLogs(audRes.data);
          }
        }

        if (critRes.data && !critRes.error) setEvalCriteria(critRes.data);
        if (setRes.data && !setRes.error) setEvalSettings(setRes.data);
        if (listRes.data && !listRes.error && Array.isArray(listRes.data)) setEvaluations(listRes.data);
      } catch (err) {
        console.warn('Eval sync error:', err.message);
      } finally {
        if (active) setEvalLoading(false);
      }
    }

    syncEvalData();

    // Realtime channel for instant evaluation updates
    const evalChan = supabase
      .channel('manafeth_eval_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manafeth_evaluations' }, () => {
        if (sessionToken) {
          supabase
            .rpc('manafeth_eval_list', { p_token: sessionToken, p_filters: {} })
            .then(({ data, error }) => {
              if (!error && Array.isArray(data)) setEvaluations(data);
            });
        }
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(evalChan);
    };
  }, [sessionToken, currentUser?.username]);

  const refreshEvaluations = useCallback(
    async (filters = {}) => {
      let token = sessionToken;
      if (!token && currentUser?.username) {
        const defaultPwd = currentUser.username.toLowerCase() === 'admin' ? 'Admin@2026' : 'Traof@2026';
        const { data } = await supabase.rpc('manafeth_issue_session', {
          p_username: currentUser.username,
          p_password: defaultPwd,
        });
        if (data?.ok && data.token) {
          token = data.token;
          setSessionToken(token);
          try { localStorage.setItem(SESSION_TOKEN_KEY, token); } catch {}
        }
      }
      if (!token) return;
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_list', {
          p_token: token,
          p_filters: filters,
        });
        if (!error && Array.isArray(data)) setEvaluations(data);
      } catch (e) {
        console.warn('refreshEvaluations error:', e);
      }
    },
    [sessionToken, currentUser]
  );

  const refreshEvalCriteria = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const { data, error } = await supabase.rpc('manafeth_eval_get_criteria', { p_token: sessionToken });
      if (!error && Array.isArray(data)) setEvalCriteria(data);
    } catch (e) {
      console.warn('refreshEvalCriteria error:', e);
    }
  }, [sessionToken]);

  const refreshEvalSettings = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const { data, error } = await supabase.rpc('manafeth_eval_get_settings', { p_token: sessionToken });
      if (!error && data) setEvalSettings(data);
    } catch (e) {
      console.warn('refreshEvalSettings error:', e);
    }
  }, [sessionToken]);

  const refreshEvalAccess = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const { data, error } = await supabase.rpc('manafeth_eval_admin_get_access', { p_token: sessionToken });
      if (!error && Array.isArray(data)) setEvalAccessList(data);
    } catch (e) {
      console.warn('refreshEvalAccess error:', e);
    }
  }, [sessionToken]);

  const submitEvaluation = useCallback(
    async (input) => {
      let token = sessionToken;
      if (!token && currentUser?.username) {
        const defaultPwd = currentUser.username.toLowerCase() === 'admin' ? 'Admin@2026' : 'Traof@2026';
        const { data } = await supabase.rpc('manafeth_issue_session', {
          p_username: currentUser.username,
          p_password: defaultPwd,
        });
        if (data?.ok && data.token) {
          token = data.token;
          setSessionToken(token);
          try { localStorage.setItem(SESSION_TOKEN_KEY, token); } catch {}
        }
      }
      if (!token) return { ok: false, error: 'انتهت الجلسة. يرجى تسجيل الدخول مجددًا.' };

      try {
        const { data, error } = await supabase.rpc('manafeth_eval_submit', {
          p_token: token,
          p_input: input,
        });
        if (error) return { ok: false, error: error.message };
        if (data && !data.ok) return { ok: false, error: data.error || 'تعذر حفظ التقييم.' };

        // Instant refresh
        const { data: refreshed } = await supabase.rpc('manafeth_eval_list', { p_token: token, p_filters: {} });
        if (Array.isArray(refreshed)) setEvaluations(refreshed);

        return { ok: true, id: data.id, evaluation: data.evaluation };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken, currentUser]
  );

  const deleteEvaluation = useCallback(
    async (id, reason) => {
      if (!sessionToken) return { ok: false, error: 'غير مصرح.' };
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_delete', {
          p_token: sessionToken,
          p_id: id,
          p_reason: reason || 'حذف التقييم من الإدارة',
        });
        if (error) return { ok: false, error: error.message };
        const { data: refreshed } = await supabase.rpc('manafeth_eval_list', { p_token: sessionToken, p_filters: {} });
        if (Array.isArray(refreshed)) setEvaluations(refreshed);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken]
  );

  const restoreEvaluation = useCallback(
    async (id) => {
      if (!sessionToken) return { ok: false, error: 'غير مصرح.' };
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_restore', {
          p_token: sessionToken,
          p_id: id,
        });
        if (error) return { ok: false, error: error.message };
        const { data: refreshed } = await supabase.rpc('manafeth_eval_list', { p_token: sessionToken, p_filters: {} });
        if (Array.isArray(refreshed)) setEvaluations(refreshed);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken]
  );

  const saveEvalCriterion = useCallback(
    async (criterion) => {
      if (!sessionToken) return { ok: false, error: 'غير مصرح.' };
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_save_criterion', {
          p_token: sessionToken,
          p_criterion: criterion,
        });
        if (error) return { ok: false, error: error.message };
        const { data: critList } = await supabase.rpc('manafeth_eval_get_criteria', { p_token: sessionToken });
        if (Array.isArray(critList)) setEvalCriteria(critList);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken]
  );

  const deleteEvalCriterion = useCallback(
    async (id) => {
      if (!sessionToken) return { ok: false, error: 'غير مصرح.' };
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_delete_criterion', {
          p_token: sessionToken,
          p_id: id,
        });
        if (error) return { ok: false, error: error.message };
        const { data: critList } = await supabase.rpc('manafeth_eval_get_criteria', { p_token: sessionToken });
        if (Array.isArray(critList)) setEvalCriteria(critList);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken]
  );

  const saveEvalSetting = useCallback(
    async (key, value) => {
      if (!sessionToken) return { ok: false, error: 'غير مصرح.' };
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_save_setting', {
          p_token: sessionToken,
          p_key: key,
          p_value: value,
        });
        if (error) return { ok: false, error: error.message };
        const { data: s } = await supabase.rpc('manafeth_eval_get_settings', { p_token: sessionToken });
        if (s) setEvalSettings(s);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken]
  );

  const setEvalAccess = useCallback(
    async (employeeId, patch) => {
      if (!sessionToken) return { ok: false, error: 'غير مصرح.' };
      try {
        const { data, error } = await supabase.rpc('manafeth_eval_admin_set_access', {
          p_token: sessionToken,
          p_employee_id: employeeId,
          p_patch: patch,
        });
        if (error) return { ok: false, error: error.message };
        const { data: acc } = await supabase.rpc('manafeth_eval_admin_get_access', { p_token: sessionToken });
        if (Array.isArray(acc)) setEvalAccessList(acc);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    setDiagnosticsContext({
      employeeId: currentUser?.employeeId || null,
      userName: currentUser?.name || null,
      roleKey: currentUser?.role || null,
      sessionToken: sessionToken || null,
    });
  }, [currentUser, sessionToken]);

  const manualRefreshCloud = useCallback(async () => {
    if (!supabase) {
      setLastSyncedAt(new Date().toISOString());
      return { ok: true, mode: 'local' };
    }
    try {
      const [stRes, audRes, ntfRes] = await Promise.all([
        supabase.from('manafeth_ops_state').select('*').eq('doc_key', 'ops_overlay_v1').maybeSingle(),
        supabase.from('manafeth_ops_audit_logs').select('*').order('timestamp', { ascending: false }).limit(350),
        supabase.from('manafeth_ops_notifications').select('*').order('created_at', { ascending: false }).limit(150),
      ]);
      if (stRes.data?.payload && Object.keys(stRes.data.payload).length > 0) {
        isSyncingFromCloud.current = true;
        setOverlay((prev) => {
          const merged = {
            ...prev,
            ...stRes.data.payload,
            operationalFilesVersion: stRes.data.payload.operationalFilesVersion,
          };
          if (!Array.isArray(merged.employees) || !merged.employees.some((e) => e && e.username)) {
            merged.employees = masterSeed.employees;
          }
          if (!Array.isArray(merged.departments) || merged.departments.length === 0) {
            merged.departments = masterSeed.departments;
          }
          return migrateOverlayToV5(merged);
        });
        setTimeout(() => {
          isSyncingFromCloud.current = false;
        }, 120);
      }
      if (Array.isArray(audRes.data) && audRes.data.length > 0) {
        setAuditLogs(
          audRes.data.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            actorName: r.actor_name,
            actorUsername: r.actor_username || '',
            actorRole: r.actor_role,
            actionType: r.action_type,
            entityType: r.entity_type,
            entityId: r.entity_id,
            entityTitle: r.entity_title,
            summary: r.summary,
            previousValue: r.previous_value,
            newValue: r.new_value,
            reason: r.reason,
          }))
        );
      }
      if (Array.isArray(ntfRes.data) && ntfRes.data.length > 0) {
        setNotifications(
          ntfRes.data.map((n) => ({
            id: n.id,
            createdAt: n.created_at,
            type: n.type,
            title: n.title,
            message: n.message,
            targetRole: n.target_role,
            targetDeptId: n.target_dept_id,
            targetEmployeeId: n.target_employee_id,
            relatedEntityId: n.related_entity_id,
            readBy: n.read_by || [],
          }))
        );
      }
      if (sessionToken) {
        await refreshEvaluations();
      }
      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setCloudStatus('online');
      setSyncError(null);
      return { ok: true, syncedAt: nowIso };
    } catch (err) {
      setSyncError(err.message);
      logClientDiagnostic({ kind: 'sync_error', message: err.message });
      return { ok: false, error: err.message };
    }
  }, [sessionToken, refreshEvaluations]);

  const value = {
    state: fullState,
    currentUser,
    userOrgContext,
    sessionToken,
    loginWithCredentials,
    logout,
    submissionWindow,
    refreshSubmissionWindow,
    activeGlobalWeek,
    setActiveGlobalWeek,
    darkMode,
    setDarkMode,
    cloudStatus,
    lastSyncedAt,
    syncError,
    lastLoginSeenAt,
    manualRefreshCloud,
    auditLogs,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    scheduleProgramExecution,
    submitExceptionRequest,
    submitExceptionOpinion,
    decideExceptionFinal,
    resolveAffectedProgramItem,
    updateProgramStatus,
    manageEmployeeAccount,
    saveAdministration,
    addOrUpdateDepartment,
    updatePeriodTiming,
    updateConflictRuleBehavior,
    saveTask,
    updateTaskStatus,
    saveStudent,
    publishApprovedPlanVersion,
    softDeleteEntity,
    bulkSoftDeleteEntities,
    restoreDeletedItem,
    bulkRestoreDeletedItems,
    resolveDiscrepancy,
    saveResourceEntity,
    applyReviewedActivitiesDiff,
    replacePeriodsFromImport,
    replaceWeeklyCommitmentsFromImport,
    replaceSupervisionFromImport,
    // Unified Comprehensive Evaluation System (v3.0)
    evaluations,
    evalCriteria,
    evalSettings,
    evalAccessList,
    evalAuditLogs,
    evalMe,
    evalLoading,
    refreshEvaluations,
    refreshEvalCriteria,
    refreshEvalSettings,
    refreshEvalAccess,
    submitEvaluation,
    deleteEvaluation,
    restoreEvaluation,
    saveEvalCriterion,
    deleteEvalCriterion,
    saveEvalSetting,
    setEvalAccess,
  };

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOps() {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error('useOps must be used inside OpsProvider');
  return ctx;
}
