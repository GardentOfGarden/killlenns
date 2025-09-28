const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname,'data.json');
if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE,JSON.stringify({keys:[]},null,2));
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
function genKey(){
  const parts = [];
  for(let i=0;i<4;i++) parts.push(crypto.randomBytes(3).toString('hex').toUpperCase());
  return parts.join('-');
}
function nowSec(){ return Math.floor(Date.now()/1000); }

const app = express();
app.use(bodyParser.json());

app.get('/', (req,res)=>{
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>eclipse key panel</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:20px}input,select,button,textarea{padding:8px;margin:6px 0;width:100%;box-sizing:border-box}button{width:auto} .row{display:flex;gap:10px} .col{flex:1} table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:8px;text-align:left} .bad{color:#a00}</style></head><body><h1>eclipse — key panel</h1><div style="max-width:900px"><h2>Создать ключ</h2><div><label>Длительность</label><select id="duration"><option value="1">1 день</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="365">1 год</option></select></div><div class="row"><div class="col"><button id="gen">Сгенерировать</button></div><div class="col"><button id="refresh">Обновить список</button></div></div><h2>Сгенерированный ключ</h2><input id="last" readonly><h2>Ввести ключ для проверки (для лоадера)</h2><input id="checkkey" placeholder="ENTER-KEY-HERE"><button id="check">Проверить</button><pre id="checkres"></pre><h2>Админ: список ключей</h2><table id="ktable"><thead><tr><th>Key</th><th>Expires</th><th>Banned</th><th>Actions</th></tr></thead><tbody></tbody></table></div><script>
async function api(path,method='GET',body){const opts={method,headers:{'content-type':'application/json'}}; if(body) opts.body=JSON.stringify(body); const r=await fetch(path,opts); return r.json();}
document.getElementById('gen').onclick=async function(){const d=document.getElementById('duration').value; const r=await api('/api/generate','POST',{days:parseInt(d)}); document.getElementById('last').value=r.key||JSON.stringify(r); refresh();}
document.getElementById('refresh').onclick=refresh;
async function refresh(){const r=await api('/api/list'); const tbody=document.querySelector('#ktable tbody'); tbody.innerHTML=''; r.keys.sort((a,b)=>a.expires-b.expires).forEach(k=>{const tr=document.createElement('tr'); const exp=new Date(k.expires*1000).toLocaleString(); tr.innerHTML='<td>'+k.key+'</td><td>'+exp+'</td><td>'+ (k.banned?'<span class="bad">YES</span>':'NO') +'</td><td></td>'; const td=tr.querySelector('td:last-child'); const btnBan=document.createElement('button'); btnBan.textContent=k.banned?'Unban':'Ban'; btnBan.onclick=async ()=>{await api('/api/ban','POST',{key:k.key,ban:!k.banned}); refresh();}; const btnDel=document.createElement('button'); btnDel.textContent='Delete'; btnDel.onclick=async ()=>{await api('/api/delete','POST',{key:k.key}); refresh();}; td.appendChild(btnBan); td.appendChild(btnDel); tbody.appendChild(tr);});}
document.getElementById('check').onclick=async function(){const key=document.getElementById('checkkey').value.trim(); if(!key){document.getElementById('checkres').textContent='Введите ключ';return;} const r=await api('/api/validate','POST',{key}); document.getElementById('checkres').textContent=JSON.stringify(r,null,2);}
refresh();
</script></body></html>`);
});

app.post('/api/generate',(req,res)=>{
  const days = parseInt(req.body && req.body.days) || 1;
  const k = genKey();
  const rec = {key:k,created:nowSec(),expires:nowSec()+days*24*3600,banned:false};
  saveKeyRecord(rec);
  res.json({ok:true,key:k,expires:rec.expires});
});

app.post('/api/validate',(req,res)=>{
  const key = (req.body && req.body.key)||'';
  const data = db.read();
  const rec = data.keys.find(x=>x.key===key);
  if(!rec) return res.json({valid:false,reason:'not_found'});
  if(rec.banned) return res.json({valid:false,reason:'banned'});
  if(rec.expires < nowSec()) return res.json({valid:false,reason:'expired',expiredAt:rec.expires});
  return res.json({valid:true,expires:rec.expires,created:rec.created});
});

app.post('/api/ban',(req,res)=>{
  const key=(req.body && req.body.key)||'';
  const ban=Boolean(req.body && req.body.ban);
  const data=db.read();
  const rec = data.keys.find(x=>x.key===key);
  if(!rec) return res.json({ok:false,reason:'not_found'});
  rec.banned = ban;
  db.write(data);
  res.json({ok:true,key,ban});
});

app.post('/api/delete',(req,res)=>{
  const key=(req.body && req.body.key)||'';
  const data=db.read();
  data.keys = data.keys.filter(x=>x.key!==key);
  db.write(data);
  res.json({ok:true});
});

app.get('/api/list',(req,res)=>{
  const data=db.read();
  res.json({keys:data.keys});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{console.log('listening',PORT);});
