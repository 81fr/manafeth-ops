import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Layers,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { useOps } from '../engine/store';
import { WORK_DAYS_AR, getDatesForGlobalWeek, formatTime12Ar } from '../engine/dateUtils';
import { getEmployeeDailyChronologicalSchedule } from '../engine/conflictEngine';
import { StatusBadge, DepartmentPill } from '../components/StatusBadge';

export default function MyDayView({ onOpenDetailModal }) {
  const { state, currentUser, activeGlobalWeek } = useOps();
  const weekDates = useMemo(() => getDatesForGlobalWeek(activeGlobalWeek), [activeGlobalWeek]);

  const allowedEmployees = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.isAdmin || currentUser.accessScope === 'system' || currentUser.accessScope === 'club') {
      return state.employees;
    }
    if (currentUser.accessScope === 'department' && currentUser.departmentId) {
      return state.employees.filter((e) => e.departmentId === currentUser.departmentId);
    }
    return state.employees.filter((e) => e.id === currentUser.employeeId);
  }, [state.employees, currentUser]);

  const [selectedEmpId, setSelectedEmpId] = useState(
    currentUser?.employeeId || allowedEmployees[0]?.id || 'EMP-01'
  );
  const [selectedDay, setSelectedDay] = useState('الاثنين');

  useEffect(() => {
    if (currentUser?.employeeId) {
      setSelectedEmpId(currentUser.employeeId);
    }
  }, [currentUser?.employeeId]);

  const employee =
    allowedEmployees.find((e) => e.id === selectedEmpId) ||
    state.employees.find((e) => e.id === currentUser?.employeeId) ||
    allowedEmployees[0];

  const dateIso = weekDates[selectedDay] || '2026-11-02';

  const dayTimeline = useMemo(() => {
    if (!employee) return [];
    return getEmployeeDailyChronologicalSchedule(employee.id, selectedDay, dateIso, state);
  }, [employee, selectedDay, dateIso, state]);

  const weeklyStudyCommitments = useMemo(() => {
    if (!employee) return [];
    return state.weeklyCommitments.filter(
      (wc) =>
        wc.leadEmployeeId === employee.id ||
        (wc.participatingEmployeeIds || []).includes(employee.id)
    );
  }, [state.weeklyCommitments, employee]);

  const freePeriods = useMemo(() => {
    return ['P1', 'P2', 'P3']
      .map((pid) => state.periods.find((p) => p.id === pid))
      .filter(Boolean)
      .filter((p) => !dayTimeline.some((it) => it.periodId === p.id));
  }, [dayTimeline, state.periods]);

  const venueMap = useMemo(() => Object.fromEntries(state.venues.map((v) => [v.id, v.name])), [state.venues]);
  const scopeMap = useMemo(() => Object.fromEntries(state.scopes.map((s) => [s.id, s.name])), [state.scopes]);

  const canSwitchEmployee = allowedEmployees.length > 1;

  return (
    <div className="view-anim" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {/* Employee Header Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(0,165,155,0.09), rgba(140,194,64,0.08))',
          borderColor: 'rgba(0,165,155,0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 15,
                background: 'var(--accent-gradient-diag)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '1.15rem',
              }}
            >
              {employee?.name?.slice(0, 2)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>جدولي الخاص: {employee?.name}</h2>
                <DepartmentPill
                  deptId={employee?.departmentId}
                  deptName={employee?.departmentName}
                  departments={state.departments}
                />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                الوظيفة: <strong>{employee?.jobTitle}</strong>
                {employee?.supervisionRole ? ` • تكليف الإشراف: ${employee.supervisionRole}` : ''}
              </div>
            </div>
          </div>

          {canSwitchEmployee && (
            <div style={{ minWidth: 270 }}>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>معاينة جدول موظف (حسب نطاق صلاحيتك):</label>
              <select
                className="form-select"
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
              >
                {allowedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.departmentName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Day Selector Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WORK_DAYS_AR.map((dAr) => (
              <button
                key={dAr}
                type="button"
                className={`btn btn-sm ${selectedDay === dAr ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedDay(dAr)}
              >
                <Calendar size={14} />
                <span>{dAr} ({weekDates[dAr]})</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-muted)' }}>الفترات المتاحة في هذا اليوم:</span>
            {freePeriods.length === 0 ? (
              <span className="status-badge badge-conflict">جميع الفترات الثلاث مشغولة</span>
            ) : (
              freePeriods.map((fp) => (
                <span key={fp.id} className="status-badge badge-approved">
                  <CheckCircle2 size={12} />
                  <span>{fp.name} متاحة</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Personal Weekly Study Timetable Locked to Employee (Req #6) */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <BookOpen size={18} color="var(--brand-teal)" />
            <span>الجدول الدراسي الأسبوعي الخاص بـ ({employee?.name}) — يتحدث تلقائيًا عند تعديل الجدول المعتمد</span>
          </div>
        </div>
        {weeklyStudyCommitments.length === 0 ? (
          <div style={{ padding: '1.3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            لا توجد حصص دراسية أسبوعية ثابتة مسجلة باسم هذا الموظف.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th>الفترة</th>
                  <th>الوقت</th>
                  <th>النشاط / المادة</th>
                  <th>الفئة / النطاق</th>
                  <th>الموقع / القاعة</th>
                </tr>
              </thead>
              <tbody>
                {weeklyStudyCommitments.map((wc) => {
                  const pObj = state.periods.find((p) => p.id === wc.periodId);
                  return (
                    <tr key={wc.id}>
                      <td style={{ fontWeight: 800 }}>{wc.day}</td>
                      <td>{wc.periodName}</td>
                      <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {pObj ? `${formatTime12Ar(pObj.approvedStart)} - ${formatTime12Ar(pObj.approvedEnd)}` : '—'}
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--brand-ink)' }}>{wc.title}</td>
                      <td>{(wc.scopeIds || []).map((id) => scopeMap[id]).join('، ') || '—'}</td>
                      <td>{wc.venueId ? venueMap[wc.venueId] : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chronological Timeline Cards */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Clock size={18} color="var(--brand-teal)" />
            <span>التسلسل الزمني الكامل لالتزامات يوم {selectedDay} ({dateIso}) — {dayTimeline.length} مهام وبرامج</span>
          </div>
        </div>

        {dayTimeline.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.2rem', color: 'var(--text-muted)' }}>
            لا توجد التزامات مسجلة في يوم {selectedDay}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {dayTimeline.map((item, idx) => {
              const isSup = item.kind === 'إشراف';
              const isExc = item.kind === 'استثناء معتمد';
              const rawEx = item.executionObj || item.rawExecution;
              return (
                <div
                  key={item.id + idx}
                  onClick={() => rawEx && onOpenDetailModal && onOpenDetailModal({ execution: rawEx })}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '155px 1fr auto',
                    gap: '1rem',
                    alignItems: 'center',
                    padding: '0.9rem 1.1rem',
                    borderRadius: 12,
                    border: isExc
                      ? '1.5px solid #8b5cf6'
                      : isSup
                      ? '1px solid rgba(2,132,199,0.28)'
                      : '1px solid var(--border)',
                    background: isExc
                      ? 'var(--exception-bg)'
                      : isSup
                      ? 'rgba(2,132,199,0.04)'
                      : 'var(--bg)',
                    cursor: rawEx ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: '0.75rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--brand-teal)' }}>
                      {formatTime12Ar(item.startTime)} - {formatTime12Ar(item.endTime)}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                      {item.periodName}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--brand-ink)' }}>
                        {item.title}
                      </span>
                      {item.roleInItem && (
                        <span className="status-badge badge-muted" style={{ fontSize: '0.68rem' }}>
                          {item.roleInItem}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={13} color="var(--brand-teal)" />
                        الموقع: <strong style={{ color: 'var(--text)' }}>{item.location}</strong>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Layers size={13} color="var(--brand-teal)" />
                        الفئة/النطاق: <strong style={{ color: 'var(--text)' }}>{item.scopeName || item.scopeLabel}</strong>
                      </span>
                      <span>القسم/الوحدة: <strong>{item.departmentName}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <StatusBadge status={item.status} />
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.kind}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
