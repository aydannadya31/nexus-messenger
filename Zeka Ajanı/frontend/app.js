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
        this.apiBase = 'http://localhost:8000/api';

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
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadConversations();
        this.checkHealth();
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

        // Etik kural ekleme
        this.elements.addEthicsRuleBtn.addEventListener('click', () => this.addEthicsRule());
        this.elements.ethicsRuleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addEthicsRule();
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

        content = content.replace(
            /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?)/gi,
            '<img src="$1" alt="görsel" class="chat-image" onclick="window.open(this.src)" style="max-width:100%;border-radius:8px;cursor:pointer;margin:8px 0">'
        );

        if (content.includes('tbm=isch') || content.includes('google.com/search')) {
            const match = content.match(/q=([^&\s]+)/);
            if (match) {
                const query = decodeURIComponent(match[1].replace(/\+/g, ' '));
                this.searchAndShowImages(query);
            }
        }

        // Kod bloklarını formatla (```)
        content = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const langClass = lang ? ` class="language-${lang}"` : '';
            return `<pre><code${langClass}>${this.escapeHtml(code.trim())}</code></pre>`;
        });

        // Inline kod (`)
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Kalın (**)
        content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        content = content.replace(
            /(https?:\/\/[^\s<]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );

        // Yeni satırları <br>'e çevir
        content = content.replace(/\n/g, '<br>');

        return content;
    }

    async searchAndShowImages(query) {
        try {
            const data = await this.api('POST', '/web/images', { query });
            if (data.success && data.results.length > 0) {
                const gallery = document.createElement('div');
                gallery.className = 'image-gallery';
                gallery.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0';

                data.results.forEach(img => {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'border-radius:8px;overflow:hidden;background:var(--bg-card);border:1px solid var(--border)';
                    wrapper.innerHTML = `
                        <img src="${this.escapeHtml(img.thumbnail)}"
                             alt="${this.escapeHtml(img.title || query)}"
                             style="width:100%;height:150px;object-fit:cover;display:block"
                             onclick="window.open(this.src)"
                             loading="lazy">
                    `;
                    gallery.appendChild(wrapper);
                });

                this.elements.chatMessages.appendChild(gallery);
                this.scrollToBottom();
            }
        } catch (e) {
            console.error('Görsel arama hatası:', e);
        }
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
                <div class="conv-title">${this.escapeHtml(conv.title)}</div>
                <div class="conv-meta">${new Date(conv.updated_at).toLocaleString('tr-TR')}</div>
            </div>
        `).join('');

        // Click eventleri
        list.querySelectorAll('.conversation-item').forEach(el => {
            el.addEventListener('click', () => {
                this.openConversation(parseInt(el.dataset.id));
                this.elements.sidebar.classList.remove('open');
            });
        });
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
