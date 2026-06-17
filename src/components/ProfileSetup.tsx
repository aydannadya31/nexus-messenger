import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from '../lib/toast';
import { UserProfile } from '../types';
import { Check, Globe, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'TUR', name: 'Türkiye' }, { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' }, { code: 'DEU', name: 'Germany' },
  { code: 'FRA', name: 'France' }, { code: 'ITA', name: 'Italy' },
  { code: 'ESP', name: 'Spain' }, { code: 'RUS', name: 'Russia' },
  { code: 'CHN', name: 'China' }, { code: 'JPN', name: 'Japan' },
  { code: 'KOR', name: 'South Korea' }, { code: 'IND', name: 'India' },
  { code: 'BRA', name: 'Brazil' }, { code: 'CAN', name: 'Canada' },
  { code: 'AUS', name: 'Australia' }, { code: 'NLD', name: 'Netherlands' },
  { code: 'SWE', name: 'Sweden' }, { code: 'NOR', name: 'Norway' },
  { code: 'DNK', name: 'Denmark' }, { code: 'FIN', name: 'Finland' },
  { code: 'CHE', name: 'Switzerland' }, { code: 'AUT', name: 'Austria' },
  { code: 'POL', name: 'Poland' }, { code: 'UKR', name: 'Ukraine' },
  { code: 'GRC', name: 'Greece' }, { code: 'EGY', name: 'Egypt' },
  { code: 'ZAF', name: 'South Africa' }, { code: 'ARE', name: 'United Arab Emirates' },
  { code: 'SAU', name: 'Saudi Arabia' }, { code: 'MEX', name: 'Mexico' },
  { code: 'ARG', name: 'Argentina' }, { code: 'IRN', name: 'Iran' },
  { code: 'IDN', name: 'Indonesia' }, { code: 'MYS', name: 'Malaysia' },
  { code: 'SGP', name: 'Singapore' }, { code: 'PHL', name: 'Philippines' },
  { code: 'VNM', name: 'Vietnam' }, { code: 'THA', name: 'Thailand' },
  { code: 'PRT', name: 'Portugal' }, { code: 'ROU', name: 'Romania' },
  { code: 'BGR', name: 'Bulgaria' }, { code: 'SRB', name: 'Serbia' },
  { code: 'HRV', name: 'Croatia' }, { code: 'BIH', name: 'Bosnia and Herzegovina' },
  { code: 'ALB', name: 'Albania' }, { code: 'GEO', name: 'Georgia' },
  { code: 'AZE', name: 'Azerbaijan' }, { code: 'KAZ', name: 'Kazakhstan' },
  { code: 'ISR', name: 'Israel' }, { code: 'MAR', name: 'Morocco' },
  { code: 'PAK', name: 'Pakistan' }, { code: 'BGD', name: 'Bangladesh' },
  { code: 'NGA', name: 'Nigeria' }, { code: 'KEN', name: 'Kenya' },
  { code: 'COL', name: 'Colombia' }, { code: 'CHL', name: 'Chile' },
  { code: 'PER', name: 'Peru' }, { code: 'CUB', name: 'Cuba' },
  { code: 'IRL', name: 'Ireland' }, { code: 'NZL', name: 'New Zealand' },
  { code: 'HUN', name: 'Hungary' }, { code: 'CZE', name: 'Czech Republic' },
  { code: 'SVK', name: 'Slovakia' }, { code: 'SVN', name: 'Slovenia' },
  { code: 'LTU', name: 'Lithuania' }, { code: 'LVA', name: 'Latvia' },
  { code: 'EST', name: 'Estonia' }, { code: 'BLR', name: 'Belarus' },
  { code: 'MDA', name: 'Moldova' }, { code: 'MKD', name: 'North Macedonia' },
  { code: 'MNE', name: 'Montenegro' }, { code: 'TKM', name: 'Turkmenistan' },
  { code: 'UZB', name: 'Uzbekistan' }, { code: 'TJK', name: 'Tajikistan' },
  { code: 'KGZ', name: 'Kyrgyzstan' }, { code: 'MNG', name: 'Mongolia' },
];

interface ProfileSetupProps {
  isOpen: boolean;
  photoURL: string;
  displayName: string;
  nickname: string;
  about: string;
  country: string;
  userUid: string;
  onSave: (data: {
    displayName: string;
    nickname: string;
    about: string;
    country: string;
    uin: string;
    photoURL: string;
  }) => Promise<void>;
  onComplete: () => void;
}

export const ProfileSetup: React.FC<ProfileSetupProps> = ({
  isOpen, photoURL, displayName: initialDisplayName,
  nickname: initialNickname, about: initialAbout,
  country: initialCountry, userUid, onSave, onComplete
}) => {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [setupDisplayName, setSetupDisplayName] = useState(initialDisplayName);
  const [setupNickname, setSetupNickname] = useState(initialNickname);
  const [setupAbout, setSetupAbout] = useState(initialAbout);
  const [setupCountry, setSetupCountry] = useState(initialCountry);
  const [setupUIN, setSetupUIN] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSetupDisplayName(initialDisplayName);
    setSetupNickname(initialNickname);
    setSetupAbout(initialAbout);
    setSetupCountry(initialCountry);
  }, [initialDisplayName, initialNickname, initialAbout, initialCountry]);

  const handleSave = async () => {
    if (!setupDisplayName.trim() || !setupCountry || saving) return;
    setSaving(true);
    const uin = `${setupCountry}-${Math.floor(10000000 + Math.random() * 90000000)}`;
    setSetupUIN(uin);
    try {
      await onSave({
        displayName: setupDisplayName.trim(),
        nickname: setupNickname.trim() || setupDisplayName.trim(),
        about: setupAbout.trim(),
        country: setupCountry,
        uin,
        photoURL,
      });
      setStep(2);
    } catch {
      addToast('Kayıt sırasında hata oluştu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {step === 1 ? (
            <>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-6 text-white">
                <h2 className="text-xl font-black tracking-tight">Profilini Oluştur</h2>
                <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mt-1">Hesabını tamamla</p>
              </div>
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-center mb-2">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-4 border-slate-50 shadow-lg">
                    <img src={photoURL} alt="" className="w-full h-full object-cover" />
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

                <button disabled={!setupDisplayName.trim() || !setupCountry || saving}
                  onClick={handleSave}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-2xl font-black uppercase tracking-wider text-sm transition-all shadow-xl shadow-blue-200"
                >
                  {saving ? (
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
                  <img src={photoURL} alt="" className="w-full h-full object-cover" />
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

                <button onClick={onComplete}
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
  );
};

export default ProfileSetup;
