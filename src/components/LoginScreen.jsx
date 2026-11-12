import React, { useState } from 'react';
import { LogIn, Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { useOps } from '../engine/store';

export default function LoginScreen({ onLoggedIn }) {
  const { state, loginWithCredentials } = useOps();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSubmitting(true);
    try {
      const res = await loginWithCredentials(username, password);
      if (!res.ok) {
        setLoginError(res.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      } else if (onLoggedIn) {
        onLoggedIn(res.user);
      }
    } catch {
      setLoginError('حدث خطأ أثناء التحقق من بيانات الحساب. حاول مجددًا.');
    } finally {
      setSubmitting(false);
    }
  };

  const adminClub = state.administrations?.[0]?.name || 'نادي تراؤف للبنين';

  return (
    <div className="login-page">
      <div className="login-shell view-anim" style={{ maxWidth: 960 }}>
        {/* Right Brand Banner */}
        <div className="login-brand-side">
          <div>
            <div
              style={{
                background: 'rgba(255,255,255,0.96)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.68rem 1.15rem',
                borderRadius: '16px',
                marginBottom: '1.6rem',
                boxShadow: '0 8px 25px rgba(0,0,0,0.12)',
              }}
            >
              <img src="./logo.png" alt="شعار تراؤف - منافذ" style={{ height: 48, objectFit: 'contain' }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#00A59B', fontWeight: 800, fontSize: '0.98rem' }}>منصة منافذ التشغيلية</div>
                <div style={{ color: '#3E4559', fontSize: '0.74rem', fontWeight: 700 }}>{adminClub} — حفر الباطن</div>
              </div>
            </div>

            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.4, marginBottom: '0.9rem' }}>
              المنصة الإلكترونية الداخلية المتكاملة لإدارة أعمال وبرامج الأقسام
            </h1>
            <p style={{ fontSize: '0.9rem', opacity: 0.94, lineHeight: 1.75 }}>
              المرجع التشغيلي الموحد لبرامج الأقسام، الجداول المعتمدة، الإشراف اليومي، القاعات والفئات الطلابية، الكشف الذكي للتعارضات، واعتماد الاستثناءات.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.65rem',
              marginTop: '1.75rem',
            }}
          >
            {[
              { num: adminClub, sub: 'الإدارة المعتمدة' },
              { num: `${state.departments.length} أقسام تشغيلية`, sub: 'مرتبطة بالهيكل التنظيمي' },
              { num: `${state.programsCatalog.length} برنامجًا معتمدًا`, sub: 'مترابطة مع الخطط والفترات' },
              { num: `${state.venues.length} قاعة وموقعًا`, sub: `${state.scopes.length} نطاقًا طلابيًا` },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.14)',
                  border: '1px solid rgba(255,255,255,0.24)',
                  borderRadius: '12px',
                  padding: '0.72rem 0.88rem',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>{item.num}</div>
                <div style={{ fontSize: '0.73rem', opacity: 0.9 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Left Dedicated Credentials Form ONLY (Req #2 & #3) */}
        <div
          className="login-form-side"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '2.4rem 2.2rem',
          }}
        >
          <div style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(0,165,155,0.1)',
                color: 'var(--brand-teal)',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: '0.75rem',
                fontWeight: 800,
                marginBottom: '0.7rem',
              }}
            >
              <ShieldCheck size={14} />
              <span>دخول موثّق حسب الحساب الشخصي والصلاحيات المعتمدة</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-ink)' }}>
              تسجيل الدخول إلى حسابك
            </h2>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.65 }}>
              أدخل اسم المستخدم وكلمة المرور الخاصة بك؛ يتعرف النظام تلقائيًا على إدارتك وقسمك وجدولك وصلاحياتك المعتمدة.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.05rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
                اسم المستخدم
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={17}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingRight: 38, height: 44, fontSize: '0.92rem' }}
                  placeholder="أدخل اسم المستخدم الخاص بك"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
                كلمة المرور
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={17}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingRight: 38, paddingLeft: 40, height: 44, fontSize: '0.92rem' }}
                  placeholder="أدخل كلمة المرور"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  borderRadius: 10,
                  padding: '0.7rem 0.9rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{
                height: 46,
                fontSize: '0.96rem',
                fontWeight: 800,
                justifyContent: 'center',
                marginTop: 4,
              }}
            >
              <LogIn size={18} />
              <span>{submitting ? 'جاري التحقق وتسجيل الدخول...' : 'تسجيل الدخول'}</span>
            </button>
          </form>

          <div
            style={{
              marginTop: '1.6rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)',
              fontSize: '0.76rem',
              color: 'var(--text-muted)',
              lineHeight: 1.65,
            }}
          >
            في حال نسيان كلمة المرور أو الحاجة إلى تفعيل الحساب، يرجى التواصل مع مدير النظام أو رئيس القسم المختص.
          </div>
        </div>
      </div>
    </div>
  );
}
