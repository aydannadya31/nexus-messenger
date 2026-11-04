/**
 * Zeka Ajanı - Frontend Uygulaması
 * Web arayüzü ile backend API arasındaki iletişimi yönetir
 */

// =============================================
// UserManager - Kullanıcı Yönetimi (localStorage)
// =============================================

class UserManager {
    constructor() {
        this.USERS_KEY = 'zeka_ajani_users';
        this.SESSION_KEY = 'zeka_ajani_session';
        this.currentUser = this.loadSession();
    }

    _hash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash = hash & hash;
        }
        return 'h_' + Math.abs(hash).toString(36);
    }

    getUsers() {
        return JSON.parse(localStorage.getItem(this.USERS_KEY) || '[]');
    }

    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    }

    findUserByNickname(nick) {
        return this.getUsers().find(u => u.nickname.toLowerCase() === nick.toLowerCase());
    }

    findUserByEmail(email) {
        return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
    }

    register(name, surname, nickname, email, password) {
        if (!name || !surname || !nickname || !email || !password) {
            return { success: false, error: 'Tüm alanlar doldurulmalıdır.' };
        }
        if (password.length < 6) {
            return { success: false, error: 'Şifre en az 6 karakter olmalıdır.' };
        }
        if (nickname.toLowerCase() === 'admin') {
            return { success: false, error: 'Bu kullanıcı adı kullanılamaz.' };
        }
        if (!email.includes('@')) {
            return { success: false, error: 'Geçerli bir e-posta adresi girin.' };
        }

        const users = this.getUsers();
        if (this.findUserByNickname(nickname)) {
            return { success: false, error: 'Bu kullanıcı adı zaten alınmış.' };
        }
        if (this.findUserByEmail(email)) {
            return { success: false, error: 'Bu e-posta adresi zaten kayıtlı.' };
        }

        const newUser = {
            id: 'user_' + Date.now(),
            name: name.trim(),
            surname: surname.trim(),
            nickname: nickname.trim(),
            email: email.trim().toLowerCase(),
            password: this._hash(password),
            messages: 0,
            chats: 0,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
        };

        users.push(newUser);
        this.saveUsers(users);
        return { success: true, user: newUser };
    }

    login(identifier, password) {
        // Admin kontrolü (hardcoded)
        if (identifier === 'Admin' && password === 'Ag1453ag!') {
            const adminUser = {
                id: 'admin',
                nickname: 'Admin',
                name: 'Admin',
                surname: '',
                email: 'admin@zekaajani',
                isAdmin: true,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
            };
            this.saveSession(adminUser);
            return { success: true, user: adminUser, isAdmin: true };
        }

        const users = this.getUsers();
        const hashed = this._hash(password);
        const user = users.find(u =>
            (u.nickname.toLowerCase() === identifier.toLowerCase() ||
             u.email.toLowerCase() === identifier.toLowerCase()) &&
            u.password === hashed
        );

        if (!user) {
            return { success: false, error: 'Kullanıcı adı/e-posta veya şifre hatalı.' };
        }

        user.lastLogin = new Date().toISOString();
        this.saveUsers(users);
        this.saveSession(user);
        return { success: true, user };
    }

    saveSession(user) {
        this.currentUser = user;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    }

    loadSession() {
        try { const d = localStorage.getItem(this.SESSION_KEY); return d ? JSON.parse(d) : null; }
        catch { return null; }
    }

    clearSession() {
        this.currentUser = null;
        localStorage.removeItem(this.SESSION_KEY);
    }

    isLoggedIn() { return this.currentUser !== null; }
    isAdmin() { return this.currentUser && this.currentUser.isAdmin === true; }
    getCurrentUser() { return this.currentUser; }

    deleteUser(userId) {
        if (userId === 'admin') return { success: false, error: 'Admin silinemez.' };
        let users = this.getUsers();
        users = users.filter(u => u.id !== userId);
        this.saveUsers(users);
        return { success: true };
    }

    getStats() {
        const users = this.getUsers();
        const today = new Date().toISOString().split('T')[0];
        return {
            totalUsers: users.length,
            activeToday: users.filter(u => u.lastLogin && u.lastLogin.startsWith(today)).length,
            totalChats: users.reduce((s, u) => s + (u.chats || 0), 0),
            totalMessages: users.reduce((s, u) => s + (u.messages || 0), 0),
        };
    }

    getAllUsers() {
        return this.getUsers();
    }
}

// =============================================
// Zeka Ajanı Ana Uygulama Sınıfı
// =============================================

class ZekaAjani {
    constructor() {
        // === State ===
        this.currentConversationId = null;
        this.conversations = [];
        this.isLoading = false;
        // API URL: önce window.API_URL'yi dene, yoksa /api (same-origin)
        this.apiBase = window.API_URL || '/api';

        // === DOM Referansları ===
        this.elements = {
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            sendBtn: document.getElementById('sendBtn'),
            attachBtn: document.getElementById('attachBtn'),
            fileInput: document.getElementById('fileInput'),
            newChatBtn: document.getElementById('newChatBtn'),
            newChatBtn2: document.getElementById('newChatBtn2'),
            conversationList: document.getElementById('conversationList'),
            welcomeScreen: document.getElementById('welcomeScreen'),
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            settingsClose: document.getElementById('settingsClose'),
            settingsClose2: document.getElementById('settingsClose2'),
            settingsSave: document.getElementById('settingsSave'),
            statusBadge: document.getElementById('statusBadge'),
            modelBadge: document.getElementById('modelBadge'),
            inputGroqKey: document.getElementById('inputGroqKey'),
            inputOpenRouterKey: document.getElementById('inputOpenRouterKey'),
            inputProvider: document.getElementById('inputProvider'),
            inputGroqModel: document.getElementById('inputGroqModel'),
            ethicsRulesList: document.getElementById('ethicsRulesList'),
            ethicsRuleInput: document.getElementById('ethicsRuleInput'),
            addEthicsRuleBtn: document.getElementById('addEthicsRuleBtn'),
            ethicsCount: document.getElementById('ethicsCount'),
            systemStatus: document.getElementById('systemStatus'),
            archivedToggle: document.getElementById('archivedToggle'),
            archivedList: document.getElementById('archivedList'),
            archivedCount: document.getElementById('archivedCount'),
            repoList: document.getElementById('repoList'),
            repoCount: document.getElementById('repoCount'),
            repoModal: document.getElementById('repoModal'),
            repoModalTitle: document.getElementById('repoModalTitle'),
            repoModalClose: document.getElementById('repoModalClose'),
            repoModalCancel: document.getElementById('repoModalCancel'),
            repoModalSave: document.getElementById('repoModalSave'),
            repoNameInput: document.getElementById('repoNameInput'),
            repoUrlInput: document.getElementById('repoUrlInput'),
            repoIconPicker: document.getElementById('repoIconPicker'),
            repoBadgeInput: document.getElementById('repoBadgeInput'),
            aiImageBtn: document.getElementById('aiImageBtn'),
            aiImageOverlay: document.getElementById('aiImageOverlay'),
            aiImageClose: document.getElementById('aiImageClose'),
            aiImageOpenBtn: document.getElementById('aiImageOpenBtn'),
            aiImageUrlInput: document.getElementById('aiImageUrlInput'),
            aiImageSendBtn: document.getElementById('aiImageSendBtn'),
            aiImageSendCancel: document.getElementById('aiImageSendCancel'),
            // Auth elements
            authScreen: document.getElementById('authScreen'),
            registerForm: document.getElementById('registerForm'),
            loginForm: document.getElementById('loginForm'),
            regName: document.getElementById('regName'),
            regSurname: document.getElementById('regSurname'),
            regNickname: document.getElementById('regNickname'),
            regNicknameHint: document.getElementById('regNicknameHint'),
            regEmail: document.getElementById('regEmail'),
            regPassword: document.getElementById('regPassword'),
            regPasswordConfirm: document.getElementById('regPasswordConfirm'),
            registerBtn: document.getElementById('registerBtn'),
            loginUsername: document.getElementById('loginUsername'),
            loginPassword: document.getElementById('loginPassword'),
            loginBtn: document.getElementById('loginBtn'),
            switchToLogin: document.getElementById('switchToLogin'),
            switchToRegister: document.getElementById('switchToRegister'),
            authTabs: document.querySelectorAll('.auth-tab'),
            registerTab: document.querySelector('.auth-tab[data-form="register"]'),
            loginTab: document.querySelector('.auth-tab[data-form="login"]'),
            welcomeOverlay: document.getElementById('welcomeOverlay'),
            welcomeUserName: document.getElementById('welcomeUserName'),
            appContent: document.getElementById('appContent'),
            // Admin elements
            adminModal: document.getElementById('adminModal'),
            adminModalClose: document.getElementById('adminModalClose'),
            adminModalClose2: document.getElementById('adminModalClose2'),
            adminLogoutBtn: document.getElementById('adminLogoutBtn'),
            adminUserList: document.getElementById('adminUserList'),
            adminUserSearch: document.getElementById('adminUserSearch'),
            adminUserCount: document.getElementById('adminUserCount'),
            statTotalUsers: document.getElementById('statTotalUsers'),
            statActiveToday: document.getElementById('statActiveToday'),
            statTotalChats: document.getElementById('statTotalChats'),
            statTotalMessages: document.getElementById('statTotalMessages'),
            // User menu
            userMenu: document.getElementById('userMenu'),
            userMenuBtn: document.getElementById('userMenuBtn'),
            userAvatarLetter: document.getElementById('userAvatarLetter'),
            userDropdown: document.getElementById('userDropdown'),
            userDropdownName: document.getElementById('userDropdownName'),
            userDropdownNick: document.getElementById('userDropdownNick'),
            userSwitchBtn: document.getElementById('userSwitchBtn'),
            userLogoutBtn: document.getElementById('userLogoutBtn'),
        };

        // === Canlı Projeler ===
        this.repos = [];
        this.editingRepoId = null;

        // === Kullanıcı Yönetimi ===
        this.userManager = new UserManager();
        this.appInitialized = false;

        // Auth kontrolü ile başla
        this.checkAuth();
    }

    init() {
        this.bindEvents();
        this.loadConversations();
        this.loadArchivedConversations();
        this.checkHealth();
        this.loadRepoSites();
    }

    // === Auth Kontrolü ===

    checkAuth() {
        if (this.userManager.isLoggedIn()) {
            // Oturum varsa direkt uygulamaya geç (welcome göstermeden)
            const user = this.userManager.getCurrentUser();
            if (user.isAdmin) {
                this.updateUserMenu(user);
                this.elements.authScreen.classList.add('hidden');
                this.elements.appContent.style.display = 'block';
                this.appInitialized = true;
                this.init();
                this.showToast('👋 Admin olarak giriş yapıldı');
                this.bindUserMenuEvents();
                return;
            }
            // Normal kullanıcı - welcome animasyonu göster
            this.bindUserMenuEvents();
            this.showWelcomeAndEnter(user);
        } else {
            // Auth ekranı zaten görünür (varsayılan CSS)
            this.bindUserMenuEvents();
            this.bindAuthEvents();
        }
    }

    bindUserMenuEvents() {
        if (this._userMenuBound) return;
        this._userMenuBound = true;

        this.elements.userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.userDropdown.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (this.elements.userMenu && !this.elements.userMenu.contains(e.target)) {
                this.elements.userDropdown.classList.remove('active');
            }
        });
        this.elements.userSwitchBtn.addEventListener('click', () => {
            this.elements.userDropdown.classList.remove('active');
            this.userManager.clearSession();
            this.switchUser();
        });
        this.elements.userLogoutBtn.addEventListener('click', () => {
            this.elements.userDropdown.classList.remove('active');
            this.handleLogout();
        });
    }

    bindAuthEvents() {
        // Ortak form geçiş fonksiyonu
        const switchForm = (formName) => {
            this.elements.authTabs.forEach(t => t.classList.remove('active'));
            this.elements.registerForm.classList.remove('active');
            this.elements.loginForm.classList.remove('active');
            if (formName === 'register') {
                this.elements.registerTab.classList.add('active');
                this.elements.registerForm.classList.add('active');
            } else {
                this.elements.loginTab.classList.add('active');
                this.elements.loginForm.classList.add('active');
            }
        };

        // Tab butonları ile geçiş
        this.elements.authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchForm(tab.dataset.form);
            });
        });

        // Link ile geçiş (altyazı linkleri)
        this.elements.switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            switchForm('login');
        });
        this.elements.switchToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            switchForm('register');
        });

        // Kayıt işlemi
        this.elements.registerBtn.addEventListener('click', () => this.handleRegister());

        // Giriş işlemi
        this.elements.loginBtn.addEventListener('click', () => this.handleLogin());

        // Enter ile gönderme
        this.elements.regPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleRegister();
        });
        this.elements.regPasswordConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleRegister();
        });
        this.elements.loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // Nickname uniqueness check (canlı)
        let nickTimer = null;
        this.elements.regNickname.addEventListener('input', () => {
            clearTimeout(nickTimer);
            const hint = this.elements.regNicknameHint;
            const val = this.elements.regNickname.value.trim();
            if (val.length < 2) { hint.textContent = ''; return; }
            nickTimer = setTimeout(() => {
                if (this.userManager.findUserByNickname(val)) {
                    hint.textContent = '❌ Bu kullanıcı adı alınmış';
                    hint.className = 'auth-field-hint error';
                } else {
                    hint.textContent = '✅ Kullanılabilir';
                    hint.className = 'auth-field-hint success';
                }
            }, 400);
        });

        // Admin panel event'leri (sayfa yüklendiğinde bağla)
        this.elements.adminModalClose.addEventListener('click', () => this.closeAdminPanel());
        this.elements.adminModalClose2.addEventListener('click', () => this.closeAdminPanel());
        this.elements.adminModal.addEventListener('click', (e) => {
            if (e.target === this.elements.adminModal) this.closeAdminPanel();
        });
        this.elements.adminLogoutBtn.addEventListener('click', () => this.handleLogout());

        // Admin tab geçişleri
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const content = document.getElementById('admin' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1) + 'Tab');
                if (content) content.classList.add('active');
                if (tab.dataset.tab === 'users') this.renderAdminUsers();
                if (tab.dataset.tab === 'stats') this.renderAdminStats();
            });
        });

        // Admin kullanıcı arama
        this.elements.adminUserSearch.addEventListener('input', () => this.renderAdminUsers());

        // ESC ile admin panelini kapat
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.adminModal.classList.contains('active')) {
                this.closeAdminPanel();
            }
        });
    }

    // === Auth Handlers ===

    handleRegister() {
        const name = this.elements.regName.value.trim();
        const surname = this.elements.regSurname.value.trim();
        const nickname = this.elements.regNickname.value.trim();
        const email = this.elements.regEmail.value.trim();
        const password = this.elements.regPassword.value;
        const confirm = this.elements.regPasswordConfirm.value;

        if (password !== confirm) {
            this.showToast('❌ Şifreler eşleşmiyor');
            return;
        }

        const result = this.userManager.register(name, surname, nickname, email, password);
        if (result.success) {
            this.showToast('✅ Kayıt başarılı! Hoş geldiniz.');
            this.userManager.saveSession(result.user);
            this.showWelcomeAndEnter(result.user);
        } else {
            this.showToast('❌ ' + result.error);
        }
    }

    handleLogin() {
        const identifier = this.elements.loginUsername.value.trim();
        const password = this.elements.loginPassword.value;

        if (!identifier || !password) {
            this.showToast('❌ Kullanıcı adı ve şifre girin');
            return;
        }

        const result = this.userManager.login(identifier, password);
        if (result.success) {
            if (result.isAdmin) {
                this.elements.authScreen.classList.add('hidden');
                this.elements.appContent.style.display = 'block';
                this.appInitialized = true;
                this.init();
                this.showToast('👋 Admin girişi başarılı');
                this.openAdminPanel();
            } else {
                this.showWelcomeAndEnter(result.user);
            }
        } else {
            this.showToast('❌ ' + result.error);
        }
    }

    handleLogout() {
        if (!confirm('Çıkış yapmak istediğinize emin misiniz?')) return;
        this.userManager.clearSession();
        this.appInitialized = false;

        // Uygulamayı sıfırla
        this.elements.appContent.style.display = 'none';
        this.elements.authScreen.classList.remove('hidden');
        this.elements.authScreen.style.display = 'flex';
        this.elements.loginForm.classList.remove('active');
        this.elements.registerForm.classList.add('active');
        this.elements.chatMessages.innerHTML = '';
        if (this.elements.welcomeScreen) this.elements.welcomeScreen.style.display = 'flex';
        this.conversations = [];
        this.currentConversationId = null;

        // Admin panelini kapat
        this.closeAdminPanel();

        this.showToast('👋 Çıkış yapıldı');
    }

    showWelcomeAndEnter(user) {
        // Auth ekranını gizle
        this.elements.authScreen.classList.add('hidden');

        // Kullanıcı menüsünü güncelle
        this.updateUserMenu(user);

        // Hoşgeldin animasyonunu göster
        const nameDisplay = user.isAdmin ? 'Admin' : (user.name + ' ' + user.surname);
        this.elements.welcomeUserName.textContent = 'Hoş Geldin, ' + nameDisplay + '!';
        this.elements.welcomeOverlay.classList.add('active');

        // 2.5 saniye sonra uygulamaya geç
        setTimeout(() => {
            this.elements.welcomeOverlay.classList.remove('active');
            this.elements.appContent.style.display = 'block';
            if (!this.appInitialized) {
                this.appInitialized = true;
                // Admin girişi yapılmadıysa
                if (user.isAdmin) {
                    this.init();
                    this.openAdminPanel();
                } else {
                    this.init();
                }
            }
            // Hoşgeldin toast'ı
            if (!user.isAdmin) {
                this.showToast('👋 Hoş geldin, ' + user.nickname + '!');
            }
        }, 2500);
    }

    updateUserMenu(user) {
        if (!this.elements.userAvatarLetter) return;
        const letter = (user.name || user.nickname || '?').charAt(0).toUpperCase();
        this.elements.userAvatarLetter.textContent = letter;
        this.elements.userDropdownName.textContent = user.isAdmin ? 'Admin' : (user.name + ' ' + user.surname);
        this.elements.userDropdownNick.textContent = '@' + (user.isAdmin ? 'admin' : user.nickname);
    }

    switchUser() {
        this.appInitialized = false;
        this.elements.appContent.style.display = 'none';
        this.elements.authScreen.classList.remove('hidden');
        this.elements.authScreen.style.display = 'flex';
        this.elements.loginForm.classList.remove('active');
        this.elements.registerForm.classList.add('active');
        this.elements.chatMessages.innerHTML = '';
        if (this.elements.welcomeScreen) this.elements.welcomeScreen.style.display = 'flex';
        this.conversations = [];
        this.currentConversationId = null;
        this.closeAdminPanel();
        this.showToast('🔄 Kullanıcı değiştiriliyor...');
    }

    // === Admin Paneli ===

    openAdminPanel() {
        this.elements.adminModal.classList.add('active');
        this.renderAdminUsers();
        this.renderAdminStats();
    }

    closeAdminPanel() {
        this.elements.adminModal.classList.remove('active');
    }

    renderAdminUsers() {
        const list = this.elements.adminUserList;
        const search = this.elements.adminUserSearch.value.trim().toLowerCase();
        const users = this.userManager.getAllUsers().filter(u => {
            if (!search) return true;
            return u.name.toLowerCase().includes(search) ||
                   u.surname.toLowerCase().includes(search) ||
                   u.nickname.toLowerCase().includes(search) ||
                   u.email.toLowerCase().includes(search);
        });

        this.elements.adminUserCount.textContent = users.length + ' kullanıcı';

        if (users.length === 0) {
            list.innerHTML = '<p class="text-muted">Kullanıcı bulunamadı.</p>';
            return;
        }

        list.innerHTML = users.map(u => {
            const initial = (u.name.charAt(0) + u.surname.charAt(0)).toUpperCase() || u.nickname.charAt(0).toUpperCase();
            const created = new Date(u.createdAt).toLocaleDateString('tr-TR');
            const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('tr-TR') : '-';
            return `
                <div class="admin-user-card" data-id="${u.id}">
                    <div class="admin-user-avatar">${initial}</div>
                    <div class="admin-user-info">
                        <div class="admin-user-name">${this.escapeHtml(u.name + ' ' + u.surname)} <small>@${this.escapeHtml(u.nickname)}</small></div>
                        <div class="admin-user-email">${this.escapeHtml(u.email)}</div>
                    </div>
                    <div class="admin-user-meta">
                        <div class="admin-user-date">Kayıt: ${created}</div>
                        <div class="admin-user-date">Son: ${lastLogin}</div>
                    </div>
                    <button class="admin-user-del-btn" data-id="${u.id}" title="Kullanıcıyı sil">✕</button>
                </div>
            `;
        }).join('');

        // Silme butonları
        list.querySelectorAll('.admin-user-del-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = btn.dataset.id;
                if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
                const result = this.userManager.deleteUser(userId);
                if (result.success) {
                    this.showToast('✅ Kullanıcı silindi');
                    this.renderAdminUsers();
                    this.renderAdminStats();
                } else {
                    this.showToast('❌ ' + result.error);
                }
            });
        });
    }

    renderAdminStats() {
        const stats = this.userManager.getStats();
        if (this.elements.statTotalUsers) this.elements.statTotalUsers.textContent = stats.totalUsers;
        if (this.elements.statActiveToday) this.elements.statActiveToday.textContent = stats.activeToday;
        if (this.elements.statTotalChats) this.elements.statTotalChats.textContent = stats.totalChats;
        if (this.elements.statTotalMessages) this.elements.statTotalMessages.textContent = stats.totalMessages;
    }

    bindEvents() {
        // Yeni sohbet
        this.elements.newChatBtn.addEventListener('click', () => this.createNewConversation());
        this.elements.newChatBtn2.addEventListener('click', () => this.createNewConversation());

        // Mesaj gönderme
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
            // Otomatik yükseklik
            setTimeout(() => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }, 0);
        });

        // Dosya ekleme
        this.elements.attachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.elements.fileInput.click();
        });
        this.elements.fileInput.addEventListener('change', () => this.handleFileSelect());

        // Menü toggle (mobil)
        this.elements.menuToggle.addEventListener('click', () => {
            this.elements.sidebar.classList.toggle('open');
        });

        // Ayarlar modal
        this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
        this.elements.settingsClose.addEventListener('click', () => this.closeSettings());
        this.elements.settingsClose2.addEventListener('click', () => this.closeSettings());
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) this.closeSettings();
        });
        this.elements.settingsSave.addEventListener('click', () => this.saveSettings());

        this.elements.addEthicsRuleBtn.addEventListener('click', () => this.addEthicsRule());
        this.elements.ethicsRuleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addEthicsRule();
        });

        // Repo modal
        this.elements.repoModalClose.addEventListener('click', () => this.closeRepoModal());
        this.elements.repoModalCancel.addEventListener('click', () => this.closeRepoModal());
        this.elements.repoModal.addEventListener('click', (e) => {
            if (e.target === this.elements.repoModal) this.closeRepoModal();
        });
        this.elements.repoModalSave.addEventListener('click', () => this.saveRepo());

        // Repo icon picker
        this.elements.repoIconPicker.addEventListener('click', (e) => {
            const btn = e.target.closest('.repo-icon-option');
            if (!btn) return;
            this.elements.repoIconPicker.querySelectorAll('.repo-icon-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
        this.elements.repoIconPicker.querySelector('#repoIconCustom').addEventListener('input', (e) => {
            this.elements.repoIconPicker.querySelectorAll('.repo-icon-option').forEach(b => b.classList.remove('selected'));
        });

        this.elements.archivedToggle.addEventListener('click', () => {
            const list = this.elements.archivedList;
            const arrow = this.elements.archivedToggle.querySelector('.archived-arrow');
            if (list.style.display === 'none' || !list.style.display) {
                list.style.display = 'block';
                arrow.textContent = '▼';
            } else {
                list.style.display = 'none';
                arrow.textContent = '▶';
            }
        });

        // AI Görsel
        this.elements.aiImageBtn.addEventListener('click', () => this.openAIImage());
        this.elements.aiImageClose.addEventListener('click', () => this.closeAIImage());
        this.elements.aiImageOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.aiImageOverlay) this.closeAIImage();
        });
        this.elements.aiImageOpenBtn.addEventListener('click', () => this.openPerchanceTab());
        this.elements.aiImageSendBtn.addEventListener('click', () => this.sendImageUrlToChat());
        this.elements.aiImageSendCancel.addEventListener('click', () => { this.elements.aiImageUrlInput.value = ''; });
        this.elements.aiImageUrlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendImageUrlToChat();
        });
        // ESC ile kapat
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.aiImageOverlay.classList.contains('active')) {
                this.closeAIImage();
            }
        });
    }

    // === API İletişimi ===

    async api(method, endpoint, body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, options);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'API hatası');
            }

            return data;
        } catch (error) {
            console.error(`API Hatası [${method} ${endpoint}]:`, error);
            throw error;
        }
    }

    // === Sohbet İşlemleri ===

    async loadConversations() {
        try {
            const data = await this.api('GET', '/chat/conversations');
            this.conversations = data.conversations;
            this.renderConversationList();

            // Son sohbeti aç
            if (this.conversations.length > 0 && !this.currentConversationId) {
                this.openConversation(this.conversations[0].id);
            }
        } catch (e) {
            console.error('Sohbetler yüklenemedi:', e);
            this.showError('Sohbetler yüklenemedi. Backend çalışıyor mu?');
        }
    }

    async createNewConversation() {
        try {
            const data = await this.api('POST', '/chat/conversations', {
                title: 'Yeni Sohbet',
                model_provider: 'groq'
            });

            this.conversations.unshift(data.conversation);
            this.renderConversationList();
            this.openConversation(data.conversation.id);

            // Mobilde sidebar'ı kapat
            this.elements.sidebar.classList.remove('open');
        } catch (e) {
            this.showError('Yeni sohbet oluşturulamadı');
        }
    }

    async openConversation(convId) {
        this.currentConversationId = convId;

        // Sidebar'da aktif göster
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.id) === convId);
        });

        try {
            const data = await this.api('GET', `/chat/conversations/${convId}`);
            this.renderMessages(data.messages);
        } catch (e) {
            console.error('Sohbet yüklenemedi:', e);
        }
    }

    async sendMessage() {
        const message = this.elements.chatInput.value.trim();
        if (!message || this.isLoading) return;

        if (!this.currentConversationId) {
            await this.createNewConversation();
        }

        // Input'u temizle
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';

        // Kullanıcı mesajını göster
        this.hideWelcomeScreen();
        this.appendMessage('user', message);
        this.isLoading = true;
        this.showTypingIndicator();

        try {
            const data = await this.api('POST', '/chat/send', {
                conversation_id: this.currentConversationId,
                message: message
            });

            this.hideTypingIndicator();
            this.appendMessage('assistant', data.response, data.model_used);
            if (this.elements.modelBadge) {
                this.elements.modelBadge.textContent = data.model_used || 'Groq';
            }

            // Sohbet başlığını güncelle
            if (this.conversations.length > 0) {
                const conv = this.conversations.find(c => c.id === this.currentConversationId);
                if (conv && conv.title === 'Yeni Sohbet') {
                    conv.title = message.substring(0, 40) + (message.length > 40 ? '...' : '');
                    this.renderConversationList();
                }
            }

        } catch (e) {
            this.hideTypingIndicator();
            this.appendMessage('assistant', `⚠️ Hata: ${e.message}`);
        } finally {
            this.isLoading = false;
        }
    }

    // === Mesaj Render ===

    hideWelcomeScreen() {
        const ws = this.elements.welcomeScreen;
        if (ws) {
            ws.style.display = 'none';
        }
    }

    appendMessage(role, content, model = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = this.formatContent(content);
        messageDiv.appendChild(bubble);

        if (model) {
            const meta = document.createElement('div');
            meta.className = 'msg-meta';
            meta.textContent = `Model: ${model}`;
            messageDiv.appendChild(meta);
        }

        this.elements.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    renderMessages(messages) {
        this.elements.chatMessages.innerHTML = '';
        this.hideWelcomeScreen();

        if (messages.length === 0) return;

        messages.forEach(msg => {
            this.appendMessage(msg.role, msg.content, msg.model_used);
        });

        this.scrollToBottom();
    }

    formatContent(content) {
        if (!content) return '';

        // Kod bloklarını formatla (```)
        content = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const langClass = lang ? ` class="language-${lang}"` : '';
            return `<pre><code${langClass}>${this.escapeHtml(code.trim())}</code></pre>`;
        });

        // Inline kod (`)
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Kalın (**)
        content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Yeni satırları <br>'e çevir
        content = content.replace(/\n/g, '<br>');

        return content;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.id = 'typingIndicator';
        div.innerHTML = `<div class="bubble"><div class="typing-indicator">
            <span></span><span></span><span></span>
        </div></div>`;
        this.elements.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    scrollToBottom() {
        setTimeout(() => {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }, 50);
    }

    // === Sağ Sidebar (Projelerim) ===

    async loadRepoSites() {
        try {
            const data = await this.api('GET', '/repos');
            this.repos = data.repos || [];
        } catch (e) {
            console.error('Projeler yüklenemedi:', e);
            this.repos = [];
        }
        this.renderRepoSites();
    }

    renderRepoSites() {
        const list = this.elements.repoList;
        const sites = this.repos;

        const groups = {};
        sites.forEach(site => {
            const badge = site.badge || 'Diğer';
            if (!groups[badge]) groups[badge] = [];
            groups[badge].push(site);
        });

        let html = '';
        const order = ['Domain', 'Pages', 'Vercel', 'Render', 'Web', 'App', 'Site', 'Diğer'];
        order.forEach(label => {
            if (!groups[label]) return;
            html += `<div class="repo-section-label">
                <span>${label}</span>
                <button class="conv-btn add-repo-btn" data-badge="${label}" title="Proje ekle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                </button>
            </div>`;
            groups[label].forEach(site => {
                html += `
                    <div class="repo-link" data-id="${site.id}">
                        <a href="${site.url}" target="_blank" rel="noopener"
                           class="repo-link-inner" title="${site.name}">
                            <span class="repo-icon">${site.icon}</span>
                            <span class="repo-name">${site.name}</span>
                        </a>
                        <span class="repo-badge">${site.badge}</span>
                        <span class="repo-actions">
                            <button class="conv-btn edit-btn" data-id="${site.id}" title="Düzenle">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="conv-btn delete-btn" data-id="${site.id}" title="Sil">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                </svg>
                            </button>
                        </span>
                    </div>
                `;
            });
        });

        list.innerHTML = html;
        this.elements.repoCount.textContent = `${sites.length} proje`;

        // Ekleme butonları
        list.querySelectorAll('.add-repo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openRepoModal(null, btn.dataset.badge);
            });
        });

        // Düzenleme butonları
        list.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const repo = this.repos.find(r => r.id === parseInt(btn.dataset.id));
                if (repo) this.openRepoModal(repo);
            });
        });

        // Silme butonları
        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteRepoSite(parseInt(btn.dataset.id));
            });
        });
    }

    // === Repo CRUD ===

    openRepoModal(repo = null, defaultBadge = null) {
        this.editingRepoId = repo ? repo.id : null;
        this.elements.repoModalTitle.textContent = repo ? '✏️ Proje Düzenle' : '🌐 Proje Ekle';
        this.elements.repoNameInput.value = repo ? repo.name : '';
        this.elements.repoUrlInput.value = repo ? repo.url : '';

        // İkon seçimi
        const icon = repo ? repo.icon : '🌐';
        this.elements.repoIconPicker.querySelectorAll('.repo-icon-option').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.icon === icon);
        });
        this.elements.repoIconPicker.querySelector('#repoIconCustom').value = '';

        // Etiket seçimi
        if (repo) {
            this.elements.repoBadgeInput.value = repo.badge;
        } else if (defaultBadge) {
            this.elements.repoBadgeInput.value = defaultBadge;
        } else {
            this.elements.repoBadgeInput.value = 'Site';
        }

        this.elements.repoModal.classList.add('active');
        this.elements.repoNameInput.focus();
    }

    closeRepoModal() {
        this.elements.repoModal.classList.remove('active');
        this.editingRepoId = null;
    }

    getSelectedIcon() {
        const selected = this.elements.repoIconPicker.querySelector('.repo-icon-option.selected');
        if (selected) return selected.dataset.icon;
        const custom = this.elements.repoIconPicker.querySelector('#repoIconCustom').value.trim();
        return custom || '🌐';
    }

    async saveRepo() {
        const name = this.elements.repoNameInput.value.trim();
        const url = this.elements.repoUrlInput.value.trim();
        if (!name) { this.showToast('Proje adı gerekli'); return; }
        if (!url) { this.showToast('URL gerekli'); return; }

        const icon = this.getSelectedIcon();
        const badge = this.elements.repoBadgeInput.value;
        const isEdit = this.editingRepoId !== null;

        try {
            if (isEdit) {
                await this.api('PUT', `/repos/${this.editingRepoId}`, { name, url, icon, badge });
                this.showToast('Proje güncellendi');
            } else {
                await this.api('POST', '/repos', { name, url, icon, badge });
                this.showToast('Proje eklendi');
            }
            this.closeRepoModal();
            await this.loadRepoSites();
        } catch (e) {
            this.showError('Proje kaydedilemedi');
        }
    }

    async deleteRepoSite(repoId) {
        const repo = this.repos.find(r => r.id === repoId);
        if (!confirm(`"${repo ? repo.name : 'bu proje'}" silinsin mi?`)) return;
        try {
            await this.api('DELETE', `/repos/${repoId}`);
            this.showToast('Proje silindi');
            await this.loadRepoSites();
        } catch (e) {
            this.showError('Proje silinemedi');
        }
    }

    // === Sidebar ===

    renderConversationList() {
        const list = this.elements.conversationList;

        if (this.conversations.length === 0) {
            list.innerHTML = '<div class="loading-msg">Henüz sohbet yok</div>';
            return;
        }

        list.innerHTML = this.conversations.map(conv => `
            <div class="conversation-item ${conv.id === this.currentConversationId ? 'active' : ''}"
                 data-id="${conv.id}">
                <div class="conv-info">
                    <div class="conv-title">${this.escapeHtml(conv.title)}</div>
                    <div class="conv-meta">${new Date(conv.updated_at).toLocaleString('tr-TR')}</div>
                </div>
                <div class="conv-actions">
                    <button class="conv-btn archive-btn" data-id="${conv.id}" title="Arşivle">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>
                        </svg>
                    </button>
                    <button class="conv-btn delete-btn" data-id="${conv.id}" title="Sil">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.conversation-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.conv-btn')) return;
                this.openConversation(parseInt(el.dataset.id));
                this.elements.sidebar.classList.remove('open');
            });
        });

        list.querySelectorAll('.archive-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.archiveConversation(parseInt(btn.dataset.id));
            });
        });

        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteConversation(parseInt(btn.dataset.id));
            });
        });
    }

    async deleteConversation(convId) {
        if (!confirm('Bu sohbeti silmek istediğinize emin misiniz?')) return;
        try {
            await this.api('DELETE', `/chat/conversations/${convId}`);
            this.conversations = this.conversations.filter(c => c.id !== convId);
            if (this.currentConversationId === convId) {
                this.currentConversationId = null;
                this.elements.chatMessages.innerHTML = '';
                if (this.conversations.length > 0) {
                    this.openConversation(this.conversations[0].id);
                }
            }
            this.renderConversationList();
            this.showToast('Sohbet silindi');
        } catch (e) {
            this.showError('Sohbet silinemedi');
        }
    }

    async archiveConversation(convId) {
        try {
            await this.api('POST', `/chat/conversations/${convId}/archive`);
            this.conversations = this.conversations.filter(c => c.id !== convId);
            if (this.currentConversationId === convId) {
                this.currentConversationId = null;
                this.elements.chatMessages.innerHTML = '';
                if (this.conversations.length > 0) {
                    this.openConversation(this.conversations[0].id);
                }
            }
            this.renderConversationList();
            this.loadArchivedConversations();
            this.showToast('Sohbet arşivlendi');
        } catch (e) {
            this.showError('Sohbet arşivlenemedi');
        }
    }

    async loadArchivedConversations() {
        try {
            const data = await this.api('GET', '/chat/conversations/archived');
            this.archivedConversations = data.conversations;
            this.renderArchivedList();
        } catch (e) {
            this.archivedConversations = [];
            console.error('Arşivlenenler yüklenemedi:', e);
        }
    }

    renderArchivedList() {
        const list = this.elements.archivedList;
        const countEl = this.elements.archivedCount;
        const archived = this.archivedConversations || [];

        countEl.textContent = archived.length;

        if (archived.length === 0) {
            list.innerHTML = '<div class="archived-empty">Arşivlenen sohbet yok</div>';
            return;
        }

        list.innerHTML = archived.map(conv => `
            <div class="archived-item" data-id="${conv.id}">
                <div class="archived-item-info" data-id="${conv.id}">
                    <div class="archived-item-title">${this.escapeHtml(conv.title)}</div>
                    <div class="archived-item-meta">${new Date(conv.updated_at).toLocaleString('tr-TR')}</div>
                </div>
                <button class="conv-btn unarchive-btn" data-id="${conv.id}" title="Arşivden Çıkar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 8v13H3V8M1 3h22v5H1zM12 8v9M8 13l4 4 4-4"/>
                    </svg>
                </button>
            </div>
        `).join('');

        list.querySelectorAll('.archived-item-info').forEach(el => {
            el.addEventListener('click', () => {
                this.openConversation(parseInt(el.dataset.id));
                this.elements.sidebar.classList.remove('open');
            });
        });

        list.querySelectorAll('.unarchive-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unarchiveConversation(parseInt(btn.dataset.id));
            });
        });
    }

    async unarchiveConversation(convId) {
        try {
            await this.api('POST', `/chat/conversations/${convId}/unarchive`);
            this.conversations.unshift({...this.archivedConversations.find(c => c.id === convId), is_archived: 0});
            this.archivedConversations = this.archivedConversations.filter(c => c.id !== convId);
            this.renderConversationList();
            this.renderArchivedList();
            this.showToast('Sohbet arşivden çıkarıldı');
        } catch (e) {
            this.showError('Arşivden çıkarılamadı');
        }
    }

    // === Sağlık Kontrolü ===

    async checkHealth() {
        try {
            const data = await this.api('GET', '/health');
            const badge = this.elements.statusBadge;
            badge.textContent = '● Çevrimiçi';
            badge.style.color = 'var(--success)';

            this.elements.modelBadge.textContent = 'Groq';

            // API anahtarı durumu
            const statusRows = this.elements.systemStatus.querySelectorAll('.status-row');
            if (statusRows.length >= 3) {
                const groqStatus = statusRows[1].querySelector('span:last-child');
                const orStatus = statusRows[2].querySelector('span:last-child');

                if (data.groq_configured) {
                    groqStatus.textContent = '● Anahtar Var';
                    groqStatus.style.color = 'var(--success)';
                } else {
                    groqStatus.textContent = '● Anahtar Yok';
                    groqStatus.style.color = 'var(--warning)';
                }

                if (data.openrouter_configured) {
                    orStatus.textContent = '● Anahtar Var';
                    orStatus.style.color = 'var(--success)';
                } else {
                    orStatus.textContent = '● Anahtar Yok';
                    orStatus.style.color = 'var(--warning)';
                }
            }

            this.elements.ethicsCount.textContent = data.ethics_rules || 0;

        } catch (e) {
            const badge = this.elements.statusBadge;
            badge.textContent = '● Bağlantı Yok';
            badge.style.color = 'var(--error)';
        }
    }

    // === Ayarlar ===

    async openSettings() {
        this.elements.settingsModal.classList.add('active');

        // Mevcut etik kurallarını yükle
        this.loadEthicsRules();

        // Kayıtlı ayarları yükle
        const saved = JSON.parse(localStorage.getItem('zeka_ajani_settings') || '{}');
        if (saved.groqKey) this.elements.inputGroqKey.value = saved.groqKey;
        if (saved.openrouterKey) this.elements.inputOpenRouterKey.value = saved.openrouterKey;
        if (saved.provider) this.elements.inputProvider.value = saved.provider;
        if (saved.groqModel) this.elements.inputGroqModel.value = saved.groqModel;
    }

    closeSettings() {
        this.elements.settingsModal.classList.remove('active');
    }

    // AI Image Overlay
    openAIImage() {
        this.elements.aiImageOverlay.classList.add('active');
        this.elements.aiImageUrlInput.focus();
    }

    closeAIImage() {
        this.elements.aiImageOverlay.classList.remove('active');
        this.elements.aiImageUrlInput.value = '';
    }

    openPerchanceTab() {
        window.open('https://null.perchance.org/image-ai', '_blank');
        this.showToast('✨ Perchance yeni sekmede açıldı. Görseli oluşturup URL\'sini kopyalayın ve buraya yapıştırın.');
    }

    sendImageUrlToChat() {
        const url = this.elements.aiImageUrlInput.value.trim();
        if (!url) return;

        if (!url.match(/^https?:\/\/.+/i)) {
            this.showToast('Geçerli bir URL girin (https:// ile başlamalı)');
            return;
        }

        this.closeAIImage();

        this.hideWelcomeScreen();
        const imageHtml = `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener">
            <img src="${this.escapeHtml(url)}" alt="AI Görsel" class="chat-image"
                 style="max-width:100%;max-height:400px;border-radius:8px;cursor:pointer;margin:8px 0"
                 onclick="window.open(this.src)">
        </a>`;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = `<strong>🖼️ AI Görsel</strong><br>${imageHtml}`;
        messageDiv.appendChild(bubble);
        this.elements.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        this.elements.aiImageUrlInput.value = '';
        this.showToast('Görsel sohbete eklendi');
    }

    // Dosya ekleme
    handleFileSelect() {
        const files = this.elements.fileInput.files;
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            // Dosya boyutu kontrolü (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                this.showToast(`⚠️ ${file.name} çok büyük (max 10MB)`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                this.appendFileToChat(file, dataUrl);
            };
            reader.onerror = () => {
                this.showToast(`⚠️ ${file.name} okunamadı`);
            };
            reader.readAsDataURL(file);
        });

        // Input'u sıfırla (aynı dosyayı tekrar seçebilmek için)
        this.elements.fileInput.value = '';
    }

    appendFileToChat(file, dataUrl) {
        this.hideWelcomeScreen();

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        // Görsel dosyaları inline göster, diğerlerini link olarak
        if (file.type.startsWith('image/')) {
            bubble.innerHTML = `<div style="margin-bottom:4px;font-size:12px;color:var(--text-muted)">📷 ${this.escapeHtml(file.name)}</div>
                <img src="${dataUrl}" alt="${this.escapeHtml(file.name)}"
                     style="max-width:100%;max-height:400px;border-radius:8px;cursor:pointer"
                     onclick="window.open('${dataUrl}')">`;
        } else {
            const icon = file.type.includes('pdf') ? '📄' :
                         file.type.includes('zip') || file.type.includes('rar') ? '📦' :
                         file.type.includes('text') || file.name.match(/\.(js|py|html|css|json|xml|md)$/i) ? '📝' : '📎';
            const sizeStr = file.size > 1024 * 1024
                ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
                : (file.size / 1024).toFixed(0) + ' KB';
            bubble.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px 0">
                <span style="font-size:24px">${icon}</span>
                <div>
                    <div style="font-weight:600;font-size:13px">${this.escapeHtml(file.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${sizeStr}</div>
                </div>
                <a href="${dataUrl}" download="${this.escapeHtml(file.name)}"
                   style="margin-left:auto;padding:4px 10px;background:var(--accent);color:#fff;border-radius:6px;text-decoration:none;font-size:12px">İndir</a>
            </div>`;
        }

        messageDiv.appendChild(bubble);

        // Mesajı sohbet listesinin sonundan bir önceki konuma ekle (typing indicator'dan önce)
        const typingIndicator = this.elements.chatMessages.querySelector('.typing-indicator');
        if (typingIndicator) {
            this.elements.chatMessages.insertBefore(messageDiv, typingIndicator);
        } else {
            this.elements.chatMessages.appendChild(messageDiv);
        }
        this.scrollToBottom();
    }

    async saveSettings() {
        const settings = {
            groqKey: this.elements.inputGroqKey.value,
            openrouterKey: this.elements.inputOpenRouterKey.value,
            provider: this.elements.inputProvider.value,
            groqModel: this.elements.inputGroqModel.value,
        };

        localStorage.setItem('zeka_ajani_settings', JSON.stringify(settings));
        this.closeSettings();
        this.showToast('Ayarlar kaydedildi');
    }

    // === Etik Kurallar ===

    async loadEthicsRules() {
        // Etik kuralları local'de sakla (backend'deki ethics_rules tablosu ile senkron)
        const rules = JSON.parse(localStorage.getItem('zeka_ajani_ethics_rules') || '[]');
        this.renderEthicsRules(rules);
    }

    async addEthicsRule() {
        const input = this.elements.ethicsRuleInput;
        const text = input.value.trim();

        if (!text) return;

        const rules = JSON.parse(localStorage.getItem('zeka_ajani_ethics_rules') || '[]');
        rules.push({ key: `rule_${Date.now()}`, text: text });
        localStorage.setItem('zeka_ajani_ethics_rules', JSON.stringify(rules));

        input.value = '';
        this.renderEthicsRules(rules);
        this.elements.ethicsCount.textContent = rules.length;
        this.showToast('Etik kuralı eklendi');
    }

    deleteEthicsRule(key) {
        let rules = JSON.parse(localStorage.getItem('zeka_ajani_ethics_rules') || '[]');
        rules = rules.filter(r => r.key !== key);
        localStorage.setItem('zeka_ajani_ethics_rules', JSON.stringify(rules));
        this.renderEthicsRules(rules);
        this.elements.ethicsCount.textContent = rules.length;
    }

    renderEthicsRules(rules) {
        const list = this.elements.ethicsRulesList;

        if (rules.length === 0) {
            list.innerHTML = '<p class="text-muted">Henüz etik kuralı tanımlanmamış.</p>';
            return;
        }

        list.innerHTML = rules.map(rule => `
            <div class="ethics-rule-item">
                <span class="rule-text">📜 ${this.escapeHtml(rule.text)}</span>
                <button class="rule-delete" onclick="app.deleteEthicsRule('${rule.key}')">✕</button>
            </div>
        `).join('');
    }

    // === UI Yardımcıları ===

    showError(msg) {
        console.error(msg);
        this.showToast('⚠️ ' + msg);
    }

    showToast(msg) {
        // Basit toast bildirimi
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            zIndex: '2000',
            fontSize: '14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'messageSlide 0.3s ease',
        });

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// === Uygulamayı Başlat ===
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new ZekaAjani();
    window.app = app; // Global erişim için (etik kural silme vs.)
});
