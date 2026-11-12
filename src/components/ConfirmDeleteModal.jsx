import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, ShieldCheck, CheckSquare } from 'lucide-react';
import { ENTITY_TYPE_LABELS_AR } from '../engine/permissions';

/**
 * Unified Safe-Delete Confirmation Dialog (Req #40, #41, #42 + Bulk Delete v4.1)
 * Supports both single item deletion and bulk selection deletion ("تحديد الكل + حذف المحدد").
 */
export default function ConfirmDeleteModal({
  isOpen,
  entityType,
  entityTitle,
  items = null, // Optional array of { entityType, entityId, parentId, entityTitle } for bulk delete
  extraNote = '',
  onCancel,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCancel = onCancel || onClose || (() => {});
  const isBulk = Array.isArray(items) && items.length > 0;
  const bulkCount = isBulk ? items.length : 1;
  const primaryType = isBulk ? items[0]?.entityType || entityType : entityType;
  const typeLabel = ENTITY_TYPE_LABELS_AR[primaryType] || 'عنصر';

  return (
    <div className="modal-backdrop" style={{ zIndex: 1300 }} onClick={handleCancel}>
      <div
        className="modal-panel"
        style={{ maxWidth: isBulk ? 560 : 490 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ borderBottomColor: '#fecaca', background: 'rgba(239,68,68,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(239,68,68,0.14)',
                color: '#dc2626',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#991b1b' }}>
                {isBulk
                  ? `هل أنت متأكد من حذف (${bulkCount}) عناصر محددة؟`
                  : 'هل أنت متأكد من حذف هذا العنصر؟'}
              </h3>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                نوع العنصر: {typeLabel} {isBulk ? `— حذف جماعي (${bulkCount})` : ''}
              </div>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={handleCancel} title="إلغاء">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div
            style={{
              padding: '0.75rem 0.9rem',
              borderRadius: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: '0.73rem',
                color: 'var(--text-muted)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isBulk && <CheckSquare size={14} color="#dc2626" />}
              <span>{isBulk ? `العناصر المحددة للحذف الجماعي (${bulkCount}):` : 'العنصر المحدد للحذف:'}</span>
            </div>

            {isBulk ? (
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 165,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  paddingLeft: 4,
                }}
              >
                {items.map((it, idx) => (
                  <div
                    key={`${it.entityType}-${it.entityId}-${idx}`}
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--brand-ink)',
                      padding: '0.32rem 0.55rem',
                      borderRadius: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span>
                      {idx + 1}. {it.entityTitle || it.entityId}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.66rem' }}>
                      {ENTITY_TYPE_LABELS_AR[it.entityType] || it.entityType}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--brand-ink)', marginTop: 2 }}>
                {entityTitle || '—'}
              </div>
            )}

            {extraNote && (
              <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: 6 }}>{extraNote}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">سبب الحذف (اختياري — يُوثّق في سجل الحذف):</label>
            <input
              type="text"
              className="form-input"
              placeholder="اكتب سبب الحذف لتوثيقه في السجل..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '0.65rem 0.8rem',
              borderRadius: 10,
              background: 'rgba(0,165,155,0.06)',
              border: '1px solid rgba(0,165,155,0.22)',
              fontSize: '0.75rem',
              color: 'var(--text)',
            }}
          >
            <ShieldCheck size={16} color="var(--brand-teal)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>حذف آمن ومؤرشف:</strong>{' '}
              {isBulk
                ? `تُخفى العناصر المحددة (${bulkCount}) من الاستخدام النشط دفعة واحدة مع حفظ كامل ارتباطاتها وسجلها التاريخي، ويمكن لمدير النظام استرجاعها في أي وقت من «سلة المحذوفات والاسترجاع».`
                : 'يُخفى العنصر من الاستخدام النشط مع حفظ كامل ارتباطاته وسجله التاريخي، ويمكن لمدير النظام استرجاعه في أي وقت من «سلة المحذوفات والاسترجاع».'}
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={handleCancel}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onConfirm(reason.trim() || (isBulk ? `حذف جماعي موثق (${bulkCount} عناصر)` : 'حذف إداري موثق'))}
          >
            <Trash2 size={15} />
            <span>{isBulk ? `تأكيد حذف المحدد (${bulkCount})` : 'تأكيد الحذف'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
