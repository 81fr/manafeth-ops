import React, { useState, useRef } from 'react';
import { useOps } from '../engine/store';
import {
  downloadPeriodsTemplateExcel,
  exportCurrentPeriodsExcel,
  parsePeriodsExcelFile,
  downloadScheduleTemplateExcel,
  exportCurrentScheduleExcel,
  parseScheduleExcelFile,
  downloadSupervisionTemplateExcel,
  exportCurrentSupervisionExcel,
  parseSupervisionExcelFile,
} from '../engine/operationalExcelIO';
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Calendar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const FILE_META = {
  periods: {
    title: 'ملف الجدول الزمني للفترات (تحديث 8-11-2026م)',
    shortTitle: 'ملف الفترات الزمني',
    subtitle: 'معاينة وتعبئة أو استيراد وتصدير فترات النادي والأحداث الثابتة بنفس تنسيق الملف المعتمد',
    icon: Clock,
    accent: '#0284c7',
    bgLight: '#f0f9ff',
    borderLight: '#bae6fd',
  },
  schedule: {
    title: 'ملف جدول المعلمين والقاعات والفئات الأسبوعي (تحديث 18-10-2026م)',
    shortTitle: 'ملف الجدول الأسبوعي',
    subtitle: 'معاينة وتعبئة أو استيراد وتصدير جدول المعلمين (28 معلماً × 5 أيام × 3 فترات) بنفس التعبئة الشبكية والتفصيلية',
    icon: Calendar,
    accent: '#0d9488',
    bgLight: '#f0fdfa',
    borderLight: '#99f6e4',
  },
  supervision: {
    title: 'ملف جدول الإشراف اليومي والتعليمات والمعايير (تحديث 18-10-2026م)',
    shortTitle: 'ملف الإشراف اليومي',
    subtitle: 'معاينة وتعبئة أو استيراد وتصدير مواقع الإشراف اليومي وصلاة العصر والمغرب والعشاء والحافلات والتعليمات',
    icon: ShieldCheck,
    accent: '#7c3aed',
    bgLight: '#f5f3ff',
    borderLight: '#ddd6fe',
  },
};

export function OperationalFileCard({ fileType = 'periods', compact = false }) {
  const {
    state,
    replacePeriodsFromImport,
    replaceWeeklyCommitmentsFromImport,
    replaceSupervisionFromImport,
  } = useOps();

  const fileInputRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [previewData, setPreviewData] = useState(null);

  const meta = FILE_META[fileType] || FILE_META.periods;
  const IconComp = meta.icon;

  const handleDownloadTemplate = () => {
    setErrorMsg('');
    if (fileType === 'periods') {
      downloadPeriodsTemplateExcel(state.periods);
    } else if (fileType === 'schedule') {
      downloadScheduleTemplateExcel(state);
    } else if (fileType === 'supervision') {
      downloadSupervisionTemplateExcel(state);
    }
  };

  const handleExportCurrent = () => {
    setErrorMsg('');
    if (fileType === 'periods') {
      exportCurrentPeriodsExcel(state.periods);
    } else if (fileType === 'schedule') {
      exportCurrentScheduleExcel(state);
    } else if (fileType === 'supervision') {
      exportCurrentSupervisionExcel(state);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (fileType === 'periods') {
        const res = await parsePeriodsExcelFile(file);
        setPreviewData({ type: 'periods', fileName: file.name, ...res });
      } else if (fileType === 'schedule') {
        const res = await parseScheduleExcelFile(file, state);
        setPreviewData({ type: 'schedule', fileName: file.name, ...res });
      } else if (fileType === 'supervision') {
        const res = await parseSupervisionExcelFile(file, state);
        setPreviewData({ type: 'supervision', fileName: file.name, ...res });
      }
    } catch (err) {
      setErrorMsg(err.message || 'تعذر قراءة الملف المرفوع؛ تأكد من استخدام ملف المعاينة المعتمد (.xlsx).');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!previewData) return;
    if (previewData.type === 'periods') {
      replacePeriodsFromImport(previewData.periods, previewData.fileName);
      setSuccessMsg(`تم حذف الفترات السابقة واعتماد (${previewData.periods.length}) فترة جديدة من الملف «${previewData.fileName}» بنجاح.`);
    } else if (previewData.type === 'schedule') {
      replaceWeeklyCommitmentsFromImport(previewData.commitments, previewData.fileName);
      setSuccessMsg(`تم حذف الجدول السابق واعتماد (${previewData.commitments.length}) حصة/فترة أسبوعية من الملف «${previewData.fileName}» بنجاح.`);
    } else if (previewData.type === 'supervision') {
      replaceSupervisionFromImport(
        {
          supervisionDuties: previewData.supervisionDuties,
          supervisionInstructions: previewData.supervisionInstructions,
          supervisionCriteria: previewData.supervisionCriteria,
        },
        previewData.fileName
      );
      setSuccessMsg(`تم حذف بيانات الإشراف السابقة واعتماد (${previewData.supervisionDuties.length}) تكليف إشراف يومي من الملف «${previewData.fileName}» بنجاح.`);
    }
    setPreviewData(null);
  };

  return (
    <div
      className="card"
      style={{
        padding: compact ? '12px 16px' : '16px 20px',
        marginBottom: 14,
        background: meta.bgLight,
        border: `1px solid ${meta.borderLight}`,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#fff',
              border: `1px solid ${meta.borderLight}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: meta.accent,
              flexShrink: 0,
            }}
          >
            <IconComp size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: compact ? '0.9rem' : '0.98rem', color: '#0f172a' }}>
              {meta.title}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>{meta.subtitle}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadTemplate}
            style={{ background: '#fff', borderColor: meta.borderLight, color: '#0f172a', fontWeight: 700 }}
            title="تنزيل ملف معاينة جاهز بنفس الأعمدة والتعبئة لتعديله ورفعه"
          >
            <FileSpreadsheet size={15} style={{ color: meta.accent }} /> تنزيل ملف معاينة للتعبئة (.xlsx)
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCurrent}
            style={{ background: '#fff', borderColor: meta.borderLight, color: '#0f172a', fontWeight: 700 }}
            title="تصدير البيانات الحالية من المنصة إلى ملف Excel"
          >
            <Download size={15} style={{ color: '#059669' }} /> تصدير الملف الحالي (.xlsx)
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            style={{ background: meta.accent, borderColor: meta.accent }}
          >
            <Upload size={15} /> {parsing ? 'جاري قراءة الملف...' : 'رفع واستيراد ملف معبأ (.xlsx)'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          className="alert-banner warn"
          style={{ marginTop: 10, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>
            <AlertTriangle size={15} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
            {errorMsg}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setErrorMsg('')}>
            <X size={13} />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          className="alert-banner teal"
          style={{ marginTop: 10, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>
            <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
            {successMsg}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSuccessMsg('')}>
            <X size={13} />
          </button>
        </div>
      )}

      {previewData && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            background: '#ffffff',
            borderRadius: 10,
            border: `2px solid ${meta.accent}`,
          }}
        >
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>
                <Sparkles size={15} style={{ verticalAlign: 'middle', marginLeft: 6, color: meta.accent }} />
                معاينة الملف المرفوع قبل الاستبدال: <span style={{ color: meta.accent }}>{previewData.fileName}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                {previewData.type === 'periods' &&
                  `إجمالي الفترات المقروءة: ${previewData.summary.totalPeriods} فترة (${previewData.summary.programPeriodsCount} فترات برامج تشغيلية + ${previewData.summary.fixedEventsCount} أحداث ثابتة)`}
                {previewData.type === 'schedule' &&
                  `الصيغة: ${previewData.summary.format} — إجمالي الحصص المقروءة: ${previewData.summary.totalSlots} حصة لعدد ${previewData.summary.teachersCount} معلم/موظف`}
                {previewData.type === 'supervision' &&
                  `إجمالي صفوف الإشراف المقروءة: ${previewData.summary.dutiesCount} صفاً — التعليمات: ${previewData.summary.instructionsCount} — المعايير: ${previewData.summary.criteriaCount}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-teal btn-sm" onClick={handleConfirmImport}>
                <CheckCircle2 size={15} /> حذف السابق واعتماد الملف الجديد فوراً
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreviewData(null)}>
                <X size={14} /> إلغاء
              </button>
            </div>
          </div>

          <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {previewData.type === 'periods' && (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الفترة</th>
                    <th>الوقت (للعرض)</th>
                    <th>من (24س)</th>
                    <th>إلى (24س)</th>
                    <th>التصنيف</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.periods.map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.order}</td>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td dir="ltr" style={{ textAlign: 'right', fontWeight: 700 }}>{p.displayTime}</td>
                      <td dir="ltr">{p.startTime}</td>
                      <td dir="ltr">{p.endTime}</td>
                      <td>{p.category === 'program_period' ? 'فترة برامج' : 'حدث ثابت'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {previewData.type === 'schedule' && (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>المعلم / الموظف</th>
                    <th>اليوم</th>
                    <th>الفترة</th>
                    <th>النشاط / المادة</th>
                    <th>الفئة / النطاق</th>
                    <th>الموقع / القاعة</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.commitments.slice(0, 30).map((c, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>{c.employeeName}</td>
                      <td>{c.day}</td>
                      <td>{c.periodName}</td>
                      <td style={{ fontWeight: 700 }}>{c.activityTitle}</td>
                      <td>{(c.scopeNames || []).join(' ، ') || c.rawClassText || '-'}</td>
                      <td>{c.venueName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {previewData.type === 'supervision' && (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>م</th>
                    <th>الدور</th>
                    <th>الإشراف العام</th>
                    <th>مشرف النظام</th>
                    <th>المشرف</th>
                    <th>استقبال الطلاب</th>
                    <th>صلاة العصر</th>
                    <th>صرف الطلاب</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.supervisionDuties.map((d, idx) => (
                    <tr key={idx}>
                      <td>{d.seq}</td>
                      <td>{d.floor}</td>
                      <td style={{ fontWeight: 700 }}>{d.generalSup}</td>
                      <td>{d.systemSupervisorName}</td>
                      <td style={{ fontWeight: 700 }}>{d.supervisorName}</td>
                      <td>{d.receptionLocation}</td>
                      <td>
                        {d.asrPrayer?.location} {d.asrPrayer?.row ? `(صف ${d.asrPrayer.row})` : ''}
                      </td>
                      <td>{d.dismissalLocation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
