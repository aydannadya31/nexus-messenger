/**
 * Zeka Ajanı - Frontend Uygulaması
 * Web arayüzü ile backend API arasındaki iletişimi yönetir
 */

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
            aiImageFrame: document.getElementById('aiImageFrame'),
        };

        // === Canlı Projeler ===
        this.repos = [];
        this.editingRepoId = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadConversations();
        this.loadArchivedConversations();
        this.checkHealth();
        this.loadRepoSites();
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
        this.elements.aiImageFrame.src = 'https://null.perchance.org/image-ai';
    }

    closeAIImage() {
        this.elements.aiImageOverlay.classList.remove('active');
        this.elements.aiImageFrame.src = 'about:blank';
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
