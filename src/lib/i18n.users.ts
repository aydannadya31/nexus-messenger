import type { LangCode } from './i18n';

type Dict = Record<string, Partial<Record<LangCode, string>>>;

export const upDict: Dict = {
  'up.title': { tr: 'Kullanıcılar', en: 'Users', de: 'Benutzer', fr: 'Utilisateurs', ar: 'المستخدمون', ko: '사용자', zh: '用户', ja: 'ユーザー', hi: 'उपयोगकर्ता' },
  'up.searchPlaceholder': { tr: 'Arkadaş veya grup ara...', en: 'Search friends or groups...', de: 'Freunde oder Gruppen suchen...', fr: 'Rechercher des amis ou des groupes...', ar: 'ابحث عن أصدقاء أو مجموعات...', ko: '친구 또는 그룹 검색...', zh: '搜索好友或群组...', ja: '友達またはグループを検索...', hi: 'दोस्तों या समूहों को खोजें...' },
  'up.noResults': { tr: 'Sonuç bulunamadı', en: 'No results found', de: 'Keine Ergebnisse gefunden', fr: 'Aucun résultat', ar: 'لم يتم العثور على نتائج', ko: '결과 없음', zh: '未找到结果', ja: '結果が見つかりません', hi: 'कोई परिणाम नहीं मिला' },
  'up.noConnections': { tr: 'Henüz bağlantın yok', en: 'You have no connections yet', de: 'Noch keine Kontakte', fr: 'Vous n’avez pas encore de contacts', ar: 'ليس لديك روابط بعد', ko: '아직 연락처가 없습니다', zh: '你还没有联系人', ja: 'まだ接続がありません', hi: 'अभी आपके कोई संपर्क नहीं हैं' },
  'up.tryDifferentSearch': { tr: 'Farklı bir arama dene', en: 'Try a different search', de: 'Versuche eine andere Suche', fr: 'Essayez une autre recherche', ar: 'جرّب بحثًا آخر', ko: '다른 검색을 시도하세요', zh: '尝试其他搜索条件', ja: '別の検索をお試しください', hi: 'दूसरी खोज आज़माएँ' },
  'up.addUsersHint': { tr: 'Kullanıcı eklemek için sol üstteki "Kull. List." butonunu kullan', en: 'Use the "User List" button at the top left to add users', de: 'Verwende die Schaltfläche „Benutzerliste“ oben links, um Benutzer hinzuzufügen', fr: 'Utilisez le bouton « Liste des utilisateurs » en haut à gauche pour ajouter des utilisateurs', ar: 'استخدم زر "قائمة المستخدمين" في الأعلى يسارًا لإضافة مستخدمين', ko: '사용자를 추가하려면 왼쪽 위의 "사용자 목록" 버튼을 사용하세요', zh: '使用左上角的"用户列表"按钮添加用户', ja: '左上の「ユーザー一覧」ボタンからユーザーを追加できます', hi: 'उपयोगकर्ता जोड़ने के लिए ऊपर बाईं ओर "उपयोगकर्ता सूची" बटन का उपयोग करें' },
  'up.anonymous': { tr: 'İsimsiz', en: 'Anonymous', de: 'Anonym', fr: 'Anonyme', ar: 'مجهول', ko: '익명', zh: '匿名', ja: '匿名', hi: 'अनाम' },
  'up.sendMessage': { tr: 'Mesaj Gönder', en: 'Send Message', de: 'Nachricht senden', fr: 'Envoyer un message', ar: 'إرسال رسالة', ko: '메시지 보내기', zh: '发送消息', ja: 'メッセージを送信', hi: 'संदेश भेजें' },
  'up.groupFallback': { tr: 'Grup', en: 'Group', de: 'Gruppe', fr: 'Groupe', ar: 'مجموعة', ko: '그룹', zh: '群组', ja: 'グループ', hi: 'समूह' },
  'up.someone': { tr: 'Birisi', en: 'Someone', de: 'Jemand', fr: 'Quelqu’un', ar: 'شخص ما', ko: '누군가', zh: '某人', ja: '誰か', hi: 'कोई' },
};
