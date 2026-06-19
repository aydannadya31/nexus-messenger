import React, { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from '../lib/toast';
import { UserProfile } from '../types';
import { X, Check, User, Info, Wifi, Camera, Upload, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  readOnly?: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose, readOnly }) => {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [nickname, setNickname] = useState(user.nickname || '');
  const [about, setAbout] = useState(user.about || '');
  const [onlineStatus, setOnlineStatus] = useState(user.onlineStatus || 'online');
  const [photoURL, setPhotoURL] = useState(user.photoURL);
  const [birthDate, setBirthDate] = useState(user.birthDate || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [location, setLocation] = useState(user.location || '');
  const [showBirthDate, setShowBirthDate] = useState(user.showBirthDate ?? true);
  const [showPhone, setShowPhone] = useState(user.showPhone ?? true);
  const [showLocation, setShowLocation] = useState(user.showLocation ?? true);
  const [saving, setSaving] = useState(false);
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isReadOnly = readOnly === true;

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalPhotoURL = photoURL;
      if (photoURL && photoURL.startsWith('data:')) {
        const { uploadProfilePhoto } = await import('../lib/storage');
        finalPhotoURL = await uploadProfilePhoto(photoURL, user.uid);
        setPhotoURL(finalPhotoURL);
      }
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        uid: user.uid,
        displayName,
        nickname,
        about,
        onlineStatus,
        photoURL: finalPhotoURL,
        birthDate,
        phone,
        location,
        showBirthDate,
        showPhone,
        showLocation
      });
      onClose();
    } catch (error) {
      console.error("Profile update error:", error);
      addToast("Profil kaydedilirken hata oluştu.", 'error');
    } finally {
      setSaving(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      addToast("Kameraya erişilemedi.", 'error');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Use a smaller size for Base64 storage in Firestore (1MB limit)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPhotoURL(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) { // 500KB limit for demo simplicity
        addToast("Dosya çok büyük (maks 500KB).", 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const statusOptions = [
    { value: 'online', label: 'Çevrimiçi', color: 'bg-green-500' },
    { value: 'away', label: 'Uzakta', color: 'bg-amber-500' },
    { value: 'busy', label: 'Meşgul', color: 'bg-red-500' }
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-blue-600 p-6 flex justify-between items-center text-white">
          <div>
            <h2 className="text-xl font-black tracking-tight">{isReadOnly ? 'Kullanıcı Bilgisi' : 'Profilini Düzenle'}</h2>
            <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mt-1">UIN NO: {user.uin}</p>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {/* Photo Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-3xl overflow-hidden bg-slate-100 border-4 border-slate-50 shadow-xl relative">
                {isCameraActive ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover mirror"
                  />
                ) : (
                  <img 
                    src={photoURL} 
                    alt="Profil" 
                    className="w-full h-full object-cover" 
                  />
                )}
                
                {isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <button 
                      onClick={capturePhoto}
                      className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-slate-900" />
                    </button>
                  </div>
                )}
              </div>

              {!isCameraActive && !isReadOnly && (
                <div className="absolute -bottom-2 -right-2 flex gap-1">
                  <button 
                    onClick={startCamera}
                    className="p-2 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-colors"
                    title="Kamera ile çek"
                  >
                    <Camera size={16} />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 bg-slate-800 text-white rounded-xl shadow-lg hover:bg-slate-900 transition-colors"
                    title="Dosya yükle"
                  >
                    <Upload size={16} />
                  </button>
                </div>
              )}
              
              {isCameraActive && (
                 <button 
                  onClick={stopCamera}
                  className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-lg shadow-lg"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileUpload} 
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <User size={12} className="text-blue-500" /> Görünür İsim
            </label>
            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              readOnly={isReadOnly}
              className={cn("w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300", isReadOnly && "opacity-70 cursor-default")}
              placeholder="İsminiz..."
            />
          </div>

          {/* Nickname */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <User size={12} className="text-purple-500" /> Takma Ad
            </label>
            <input 
              type="text" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              readOnly={isReadOnly}
              className={cn("w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all placeholder:text-slate-300", isReadOnly && "opacity-70 cursor-default")}
              placeholder="Takma adınız (opsiyonel)..."
            />
          </div>

          {/* Online Status */}
          <div className="space-y-3">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Wifi size={12} className="text-blue-500" /> Durum
            </label>
            <div className="flex gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => !isReadOnly && setOnlineStatus(opt.value as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-bold text-xs uppercase tracking-tighter",
                    onlineStatus === opt.value 
                      ? "border-blue-500 bg-blue-50 text-blue-600 shadow-md shadow-blue-500/10" 
                      : "border-slate-100 bg-white text-slate-400 hover:border-slate-200",
                    isReadOnly && "cursor-default"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", opt.color)} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* About */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Info size={12} className="text-blue-500" /> Hakkında / Durum Mesajı
            </label>
            <textarea 
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              readOnly={isReadOnly}
              rows={3}
              className={cn("w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none placeholder:text-slate-300", isReadOnly && "opacity-70 cursor-default")}
              placeholder="Neler yapıyorsun?"
            />
          </div>

          {/* Birth Date */}
          <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  🎂 Doğum Tarihi
                </label>
                {!isReadOnly && (
                <button onClick={() => setShowBirthDate(!showBirthDate)}
                  className={cn("text-[9px] font-bold px-2 py-1 rounded-lg transition-all", showBirthDate ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400")}>
                  {showBirthDate ? 'Gösteriliyor' : 'Gizli'}
                </button>
                )}
              </div>
            <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
              readOnly={isReadOnly}
              className={cn("w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 outline-none transition-all", isReadOnly && "opacity-70 cursor-default")} />
          </div>

          {/* Phone */}
          <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  📞 Telefon No.
                </label>
                {!isReadOnly && (
                <button onClick={() => setShowPhone(!showPhone)}
                  className={cn("text-[9px] font-bold px-2 py-1 rounded-lg transition-all", showPhone ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400")}>
                  {showPhone ? 'Gösteriliyor' : 'Gizli'}
                </button>
                )}
              </div>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+90 5XX XXX XXXX"
              readOnly={isReadOnly}
              className={cn("w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 outline-none transition-all", isReadOnly && "opacity-70 cursor-default")} />
          </div>

          {/* Location */}
          <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  📍 Konum
                </label>
                {!isReadOnly && (
                <button onClick={() => setShowLocation(!showLocation)}
                  className={cn("text-[9px] font-bold px-2 py-1 rounded-lg transition-all", showLocation ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400")}>
                  {showLocation ? 'Gösteriliyor' : 'Gizli'}
                </button>
                )}
              </div>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="İstanbul, Türkiye"
              readOnly={isReadOnly}
              className={cn("w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 outline-none transition-all", isReadOnly && "opacity-70 cursor-default")} />
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-4 rounded-2xl text-sm font-black text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-widest"
            >
              {isReadOnly ? 'Kapat' : 'Vazgeç'}
            </button>
            {!isReadOnly && (
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 px-4 py-4 rounded-2xl text-sm font-black text-white shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check size={18} />
                  Kaydet
                </>
              )}
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
