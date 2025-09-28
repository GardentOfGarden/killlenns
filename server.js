const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ 
        apps: [],
        settings: {} 
    }, null, 2));
}

const db = {
    read() { 
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading database:', error);
            return { apps: [], settings: {} };
        }
    },
    write(data) { 
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error writing database:', error);
        }
    }
};

// Генерация ID и ключей
function generateId() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
}

function generateSecretKey() {
    return crypto.randomBytes(32).toString('hex').toUpperCase();
}

function generateKey() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
        parts.push(crypto.randomBytes(3).toString('hex').toUpperCase());
    }
    return parts.join('-');
}

function nowSec() { 
    return Math.floor(Date.now() / 1000); 
}

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Middleware для проверки приложения
function validateApp(req, res, next) {
    const ownerId = req.headers['x-owner-id'];
    const secretKey = req.headers['x-secret-key'];
    
    console.log('Validating app credentials:', { ownerId, secretKey: secretKey ? '***' : 'missing' });
    
    if (!ownerId || !secretKey) {
        console.log('Missing credentials');
        return res.status(401).json({ error: 'Missing app credentials' });
    }
    
    const data = db.read();
    const appData = data.apps.find(a => a.ownerId === ownerId && a.secretKey === secretKey);
    
    if (!appData) {
        console.log('Invalid credentials for ownerId:', ownerId);
        return res.status(401).json({ error: 'Invalid app credentials' });
    }
    
    req.app = appData;
    next();
}

// Web Interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API для управления приложениями
app.post('/api/apps/create', (req, res) => {
    const { name } = req.body;
    
    console.log('Creating app with name:', name);
    
    if (!name || name.length < 2) {
        return res.json({ success: false, error: 'App name must be at least 2 characters' });
    }
    
    const data = db.read();
    
    // Проверяем уникальность имени
    if (data.apps.find(app => app.name.toLowerCase() === name.toLowerCase())) {
        return res.json({ success: false, error: 'App name already exists' });
    }
    
    const ownerId = generateId();
    const secretKey = generateSecretKey();
    
    const newApp = {
        id: generateId(),
        name: name.trim(),
        ownerId,
        secretKey,
        created: nowSec(),
        keys: []
    };
    
    data.apps.push(newApp);
    db.write(data);
    
    console.log('App created successfully:', { id: newApp.id, name: newApp.name });
    
    res.json({
        success: true,
        app: {
            id: newApp.id,
            name: newApp.name,
            ownerId: newApp.ownerId,
            secretKey: newApp.secretKey,
            created: newApp.created
        }
    });
});

app.get('/api/apps', (req, res) => {
    const data = db.read();
    const apps = data.apps.map(app => ({
        id: app.id,
        name: app.name,
        ownerId: app.ownerId,
        created: app.created,
        keyCount: app.keys ? app.keys.length : 0,
        activeKeys: app.keys ? app.keys.filter(k => !k.banned && k.expires > nowSec()).length : 0
    }));
    
    res.json({ success: true, apps });
});

app.delete('/api/apps/:id', (req, res) => {
    const appId = req.params.id;
    const data = db.read();
    
    const initialLength = data.apps.length;
    data.apps = data.apps.filter(app => app.id !== appId);
    
    if (data.apps.length === initialLength) {
        return res.json({ success: false, error: 'App not found' });
    }
    
    db.write(data);
    res.json({ success: true });
});

// API для управления ключами (требует аутентификации приложения)
app.post('/api/keys/generate', validateApp, (req, res) => {
    const { days, note } = req.body;
    const app = req.app;
    
    console.log('Generating key for app:', app.name);
    
    const duration = parseInt(days) || 1;
    if (duration < 1) {
        return res.json({ success: false, error: 'Invalid duration' });
    }
    
    const key = generateKey();
    const keyRecord = {
        key,
        created: nowSec(),
        expires: nowSec() + duration * 24 * 3600,
        banned: false,
        note: note || '',
        used: false,
        hwid: null,
        lastUsed: null
    };
    
    const data = db.read();
    const appIndex = data.apps.findIndex(a => a.id === app.id);
    
    if (appIndex === -1) {
        return res.json({ success: false, error: 'App not found' });
    }
    
    if (!data.apps[appIndex].keys) {
        data.apps[appIndex].keys = [];
    }
    
    // Удаляем старый ключ если существует
    data.apps[appIndex].keys = data.apps[appIndex].keys.filter(k => k.key !== key);
    data.apps[appIndex].keys.push(keyRecord);
    
    db.write(data);
    
    console.log('Key generated successfully:', key);
    
    res.json({
        success: true,
        key: keyRecord.key,
        expires: keyRecord.expires,
        note: keyRecord.note
    });
});

app.post('/api/keys/validate', validateApp, (req, res) => {
    const { key, hwid } = req.body;
    
    console.log('Validating key:', { key, hwid, app: req.app.name });
    
    if (!key) {
        return res.json({ valid: false, reason: 'no_key' });
    }
    
    if (!hwid) {
        return res.json({ valid: false, reason: 'no_hwid' });
    }
    
    const data = db.read();
    const app = data.apps.find(a => a.id === req.app.id);
    
    if (!app || !app.keys) {
        return res.json({ valid: false, reason: 'not_found' });
    }
    
    const keyRecord = app.keys.find(k => k.key === key);
    
    if (!keyRecord) {
        return res.json({ valid: false, reason: 'not_found' });
    }
    
    if (keyRecord.banned) {
        return res.json({ valid: false, reason: 'banned' });
    }
    
    if (keyRecord.expires < nowSec()) {
        return res.json({ valid: false, reason: 'expired', expiredAt: keyRecord.expires });
    }
    
    // Проверка HWID
    if (keyRecord.hwid && keyRecord.hwid !== hwid) {
        return res.json({ valid: false, reason: 'hwid_mismatch' });
    }
    
    // Если HWID не установлен, привязываем его
    const appIndex = data.apps.findIndex(a => a.id === req.app.id);
    const keyIndex = data.apps[appIndex].keys.findIndex(k => k.key === key);
    
    if (!keyRecord.hwid) {
        data.apps[appIndex].keys[keyIndex].hwid = hwid;
    }
    
    // Обновляем время последнего использования
    data.apps[appIndex].keys[keyIndex].lastUsed = nowSec();
    data.apps[appIndex].keys[keyIndex].used = true;
    
    db.write(data);
    
    res.json({
        valid: true,
        expires: keyRecord.expires,
        created: keyRecord.created,
        hwid: keyRecord.hwid || hwid
    });
});

app.post('/api/keys/ban', validateApp, (req, res) => {
    const { key, ban } = req.body;
    
    console.log('Banning key:', { key, ban, app: req.app.name });
    
    const data = db.read();
    const appIndex = data.apps.findIndex(a => a.id === req.app.id);
    
    if (appIndex === -1) {
        return res.json({ success: false, error: 'App not found' });
    }
    
    const keyIndex = data.apps[appIndex].keys.findIndex(k => k.key === key);
    
    if (keyIndex === -1) {
        return res.json({ success: false, error: 'Key not found' });
    }
    
    data.apps[appIndex].keys[keyIndex].banned = Boolean(ban);
    db.write(data);
    
    res.json({ success: true, banned: Boolean(ban) });
});

app.delete('/api/keys/:key', validateApp, (req, res) => {
    const key = req.params.key;
    
    console.log('Deleting key:', { key, app: req.app.name });
    
    const data = db.read();
    const appIndex = data.apps.findIndex(a => a.id === req.app.id);
    
    if (appIndex === -1) {
        return res.json({ success: false, error: 'App not found' });
    }
    
    const initialLength = data.apps[appIndex].keys.length;
    data.apps[appIndex].keys = data.apps[appIndex].keys.filter(k => k.key !== key);
    
    db.write(data);
    
    res.json({ 
        success: true, 
        deleted: initialLength !== data.apps[appIndex].keys.length 
    });
});

app.get('/api/keys', validateApp, (req, res) => {
    const data = db.read();
    const app = data.apps.find(a => a.id === req.app.id);
    
    if (!app || !app.keys) {
        return res.json({ success: true, keys: [] });
    }
    
    const keysWithStatus = app.keys.map(k => ({
        ...k,
        status: k.banned ? 'banned' : (k.expires <= nowSec() ? 'expired' : 'active'),
        remaining: getRemainingTime(k.expires)
    }));
    
    res.json({ success: true, keys: keysWithStatus });
});

app.get('/api/stats', validateApp, (req, res) => {
    const data = db.read();
    const app = data.apps.find(a => a.id === req.app.id);
    
    if (!app || !app.keys) {
        return res.json({ total: 0, active: 0, banned: 0, expired: 0, used: 0, hwidLocked: 0 });
    }
    
    const keys = app.keys;
    const now = nowSec();
    
    const stats = {
        total: keys.length,
        active: keys.filter(k => !k.banned && k.expires > now).length,
        banned: keys.filter(k => k.banned).length,
        expired: keys.filter(k => k.expires <= now && !k.banned).length,
        used: keys.filter(k => k.used).length,
        hwidLocked: keys.filter(k => k.hwid).length
    };
    
    res.json(stats);
});

function getRemainingTime(expires) {
    const now = nowSec();
    const diff = expires - now;
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (24 * 3600));
    const hours = Math.floor((diff % (24 * 3600)) / 3600);
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 Eclipse Key Panel запущен на порту', PORT);
    console.log('📱 Система мульти-приложений с HWID активирована');
});
