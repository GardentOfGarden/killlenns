class EclipseKeyPanel {
    constructor() {
        this.initEventListeners();
        this.loadSettings();
        this.refreshStats();
        this.refresh();
    }

    initEventListeners() {
        // Key generation
        document.getElementById('gen').onclick = () => this.generateKey();
        document.getElementById('refresh').onclick = () => this.refresh();
        document.getElementById('copy-key').onclick = () => this.copyKey();
        
        // Key validation
        document.getElementById('check').onclick = () => this.validateKey();
        document.getElementById('checkkey').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.validateKey();
        });

        // Settings
        document.getElementById('save-settings').onclick = () => this.saveSettings();
        document.getElementById('duration').addEventListener('change', (e) => {
            this.toggleCustomDays(e.target.value === 'custom');
        });

        // Filters
        document.getElementById('filter-status').addEventListener('change', () => this.refresh());

        // Modal
        document.querySelector('.close').onclick = () => this.closeModal();
        document.getElementById('cancel-note').onclick = () => this.closeModal();
        document.getElementById('save-note').onclick = () => this.saveNote();
        
        // Close modal on outside click
        window.onclick = (e) => {
            if (e.target === document.getElementById('note-modal')) {
                this.closeModal();
            }
        }
    }

    async api(path, method = 'GET', body) {
        const opts = {
            method,
            headers: { 'content-type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);
        
        try {
            const r = await fetch(path, opts);
            return await r.json();
        } catch (error) {
            this.showToast('Ошибка соединения', 'error');
            console.error('API Error:', error);
            return { ok: false, error: 'Connection failed' };
        }
    }

    async generateKey() {
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

        const btn = document.getElementById('gen');
        btn.classList.add('loading');
        
        const r = await this.api('/api/generate', 'POST', { days, note });
        
        btn.classList.remove('loading');
        
        if (r.ok) {
            document.getElementById('last').value = r.key;
            document.getElementById('generated-key-section').style.display = 'block';
            document.getElementById('key-note').value = '';
            this.showToast('Ключ успешно создан!', 'success');
            await this.refresh();
            await this.refreshStats();
        } else {
            this.showToast('Ошибка создания ключа', 'error');
        }
    }

    async validateKey() {
        const key = document.getElementById('checkkey').value.trim();
        if (!key) {
            document.getElementById('checkres').textContent = 'Введите ключ для проверки';
            return;
        }

        const btn = document.getElementById('check');
        btn.classList.add('loading');
        
        const r = await this.api('/api/validate', 'POST', { key });
        
        btn.classList.remove('loading');
        
        let resultText = '';
        if (r.valid) {
            const created = new Date(r.created * 1000).toLocaleString();
            const expires = new Date(r.expires * 1000).toLocaleString();
            resultText = `✅ Ключ действителен!\n\nСоздан: ${created}\nИстекает: ${expires}`;
            this.showToast('Ключ действителен!', 'success');
        } else {
            switch (r.reason) {
                case 'not_found':
                    resultText = '❌ Ключ не найден';
                    break;
                case 'banned':
                    resultText = '❌ Ключ забанен';
                    break;
                case 'expired':
                    const expired = new Date(r.expiredAt * 1000).toLocaleString();
                    resultText = `❌ Ключ истек\n\nИстек: ${expired}`;
                    break;
                default:
                    resultText = '❌ Ключ недействителен';
            }
            this.showToast('Ключ недействителен', 'error');
        }
        
        document.getElementById('checkres').textContent = resultText;
    }

    async refresh() {
        const tbody = document.querySelector('#ktable tbody');
        const filter = document.getElementById('filter-status').value;
        
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">Загрузка...</td></tr>';
        
        const r = await this.api('/api/list');
        
        if (!r.keys) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Ошибка загрузки</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        let filteredKeys = r.keys;
        if (filter !== 'all') {
            filteredKeys = r.keys.filter(k => k.status === filter);
        }

        if (filteredKeys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--gray);">Ключи не найдены</td></tr>';
            return;
        }

        filteredKeys.sort((a, b) => b.created - a.created).forEach(k => {
            const tr = document.createElement('tr');
            
            const created = new Date(k.created * 1000).toLocaleString();
            const expires = new Date(k.expires * 1000).toLocaleString();
            
            let statusClass = '';
            let statusText = '';
            switch (k.status) {
                case 'active':
                    statusClass = 'status-active';
                    statusText = 'Активен';
                    break;
                case 'expired':
                    statusClass = 'status-expired';
                    statusText = 'Истек';
                    break;
                case 'banned':
                    statusClass = 'status-banned';
                    statusText = 'Забанен';
                    break;
            }

            tr.innerHTML = `
                <td><code>${k.key}</code></td>
                <td>${created}</td>
                <td>${expires}</td>
                <td>${k.remaining}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="note-cell">
                        <span class="note-text">${k.note || '-'}</span>
                        <button class="btn btn-sm btn-outline edit-note" data-key="${k.key}">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm ${k.banned ? 'btn-success' : 'btn-warning'} ban-btn" data-key="${k.key}" data-ban="${!k.banned}">
                            <i class="fas ${k.banned ? 'fa-unlock' : 'fa-ban'}"></i>
                            ${k.banned ? 'Разбан' : 'Бан'}
                        </button>
                        <button class="btn btn-sm btn-danger delete-btn" data-key="${k.key}">
                            <i class="fas fa-trash"></i>
                            Удалить
                        </button>
                    </div>
                </td>
            `;

            // Add event listeners for action buttons
            tr.querySelector('.ban-btn').onclick = (e) => this.toggleBan(e);
            tr.querySelector('.delete-btn').onclick = (e) => this.deleteKey(e);
            tr.querySelector('.edit-note').onclick = (e) => this.editNote(e);

            tbody.appendChild(tr);
        });
    }

    async refreshStats() {
        const r = await this.api('/api/stats');
        if (r) {
            document.getElementById('stat-total').textContent = r.total;
            document.getElementById('stat-active').textContent = r.active;
            document.getElementById('stat-banned').textContent = r.banned;
            document.getElementById('stat-expired').textContent = r.expired;
        }
    }

    async toggleBan(e) {
        const key = e.target.closest('.ban-btn').dataset.key;
        const ban = e.target.closest('.ban-btn').dataset.ban === 'true';
        
        const r = await this.api('/api/ban', 'POST', { key, ban });
        
        if (r.ok) {
            this.showToast(`Ключ ${ban ? 'забанен' : 'разбанен'}`, 'success');
            await this.refresh();
            await this.refreshStats();
        } else {
            this.showToast('Ошибка операции', 'error');
        }
    }

    async deleteKey(e) {
        const key = e.target.closest('.delete-btn').dataset.key;
        
        if (!confirm(`Удалить ключ ${key}? Это действие нельзя отменить.`)) {
            return;
        }
        
        const r = await this.api('/api/delete', 'POST', { key });
        
        if (r.ok && r.deleted) {
            this.showToast('Ключ удален', 'success');
            await this.refresh();
            await this.refreshStats();
        } else {
            this.showToast('Ошибка удаления ключа', 'error');
        }
    }

    editNote(e) {
        const key = e.target.closest('.edit-note').dataset.key;
        const noteCell = e.target.closest('.note-cell');
        const currentNote = noteCell.querySelector('.note-text').textContent;
        
        document.getElementById('edit-note-input').value = currentNote === '-' ? '' : currentNote;
        document.getElementById('edit-note-key').value = key;
        
        document.getElementById('note-modal').style.display = 'block';
    }

    async saveNote() {
        const key = document.getElementById('edit-note-key').value;
        const note = document.getElementById('edit-note-input').value;
        
        const r = await this.api('/api/update-note', 'POST', { key, note });
        
        if (r.ok) {
            this.showToast('Примечание обновлено', 'success');
            this.closeModal();
            await this.refresh();
        } else {
            this.showToast('Ошибка обновления', 'error');
        }
    }

    closeModal() {
        document.getElementById('note-modal').style.display = 'none';
    }

    async loadSettings() {
        const r = await this.api('/api/settings');
        if (r.ok && r.settings.keyFormat) {
            document.getElementById('key-format').value = r.settings.keyFormat;
        }
    }

    async saveSettings() {
        const keyFormat = document.getElementById('key-format').value;
        
        if (!keyFormat.match(/^[X-]+$/)) {
            this.showToast('Неверный формат ключа. Используйте X и -', 'error');
            return;
        }
        
        const r = await this.api('/api/settings', 'POST', {
            settings: { keyFormat }
        });
        
        if (r.ok) {
            this.showToast('Настройки сохранены', 'success');
        } else {
            this.showToast('Ошибка сохранения настроек', 'error');
        }
    }

    copyKey() {
        const keyInput = document.getElementById('last');
        keyInput.select();
        document.execCommand('copy');
        this.showToast('Ключ скопирован в буфер обмена!', 'success');
    }

    toggleCustomDays(show) {
        const container = document.getElementById('custom-days-container');
        container.style.display = show ? 'block' : 'none';
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EclipseKeyPanel();
});
