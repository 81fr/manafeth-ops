import React, { useState, useMemo } from 'react';
import {
  Radio,
  MapPin,
  Users,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Clock,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { hasPermission } from '../engine/permissions';
import { WORK_DAYS_AR, getDatesForGlobalWeek, formatTime12Ar, isDateInExecutionRange } from '../engine/dateUtils';
import { getVenuesAvailability } from '../engine/conflictEngine';
import { StatusBadge, DepartmentPill } from '../components/StatusBadge';

/**
 * Live Operations Center (مركز التشغيل — الآن والتالي — Req #10, #11, #48, #50)
 * Visible to all employees as general club operational info, Read-Only unless authorized!
 */
export default function LiveOpsCenterView({ onOpenDetailModal, onOpenScheduleModal }) {
  const { state, currentUser, activeGlobalWeek } = useOps();
  const weekDates = useMemo(() => getDatesForGlobalWeek(activeGlobalWeek), [activeGlobalWeek]);

  const canCreateProgram = hasPermission(currentUser, 'create_program');
  const canViewDrafts = hasPermission(currentUser, 'view_drafts');

  const [selectedDay, setSelectedDay] = useState('الاثنين');
  const [selectedPeriodId, setSelectedPeriodId] = useState('P1');

  const visiblePeriods = useMemo(
    () => state.periods.filter((p) => p.showInSchedule !== false),
    [state.periods]
  );

  const selectedDateIso = weekDates[selectedDay] || '2026-11-02';
  const selectedPeriod = visiblePeriods.find((p) => p.id === selectedPeriodId) || state.periods.find((p) => p.id === selectedPeriodId) || state.periods[3];

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const empMap = useMemo(() => Object.fromEntries(state.employees.map((e) => [e.id, e.name])), [state.employees]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);

  // All active operational items in this exact Day + Period
  const activeItems = useMemo(() => {
    const items = [];

    // If fixed supervision/prayer period is chosen, show supervision deployments!
    if (selectedPeriod?.category === 'fixed_event') {
      state.supervisionDuties.forEach((sr) => {
        if (sr.showInSchedule === false) return;
        let loc = sr.floor;
        let desc = 'متابعة إشرافية ميدانية';
        if (selectedPeriodId === 'PER_RECEPTION' || selectedPeriodId === 'PER_SUP_START') {
          loc = sr.reception;
          desc = `استقبال الطلاب (${sr.floor})`;
        } else if (selectedPeriodId === 'PER_ASR') {
          loc = sr.asrHall;
          desc = `إشراف صلاة العصر — الصف (${sr.asrRow})`;
        } else if (selectedPeriodId === 'PER_MAGHRIB') {
          loc = `${sr.maghribPre} ← ${sr.maghribHall}`;
          desc = `إشراف قبل وأثناء صلاة المغرب — الصف (${sr.maghribRow})`;
        } else if (selectedPeriodId === 'PER_ISHA') {
          loc = `${sr.ishaPre} ← ${sr.ishaHall}`;
          desc = `إشراف قبل وأثناء صلاة العشاء — الصف (${sr.ishaRow})`;
        } else if (selectedPeriodId === 'PER_DISMISSAL') {
          loc = sr.dismissal;
          desc = `صرف الطلاب ${sr.buses ? `— حافلات (${sr.buses})` : ''}`;
        }
        items.push({
          id: `LIVE-SUP-${sr.id}`,
          title: desc,
          subPrograms: [],
          departmentId: null,
          departmentName: 'وحدة الإشراف اليومي',
          venueName: loc,
          scopeName: sr.floor,
          employeeName: sr.supervisor,
          healthBadge: 'طبيعي',
          source: 'جدول الإشراف اليومي',
        });
      });
    }

    // Weekly recurring classes & activities in this period
    state.weeklyCommitments.forEach((wcm) => {
      const ov = state.commitmentOverrides[`${wcm.id}__${selectedDateIso}`];
      if (ov?.cancelledForDate || ov?.suspendedForDate) return;
      const effDay = ov?.newDay || wcm.day;
      const effPer = ov?.newPeriodId || wcm.periodId;
      if (effDay !== selectedDay || effPer !== selectedPeriodId) return;

      items.push({
        id: wcm.id,
        title: wcm.title,
        subPrograms: [],
        departmentId: wcm.departmentId,
        departmentName: state.departments.find((d) => d.id === wcm.departmentId)?.name || 'عام',
        venueName: venueMap[ov?.newVenueId || wcm.venueId] || wcm.venueNote || 'بدون قاعة محددة',
        scopeName: (wcm.scopeIds || []).map((id) => scopeMap[id]).join('، ') || 'عام',
        employeeName: empMap[ov?.newLeadEmployeeId || wcm.leadEmployeeId] || '—',
        healthBadge: wcm.venueId ? 'طبيعي' : 'تنبيه',
        source: 'الجدول الأسبوعي المعتمد',
      });
    });

    // Scheduled department executions in this period (including multi-period coveredPeriodIds!)
    state.scheduledExecutions.forEach((ex) => {
      if (ex.status === 'ملغي' || ex.status === 'مؤجل') return;
      if (ex.status === 'مسودة' && !canViewDrafts && ex.createdByEmployeeId !== currentUser?.employeeId) {
        return;
      }
      const sameDay = isDateInExecutionRange(selectedDateIso, selectedDay, ex);
      const covIds = ex.coveredPeriodIds?.length ? ex.coveredPeriodIds : [ex.periodId];
      if (!sameDay || !covIds.includes(selectedPeriodId)) return;

      let health = 'طبيعي';
      if (ex.status === 'معتمد باستثناء') health = 'استثناء معتمد';
      else if (ex.status === 'يوجد تعارض') health = 'تعارض';
      else if (ex.status.includes('بانتظار')) health = 'يحتاج قرار';

      const activeSubs = (ex.subPrograms || []).filter((sp) =>
        (sp.coveredPeriodIds?.length ? sp.coveredPeriodIds : [sp.periodId]).includes(selectedPeriodId)
      );
      const scopeLabels = (ex.scopeIds || []).map((id) => scopeMap[id]).filter(Boolean);
      if (ex.studentIds?.length > 0) {
        scopeLabels.push(`طلاب محددون (${ex.studentIds.length})`);
      }

      items.push({
        id: ex.id,
        executionObj: ex,
        title: ex.programName,
        subPrograms: activeSubs,
        departmentId: ex.departmentId,
        departmentName: ex.departmentName,
        venueName: venueMap[ex.venueId] || '—',
        scopeName: scopeLabels.join('، ') || 'عام',
        employeeName: empMap[ex.leadEmployeeId] || '—',
        healthBadge: health,
        source: 'جدولة الأقسام',
      });
    });

    return items;
  }, [
    selectedPeriod,
    selectedPeriodId,
    selectedDay,
    selectedDateIso,
    state.supervisionDuties,
    state.weeklyCommitments,
    state.commitmentOverrides,
    state.scheduledExecutions,
    state.departments,
    venueMap,
    scopeMap,
    empMap,
    canViewDrafts,
    currentUser,
  ]);

  const { availableVenues, occupiedVenues } = useMemo(
    () =>
      getVenuesAvailability(
        {
          day: selectedDay,
          executionDate: selectedDateIso,
          periodId: selectedPeriodId,
        },
        state
      ),
    [selectedDay, selectedDateIso, selectedPeriodId, state]
  );

  const pendingDecisionsCount = useMemo(
    () =>
      state.exceptionRequests.filter(
        (r) =>
          r.status === 'بانتظار إبداء الرأي' ||
          r.status === 'بانتظار الاعتماد' ||
          (r.status === 'معتمد باستثناء' && !r.allAffectedResolved)
      ).length,
    [state.exceptionRequests]
  );

  const healthBadgeStyle = (h) => {
    if (h === 'طبيعي') return 'badge-approved';
    if (h === 'استثناء معتمد') return 'badge-exception';
    if (h === 'تعارض') return 'badge-conflict';
    if (h === 'يحتاج قرار') return 'badge-pending';
    return 'badge-unscheduled';
  };

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {/* Live Period & Day Selector */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--accent-gradient-diag)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Radio size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                مركز التشغيل الميداني الموحد (الآن والتالي) — يوم {selectedDay} ({selectedDateIso})
              </h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                الفترة المعروضة: <strong>{selectedPeriod?.name}</strong> ({formatTime12Ar(selectedPeriod?.approvedStart)} - {formatTime12Ar(selectedPeriod?.approvedEnd)})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WORK_DAYS_AR.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${selectedDay === d ? 'btn-teal' : 'btn-secondary'}`}
                onClick={() => setSelectedDay(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* All Visible Operational Periods Timeline Strip */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {visiblePeriods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPeriodId(p.id)}
              className={`btn btn-sm ${selectedPeriodId === p.id ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Clock size={13} />
              <span>{p.name}</span>
              <span style={{ opacity: 0.8, fontSize: '0.68rem' }}>({formatTime12Ar(p.approvedStart)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5 Live Health Status Indicators (Req #50) */}
      <div className="stats-grid">
        <div className="stat-card" style={{ '--stat-color': '#00A59B' }}>
          <div>
            <div className="stat-value">{activeItems.filter((i) => i.healthBadge === 'طبيعي').length}</div>
            <div className="stat-label">تشغيل طبيعي</div>
            <div className="stat-hint">برامج والتزامات تسير بدون تعارض</div>
          </div>
          <span className="status-badge badge-approved">طبيعي</span>
        </div>

        <div className="stat-card" style={{ '--stat-color': '#f59e0b' }}>
          <div>
            <div className="stat-value">{activeItems.filter((i) => i.healthBadge === 'تنبيه').length}</div>
            <div className="stat-label">تنبيه تشغيلي</div>
            <div className="stat-hint">أنشطة بدون قاعة مخصصة أو تزامن</div>
          </div>
          <span className="status-badge badge-unscheduled">تنبيه</span>
        </div>

        <div className="stat-card" style={{ '--stat-color': '#ef4444' }}>
          <div>
            <div className="stat-value">{activeItems.filter((i) => i.healthBadge === 'تعارض').length}</div>
            <div className="stat-label">تعارض نشط</div>
            <div className="stat-hint">يتطلب بديلاً أو طلب استثناء</div>
          </div>
          <span className="status-badge badge-conflict">تعارض</span>
        </div>

        <div className="stat-card" style={{ '--stat-color': '#8b5cf6' }}>
          <div>
            <div className="stat-value">{activeItems.filter((i) => i.healthBadge === 'استثناء معتمد').length}</div>
            <div className="stat-label">استثناء معتمد</div>
            <div className="stat-hint">برامج نوعية معتمدة باستثناء</div>
          </div>
          <span className="status-badge badge-exception">استثناء معتمد</span>
        </div>

        <div className="stat-card" style={{ '--stat-color': '#ea580c' }}>
          <div>
            <div className="stat-value">{pendingDecisionsCount}</div>
            <div className="stat-label">يحتاج قرار</div>
            <div className="stat-hint">طلبات استثناء أو برامج متأثرة</div>
          </div>
          <span className="status-badge badge-pending">يحتاج قرار</span>
        </div>
      </div>

      {/* Main Split: Active Programs Table vs Venues Availability */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span>ما يجري الآن في ({selectedPeriod?.name}) — {activeItems.length} نشاطًا وتكليفًا</span>
            </div>
            {canCreateProgram && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onOpenScheduleModal({ mode: 'new_program' })}
              >
                + جدولة نشاط في هذه الفترة
              </button>
            )}
          </div>

          <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>البرنامج / المهمة</th>
                  <th>القسم / الوحدة</th>
                  <th>الفئة / الطلاب</th>
                  <th>القاعة / الموقع</th>
                  <th>الموظف المكلف</th>
                  <th>المؤشر اللحظي</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      لا توجد برامج مجدولة في هذه الفترة الزمنية.
                    </td>
                  </tr>
                ) : (
                  activeItems.map((it) => (
                    <tr
                      key={it.id}
                      style={{ cursor: it.executionObj ? 'pointer' : 'default' }}
                      onClick={() => it.executionObj && onOpenDetailModal({ execution: it.executionObj })}
                    >
                      <td>
                        <div style={{ fontWeight: 800 }}>{it.title}</div>
                        {(it.subPrograms || []).map((sp) => (
                          <div key={sp.id || sp.name} style={{ fontSize: '0.7rem', color: 'var(--brand-teal)', fontWeight: 700, marginTop: 2 }}>
                            ↳ {sp.name}
                          </div>
                        ))}
                      </td>
                      <td>
                        <DepartmentPill
                          deptId={it.departmentId}
                          deptName={it.departmentName}
                          departments={state.departments}
                        />
                      </td>
                      <td>{it.scopeName}</td>
                      <td>{it.venueName}</td>
                      <td>{it.employeeName}</td>
                      <td>
                        <span className={`status-badge ${healthBadgeStyle(it.healthBadge)}`}>{it.healthBadge}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Rooms Status */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="card-title">
            <MapPin size={17} color="var(--brand-teal)" />
            <span>حركة القاعات والمواقع في هذه الفترة</span>
          </div>

          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--approved-text)', marginBottom: 6 }}>
              القاعات المتاحة فورًا ({availableVenues.length} قاعة):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 175, overflowY: 'auto' }}>
              {availableVenues.map((v) => (
                <span key={v.id} className="status-badge badge-approved" style={{ fontSize: '0.72rem' }}>
                  {v.name}
                </span>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--conflict-text)', marginBottom: 6 }}>
              القاعات المشغولة حاليًا ({occupiedVenues.length} قاعة):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
              {occupiedVenues.map(({ venue, occupancies }) => (
                <div
                  key={venue.id}
                  style={{
                    fontSize: '0.75rem',
                    padding: '6px 9px',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <strong>{venue.name}</strong>:{' '}
                  {occupancies.map((o) => `${o.programName} (${o.scopeName} — ${o.employeeName})`).join(' + ')}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

