import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { chatDict } from './i18n.chat';
import { admDict } from './i18n.admin';
import { ncDict } from './i18n.newchat';
import { upDict } from './i18n.users';

export type LangCode = 'tr' | 'en' | 'ar' | 'de' | 'fr' | 'ko' | 'zh' | 'ja' | 'hi';

export type Lang = { code: LangCode; name: string; flag: string };

export const LANGS: Lang[] = [
  { code: 'tr', name: 'Türkçe', flag: 'tr' },
  { code: 'en', name: 'English', flag: 'gb' },
  { code: 'ar', name: 'العربية', flag: 'sa' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'ko', name: '한국어', flag: 'kr' },
  { code: 'zh', name: '中文', flag: 'cn' },
  { code: 'ja', name: '日本語', flag: 'jp' },
  { code: 'hi', name: 'हिन्दी', flag: 'in' },
];

type Dict = Record<string, Partial<Record<LangCode, string>>>;

const core: Dict = {
  'app.syncing': { tr: 'Syncing Core...', en: 'Syncing Core...' },
  'app.banned': { tr: 'Hesabınız Banlanmış', en: 'Your Account Is Banned' },
  'app.bannedDesc': { tr: 'Hesabınız geçici olarak askıya alınmıştır.', en: 'Your account has been temporarily suspended.' },
  'app.remaining': { tr: 'KALAN SÜRE', en: 'TIME REMAINING' },
  'app.reason': { tr: 'Sebep:', en: 'Reason:' },

  'login.tagline': { tr: 'Yeni nesil iletişim protokolü ile kesintisiz ve şık bir deneyim.', en: 'A seamless and stylish experience with the next-generation communication protocol.', de: 'Nahtloses und elegantes Erlebnis mit dem Kommunikationsprotokoll der nächsten Generation.', fr: 'Une expérience fluide et élégante avec le protocole de communication de nouvelle génération.', ar: 'تجربة سلسة وأنيقة مع بروتوكول التواصل من الجيل الجديد.', ko: '차세대 통신 프로토콜로 끊김 없고 세련된 경험.', zh: '新一代通信协议，带来无缝优雅的体验。', ja: '次世代通信プロトコルによる途切れのないスタイリッシュな体験。', hi: 'नेक्स्ट-जेन कम्युनिकेशन प्रोटोकॉल के साथ निर्बाध और स्टाइलिश अनुभव।' },
  'login.fast': { tr: 'HIZLI', en: 'FAST', de: 'SCHNELL', fr: 'RAPIDE', ar: 'سريع', ko: '빠름', zh: '快速', ja: '高速', hi: 'तेज़' },
  'login.secure': { tr: 'GÜVENLİ', en: 'SECURE', de: 'SICHER', fr: 'SÉCURISÉ', ar: 'آمن', ko: '보안', zh: '安全', ja: '安全', hi: 'सुरक्षित' },
  'login.universal': { tr: 'EVRENSEL', en: 'UNIVERSAL', de: 'UNIVERSELL', fr: 'UNIVERSEL', ar: 'عالمي', ko: '범용', zh: '通用', ja: 'ユニバーサル', hi: 'सार्वभौमिक' },
  'login.google': { tr: 'Google ile Giriş Yap', en: 'Sign in with Google', de: 'Mit Google anmelden', fr: 'Se connecter avec Google', ar: 'تسجيل الدخول عبر Google', ko: 'Google로 로그인', zh: '使用 Google 登录', ja: 'Googleでログイン', hi: 'Google से साइन इन करें' },
  'login.management': { tr: 'Yönetim', en: 'Management', de: 'Verwaltung', fr: 'Gestion', ar: 'الإدارة', ko: '관리', zh: '管理', ja: '管理', hi: 'प्रबंधन' },
  'login.adminTitle': { tr: 'Admin Girişi', en: 'Admin Login', de: 'Admin-Login', fr: 'Connexion admin', ar: 'دخول المشرف', ko: '관리자 로그인', zh: '管理员登录', ja: '管理者ログイン', hi: 'एडमिन लॉगिन' },
  'login.adminHint': { tr: 'Yetkili yönetici girişi için şifrenizi girin.', en: 'Enter your password for authorized manager access.', de: 'Geben Sie Ihr Passwort für autorisierten Zugang ein.', fr: 'Saisissez votre mot de passe pour un accès autorisé.', ar: 'أدخل كلمة المرور للوصول المصرح به.', ko: '권한 있는 관리자 액세스를 위해 비밀번호를 입력하세요.', zh: '请输入密码以获得授权访问。', ja: '権限を持つ管理者としてログインするにはパスワードを入力してください。', hi: 'अधिकृत प्रबंधक पहुंच के लिए अपना पासवर्ड दर्ज करें।' },
  'login.cancel': { tr: 'İptal', en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', ar: 'إلغاء', ko: '취소', zh: '取消', ja: 'キャンセル', hi: 'रद्द करें' },
  'login.enter': { tr: 'Giriş', en: 'Enter', de: 'Eintreten', fr: 'Entrer', ar: 'دخول', ko: '입장', zh: '进入', ja: '入る', hi: 'प्रवेश' },
  'login.wrongPw': { tr: 'Hatalı şifre!', en: 'Wrong password!', de: 'Falsches Passwort!', fr: 'Mot de passe incorrect !', ar: 'كلمة المرور خاطئة!', ko: '잘못된 비밀번호!', zh: '密码错误！', ja: 'パスワードが違います！', hi: 'गलत पासवर्ड!' },

  'side.search': { tr: 'Ara veya yeni sohbet başlat', en: 'Search or start a new chat', de: 'Suchen oder neuen Chat starten', fr: 'Rechercher ou démarrer une discussion', ar: 'ابحث أو ابدأ محادثة جديدة', ko: '검색 또는 새 채팅 시작', zh: '搜索或开始新聊天', ja: '検索または新しいチャットを開始', hi: 'खोजें या नई चैट शुरू करें' },
  'side.friends': { tr: 'Arkadaşlar', en: 'Friends', de: 'Freunde', fr: 'Amis', ar: 'الأصدقاء', ko: '친구', zh: '好友', ja: 'フレンド', hi: 'दोस्त' },
  'side.groups': { tr: 'Gruplar', en: 'Groups', de: 'Gruppen', fr: 'Groupes', ar: 'المجموعات', ko: '그룹', zh: '群组', ja: 'グループ', hi: 'समूह' },
  'side.requests': { tr: 'İstekler', en: 'Requests', de: 'Anfragen', fr: 'Demandes', ar: 'الطلبات', ko: '요청', zh: '请求', ja: 'リクエスト', hi: 'अनुरोध' },
  'side.userList': { tr: 'Kull. List.', en: 'User List', de: 'Benutzer', fr: 'Utilisateurs', ar: 'قائمة المستخدمين', ko: '사용자 목록', zh: '用户列表', ja: 'ユーザー一覧', hi: 'उपयोगकर्ता' },
  'side.adminMsg': { tr: 'Yön. Msj', en: 'Admin Msg', de: 'Admin-Nachr.', fr: 'Msg admin', ar: 'رسالة المشرف', ko: '관리자 메시지', zh: '管理员消息', ja: '管理者メッセージ', hi: 'एडमिन संदेश' },
  'side.logout': { tr: 'Çıkış', en: 'Log out', de: 'Abmelden', fr: 'Déconnexion', ar: 'خروج', ko: '로그아웃', zh: '退出', ja: 'ログアウト', hi: 'लॉग आउट' },
  'side.light': { tr: 'Açık', en: 'Light', de: 'Hell', fr: 'Clair', ar: 'فاتح', ko: '밝음', zh: '浅色', ja: 'ライト', hi: 'लाइट' },
  'side.dark': { tr: 'Karanlık', en: 'Dark', de: 'Dunkel', fr: 'Sombre', ar: 'داكن', ko: '어둠', zh: '深色', ja: 'ダーク', hi: 'डार्क' },
  'side.admin': { tr: 'Admin', en: 'Admin', de: 'Admin', fr: 'Admin', ar: 'المشرف', ko: '관리자', zh: '管理员', ja: '管理者', hi: 'एडमिन' },
  'side.broadcast': { tr: 'Broadcast', en: 'Broadcast', de: 'Broadcast', fr: 'Broadcast', ar: 'بث', ko: '방송', zh: '广播', ja: 'ブロードキャスト', hi: 'प्रसारण' },
  'side.broadcastDesc': { tr: 'Tüm kullanıcılara açık kanal', en: 'Open channel for all users', de: 'Offener Kanal für alle Nutzer', fr: 'Canal ouvert à tous les utilisateurs', ar: 'قناة مفتوحة لجميع المستخدمين', ko: '모든 사용자를 위한 공개 채널', zh: '对所有用户开放的频道', ja: 'すべてのユーザーに開かれたチャンネル', hi: 'सभी उपयोगकर्ताओं के लिए खुला चैनल' },
  'side.broadcastChannel': { tr: 'Broadcast Kanalı', en: 'Broadcast Channel', de: 'Broadcast-Kanal', fr: 'Canal de diffusion', ar: 'قناة البث', ko: '방송 채널', zh: '广播频道', ja: 'ブロードキャストチャンネル', hi: 'प्रसारण चैनल' },
  'side.noFriendsYet': { tr: 'Henüz arkadaşın yok', en: 'No friends yet', de: 'Noch keine Freunde', fr: 'Pas encore d’amis', ar: 'لا يوجد أصدقاء بعد', ko: '아직 친구가 없습니다', zh: '还没有好友', ja: 'まだフレンドがいません', hi: 'अभी कोई दोस्त नहीं' },
  'side.noFriendsHint': { tr: 'Kullanıcı listesinden arkadaşlık isteği gönder', en: 'Send a friend request from the user list', de: 'Freundschaftsanfrage aus der Benutzerliste senden', fr: 'Envoyez une demande d’ami depuis la liste des utilisateurs', ar: 'أرسل طلب صداقة من قائمة المستخدمين', ko: '사용자 목록에서 친구 요청을 보내세요', zh: '从用户列表发送好友请求', ja: 'ユーザー一覧からフレンドリクエストを送信', hi: 'उपयोगकर्ता सूची से मित्रता अनुरोध भेजें' },
  'side.seeUsers': { tr: 'Kullanıcıları Gör', en: 'See Users', de: 'Benutzer ansehen', fr: 'Voir les utilisateurs', ar: 'عرض المستخدمين', ko: '사용자 보기', zh: '查看用户', ja: 'ユーザーを見る', hi: 'उपयोगकर्ता देखें' },
  'side.noGroupsYet': { tr: 'Henüz grupta değilsin', en: 'Not in any group yet', de: 'Noch in keiner Gruppe', fr: 'Pas encore dans un groupe', ar: 'لست في أي مجموعة بعد', ko: '아직 어떤 그룹에도 없습니다', zh: '还没有加入任何群组', ja: 'まだどのグループにもいません', hi: 'अभी किसी समूह में नहीं हैं' },
  'side.noGroupsHint': { tr: 'Kullanıcı listesinden gruplara katılabilirsin', en: 'You can join groups from the user list', de: 'Du kannst über die Benutzerliste Gruppen beitreten', fr: 'Vous pouvez rejoindre des groupes depuis la liste des utilisateurs', ar: 'يمكنك الانضمام إلى المجموعات من قائمة المستخدمين', ko: '사용자 목록에서 그룹에 참여할 수 있습니다', zh: '你可以从用户列表加入群组', ja: 'ユーザー一覧からグループに参加できます', hi: 'उपयोगकर्ता सूची से समूहों में शामिल हो सकते हैं' },
  'side.seeGroups': { tr: 'Grupları Gör', en: 'See Groups', de: 'Gruppen ansehen', fr: 'Voir les groupes', ar: 'عرض المجموعات', ko: '그룹 보기', zh: '查看群组', ja: 'グループを見る', hi: 'समूह देखें' },
  'side.noMessagesYet': { tr: 'Henüz mesaj yok', en: 'No messages yet', de: 'Noch keine Nachrichten', fr: 'Pas encore de messages', ar: 'لا توجد رسائل بعد', ko: '아직 메시지가 없습니다', zh: '还没有消息', ja: 'まだメッセージがありません', hi: 'अभी कोई संदेश नहीं' },
  'side.members': { tr: 'üye', en: 'members', de: 'Mitglieder', fr: 'membres', ar: 'أعضاء', ko: '명', zh: '成员', ja: 'メンバー', hi: 'सदस्य' },
  'side.online': { tr: 'Çevrimiçi', en: 'Online', de: 'Online', fr: 'En ligne', ar: 'متصل', ko: '온라인', zh: '在线', ja: 'オンライン', hi: 'ऑनलाइन' },
  'side.away': { tr: 'Uzakta', en: 'Away', de: 'Abwesend', fr: 'Absent', ar: 'غائب', ko: '자리 비움', zh: '离开', ja: '離席中', hi: 'दूर' },
  'side.busy': { tr: 'Meşgul', en: 'Busy', de: 'Beschäftigt', fr: 'Occupé', ar: 'مشغول', ko: '바쁨', zh: '忙碌', ja: '取り込み中', hi: 'व्यस्त' },
  'side.active': { tr: 'Aktif', en: 'Active', de: 'Aktiv', fr: 'Actif', ar: 'نشط', ko: '활성', zh: '在线', ja: 'アクティブ', hi: 'सक्रिय' },
  'side.noStatus': { tr: 'Durum yok', en: 'No status', de: 'Kein Status', fr: 'Aucun statut', ar: 'لا يوجد حالة', ko: '상태 없음', zh: '无状态', ja: 'ステータスなし', hi: 'कोई स्थिति नहीं' },
  'side.muted': { tr: 'Sessize alındı', en: 'Muted', de: 'Stummgeschaltet', fr: 'Muet', ar: 'تم كتم الصوت', ko: '음소거됨', zh: '已静音', ja: 'ミュート', hi: 'म्यूट' },
  'side.requestTitle': { tr: 'Arkadaşlık İstekleri', en: 'Friend Requests', de: 'Freundschaftsanfragen', fr: 'Demandes d’amis', ar: 'طلبات الصداقة', ko: '친구 요청', zh: '好友请求', ja: 'フレンドリクエスト', hi: 'मित्रता अनुरोध' },
  'side.userListTitle': { tr: 'Kullanıcı Listesi', en: 'User List', de: 'Benutzerliste', fr: 'Liste des utilisateurs', ar: 'قائمة المستخدمين', ko: '사용자 목록', zh: '用户列表', ja: 'ユーザー一覧', hi: 'उपयोगकर्ता सूची' },
  'side.adminMsgTitle': { tr: 'Yöneticiye Mesaj Gönder', en: 'Send Message to Admin', de: 'Nachricht an Admin senden', fr: 'Envoyer un message à l’admin', ar: 'أرسل رسالة إلى المشرف', ko: '관리자에게 메시지 보내기', zh: '给管理员发消息', ja: '管理者にメッセージを送信', hi: 'एडमिन को संदेश भेजें' },
  'side.adminMsgHint': { tr: 'Sorun, öneri veya ihlal bildirimi gönderebilirsiniz.', en: 'You can send a problem, suggestion or violation report.', de: 'Sie können Problem, Vorschlag oder Verstoß melden.', fr: 'Vous pouvez envoyer un problème, une suggestion ou un signalement.', ar: 'يمكنك إرسال مشكلة أو اقتراح أو تقرير مخالفة.', ko: '문제, 제안 또는 위반 신고를 보낼 수 있습니다.', zh: '您可以发送问题、建议或违规举报。', ja: '問題、提案、違反報告を送信できます。', hi: 'आप समस्या, सुझाव या उल्लंघन रिपोर्ट भेज सकते हैं।' },
  'side.msgPlaceholder': { tr: 'Mesajınız...', en: 'Your message...', de: 'Ihre Nachricht...', fr: 'Votre message...', ar: 'رسالتك...', ko: '메시지...', zh: '您的消息...', ja: 'メッセージ...', hi: 'आपका संदेश...' },
  'side.adminMsgSend': { tr: 'Gönder', en: 'Send', de: 'Senden', fr: 'Envoyer', ar: 'إرسال', ko: '보내기', zh: '发送', ja: '送信', hi: 'भेजें' },
  'side.adminMsgSent': { tr: 'Mesajınız yöneticiye iletilmiştir.', en: 'Your message has been sent to the admin.', de: 'Ihre Nachricht wurde an den Admin gesendet.', fr: 'Votre message a été envoyé à l’admin.', ar: 'تم إرسال رسالتك إلى المشرف.', ko: '메시지가 관리자에게 전송되었습니다.', zh: '您的消息已发送给管理员。', ja: 'メッセージが管理者に送信されました。', hi: 'आपका संदेश एडमिन को भेज दिया गया है।' },
  'side.adminMsgFail': { tr: 'Mesaj gönderilemedi. Lütfen tekrar deneyin.', en: 'Message could not be sent. Please try again.', de: 'Nachricht konnte nicht gesendet werden. Bitte erneut versuchen.', fr: 'Le message n’a pas pu être envoyé. Veuillez réessayer.', ar: 'تعذّر إرسال الرسالة. حاول مرة أخرى.', ko: '메시지를 보낼 수 없습니다. 다시 시도하세요.', zh: '消息发送失败，请重试。', ja: 'メッセージを送信できませんでした。もう一度お試しください。', hi: 'संदेश नहीं भेजा जा सका। कृपया पुनः प्रयास करें।' },
  'side.holdNotify': { tr: 'Bildirim 30 dakikada bir gönderilebilir.', en: 'A notification can be sent once every 30 minutes.', de: 'Benachrichtigung kann alle 30 Minuten gesendet werden.', fr: 'Une notification peut être envoyée toutes les 30 minutes.', ar: ' يمكن إرسال إشعار كل 30 دقيقة.', ko: '알림은 30분마다 한 번만 보낼 수 있습니다.', zh: '通知每 30 分钟可发送一次。', ja: '通知は30分に1回のみ送信できます。', hi: 'सूचना हर 30 मिनट में एक बार भेजी जा सकती है।' },
  'side.holdMessage': { tr: 'sohbeti beklemeye alındı. Lütfen durumu gözden geçirin.', en: 'chat has been put on hold. Please review the status.', de: 'Chat wurde zurückgestellt. Bitte Status prüfen.', fr: 'discussion a été mise en attente. Veuillez vérifier.', ar: 'تم تعليق المحادثة. يرجى مراجعة الحالة.', ko: '채팅이 보류되었습니다. 상태를 확인하세요.', zh: '聊天已暂停，请检查状态。', ja: 'チャットが保留されました。状況をご確認ください।', hi: 'चैट रोक दी गई है। कृपया स्थिति की समीक्षा करें।' },

  'profile.created': { tr: 'Profil Oluşturuldu!', en: 'Profile Created!', de: 'Profil erstellt!', fr: 'Profil créé !', ar: 'تم إنشاء الملف!', ko: '프로필 생성됨!', zh: '资料已创建！', ja: 'プロフィール作成完了！', hi: 'प्रोफ़ाइल बन गई!' },
  'profile.welcome': { tr: 'Nexus Messenger’a hoş geldin', en: 'Welcome to Nexus Messenger', de: 'Willkommen bei Nexus Messenger', fr: 'Bienvenue sur Nexus Messenger', ar: 'مرحبًا بك في Nexus Messenger', ko: 'Nexus Messenger에 오신 것을 환영합니다', zh: '欢迎使用 Nexus Messenger', ja: 'Nexus Messengerへようこそ', hi: 'Nexus Messenger में आपका स्वागत है' },
  'profile.save': { tr: 'Kaydet ve Devam Et', en: 'Save and Continue', de: 'Speichern und fortfahren', fr: 'Enregistrer et continuer', ar: 'احفظ وتابع', ko: '저장 후 계속', zh: '保存并继续', ja: '保存して続行', hi: 'सहेजें और जारी रखें' },
  'profile.uin': { tr: 'UIN NUMARAN', en: 'YOUR UIN', de: 'DEINE UIN', fr: 'VOTRE UIN', ar: 'رقم UIN الخاص بك', ko: 'UIN 번호', zh: '您的 UIN', ja: 'あなたのUIN', hi: 'आपका UIN' },

  'set.theme': { tr: 'Tema', en: 'Theme', de: 'Design', fr: 'Thème', ar: 'المظهر', ko: '테마', zh: '主题', ja: 'テーマ', hi: 'थीम' },
  'set.language': { tr: 'Dil', en: 'Language', de: 'Sprache', fr: 'Langue', ar: 'اللغة', ko: '언어', zh: '语言', ja: '言語', hi: 'भाषा' },
  'set.presets': { tr: 'Hazır Temalar', en: 'Preset Themes', de: 'Vorlagen', fr: 'Thèmes prédéfinis', ar: 'سمات جاهزة', ko: '미리 설정된 테마', zh: '预设主题', ja: 'プリセットテーマ', hi: 'प्रीसेट थीम' },
  'set.customize': { tr: 'Renkleri Özelleştir', en: 'Customize Colors', de: 'Farben anpassen', fr: 'Personnaliser les couleurs', ar: 'تخصيص الألوان', ko: '색상 사용자 지정', zh: '自定义颜色', ja: 'カラーをカスタマイズ', hi: 'रंग अनुकूलित करें' },
  'set.reset': { tr: 'Varsayılana Dön', en: 'Reset to Default', de: 'Zurücksetzen', fr: 'Réinitialiser', ar: 'إعادة الافتراضي', ko: '기본값으로', zh: '恢复默认', ja: 'デフォルトに戻す', hi: 'डिफ़ॉल्ट पर रीसेट' },
  'set.primary': { tr: 'Birincil', en: 'Primary', de: 'Primär', fr: 'Principal', ar: 'أساسي', ko: '기본', zh: '主要', ja: 'メイン', hi: 'प्राथमिक' },
  'set.moreLangs': { tr: 'İleride daha fazla dil eklenecek.', en: 'More languages will be added soon.', de: 'Weitere Sprachen werden bald hinzugefügt.', fr: 'D’autres langues seront bientôt ajoutées.', ar: 'ستتم إضافة المزيد من اللغات قريبًا.', ko: '곧 더 많은 언어가 추가됩니다.', zh: '即将添加更多语言。', ja: '近日中にさらに多くの言語が追加されます।', hi: 'जल्द ही और भाषाएँ जोड़ी जाएँगी।' },
  'set.cBg': { tr: 'Sayfa Arka Planı', en: 'Page Background', de: 'Seitenhintergrund', fr: 'Arrière-plan', ar: 'خلفية الصفحة', ko: '페이지 배경', zh: '页面背景', ja: 'ページ背景', hi: 'पृष्ठ पृष्ठभूमि' },
  'set.cSurface': { tr: 'Yüzey', en: 'Surface', de: 'Fläche', fr: 'Surface', ar: 'السطح', ko: '표면', zh: '表面', ja: 'サーフェス', hi: 'सतह' },
  'set.cText': { tr: 'Metin', en: 'Text', de: 'Text', fr: 'Texte', ar: 'النص', ko: '텍스트', zh: '文本', ja: 'テキスト', hi: 'पाठ' },
  'set.cMuted': { tr: 'İkincil Metin', en: 'Muted Text', de: 'Gedämpfter Text', fr: 'Texte atténué', ar: 'نص باهت', ko: '보조 텍스트', zh: '次要文本', ja: '補助テキスト', hi: 'म्यूट टेक्स्ट' },
  'set.cAccent': { tr: 'Vurgu', en: 'Accent', de: 'Akzent', fr: 'Accent', ar: 'لون مميز', ko: '강조색', zh: '强调色', ja: 'アクセント', hi: 'एक्सेंट' },
  'set.cBubbleMine': { tr: 'Giden Mesaj', en: 'Sent Message', de: 'Gesendet', fr: 'Message envoyé', ar: 'الرسالة المرسلة', ko: '보낸 메시지', zh: '发送的消息', ja: '送信メッセージ', hi: 'भेजा गया संदेश' },
  'set.cBubbleTheirs': { tr: 'Gelen Mesaj', en: 'Received Message', de: 'Empfangen', fr: 'Message reçu', ar: 'الرسالة المستلمة', ko: '받은 메시지', zh: '接收的消息', ja: '受信メッセージ', hi: 'प्राप्त संदेश' },
  'set.cBorder': { tr: 'Kenarlık', en: 'Border', de: 'Rahmen', fr: 'Bordure', ar: 'الحدود', ko: '테두리', zh: '边框', ja: '境界線', hi: 'बॉर्डर' },

  'pre.default': { tr: 'Varsayılan', en: 'Default', de: 'Standard', fr: 'Défaut', ar: 'افتراضي', ko: '기본', zh: '默认', ja: 'デフォルト', hi: 'डिफ़ॉल्ट' },
  'pre.night': { tr: 'Gece', en: 'Night', de: 'Nacht', fr: 'Nuit', ar: 'ليل', ko: '밤', zh: '夜晚', ja: '夜', hi: 'रात' },
  'pre.ocean': { tr: 'Okyanus', en: 'Ocean', de: 'Ozean', fr: 'Océan', ar: 'محيط', ko: '바다', zh: '海洋', ja: '海', hi: 'महासागर' },
  'pre.forest': { tr: 'Orman', en: 'Forest', de: 'Wald', fr: 'Forêt', ar: 'غابة', ko: '숲', zh: '森林', ja: '森', hi: 'वन' },
  'pre.sunset': { tr: 'Gün Batımı', en: 'Sunset', de: 'Sonnenuntergang', fr: 'Coucher de soleil', ar: 'غروب', ko: '일몰', zh: '日落', ja: '夕日', hi: 'सूर्यास्त' },
  'pre.lavender': { tr: 'Lavanta', en: 'Lavender', de: 'Lavendel', fr: 'Lavande', ar: 'لافندر', ko: '라벤더', zh: '薰衣草', ja: 'ラベンダー', hi: 'लैवेंडर' },
  'pre.cherry': { tr: 'Kiraz', en: 'Cherry', de: 'Kirsche', fr: 'Cerise', ar: 'كرز', ko: '체리', zh: '樱桃', ja: 'さくらんぼ', hi: 'चेरी' },
  'pre.gold': { tr: 'Altın', en: 'Gold', de: 'Gold', fr: 'Or', ar: 'ذهبي', ko: '골드', zh: '金色', ja: 'ゴールド', hi: 'सोना' },
  'pre.mint': { tr: 'Nane', en: 'Mint', de: 'Minze', fr: 'Menthe', ar: 'نعناع', ko: '민트', zh: '薄荷', ja: 'ミント', hi: 'पुदीना' },
  'pre.rose': { tr: 'Pembe', en: 'Rose', de: 'Rose', fr: 'Rose', ar: 'وردي', ko: '장미', zh: '玫瑰', ja: 'ローズ', hi: 'गुलाबी' },
  'pre.graphite': { tr: 'Grafit', en: 'Graphite', de: 'Graphit', fr: 'Graphite', ar: 'جرافيت', ko: '그래파이트', zh: '石墨', ja: 'グラファイト', hi: 'ग्रेफाइट' },
};

const D: Dict = { ...core, ...chatDict, ...admDict, ...ncDict, ...upDict };

export const flagUrl = (code: string) => `https://flagcdn.com/24x18/${code}.png`;

let currentLang: LangCode = 'tr';
try {
  const saved = localStorage.getItem('nexus.lang');
  if (saved && LANGS.some((l) => l.code === saved)) currentLang = saved as LangCode;
} catch {
  currentLang = 'tr';
}

export function translate(key: string, vars?: Record<string, string | number>): string {
  let s = D[key]?.[currentLang] || D[key]?.tr || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

type I18nCtx = { lang: LangCode; setLang: (l: LangCode) => void; t: typeof translate };

const Ctx = createContext<I18nCtx>({ lang: 'tr', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    const saved = localStorage.getItem('nexus.lang');
    return (saved === 'tr' || saved === 'en' || saved === 'ar' || saved === 'de' || saved === 'fr' || saved === 'ko' || saved === 'zh' || saved === 'ja' || saved === 'hi') ? saved as LangCode : 'tr';
  });

  currentLang = lang;

  useEffect(() => {
    localStorage.setItem('nexus.lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  return <Ctx.Provider value={{ lang, setLang: setLangState, t: translate }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
