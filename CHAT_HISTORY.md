# AFCB Messenger - Sohbet Geçmişi

## Session: 4 Haziran 2026

### Özet
Firebase + GitHub Pages tabanlı bir chat uygulaması geliştiriliyor. Yönetici paneli, sesli/görüntülü arama, AI entegrasyonu, profil senkronizasyonu ve Firestore güvenlik kuralları var.

### Yapılan Değişiklikler

#### Tip Tanımları (`src/types.ts`)
- `Call` arayüzüne `mediaType: 'audio' | 'video'` eklendi
- `UserProfile` tipine `nickname`, `bannedUntil`, `role` alanları eklendi
- `Message` tipine `deletedBy`, `reactions`, `toAdmin` eklendi
- `EthicsRule` arayüzü eklendi (`id`, `label`, `enabled`)
- `AISettings` tipinde `ethicsFilter: boolean` kaldırıldı, `ethicsRules: EthicsRule[]` eklendi

#### Yönetici Ayarları (`src/lib/adminSettings.ts`)
- Varsayılan 7 etik kural: Küfür/Hakaret, Şiddet, Spam, NSFW, Asimov'un 3 Yasası

#### Firestore Kuralları (`firestore.rules`)
- Chat/message/call kurallarına `|| isAdmin()` eklendi
- `mediaType` validasyonu eklendi
- `videoUrl` limiti 2MB, `audioUrl` limiti 1.2MB

#### Call Sistemi (`CallProvider.tsx`, `CallOverlay.tsx`)
- `startCall` artık `mediaType` parametresi alıyor
- Private aramalar `'calling'` statüsünde başlıyor (grup `'ongoing'`)
- Aramalara arka plan karartma eklendi
- Sesli aramalar sadece mikrofon istiyor

#### Chat Alanı (`ChatArea.tsx`)
- Video kaydı için ayrı dialog modalı eklendi (kamera önizleme, ön/arka kamera değiştirme, 10sn kayıt, gönder/iptal)
- `participantInfo` için `onSnapshot` kullanılıyor
- Profil kartı gösterme (avatar/isim tıklaması)
- Limitler 2MB'a yükseltildi
- Video arama butonu kaldırıldı (sadece sesli arama)

#### Profil Modalı (`ProfileModal.tsx`)
- `updateDoc` çağrısına `uid` alanı eklendi
- Hata durumunda `alert()` gösteriliyor

#### Yönetici Paneli (`AdminPanel.tsx`)
- Açılışta `role: 'admin'` tekrar atanıyor
- Etik kuralları için ekleme/silme/düzenleme/taşıma butonları
- Varsayılan 7 kural gösteriliyor

#### Kenar Çubuğu (`Sidebar.tsx`)
- Her private chat katılımcısı için `onSnapshot` ile canlı profil güncelleme

#### GitHub Actions (`.github/workflows/deploy.yml`)
- `VITE_GEMINI_API_KEY` GitHub Secret'ı build ortamına aktarılıyor

#### `.env`
- Gemini API key eklendi (gitignored)

### Açık Sorunlar
1. **Admin panel**: "Kullanıcı mesajları yüklenirken bir hata oluştu" – Firestore kuralları doğru veritabanına yayınlanmadı
2. **Sesli arama**: Karşı tarafta beyaz ekran sorunu – düzeltildi (arka plan karartma eklendi)
3. **Video kaydı**: Tam dialog modalı eklendi – test edilecek
4. **Profil güncelleme**: Kenar çubuğunda hala güncellenmiyor – kullanıcı yeniden giriş yapmalı
5. **AI çalışmıyor**: GitHub Secret `VITE_GEMINI_API_KEY` eklenmedi – eklenecek

### Kritik Notlar
- **Firebase projesi**: `gen-lang-client-0308378658`
- **Named database**: `ai-studio-6f70c272-6822-4c0b-a15d-b77d18f46fb0`
- **Admin şifresi**: `Ag1453ag!`
- **Gemini API key**: `AIzaSyD--X4XZOuSwGDxBQMYBNb0WDScr-Utn38`
- **App URL**: `https://aydannadya31.github.io/nexus-messenger/`
- **Silme modeli**: `deletedBy: string[]` – sadece kullanıcının ekranından gizler; admin kalıcı olarak silebilir

### Yapılacaklar
1. Firestore kurallarını doğru veritabanına yayınla
2. GitHub Secret ekle ve redeploy yap
3. Video kaydını test et
4. Sesli aramayı test et
5. Profil güncellemelerini test et
