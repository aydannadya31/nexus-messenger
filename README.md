# Nexus Messenger

Real-time messaging app with voice/video calls and admin panel.

## Canlı Site

[https://aydannadya31.github.io/nexus-messenger/](https://aydannadya31.github.io/nexus-messenger/)

## Tanıtım

**Hızlı. Ücretsiz. Kurulumsuz.** Arkadaşlarınla ve gruplarınla yazış, ara, paylaş — hepsi tarayıcında, tek tıkla. İndirmek, kurmak yok.

📄 [Tanıtım PDF'ini indir](https://aydannadya31.github.io/nexus-messenger/AFCB-Messenger-Tanitim.pdf)

### Neler Yapabilirsin?

- **Anlık Mesajlaşma** — Arkadaşlarınla birebir veya grupta yazış; resim, video, ses ve dosya gönder.
- **Arkadaşlık Sistemi** — Kişilerden arkadaş ekle, istek gönder; ülke filtresiyle yeni insanlar keşfet.
- **Grup Sohbetleri** — Şifresiz gruplara anında katıl, şifrelilere şifrenle gir; yönetici devri ve üye yönetimiyle.
- **Sesli & Görüntülü Arama** — Tek dokunuşla ara. LiveKit, Agora ve yedek bağlantı motorlarıyla kesintisiz görüşme.
- **15 Saniyelik Video** — Uygulama içinde anında video kaydet ve paylaş; kayıt 15 saniyede kendiliğinden durur.
- **Tamamen Ücretsiz** — Abonelik, lisans, kurulum yok. Tarayıcını aç, hemen kullan.

### Gizlilik Senin Elinde

- **Tek Bakışlık Mesajlar** — Gönderdiğin özel mesaj karşı tarafça bir kez görülür; sonra kaybolur.
- **Şifreli Mesajlar** — Hassas konuşmaların şifreli olarak saklanır, sadece senin erişimin vardır.
- **Mesaj Geçmişi PDF Aktarımı** — Sohbetini yazı olarak PDF'e kaydet; fotoğraflar, videolar ve sesler aynı klasöre kendi formatlarında ayrı olarak iner.
- **Yakınlaştır ve İndir** — Resme tıkla, istediğin kadar yakınlaş, sürükleyerek gez. Bastır ve indir ile tek hamlede kaydet.
- **Emoji ve Profil** — Duygunu emojiyle anlat; profilinde takma adın, ülken ve doğum tarihin seni tanır.
- **Spam Koruması** — Dakikada 3 mesaj limiti istenmeyen kalabalığı önler, sohbetler temiz kalır.

## Local Development

```bash
npm install
npm run dev
```

## Deploy

### GitHub Pages (otomatik)
`main` branch'ine push yapıldığında GitHub Actions ile otomatik build alıp deploy eder.

### Firestore Rules & Indexes

Firestore güvenlik kuralları **named database**'e deploy edilmelidir:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules:ai-studio-6f70c272-6822-4c0b-a15d-b77d18f46fb0
firebase deploy --only firestore:indexes
```

### Firebase Auth (Google Sign-In)
Firebase Console > Authentication > Settings > Authorized domains:
- `aydannadya31.github.io` eklenmeli (yoksa `auth/unauthorized-domain` hatası)

## Firebase Project

- Project ID: `gen-lang-client-0308378658`
- Database: `ai-studio-6f70c272-6822-4c0b-a15d-b77d18f46fb0` (named)
