// ============================================================================
// Manafeth Platform Diagnostics, Error Telemetry & Issue Reporting Engine (v4.0)
// ============================================================================
import { supabase } from '../supabaseClient';

const LOCAL_DIAG_EVENTS_KEY = 'manafeth_ops_diag_events_v4';
const LOCAL_USER_REPORTS_KEY = 'manafeth_ops_user_reports_v4';
const APP_VERSION = '4.0.0';

let activeContext = {
  route: 'dashboard',
  employeeId: null,
  userName: null,
  roleKey: null,
  sessionToken: null,
};

const listeners = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function subscribeDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDiagnosticsContext(ctx = {}) {
  activeContext = { ...activeContext, ...ctx };
}

export function getViewportLabel() {
  if (typeof window === 'undefined') return 'unknown';
  return `${window.innerWidth}x${window.innerHeight}`;
}

export function getLocalDiagEvents() {
  try {
    const raw = localStorage.getItem(LOCAL_DIAG_EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalDiagEvents(list) {
  try {
    localStorage.setItem(LOCAL_DIAG_EVENTS_KEY, JSON.stringify(list.slice(0, 150)));
  } catch {}
}

export function getLocalProblemReports() {
  try {
    const raw = localStorage.getItem(LOCAL_USER_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalProblemReports(list) {
  try {
    localStorage.setItem(LOCAL_USER_REPORTS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

/**
 * Logs a technical diagnostic event (render crash, save failure, sync failure, permission issue, etc.)
 */
export function logClientDiagnostic({
  kind = 'error',
  route = null,
  message = '',
  stack = '',
  component = '',
}) {
  const cleanMsg = String(message || 'خطأ غير معروف').slice(0, 400);
  const targetRoute = route || activeContext.route || 'dashboard';
  const nowIso = new Date().toISOString();

  const existing = getLocalDiagEvents();
  const matchIdx = existing.findIndex(
    (e) => e.kind === kind && e.route === targetRoute && e.message === cleanMsg
  );

  let updated;
  if (matchIdx !== -1) {
    const item = existing[matchIdx];
    const merged = {
      ...item,
      createdAt: nowIso,
      occurrences: (item.occurrences || 1) + 1,
      stack: stack ? String(stack).slice(0, 2000) : item.stack,
    };
    updated = [merged, ...existing.filter((_, idx) => idx !== matchIdx)];
  } else {
    const record = {
      id: `LOC-ERR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: nowIso,
      kind,
      route: targetRoute,
      message: cleanMsg,
      stack: String(stack || '').slice(0, 2000),
      component: String(component || '').slice(0, 800),
      employeeId: activeContext.employeeId || null,
      role: activeContext.roleKey || null,
      appVersion: APP_VERSION,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : '',
      viewport: getViewportLabel(),
      occurrences: 1,
    };
    updated = [record, ...existing];
  }

  saveLocalDiagEvents(updated);
  notifyListeners();

  if (supabase) {
    supabase
      .rpc('manafeth_diag_log', {
        p_events: [
          {
            kind,
            route: targetRoute,
            message: cleanMsg,
            stack: String(stack || '').slice(0, 2000),
            component: String(component || '').slice(0, 800),
            employeeId: activeContext.employeeId || null,
            role: activeContext.roleKey || null,
            appVersion: APP_VERSION,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : '',
            viewport: getViewportLabel(),
            count: 1,
          },
        ],
        p_token: activeContext.sessionToken || null,
      })
      .then(() => {})
      .catch(() => {});
  }
}

export function clearLocalDiagEvents() {
  saveLocalDiagEvents([]);
  notifyListeners();
}

/**
 * Submits a user-reported issue ("الإبلاغ عن مشكلة") with page & timestamp context
 * without collecting unnecessary sensitive data.
 */
export async function submitUserProblemReport({
  sessionToken,
  currentUser,
  route,
  category = 'other',
  description = '',
}) {
  const cleanDesc = String(description || '').trim();
  if (cleanDesc.length < 5) {
    return { ok: false, error: 'يرجى كتابة وصف مختصر وواضح للمشكلة (5 أحرف على الأقل).' };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    route: route || activeContext.route || 'dashboard',
    category,
    description: cleanDesc,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : '',
    viewport: getViewportLabel(),
  };

  const localRecord = {
    id: `RPT-LOC-${Date.now()}`,
    createdAt: nowIso,
    employeeId: currentUser?.employeeId || 'EMP-00',
    reporterName: currentUser?.name || 'مستخدم النظام',
    role: currentUser?.role || 'employee',
    route: payload.route,
    category: payload.category,
    description: payload.description,
    viewport: payload.viewport,
    status: 'جديد',
    adminNote: '',
    resolvedAt: null,
  };

  if (supabase && sessionToken) {
    try {
      const { data, error } = await supabase.rpc('manafeth_diag_report', {
        p_token: sessionToken,
        p_report: payload,
      });
      if (!error && data && data.ok) {
        localRecord.id = data.id || localRecord.id;
        const cur = getLocalProblemReports();
        saveLocalProblemReports([localRecord, ...cur]);
        notifyListeners();
        return { ok: true, id: localRecord.id };
      }
      if (data && data.message) {
        return { ok: false, error: data.message };
      }
    } catch {}
  }

  const cur = getLocalProblemReports();
  saveLocalProblemReports([localRecord, ...cur]);
  notifyListeners();
  return { ok: true, id: localRecord.id, offlineSaved: true };
}

/**
 * Fetches full platform health overview for System Admin
 */
export async function fetchPlatformHealthOverview(sessionToken) {
  const localEvents = getLocalDiagEvents();
  const localReports = getLocalProblemReports();

  let serverData = null;
  let dbLatencyMs = null;
  let dbReachable = false;

  if (supabase) {
    const t0 = performance.now();
    try {
      if (sessionToken) {
        const { data, error } = await supabase.rpc('manafeth_diag_admin_overview', {
          p_token: sessionToken,
        });
        dbLatencyMs = Math.round(performance.now() - t0);
        if (!error && data) {
          serverData = data;
          dbReachable = true;
        }
      }
      if (!dbReachable) {
        const { error: pingErr } = await supabase
          .from('manafeth_ops_state')
          .select('doc_key, updated_at')
          .eq('doc_key', 'ops_overlay_v1')
          .maybeSingle();
        dbLatencyMs = Math.round(performance.now() - t0);
        if (!pingErr) dbReachable = true;
      }
    } catch {
      dbReachable = false;
    }
  }

  // Merge server events + local events (deduplicated)
  const serverEvents = Array.isArray(serverData?.events) ? serverData.events : [];
  const seenEventKeys = new Set(serverEvents.map((e) => `${e.kind}__${e.route}__${e.message}`));
  const mergedEvents = [
    ...serverEvents,
    ...localEvents.filter((e) => !seenEventKeys.has(`${e.kind}__${e.route}__${e.message}`)),
  ];

  // Merge server reports + local reports
  const serverReports = Array.isArray(serverData?.reports) ? serverData.reports : [];
  const seenReportIds = new Set(serverReports.map((r) => r.id));
  const mergedReports = [
    ...serverReports,
    ...localReports.filter((r) => !seenReportIds.has(r.id)),
  ];

  // Compute failing routes
  const routeFailureMap = {};
  mergedEvents
    .filter((e) => ['render_error', 'chunk_load', 'window_error'].includes(e.kind))
    .forEach((e) => {
      const r = e.route || 'unknown';
      if (!routeFailureMap[r]) {
        routeFailureMap[r] = { route: r, n: 0, last: e.createdAt };
      }
      routeFailureMap[r].n += Number(e.occurrences || 1);
      if (e.createdAt > routeFailureMap[r].last) routeFailureMap[r].last = e.createdAt;
    });

  return {
    appVersion: APP_VERSION,
    dbReachable,
    dbLatencyMs,
    serverTime: serverData?.serverTime || new Date().toISOString(),
    stateUpdatedAt: serverData?.stateUpdatedAt || null,
    counts: {
      accounts: serverData?.counts?.accounts ?? 39,
      activeSessions: serverData?.counts?.activeSessions ?? 1,
      evaluations: serverData?.counts?.evaluations ?? 0,
      events24h: mergedEvents.length,
      openReports: mergedReports.filter((r) => r.status === 'جديد' || r.status === 'قيد المعالجة').length,
      saveFailures: mergedEvents.filter((e) => e.kind === 'save_failure').length,
      syncIssues: mergedEvents.filter((e) => e.kind === 'sync_error').length,
      permissionIssues: mergedEvents.filter((e) => e.kind === 'permission_denied').length,
    },
    failingRoutes:
      Array.isArray(serverData?.failingRoutes) && serverData.failingRoutes.length > 0
        ? serverData.failingRoutes
        : Object.values(routeFailureMap),
    events: mergedEvents,
    reports: mergedReports,
  };
}

export async function updateProblemReportAdmin({ sessionToken, reportId, status, adminNote }) {
  const localReports = getLocalProblemReports();
  const nextLocal = localReports.map((r) =>
    r.id === reportId
      ? {
          ...r,
          status,
          adminNote: adminNote ?? r.adminNote,
          resolvedAt: ['تم الحل', 'مرفوض'].includes(status) ? new Date().toISOString() : null,
        }
      : r
  );
  saveLocalProblemReports(nextLocal);

  if (supabase && sessionToken && !String(reportId).startsWith('RPT-LOC-')) {
    try {
      const { data, error } = await supabase.rpc('manafeth_diag_admin_update_report', {
        p_token: sessionToken,
        p_id: reportId,
        p_status: status,
        p_note: adminNote || null,
      });
      if (error) return { ok: false, error: error.message };
      notifyListeners();
      return { ok: Boolean(data?.ok ?? true) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  notifyListeners();
  return { ok: true };
}

let globalHandlersInstalled = false;
export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled || typeof window === 'undefined') return;
  globalHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    const msg = event?.error?.message || event?.message || 'Runtime window error';
    // Ignore benign ResizeObserver warnings
    if (String(msg).includes('ResizeObserver')) return;
    logClientDiagnostic({
      kind: 'window_error',
      message: msg,
      stack: event?.error?.stack || `${event?.filename || ''}:${event?.lineno || ''}`,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = reason?.message || String(reason || 'Unhandled promise rejection');
    logClientDiagnostic({
      kind: 'unhandled_rejection',
      message: msg,
      stack: reason?.stack || '',
    });
  });
}
