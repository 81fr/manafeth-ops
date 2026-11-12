import React from 'react';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Sparkles,
  CheckCheck,
  PauseCircle,
  XCircle,
  FileEdit,
} from 'lucide-react';

/**
 * Enforces Req #62:
 * Planned Green (#DFF0D8) is EXCLUSIVELY for 'مخطط' (Planned schedule from Excel green cells).
 * Executed/Completed uses Royal Blue, Approved uses Manafeth Teal, Exception uses Violet, Conflict uses Red.
 */
export function StatusBadge({ status, size = 'md' }) {
  const s = status || 'مخطط';
  let cls = 'badge-muted';
  let Icon = Clock;

  if (s === 'مخطط') {
    cls = 'badge-planned-green';
    Icon = Calendar;
  } else if (s === 'يحتاج جدولة' || s === 'بانتظار التنفيذ') {
    cls = 'badge-unscheduled';
    Icon = AlertTriangle;
  } else if (
    s === 'معتمد' ||
    s === 'معتمد بالجدول' ||
    s === 'تم الاعتماد والمراجعة' ||
    s === 'لا يوجد تعارض' ||
    s === 'نشط' ||
    s === 'منجزة'
  ) {
    cls = 'badge-approved';
    Icon = CheckCircle2;
  } else if (s === 'معتمد باستثناء' || s === 'استثناء معتمد') {
    cls = 'badge-exception';
    Icon = Sparkles;
  } else if (s === 'منفذ' || s === 'مكتمل' || s === 'قيد التنفيذ') {
    cls = 'badge-executed';
    Icon = CheckCheck;
  } else if (
    s === 'يوجد تعارض' ||
    s === 'تعارض فعلي' ||
    s === 'تعارض حرج' ||
    s === 'تعارض يحتاج استثناء' ||
    s === 'تعارض يحتاج تعديل' ||
    s === 'مرفوض' ||
    s === 'تعارض بيانات يحتاج مراجعة' ||
    s === 'غير نشط'
  ) {
    cls = 'badge-conflict';
    Icon = ShieldAlert;
  } else if (s === 'تنبيه مهم' || s === 'مهم') {
    cls = 'badge-unscheduled';
    Icon = AlertTriangle;
  } else if (
    s === 'بانتظار إبداء الرأي' ||
    s === 'بانتظار الاعتماد' ||
    s === 'بانتظار الاستثناء' ||
    s === 'بانتظار المراجعة' ||
    s === 'تمت الجدولة' ||
    s === 'تنبيه فقط' ||
    s === 'تنبيه'
  ) {
    cls = 'badge-pending';
    Icon = Clock;
  } else if (s === 'مسودة' || s === 'لا يدخل في التعارضات') {
    cls = 'badge-muted';
    Icon = FileEdit;
  } else if (s === 'مؤجل') {
    cls = 'badge-muted';
    Icon = PauseCircle;
  } else if (s === 'ملغي') {
    cls = 'badge-conflict';
    Icon = XCircle;
  }

  return (
    <span
      className={`status-badge ${cls}`}
      style={size === 'sm' ? { fontSize: '0.68rem', padding: '2px 8px' } : undefined}
    >
      <Icon size={size === 'sm' ? 12 : 13} />
      <span>{s}</span>
    </span>
  );
}

export function PlannedGreenPill({ monthName, weekLabel, globalWeek, compact = false }) {
  if (!monthName && !globalWeek) {
    return <span className="status-badge badge-unscheduled">بدون أسبوع أخضر في المصدر</span>;
  }
  return (
    <span
      className="status-badge badge-planned-green"
      title="اللون الأخضر في ملف الأنشطة يرمز لموعد إقامة البرنامج المخطط فقط وليس الإنجاز الفعلي"
      style={compact ? { fontSize: '0.69rem', padding: '2px 8px' } : undefined}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#22c55e',
          display: 'inline-block',
        }}
      />
      <span>
        {compact ? `${monthName?.split(' ')[0] || ''} • ${weekLabel}` : `مخطط: ${monthName} — ${weekLabel} (أسبوع ${globalWeek})`}
      </span>
    </span>
  );
}

export function DepartmentPill({ deptId, deptName, departments = [] }) {
  const found = departments.find((d) => d.id === deptId || d.name === deptName);
  const color = found?.color || '#00A59B';
  const label = found?.name || deptName || 'عام';
  return (
    <span
      className="dept-pill"
      style={{
        background: `${color}15`,
        color,
        border: `1px solid ${color}35`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </span>
  );
}

