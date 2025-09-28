const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname,'data.json');
if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE,JSON.stringify({keys:[],settings:{}},null,2));
const db = {
  read(){ return JSON.parse(fs.readFileSync(DATA_FILE)); },
  write(data){ fs.writeFileSync(DATA_FILE,JSON.stringify(data,null,2)); }
};

function saveKeyRecord(rec){
  const data = db.read();
  data.keys = data.keys.filter(k=>k.key!==rec.key);
  data.keys.push(rec);
  db.write(data);
}

function genKey(format = 'XXXX-XXXX-XXXX-XXXX') {
  const data = db.read();
  const keyFormat = data.settings.keyFormat || format;
  return keyFormat.replace(/X/g, () => crypto.randomBytes(1).toString('hex').toUpperCase().charAt(0));
}

function nowSec(){ return Math.floor(Date.now()/1000); }

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('ru-RU');
}

function getRemainingTime(expires) {
  const now = nowSec();
  const diff = expires - now;
  if (diff <= 0) return 'Истек';
  
  const days = Math.floor(diff / (24 * 3600));
  const hours = Math.floor((diff % (24 * 3600)) / 3600);
  
  if (days > 0) return `${days}д ${hours}ч`;
  return `${hours}ч`;
}

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Красивый HTML с современным дизайном
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints
app.post('/api/generate',(req,res)=>{
  const days = parseInt(req.body?.days) || 1;
  const note = req.body?.note || '';
  const k = genKey();
  const rec = {
    key: k,
    created: nowSec(),
    expires: nowSec() + days * 24 * 3600,
    banned: false,
    note: note,
    used: false
  };
  saveKeyRecord(rec);
  res.json({ok:true, key:k, expires:rec.expires, note: rec.note});
});

app.post('/api/validate',(req,res)=>{
  const key = (req.body?.key)||'';
  const data = db.read();
  const rec = data.keys.find(x=>x.key===key);
  if(!rec) return res.json({valid:false,reason:'not_found'});
  if(rec.banned) return res.json({valid:false,reason:'banned'});
  if(rec.expires < nowSec()) return res.json({valid:false,reason:'expired',expiredAt:rec.expires});
  
  // Пометить ключ как использованный
  if (!rec.used) {
    rec.used = true;
    rec.usedAt = nowSec();
    const data = db.read();
    const keyIndex = data.keys.findIndex(x => x.key === key);
    if (keyIndex !== -1) {
      data.keys[keyIndex] = rec;
      db.write(data);
    }
  }
  
  return res.json({valid:true, expires:rec.expires, created:rec.created});
});

app.post('/api/ban',(req,res)=>{
  const key = req.body?.key || '';
  const ban = Boolean(req.body?.ban);
  const data = db.read();
  const rec = data.keys.find(x=>x.key===key);
  if(!rec) return res.json({ok:false,reason:'not_found'});
  rec.banned = ban;
  db.write(data);
  res.json({ok:true, key, ban});
});

app.post('/api/delete',(req,res)=>{
  const key = req.body?.key || '';
  const data = db.read();
  const initialLength = data.keys.length;
  data.keys = data.keys.filter(x=>x.key!==key);
  db.write(data);
  res.json({ok:true, deleted: initialLength !== data.keys.length});
});

app.post('/api/update-note',(req,res)=>{
  const key = req.body?.key || '';
  const note = req.body?.note || '';
  const data = db.read();
  const rec = data.keys.find(x=>x.key===key);
  if(!rec) return res.json({ok:false,reason:'not_found'});
  rec.note = note;
  db.write(data);
  res.json({ok:true});
});

app.post('/api/settings',(req,res)=>{
  const settings = req.body?.settings;
  if(!settings) return res.json({ok:false,reason:'no_settings'});
  
  const data = db.read();
  data.settings = {...data.settings, ...settings};
  db.write(data);
  res.json({ok:true, settings: data.settings});
});

app.get('/api/settings',(req,res)=>{
  const data = db.read();
  res.json({ok:true, settings: data.settings});
});

app.get('/api/stats',(req,res)=>{
  const data = db.read();
  const keys = data.keys;
  const total = keys.length;
  const active = keys.filter(k => !k.banned && k.expires > nowSec()).length;
  const banned = keys.filter(k => k.banned).length;
  const expired = keys.filter(k => k.expires <= nowSec() && !k.banned).length;
  const used = keys.filter(k => k.used).length;
  
  res.json({
    total, active, banned, expired, used
  });
});

app.get('/api/list',(req,res)=>{
  const data = db.read();
  const keysWithStatus = data.keys.map(k => ({
    ...k,
    status: k.banned ? 'banned' : (k.expires <= nowSec() ? 'expired' : 'active'),
    remaining: getRemainingTime(k.expires)
  }));
  res.json({keys: keysWithStatus});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{
  console.log('🚀 Eclipse Key Panel запущен на порту', PORT);
  console.log('📊 Статистика доступна по адресу: http://localhost:' + PORT);
});
