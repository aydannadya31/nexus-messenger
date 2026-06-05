/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Login } from './components/Login';
import { NewChatModal } from './components/NewChatModal';
import { BroadcastModal } from './components/BroadcastModal';
import { CallProvider } from './components/CallProvider';
import { CallOverlay } from './components/CallOverlay';
import { cn } from './lib/utils';
import { MessageSquare, Ban, Check, Globe, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'TUR', name: 'Türkiye' },
  { code: 'USA', name: 'United States' }, { code: 'GBR', name: 'United Kingdom' },
  { code: 'DEU', name: 'Germany' }, { code: 'FRA', name: 'France' },
  { code: 'ITA', name: 'Italy' }, { code: 'ESP', name: 'Spain' },
  { code: 'RUS', name: 'Russia' }, { code: 'CHN', name: 'China' },
  { code: 'JPN', name: 'Japan' }, { code: 'KOR', name: 'South Korea' },
  { code: 'IND', name: 'India' }, { code: 'BRA', name: 'Brazil' },
  { code: 'CAN', name: 'Canada' }, { code: 'AUS', name: 'Australia' },
  { code: 'NLD', name: 'Netherlands' }, { code: 'SWE', name: 'Sweden' },
  { code: 'NOR', name: 'Norway' }, { code: 'DNK', name: 'Denmark' },
  { code: 'FIN', name: 'Finland' }, { code: 'CHE', name: 'Switzerland' },
  { code: 'AUT', name: 'Austria' }, { code: 'POL', name: 'Poland' },
  { code: 'UKR', name: 'Ukraine' }, { code: 'GRC', name: 'Greece' },
  { code: 'EGY', name: 'Egypt' }, { code: 'ZAF', name: 'South Africa' },
  { code: 'ARE', name: 'United Arab Emirates' }, { code: 'MEX', name: 'Mexico' },
  { code: 'ARG', name: 'Argentina' }, { code: 'IRN', name: 'Iran' },
  { code: 'IDN', name: 'Indonesia' }, { code: 'MYS', name: 'Malaysia' },
  { code: 'SGP', name: 'Singapore' }, { code: 'PHL', name: 'Philippines' },
  { code: 'VNM', name: 'Vietnam' }, { code: 'THA', name: 'Thailand' },
  { code: 'ROU', name: 'Romania' }, { code: 'BGR', name: 'Bulgaria' },
  { code: 'SRB', name: 'Serbia' }, { code: 'HRV', name: 'Croatia' },
  { code: 'GEO', name: 'Georgia' }, { code: 'ISR', name: 'Israel' },
  { code: 'MAR', name: 'Morocco' }, { code: 'NGA', name: 'Nigeria' },
  { code: 'COL', name: 'Colombia' }, { code: 'CHL', name: 'Chile' },
  { code: 'IRL', name: 'Ireland' }, { code: 'NZL', name: 'New Zealand' },
  { code: 'HUN', name: 'Hungary' }, { code: 'CZE', name: 'Czech Republic' },
];

function NexusApp() {
  const { user, profile, loading } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [banned, setBanned] = useState<{ until: Date; reason?: string } | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [setupDisplayName, setSetupDisplayName] = useState('');
  const [setupNickname, setSetupNickname] = useState('');
  const [setupAbout, setSetupAbout] = useState('');
  const [setupCountry, setSetupCountry] = useState('');
  const [setupUIN, setSetupUIN] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (user && profile && !profile.profileCompleted && !showProfileSetup) {
      setSetupDisplayName(profile.displayName || user.displayName || '');
      setSetupNickname(profile.nickname || '');
      setSetupAbout(profile.about || '');
      setShowProfileSetup(true);
    }
  }, [user, profile]);

  useEffect(() => {
    if (!user) { setBanned(null); return; }
    const checkBan = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data();
        if (data?.bannedUntil?.toDate?.() > new Date()) {
          setBanned({ until: data.bannedUntil.toDate(), reason: data.banReason });
        } else {
          setBanned(null);
        }
      } catch { setBanned(null); }
    };
    checkBan();
    const interval = setInterval(checkBan, 30000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="relative flex flex-col items-center">
          <div className="w-20 h-20 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin shadow-xl shadow-blue-100" />
          <MessageSquare className="absolute top-7 left-1/2 -translate-x-1/2 text-blue-600" size={28} />
          <span className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Syncing Core...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (banned) {
    const remaining = Math.max(0, Math.floor((banned.until.getTime() - Date.now()) / 1000));
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-md w-full text-center border border-slate-200">
          <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Ban size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3">Hesabınız Banlanmış</h1>
          <p className="text-sm text-slate-500 font-bold mb-6 leading-relaxed">
            Hesabınız geçici olarak askıya alınmıştır.
          </p>
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">KALAN SÜRE</p>
            <p className="text-3xl font-black text-red-600 tabular-nums tracking-tight font-mono">
              {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </p>
          </div>
          {banned.reason && (
            <p className="text-xs text-slate-500 font-medium mb-4">
              Sebep: {banned.reason}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-neutral-950">
      {/* Sidebar - hidden on mobile when chat is open */}
      <div className={cn(
        "w-full sm:w-[350px] sm:block",
        showMobileSidebar || !selectedChatId ? "block" : "hidden sm:block"
      )}>
        <Sidebar
          selectedChatId={selectedChatId}
          onSelectChat={(id) => {
            setSelectedChatId(id);
            setShowMobileSidebar(false);
          }}
          onStartNewChat={() => setIsNewChatModalOpen(true)}
          onOpenBroadcast={() => setIsBroadcastModalOpen(true)}
        />
      </div>

      {/* Chat Area - hidden on mobile when showing sidebar */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0",
        !showMobileSidebar || !selectedChatId ? "flex" : "hidden sm:flex"
      )}>
        <ChatArea
          chatId={selectedChatId || ''}
          onBack={() => setShowMobileSidebar(true)}
        />
      </div>

      {isNewChatModalOpen && (
        <NewChatModal 
          onClose={() => setIsNewChatModalOpen(false)}
          onChatCreated={(id) => {
            setSelectedChatId(id);
            setIsNewChatModalOpen(false);
            setShowMobileSidebar(false);
          }}
        />
      )}

      {isBroadcastModalOpen && (
        <BroadcastModal 
          onClose={() => setIsBroadcastModalOpen(false)}
        />
      )}

      <CallOverlay />

      {/* Profile Setup Overlay */}
      <AnimatePresence>
      {showProfileSetup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
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
                      <img src={profile?.photoURL || user?.photoURL || ''} alt="" className="w-full h-full object-cover" />
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
                      const uin = `${setupCountry}-${Math.floor(10000000 + Math.random() * 90000000)}`;
                      setSetupUIN(uin);
                      try {
                        await updateDoc(doc(db, 'users', user!.uid), {
                          displayName: setupDisplayName.trim(),
                          nickname: setupNickname.trim() || setupDisplayName.trim(),
                          about: setupAbout.trim(),
                          country: setupCountry,
                          uin,
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
                    <img src={profile?.photoURL || user?.photoURL || ''} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{setupDisplayName}</h3>
                    {setupNickname && <p className="text-xs text-slate-500">@{setupNickname}</p>}
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-6 border border-blue-100 shadow-inner">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">UIN NUMARAN</p>
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
}

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <NexusApp />
      </CallProvider>
    </AuthProvider>
  );
}
