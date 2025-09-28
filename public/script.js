class EclipsePanel {
    constructor() {
        this.currentApp = null;
        this.apps = [];
        this.init();
    }

    async init() {
        this.initEventListeners();
        await this.loadApps();
        this.showTab('apps');
    }

    initEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.showTab(e.target.dataset.tab);
            });
        });

        // Apps
        document.getElementById('create-app').addEventListener('click', () => this.createApp());
        
        // Keys
        document.getElementById('app-select').addEventListener('change', (e) => this.selectApp(e.target.value));
        document.getElementById('generate-key').addEventListener('click', () => this.generateKey());
        document.getElementById('refresh-keys').addEventListener('click', () => this.refreshKeys());
        document.getElementById('filter-status').addEventListener('change', () => this.refreshKeys());
        document.getElementById('copy-key').addEventListener('click', () => this.copyKey());
        document.getElementById('duration').addEventListener('change', (e) => {
            this.toggleCustomDays(e.target.value === 'custom');
        });

        // Validation
        document.getElementById('validate-key').addEventListener('click', () => this.validateKey());

        // Copy buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.copy-btn')) {
                const target = e.target.closest('.copy-btn').dataset.target;
                this.copyToClipboard(document.getElementById(target));
            }
        });

        // Modal
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('app-modal')) {
                this.closeModal();
            }
        });
    }

    showTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Show tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `${tabName}-tab`);
        });

        // Load data if needed
        if (tabName === 'keys') {
            this.loadAppsForSelect();
        }
    }

    async api(endpoint, options = {}) {
        const url = `/api${endpoint}`;
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body) {
            config.body = JSON.stringify(options.body);
        }

        try {
            console.log('Making API request:', url, config);
            const response = await fetch(url, config);
            const result = await response.json();
            console.log('API response:', result);
            return result;
        } catch (error) {
            console.error('API Error:', error);
            this.showToast('Ошибка соединения', 'error');
            return { success: false, error: 'Connection failed' };
        }
    }

    async loadApps() {
        const result = await this.api('/apps');
        if (result.success) {
            this.apps = result.apps;
            this.renderApps();
        }
    }

    async loadAppsForSelect() {
        const result = await this.api('/apps');
        if (result.success) {
            const select = document.getElementById('app-select');
            select.innerHTML = '<option value="">-- Выберите приложение --</option>';
            
            result.apps.forEach(app => {
                const option = document.createElement('option');
                option.value = app.id;
                option.textContent = app.name;
                option.setAttribute('data-owner-id', app.ownerId);
                option.setAttribute('data-secret-key', app.secretKey);
                select.appendChild(option);
            });
        }
    }

    renderApps() {
        const tbody = document.getElementById('apps-list');
        
        if (this.apps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--gray);">Нет приложений</td></tr>';
            return;
        }

        tbody.innerHTML = this.apps.map(app => `
            <tr>
                <td>
                    <strong>${app.name}</strong>
                </td>
                <td>
                    <code>${app.ownerId}</code>
                </td>
                <td>
                    <span class="status-badge status-active">${app.activeKeys}/${app.keyCount}</span>
                </td>
                <td>${new Date(app.created * 1000).toLocaleDateString('ru-RU')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary view-app" data-app-id="${app.id}">
                            <i class="fas fa-eye"></i> Данные
                        </button>
                        <button class="btn btn-sm btn-danger delete-app" data-app-id="${app.id}">
                            <i class="fas fa-trash"></i> Удалить
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Add event listeners
        tbody.querySelectorAll('.view-app').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const appId = e.target.closest('.view-app').dataset.appId;
                this.showAppCredentials(appId);
            });
        });

        tbody.querySelectorAll('.delete-app').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const appId = e.target.closest('.delete-app').dataset.appId;
                this.deleteApp(appId);
            });
        });
    }

    async createApp() {
        const nameInput = document.getElementById('app-name');
        const name = nameInput.value.trim();

        if (!name || name.length < 2) {
            this.showToast('Название приложения должно быть не менее 2 символов', 'error');
            return;
        }

        const btn = document.getElementById('create-app');
        btn.classList.add('loading');

        const result = await this.api('/apps/create', {
            method: 'POST',
            body: { name }
        });

        btn.classList.remove('loading');

        if (result.success) {
            this.showAppCredentialsModal(result.app);
            nameInput.value = '';
            await this.loadApps();
            await this.loadAppsForSelect();
        } else {
            this.showToast(result.error, 'error');
        }
    }

    showAppCredentialsModal(app) {
        document.getElementById('modal-owner-id').textContent = app.ownerId;
        document.getElementById('modal-secret-key').textContent = app.secretKey;
        document.getElementById('app-modal').style.display = 'block';
    }

    closeModal() {
        document.getElementById('app-modal').style.display = 'none';
    }

    async showAppCredentials(appId) {
        const app = this.apps.find(a => a.id === appId);
        if (app) {
            this.showAppCredentialsModal(app);
        }
    }

    async deleteApp(appId) {
        if (!confirm('Удалить приложение? Все ключи будут удалены.')) {
            return;
        }

        const result = await this.api(`/apps/${appId}`, {
            method: 'DELETE'
        });

        if (result.success) {
            this.showToast('Приложение удалено', 'success');
            await this.loadApps();
            await this.loadAppsForSelect();
            
            if (this.currentApp && this.currentApp.id === appId) {
                this.currentApp = null;
                document.getElementById('app-actions').style.display = 'none';
            }
        } else {
            this.showToast('Ошибка удаления', 'error');
        }
    }

    async selectApp(appId) {
        const select = document.getElementById('app-select');
        const selectedOption = select.options[select.selectedIndex];
        
        if (!appId) {
            this.currentApp = null;
            document.getElementById('app-actions').style.display = 'none';
            document.getElementById('app-credentials-display').style.display = 'none';
            return;
        }

        // Находим приложение в списке
        const app = this.apps.find(a => a.id === appId);
        if (!app) {
            this.showToast('Приложение не найдено', 'error');
            return;
        }

        this.currentApp = {
            id: app.id,
            name: app.name,
            ownerId: app.ownerId,
            secretKey: selectedOption.getAttribute('data-secret-key')
        };
        
        console.log('Selected app:', this.currentApp);
        
        // Show app credentials
        document.getElementById('current-owner-id').textContent = this.currentApp.ownerId;
        document.getElementById('current-secret-key').textContent = '••••••••';
        document.getElementById('app-credentials-display').style.display = 'block';
        document.getElementById('app-actions').style.display = 'block';

        // Load stats and keys
        await this.loadAppStats();
        await this.refreshKeys();
    }

    async loadAppStats() {
        if (!this.currentApp) return;

        console.log('Loading stats for app:', this.currentApp.name);

        const stats = await this.api('/stats', {
            headers: {
                'X-Owner-ID': this.currentApp.ownerId,
                'X-Secret-Key': this.currentApp.secretKey
            }
        });

        console.log('Stats response:', stats);

        if (stats) {
            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-active').textContent = stats.active;
            document.getElementById('stat-banned').textContent = stats.banned;
            document.getElementById('stat-locked').textContent = stats.hwidLocked;
        }
    }

    async generateKey() {
        if (!this.currentApp) {
            this.showToast('Выберите приложение', 'error');
            return;
        }

        const durationSelect = document.getElementById('duration');
        const customDays = document.getElementById('custom-days');
        const note = document.getElementById('key-note').value;

        let days;
        if (durationSelect.value === 'custom') {
            days = parseInt(customDays.value) || 30;
        } else {
            days = parseInt(durationSelect.value) || 1;
        }

        if (days < 1) {
            this.showToast('Длительность должна быть положительной', 'error');
            return;
        }

        const btn = document.getElementById('generate-key');
        btn.classList.add('loading');

        console.log('Generating key with credentials:', {
            ownerId: this.currentApp.ownerId,
            secretKey: this.currentApp.secretKey ? '***' : 'missing'
        });

        const result = await this.api('/keys/generate', {
            method: 'POST',
            headers: {
                'X-Owner-ID': this.currentApp.ownerId,
                'X-Secret-Key': this.currentApp.secretKey
            },
            body: { days, note }
        });

        btn.classList.remove('loading');

        if (result.success) {
            document.getElementById('generated-key').value = result.key;
            document.getElementById('generated-key-section').style.display = 'block';
            document.getElementById('key-note').value = '';
            this.showToast('Ключ создан!', 'success');
            await this.refreshKeys();
            await this.loadAppStats();
        } else {
            this.showToast(result.error || 'Ошибка создания ключа', 'error');
        }
    }

    async refreshKeys() {
        if (!this.currentApp) return;

        const tbody = document.getElementById('keys-list');
        const filter = document.getElementById('filter-status').value;

        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">Загрузка...</td></tr>';

        const result = await this.api('/keys', {
            headers: {
                'X-Owner-ID': this.currentApp.ownerId,
                'X-Secret-Key': this.currentApp.secretKey
            }
        });

        if (!result.success) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Ошибка загрузки</td></tr>';
            return;
        }

        let keys = result.keys;
        if (filter !== 'all') {
            keys = keys.filter(k => k.status === filter);
        }

        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--gray);">Ключи не найдены</td></tr>';
            return;
        }

        tbody.innerHTML = keys.sort((a, b) => b.created - a.created).map(key => `
            <tr>
                <td><code>${key.key}</code></td>
                <td>${new Date(key.created * 1000).toLocaleDateString('ru-RU')}</td>
                <td>${new Date(key.expires * 1000).toLocaleDateString('ru-RU')}</td>
                <td>${key.remaining}</td>
                <td>${key.hwid ? '<i class="fas fa-lock" style="color: var(--success);"></i>' : '<i class="fas fa-unlock" style="color: var(--gray);"></i>'}</td>
                <td>
                    <span class="status-badge status-${key.status}">
                        ${key.status === 'active' ? 'Активен' : key.status === 'expired' ? 'Истек' : 'Забанен'}
                    </span>
                </td>
                <td>${key.note || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm ${key.banned ? 'btn-success' : 'btn-warning'} ban-key" data-key="${key.key}" data-ban="${!key.banned}">
                            <i class="fas ${key.banned ? 'fa-unlock' : 'fa-ban'}"></i>
                            ${key.banned ? 'Разбан' : 'Бан'}
                        </button>
                        <button class="btn btn-sm btn-danger delete-key" data-key="${key.key}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Add event listeners
        tbody.querySelectorAll('.ban-key').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const key = e.target.closest('.ban-key').dataset.key;
                const ban = e.target.closest('.ban-key').dataset.ban === 'true';
                
                const result = await this.api('/keys/ban', {
                    method: 'POST',
                    headers: {
                        'X-Owner-ID': this.currentApp.ownerId,
                        'X-Secret-Key': this.currentApp.secretKey
                    },
                    body: { key, ban }
                });

                if (result.success) {
                    this.showToast(`Ключ ${ban ? 'забанен' : 'разбанен'}`, 'success');
                    this.refreshKeys();
                    this.loadAppStats();
                } else {
                    this.showToast('Ошибка операции', 'error');
                }
            });
        });

        tbody.querySelectorAll('.delete-key').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const key = e.target.closest('.delete-key').dataset.key;
                
                if (!confirm(`Удалить ключ ${key}?`)) return;

                const result = await this.api(`/keys/${key}`, {
                    method: 'DELETE',
                    headers: {
                        'X-Owner-ID': this.currentApp.ownerId,
                        'X-Secret-Key': this.currentApp.secretKey
                    }
                });

                if (result.success && result.deleted) {
                    this.showToast('Ключ удален', 'success');
                    this.refreshKeys();
                    this.loadAppStats();
                } else {
                    this.showToast('Ошибка удаления', 'error');
                }
            });
        });
    }

    async validateKey() {
        const key = document.getElementById('validation-key').value.trim();
        const hwid = document.getElementById('validation-hwid').value.trim();

        if (!key) {
            this.showToast('Введите ключ', 'error');
            return;
        }

        if (!hwid) {
            this.showToast('Введите HWID', 'error');
            return;
        }

        // For validation, we need to use a specific app's credentials
        if (this.apps.length === 0) {
            this.showToast('Создайте приложение для проверки', 'error');
            return;
        }

        // Use the first app for demo
        const app = this.apps[0];
        const btn = document.getElementById('validate-key');
        btn.classList.add('loading');

        const result = await this.api('/keys/validate', {
            method: 'POST',
            headers: {
                'X-Owner-ID': app.ownerId,
                'X-Secret-Key': app.secretKey
            },
            body: { key, hwid }
        });

        btn.classList.remove('loading');

        const resultDiv = document.getElementById('validation-result');
        const output = document.getElementById('validation-output');

        if (result.valid) {
            output.textContent = `✅ Ключ действителен!\n\nСоздан: ${new Date(result.created * 1000).toLocaleString()}\nИстекает: ${new Date(result.expires * 1000).toLocaleString()}\nHWID: ${result.hwid}`;
            resultDiv.style.display = 'block';
        } else {
            let message = '❌ Ключ недействителен\n\n';
            switch (result.reason) {
                case 'not_found': message += 'Причина: Ключ не найден'; break;
                case 'banned': message += 'Причина: Ключ забанен'; break;
                case 'expired': message += `Причина: Ключ истек\nИстек: ${new Date(result.expiredAt * 1000).toLocaleString()}`; break;
                case 'hwid_mismatch': message += 'Причина: HWID не совпадает'; break;
                default: message += 'Причина: Неизвестная ошибка';
            }
            output.textContent = message;
            resultDiv.style.display = 'block';
        }
    }

    copyKey() {
        this.copyToClipboard(document.getElementById('generated-key'));
        this.showToast('Ключ скопирован!', 'success');
    }

    copyToClipboard(element) {
        const text = element.textContent || element.value;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Скопировано!', 'success');
        }).catch(() => {
            // Fallback
            element.select();
            document.execCommand('copy');
            this.showToast('Скопировано!', 'success');
        });
    }

    toggleCustomDays(show) {
        document.getElementById('custom-days-container').style.display = show ? 'block' : 'none';
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new EclipsePanel();
});
