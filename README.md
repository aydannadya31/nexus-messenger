# Nexus Messenger

Real-time messaging app with voice/video calls and admin panel.

## Canlı Site

[https://aydannadya31.github.io/nexus-messenger/](https://aydannadya31.github.io/nexus-messenger/)

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
