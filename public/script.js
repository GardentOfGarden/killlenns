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
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.showTab(e.target.dataset.tab);
            });
        });

        document.getElementById('create-app').addEventListener('click', () => this.createApp());
        
        document.getElementById('app-select').addEventListener('change', (e) => this.selectApp(e.target.value));
        document.getElementById('generate-key').addEventListener('click', () => this.generateKey());
        document.getElementById('refresh-keys').addEventListener('click', () => this.refreshKeys());
        document.getElementById('filter-status').addEventListener('change', () => this.refreshKeys());
        document.getElementById('copy-key').addEventListener('click', () => this.copyKey());
        document.getElementById('duration').addEventListener('change', (e) => {
            this.toggleCustomDays(e.target.value === 'custom');
        });

        document.getElementById('validate-key').addEventListener('click', () => this.validateKey());

        document.addEventListener('click', (e) => {
            if (e.target.closest('.copy-btn')) {
                const target = e.target.closest('.copy-btn').dataset.target;
                this.copyToClipboard(document.getElementById(target));
            }
        });

        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('app-modal')) {
                this.closeModal();
            }
        });
    }

    showTab(tabName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `${tabName}-tab`);
        });

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
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            this.showToast('Connection error: ' + error.message, 'error');
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
            select.innerHTML = '<option value="">-- Select Application --</option>';
            
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--gray);">No applications</td></tr>';
            return;
        }

        tbody.innerHTML = this.apps.map(app => `
            <tr>
                <td><strong>${app.name}</strong></td>
                <td><code>${app.ownerId}</code></td>
                <td><span class="status-badge status-active">${app.activeKeys}/${app.keyCount}</span></td>
                <td>${new Date(app.created * 1000).toLocaleDateString()}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary view-app" data-app-id="${app.id}">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-sm btn-danger delete-app" data-app-id="${app.id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

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
            this.showToast('App name must be at least 2 characters', 'error');
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
            this.showToast('Application created successfully!', 'success');
        } else {
            this.showToast(result.error || 'Error creating application', 'error');
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
        if (!confirm('Delete application? All keys will be deleted.')) {
            return;
        }

        const result = await this.api(`/apps/${appId}`, {
            method: 'DELETE'
        });

        if (result.success) {
            this.showToast('Application deleted', 'success');
            await this.loadApps();
            await this.loadAppsForSelect();
            
            if (this.currentApp && this.currentApp.id === appId) {
                this.currentApp = null;
                document.getElementById('app-actions').style.display = 'none';
            }
        } else {
            this.showToast('Error deleting application', 'error');
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

        const app = this.apps.find(a => a.id === appId);
        if (!app) {
            this.showToast('Application not found', 'error');
            return;
        }

        const secretKey = selectedOption.getAttribute('data-secret-key');
        if (!secretKey) {
            this.showToast('Secret key not found. Please refresh page.', 'error');
            return;
        }

        this.currentApp = {
            id: app.id,
            name: app.name,
            ownerId: app.ownerId,
            secretKey: secretKey
        };
        
        document.getElementById('current-owner-id').textContent = this.currentApp.ownerId;
        document.getElementById('current-secret-key').textContent = this.currentApp.secretKey;
        document.getElementById('app-credentials-display').style.display = 'block';
        document.getElementById('app-actions').style.display = 'block';

        await this.loadAppStats();
        await this.refreshKeys();
    }

    async loadAppStats() {
        if (!this.currentApp) return;

        const stats = await this.api('/stats', {
            headers: {
                'X-Owner-ID': this.currentApp.ownerId,
                'X-Secret-Key': this.currentApp.secretKey
            }
        });

        if (stats) {
            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-active').textContent = stats.active;
            document.getElementById('stat-banned').textContent = stats.banned;
            document.getElementById('stat-locked').textContent = stats.hwidLocked;
        }
    }

    async generateKey() {
        if (!this.currentApp) {
            this.showToast('Select application', 'error');
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
            this.showToast('Duration must be positive', 'error');
            return;
        }

        const btn = document.getElementById('generate-key');
        btn.classList.add('loading');

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
            this.showToast('Key created!', 'success');
            await this.refreshKeys();
            await this.loadAppStats();
        } else {
            this.showToast(result.error || 'Error creating key', 'error');
        }
    }

    async refreshKeys() {
        if (!this.currentApp) return;

        const tbody = document.getElementById('keys-list');
        const filter = document.getElementById('filter-status').value;

        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">Loading...</td></tr>';

        const result = await this.api('/keys', {
            headers: {
                'X-Owner-ID': this.currentApp.ownerId,
                'X-Secret-Key': this.currentApp.secretKey
            }
        });

        if (!result.success) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Error loading</td></tr>';
            return;
        }

        let keys = result.keys;
        if (filter !== 'all') {
            keys = keys.filter(k => k.status === filter);
        }

        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--gray);">No keys found</td></tr>';
            return;
        }

        tbody.innerHTML = keys.sort((a, b) => b.created - a.created).map(key => `
            <tr>
                <td><code>${key.key}</code></td>
                <td>${new Date(key.created * 1000).toLocaleDateString()}</td>
                <td>${new Date(key.expires * 1000).toLocaleDateString()}</td>
                <td>${key.remaining}</td>
                <td>${key.hwid ? '<i class="fas fa-lock" style="color: var(--success);"></i>' : '<i class="fas fa-unlock" style="color: var(--gray);"></i>'}</td>
                <td><span class="status-badge status-${key.status}">${key.status}</span></td>
                <td>${key.note || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm ${key.banned ? 'btn-success' : 'btn-warning'} ban-key" data-key="${key.key}" data-ban="${!key.banned}">
                            <i class="fas ${key.banned ? 'fa-unlock' : 'fa-ban'}"></i>
                            ${key.banned ? 'Unban' : 'Ban'}
                        </button>
                        <button class="btn btn-sm btn-danger delete-key" data-key="${key.key}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

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
                    this.showToast(`Key ${ban ? 'banned' : 'unbanned'}`, 'success');
                    this.refreshKeys();
                    this.loadAppStats();
                } else {
                    this.showToast('Operation error', 'error');
                }
            });
        });

        tbody.querySelectorAll('.delete-key').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const key = e.target.closest('.delete-key').dataset.key;
                
                if (!confirm(`Delete key ${key}?`)) return;

                const result = await this.api(`/keys/${key}`, {
                    method: 'DELETE',
                    headers: {
                        'X-Owner-ID': this.currentApp.ownerId,
                        'X-Secret-Key': this.currentApp.secretKey
                    }
                });

                if (result.success && result.deleted) {
                    this.showToast('Key deleted', 'success');
                    this.refreshKeys();
                    this.loadAppStats();
                } else {
                    this.showToast('Delete error', 'error');
                }
            });
        });
    }

    async validateKey() {
        const key = document.getElementById('validation-key').value.trim();
        const hwid = document.getElementById('validation-hwid').value.trim();

        if (!key) {
            this.showToast('Enter key', 'error');
            return;
        }

        if (!hwid) {
            this.showToast('Enter HWID', 'error');
            return;
        }

        if (this.apps.length === 0) {
            this.showToast('Create application first', 'error');
            return;
        }

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
            output.textContent = `✅ Valid key!\n\nCreated: ${new Date(result.created * 1000).toLocaleString()}\nExpires: ${new Date(result.expires * 1000).toLocaleString()}\nHWID: ${result.hwid}`;
            resultDiv.style.display = 'block';
            this.showToast('Key valid!', 'success');
        } else {
            let message = '❌ Invalid key\n\n';
            switch (result.reason) {
                case 'not_found': message += 'Reason: Key not found'; break;
                case 'banned': message += 'Reason: Key banned'; break;
                case 'expired': message += `Reason: Key expired\nExpired: ${new Date(result.expiredAt * 1000).toLocaleString()}`; break;
                case 'hwid_mismatch': message += 'Reason: HWID mismatch'; break;
                default: message += 'Reason: Unknown error';
            }
            output.textContent = message;
            resultDiv.style.display = 'block';
            this.showToast('Key invalid', 'error');
        }
    }

    copyKey() {
        this.copyToClipboard(document.getElementById('generated-key'));
        this.showToast('Key copied!', 'success');
    }

    copyToClipboard(element) {
        const text = element.textContent || element.value;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied!', 'success');
        }).catch(() => {
            element.select();
            document.execCommand('copy');
            this.showToast('Copied!', 'success');
        });
    }

    toggleCustomDays(show) {
        document.getElementById('custom-days-container').style.display = show ? 'block' : 'none';
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new EclipsePanel();
});
