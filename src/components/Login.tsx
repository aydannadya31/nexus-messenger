import React, { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { LogIn, Shield, Zap, Globe, Lock, Check, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPanel } from './AdminPanel';

export const Login: React.FC = () => {
  const { user, profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [setupDisplayName, setSetupDisplayName] = useState('');
  const [setupNickname, setSetupNickname] = useState('');
  const [setupAbout, setSetupAbout] = useState('');
  const [setupCountry, setSetupCountry] = useState('');
  const [setupPhotoURL, setSetupPhotoURL] = useState('');
  const [setupUIN, setSetupUIN] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const COUNTRIES = [
    { code: 'TUR', name: 'Türkiye' },
    { code: 'USA', name: 'United States' },
    { code: 'GBR', name: 'United Kingdom' },
    { code: 'DEU', name: 'Germany' },
    { code: 'FRA', name: 'France' },
    { code: 'ITA', name: 'Italy' },
    { code: 'ESP', name: 'Spain' },
    { code: 'RUS', name: 'Russia' },
    { code: 'CHN', name: 'China' },
    { code: 'JPN', name: 'Japan' },
    { code: 'KOR', name: 'South Korea' },
    { code: 'IND', name: 'India' },
    { code: 'BRA', name: 'Brazil' },
    { code: 'CAN', name: 'Canada' },
    { code: 'AUS', name: 'Australia' },
    { code: 'NLD', name: 'Netherlands' },
    { code: 'SWE', name: 'Sweden' },
    { code: 'NOR', name: 'Norway' },
    { code: 'DNK', name: 'Denmark' },
    { code: 'FIN', name: 'Finland' },
    { code: 'CHE', name: 'Switzerland' },
    { code: 'AUT', name: 'Austria' },
    { code: 'POL', name: 'Poland' },
    { code: 'UKR', name: 'Ukraine' },
    { code: 'GRC', name: 'Greece' },
    { code: 'EGY', name: 'Egypt' },
    { code: 'ZAF', name: 'South Africa' },
    { code: 'ARE', name: 'United Arab Emirates' },
    { code: 'SAU', name: 'Saudi Arabia' },
    { code: 'MEX', name: 'Mexico' },
    { code: 'ARG', name: 'Argentina' },
    { code: 'IRN', name: 'Iran' },
    { code: 'IDN', name: 'Indonesia' },
    { code: 'MYS', name: 'Malaysia' },
    { code: 'SGP', name: 'Singapore' },
    { code: 'PHL', name: 'Philippines' },
    { code: 'VNM', name: 'Vietnam' },
    { code: 'THA', name: 'Thailand' },
    { code: 'PRT', name: 'Portugal' },
    { code: 'ROU', name: 'Romania' },
    { code: 'BGR', name: 'Bulgaria' },
    { code: 'SRB', name: 'Serbia' },
    { code: 'HRV', name: 'Croatia' },
    { code: 'BIH', name: 'Bosnia and Herzegovina' },
    { code: 'ALB', name: 'Albania' },
    { code: 'GEO', name: 'Georgia' },
    { code: 'AZE', name: 'Azerbaijan' },
    { code: 'KAZ', name: 'Kazakhstan' },
    { code: 'ISR', name: 'Israel' },
    { code: 'MAR', name: 'Morocco' },
    { code: 'PAK', name: 'Pakistan' },
    { code: 'BGD', name: 'Bangladesh' },
    { code: 'NGA', name: 'Nigeria' },
    { code: 'KEN', name: 'Kenya' },
    { code: 'COL', name: 'Colombia' },
    { code: 'CHL', name: 'Chile' },
    { code: 'PER', name: 'Peru' },
    { code: 'CUB', name: 'Cuba' },
    { code: 'IRL', name: 'Ireland' },
    { code: 'NZL', name: 'New Zealand' },
    { code: 'HUN', name: 'Hungary' },
    { code: 'CZE', name: 'Czech Republic' },
    { code: 'SVK', name: 'Slovakia' },
    { code: 'SVN', name: 'Slovenia' },
    { code: 'LTU', name: 'Lithuania' },
    { code: 'LVA', name: 'Latvia' },
    { code: 'EST', name: 'Estonia' },
    { code: 'BLR', name: 'Belarus' },
    { code: 'MDA', name: 'Moldova' },
    { code: 'MKD', name: 'North Macedonia' },
    { code: 'MNE', name: 'Montenegro' },
    { code: 'TKM', name: 'Turkmenistan' },
    { code: 'UZB', name: 'Uzbekistan' },
    { code: 'TJK', name: 'Tajikistan' },
    { code: 'KGZ', name: 'Kyrgyzstan' },
    { code: 'MNG', name: 'Mongolia' },
  ];

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setError(`Firebase yetkilendirme hatası. "${domain}" domaini Firebase'de tanımlı değil.\n\nŞu adrese gidip aşağıdaki domainleri ekleyin:\nhttps://console.firebase.google.com/project/gen-lang-client-0308378658/authentication/settings\n\nFirebase Console > Authentication > Settings > Authorized domains:\n• localhost\n• aydannadya31.github.io\n• ${domain}`);
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Popup engellendi. Lütfen popup engelleyicinizi kapatın ve tekrar deneyin.');
      } else if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setError(null);
      } else {
        setError(err?.message || 'Giriş yapılırken bir hata oluştu.');
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (user && profile && !profile.profileCompleted) {
      setSetupDisplayName(profile.displayName || user.displayName || '');
      setSetupNickname(profile.nickname || '');
      setSetupPhotoURL(profile.photoURL || user.photoURL || '');
      setShowProfileSetup(true);
    }
  }, [user, profile]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <style>{`
        @keyframes spin3D {
          0% { transform: rotateY(0deg) rotateX(10deg); }
          100% { transform: rotateY(360deg) rotateX(10deg); }
        }
        @keyframes shine {
          0%, 90% { color: #0f172a !important; text-shadow: none; }
          93% { color: #3b82f6 !important; text-shadow: 0 0 15px rgba(59,130,246,0.7); transform: scale(1.02); }
          95% { color: #2563eb !important; text-shadow: 0 0 25px rgba(37,99,235,1); transform: scale(1.04); }
          97% { color: #3b82f6 !important; text-shadow: 0 0 15px rgba(59,130,246,0.7); transform: scale(1.02); }
          100% { color: #0f172a !important; text-shadow: none; transform: scale(1); }
        }
        .animate-spin-3d { animation: spin3D 10s linear infinite; transform-style: preserve-3d; }
        .animate-shine-10s { animation: shine 10s infinite ease-in-out; }
      `}</style>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-100/40 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-indigo-100/40 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 relative z-10"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-gradient-to-tr from-slate-950 to-slate-800 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/10 border border-slate-800/80 [perspective:1000px]">
            <div className="animate-spin-3d relative w-16 h-16 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-16 h-16 drop-shadow-[0_12px_20px_rgba(37,99,235,0.5)]">
                <g transform="translate(50, 50) rotate(45)">
                  <ellipse rx="38" ry="12" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="4 2" opacity="0.6" />
                </g>
                <g transform="translate(50, 50) rotate(-45)">
                  <ellipse rx="38" ry="12" fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="4 2" opacity="0.6" />
                </g>
                <path d="M50,18 L78,34 L50,50 L22,34 Z" fill="url(#topGrad)" opacity="0.9" />
                <path d="M22,34 L50,50 L50,82 L22,66 Z" fill="url(#leftGrad)" opacity="0.95" />
                <path d="M50,50 L78,34 L78,66 L50,82 Z" fill="url(#rightGrad)" opacity="0.95" />
                <circle cx="50" cy="18" r="2.5" fill="#93c5fd" />
                <circle cx="22" cy="34" r="2.5" fill="#60a5fa" />
                <circle cx="78" cy="34" r="2.5" fill="#60a5fa" />
                <circle cx="50" cy="50" r="2.5" fill="#3b82f6" />
                <circle cx="22" cy="66" r="2.5" fill="#2563eb" />
                <circle cx="78" cy="66" r="2.5" fill="#2563eb" />
                <circle cx="50" cy="82" r="2.5" fill="#1d4ed8" />
                <circle cx="50" cy="50" r="8" fill="url(#coreGrad)" className="animate-pulse" />
                <defs>
                  <linearGradient id="topGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#93c5fd" /><stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="leftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                  <linearGradient id="rightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e40af" /><stop offset="100%" stopColor="#1e3a8a" />
                  </linearGradient>
                  <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" /><stop offset="50%" stopColor="#93c5fd" stopOpacity="0.9" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </radialGradient>
                </defs>
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-3 animate-shine-10s transition-all duration-500 transform-gpu">
            A+F=C.B
          </h1>
          <p className="text-sm font-medium text-slate-500 mb-12 max-w-[280px] leading-relaxed">
            Yeni nesil iletişim protokolü ile kesintisiz ve şık bir deneyim.
          </p>

          <div className="grid grid-cols-3 gap-6 w-full mb-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-blue-600 border border-slate-100">
                <Zap size={22} />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">HIZLI</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600 border border-slate-100">
                <Shield size={22} />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">GÜVENLİ</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600 border border-slate-100">
                <Globe size={22} />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">EVRENSEL</span>
            </div>
          </div>

          {error && (
            <div className="w-full mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-600 text-center leading-relaxed">
              {error}
            </div>
          )}

          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="flex items-center justify-center w-6 h-6 bg-white/20 rounded-lg">
                  <LogIn size={16} />
                </span>
                Google ile Giriş Yap
              </>
            )}
          </button>
          
          <div className="mt-6 flex items-center gap-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em] font-black">
              NEXUS PROTOCOL v2.0
            </p>
            <button
              onClick={() => setShowAdminPassword(true)}
              className="text-[9px] text-blue-500 hover:text-blue-700 uppercase tracking-[0.15em] font-black transition-colors"
            >
              Yönetim
            </button>
          </div>
        </div>
      </motion.div>

      {showAdminPassword && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-md" onClick={() => { setShowAdminPassword(false); setAdminPassword(''); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-slate-900 mb-2">Admin Girişi</h3>
            <p className="text-[10px] text-slate-400 font-bold mb-6">Yetkili yönetici girişi için şifrenizi girin.</p>
            <input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && adminPassword === 'Ag1453ag!') {
                  setShowAdminPanel(true);
                  setShowAdminPassword(false);
                  setAdminPassword('');
                  if (user?.uid) updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
                }
              }}
              placeholder="••••••••"
              className="w-full bg-slate-100 border-none rounded-xl py-3 px-4 text-sm outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAdminPassword(false); setAdminPassword(''); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (adminPassword === 'Ag1453ag!') {
                    setShowAdminPanel(true);
                    setShowAdminPassword(false);
                    setAdminPassword('');
                    if (user?.uid) updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
                  } else {
                    alert('Hatalı şifre!');
                  }
                }}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider"
              >
                Giriş
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* Profile Setup Flow */}
      <AnimatePresence>
      {showProfileSetup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" onClick={() => {}}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {setupStep === 1 ? (
              <>
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-6 text-white">
                  <h2 className="text-xl font-black tracking-tight">Profilini Oluştur</h2>
                  <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mt-1">Hesabını tamamla</p>
                </div>
                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-center mb-2">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-4 border-slate-50 shadow-lg">
                      <img src={setupPhotoURL} alt="" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Görünür İsim *</label>
                    <input type="text" value={setupDisplayName} onChange={e => setSetupDisplayName(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all"
                      placeholder="Adın soyadın" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Takma Ad (opsiyonel)</label>
                    <input type="text" value={setupNickname} onChange={e => setSetupNickname(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-purple-500 transition-all"
                      placeholder="Sohbette görünecek isim" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hakkında / Durum</label>
                    <textarea value={setupAbout} onChange={e => setSetupAbout(e.target.value)} rows={2}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all resize-none"
                      placeholder="Ne yapıyorsun?" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Globe size={12} className="text-blue-500" /> Ülke * <span className="text-red-500">(bir daha değiştirilemez!)</span>
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <select value={setupCountry} onChange={e => setSetupCountry(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-10 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer">
                        <option value="">Ülke seçin...</option>
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[9px] text-amber-600 font-bold">⚠ Ülke bilgisi kaydedildikten sonra asla değiştirilemez!</p>
                  </div>

                  <button disabled={!setupDisplayName.trim() || !setupCountry || savingProfile}
                    onClick={async () => {
                      setSavingProfile(true);
                      const prefix = setupCountry;
                      const uin = `${prefix}-${Math.floor(10000000 + Math.random() * 90000000)}`;
                      setSetupUIN(uin);
                      try {
                        const { doc, updateDoc } = await import('firebase/firestore');
                        const { db } = await import('../lib/firebase');
                        await updateDoc(doc(db, 'users', user!.uid), {
                          displayName: setupDisplayName.trim(),
                          nickname: setupNickname.trim() || setupDisplayName.trim(),
                          about: setupAbout.trim(),
                          country: setupCountry,
                          uin: uin,
                          photoURL: setupPhotoURL,
                          onlineStatus: 'online',
                          profileCompleted: true
                        });
                        setSetupStep(2);
                      } catch (err) {
                        console.error(err);
                        alert('Kayıt sırasında hata oluştu.');
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-2xl font-black uppercase tracking-wider text-sm transition-all shadow-xl shadow-blue-200"
                  >
                    {savingProfile ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                    ) : 'Kaydet ve Devam Et'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 text-white text-center">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Check size={32} />
                  </div>
                  <h2 className="text-xl font-black tracking-tight">Profil Oluşturuldu!</h2>
                  <p className="text-green-100 text-xs font-bold mt-1">A+F/C.B Messenger'a hoş geldin</p>
                </div>
                <div className="p-8 text-center space-y-4">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden mx-auto border-4 border-white shadow-xl -mt-16 relative z-10">
                    <img src={setupPhotoURL} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{setupDisplayName}</h3>
                    {setupNickname && <p className="text-xs text-slate-500">@{setupNickname}</p>}
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-6 border border-blue-100 shadow-inner">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">SENİ NUMARAN</p>
                    <div className="text-4xl font-black text-blue-600 tracking-wider tabular-nums font-mono">
                      {setupUIN}
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold mt-3">Bu numara sana özeldir ve bir daha değiştirilemez.</p>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Kayıtlı Ülke</p>
                    <p className="text-sm font-bold text-slate-700">{COUNTRIES.find(c => c.code === setupCountry)?.name} ({setupCountry})</p>
                  </div>

                  <button onClick={() => setShowProfileSetup(false)}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-wider text-sm transition-all shadow-xl shadow-blue-200"
                  >
                    Tamam, Başlayalım!
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};
