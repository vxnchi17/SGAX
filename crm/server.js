/* SGAX CRM — сервер. Node 20, без внешних зависимостей. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');

/* ============================ STORE ============================ */
let DB = {
  v: 1,
  users: [], invites: [], venues: [], deals: [], payouts: [], daily: {},
  log: [], settings: {}, counters: {}
};
function loadDB(){
  try { if (fs.existsSync(DB_FILE)) DB = Object.assign(DB, JSON.parse(fs.readFileSync(DB_FILE,'utf8'))); } catch(e){ console.log('db load fail', e.message); }
}
let saveTimer = null;
function saveDB(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    fs.mkdirSync(DATA, {recursive:true});
    fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
  }, 120);
}
function saveNow(){ clearTimeout(saveTimer); fs.mkdirSync(DATA,{recursive:true}); fs.writeFileSync(DB_FILE, JSON.stringify(DB,null,2)); }
function id(prefix){ return (prefix||'id') + '_' + crypto.randomBytes(6).toString('hex'); }
function now(){ return Date.now(); }
function dayKey(d){ d = d || new Date(); return d.toISOString().slice(0,10); }
function log(actor, action, target, meta){
  DB.log.unshift({ id: id('l'), at: now(), actor: actor || 'system', action, target: target || '', meta: meta || '' });
  if (DB.log.length > 800) DB.log.length = 800;
  saveDB();
}

/* ============================ CRYPTO ============================ */
function hashPassword(pw, salt){
  salt = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + h;
}
function verifyPassword(pw, stored){
  if (!stored || stored.indexOf(':') < 0) return false;
  const salt = stored.split(':')[0];
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex'), b = Buffer.from(stored.split(':')[1], 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function rndCode(n){ let s = ''; const d='0123456789'; for (let i=0;i<n;i++) s += d[crypto.randomInt(0,10)]; return s; }

/* ============================ ROLES ============================ */
const ROLES = {
  founder:      { label: 'Founder',       emoji: '👑', rank: 4, chip: '👑' },
  head:         { label: 'Руководитель',  emoji: '🎖️', rank: 3, chip: '🎖️' },
  manager:      { label: 'Менеджер',      emoji: '🧑‍💼', rank: 2, chip: '🧑‍💼' },
  senior_manager:{ label: 'Старший менеджер', emoji: '⭐', rank: 2, chip: '⭐' }
};
const DEFAULT_SETTINGS = {
  rates: { founder: 0, head: 5, manager: 15 },
  netRate: 15,            // % с чистой прибыли сделки, который идёт в пул бонусов
  codeRequired: true,      // требовать ежедневный сменный код
  autoPayout: true,        // система сама формирует заявку на выплаты
  autoPayoutDay: 5,        // 5-е число — отчёт и заявка за прошлый месяц
  autoPayoutHour: 10,
  codeTtlHours: 26,
  sessionHours: 12,
  maxCodeAttempts: 5,
  lockMinutes: 15,
  headShareOfManager: 40, // % от бонуса менеджера, который получает руководитель
  autoBlockDays: 5,       // сколько дней без активности — сигнал основателю
  invitesEnabled: false   // самостоятельная регистрация по коду — по умолчанию выключена
};

/* ============================ BOOTSTRAP ============================ */
function bootstrap(){
  loadDB();
  DB.settings = Object.assign({}, DEFAULT_SETTINGS, DB.settings || {});
  DB.settings.rates = Object.assign({}, DEFAULT_SETTINGS.rates, DB.settings.rates || {});
  if (!DB.users.length){
    const founder = {
      id: id('u'), login: 'faraday', name: 'Faraday', role: 'founder',
      pw: hashPassword('sgax2026'), email: 'founder@sgax.local', tg: '@faraday',
      active: true, blocked: false, created: now(), lastLogin: null, lastSeen: null,
      headId: null, team: [], base: 0, mustChange: true, fails: 0, lockUntil: 0
    };
    const head = {
      id: id('u'), login: 'head', name: 'Артём', role: 'head',
      pw: hashPassword('head2026'), email: 'head@sgax.local', tg: '@head',
      active: true, blocked: false, created: now(), lastLogin: null, lastSeen: null,
      headId: null, team: [], base: 0, fails: 0, lockUntil: 0
    };
    const m1 = {
      id: id('u'), login: 'maks', name: 'Максим', role: 'manager',
      pw: hashPassword('maks2026'), email: 'maks@sgax.local', tg: '@maks',
      active: true, blocked: false, created: now(), lastLogin: null, lastSeen: null,
      headId: head.id, base: 30000, fails: 0, lockUntil: 0
    };
    const m2 = {
      id: id('u'), login: 'lera', name: 'Лера', role: 'senior_manager',
      pw: hashPassword('lera2026'), email: 'lera@sgax.local', tg: '@lera',
      active: true, blocked: false, created: now(), lastLogin: null, lastSeen: null,
      headId: head.id, base: 25000, fails: 0, lockUntil: 0
    };
    head.team = [m1.id, m2.id];
    DB.users = [founder, head, m1, m2];
    // демо-площадки
    DB.venues = [
      { id: id('v'), name: 'RUST • Сервер #1', type: 'discord', niche: 'RUST', subs: 3000, reach: 2200, owner: 'RustWarden', ownerTg: '@rustwarden', price: 1500, status: 'work', headId: head.id, created: now(), note: 'demo' },
      { id: id('v'), name: 'RUST • Клан-хаб', type: 'discord', niche: 'RUST', subs: 1800, reach: 1200, owner: 'KlanHub', ownerTg: '@klanhub', price: 1200, status: 'new', headId: head.id, created: now(), note: 'demo' },
      { id: id('v'), name: 'RUST • Паблик-чат', type: 'telegram', niche: 'RUST', subs: 2400, reach: 1700, owner: 'RustChat', ownerTg: '@rustchat', price: 900, status: 'new', headId: head.id, created: now(), note: 'demo' }
    ];
    const d = {
      id: id('d'), client: 'RustLand', niche: 'RUST', type: 'Telegram Mini App',
      venues: DB.venues.map(function(v){ return { venueId: v.id, name: v.name, price: v.price, optsSum: 0, ownerPays: v.price }; }),
      rate: 15, ownerBase: 3600, clientTotal: 4235, our: 635,
      services: [], overhead: 0, status: 'lead',
      managerId: m1.id, headId: head.id, created: now(), closedAt: null
    };
    DB.deals = [d];
    saveNow();
    console.log('bootstrap: created founder@faraday / sgax2026');
  }
  const d = getDaily();
  if (!d.issuedAt){ issueCode(null); console.log('bootstrap: сменный код на сегодня выдан автоматически'); }
  scheduleAutoPayout();
  setInterval(function(){
    const dd = getDaily();
    if (!dd.issuedAt) issueCode(null);
  }, 60*1000);
}

/* ============================ SESSIONS ============================ */
const sessions = new Map();
function newSession(user, req){
  const token = crypto.randomBytes(32).toString('hex');
  const hours = DB.settings.sessionHours || 12;
  sessions.set(token, { userId: user.id, role: user.role, created: now(), exp: now() + hours*3600e3, ip: clientIp(req) });
  return token;
}
function getSession(req){
  const raw = req.headers.cookie || '';
  const m = raw.match(/sgax_sid=([a-f0-9]+)/);
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (s.exp < now()){ sessions.delete(m[1]); return null; }
  const u = DB.users.find(function(x){ return x.id === s.userId; });
  if (!u || u.blocked || !u.active) return null;
  return { token: m[1], s, user: u };
}
function clientIp(req){
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '—';
}

/* ============================ DAILY CODE ============================ */
function getDaily(dateStr){
  const k = dateStr || dayKey();
  if (!DB.daily[k]) DB.daily[k] = { code: null, issuedAt: null, issuedBy: null, revoked: false, used: [] };
  return DB.daily[k];
}
function issueCode(actor){
  const d = getDaily();
  d.code = rndCode(6);
  d.issuedAt = now();
  d.issuedBy = actor ? actor.id : 'system';
  d.revoked = false;
  log(actor ? actor.login : 'system', 'CODE_ISSUE', 'daily/' + dayKey(), 'code ' + d.code);
  saveDB();
  return d;
}

/* ============================ PAYOUT AUTOMATION ============================ */
function monthKey(d){ d = d || new Date(); return d.toISOString().slice(0,7); }
function prevMonthKey(){
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-1); return monthKey(d);
}
function calcPayouts(period, actorLabel){
  const rates = DB.settings.rates;
  const netRate = (DB.settings.netRate || 15) / 100;
  const headShare = (DB.settings.headShareOfManager || 0) / 100;
  const deals = DB.deals.filter(function(d){
    if (d.status !== 'paid' && d.status !== 'done') return false;
    if (!period) return true;
    const ts = d.closedAt || d.paidAt || d.created;
    return monthKey(new Date(ts)) === period;
  });
  const rows = [];
  const heads = DB.users.filter(function(u){ return u.role === 'head'; });
  const managers = DB.users.filter(function(u){ return u.role === 'manager' || u.role === 'senior_manager'; });

  managers.forEach(function(m){
    const my = deals.filter(function(d){ return d.managerId === m.id; });
    const net = my.reduce(function(s,d){ return s + (Number(d.net) || Number(d.our) || 0); }, 0);
    const pool = net * netRate;
    const bonus = Math.round(pool * (rates.manager || 0) / 100);
    const base = Math.round(Number(m.base) || 0);
    rows.push({ userId: m.id, name: m.name, role: m.role, deals: my.length, net: Math.round(net), pool: Math.round(pool), bonus: bonus, base: base, total: bonus + base, managerId: m.id });
  });
  heads.forEach(function(h){
    const teamIds = DB.users.filter(function(u){ return u.headId === h.id; }).map(function(u){ return u.id; });
    const myDeals = deals.filter(function(d){ return teamIds.indexOf(d.managerId) >= 0; });
    const teamNet = myDeals.reduce(function(s,d){ return s + (Number(d.net) || Number(d.our) || 0); }, 0);
    const teamBonus = myDeals.reduce(function(s,d){
      const net = Number(d.net) || Number(d.our) || 0;
      return s + net * netRate * (rates.manager || 0) / 100 * headShare;
    }, 0);
    const ownShare = teamNet * netRate * (rates.head || 0) / 100;
    const bonus = Math.round(teamBonus + ownShare);
    const base = Math.round(Number(h.base) || 0);
    if (myDeals.length) rows.push({ userId: h.id, name: h.name, role: h.role, deals: myDeals.length, net: Math.round(teamNet), pool: Math.round(teamNet*netRate), bonus: bonus, base: base, total: bonus + base, headOf: teamIds.length });
  });
  const founder = DB.users.find(function(u){ return u.role === 'founder'; });
  if (founder){
    const totalNet = deals.reduce(function(s,d){ return s + (Number(d.net) || Number(d.our) || 0); }, 0);
    const paid = rows.reduce(function(s,r){ return s + r.total; }, 0);
    rows.push({ userId: founder.id, name: founder.name, role: 'founder', deals: deals.length, net: totalNet, pool: totalNet*netRate, bonus: Math.max(0, totalNet - paid), base: 0, total: Math.max(0, totalNet - paid) });
  }
  return rows;
}
function buildPayoutRequest(period, actor){
  const rows = calcPayouts(period);
  const existing = DB.payouts.find(function(p){ return p.period === period && p.status !== 'rejected'; });
  if (existing) return existing;
  const req = {
    id: id('p'), period: period, createdAt: now(), createdBy: actor ? actor.login : 'system',
    status: 'pending', rows: rows, comment: '', decidedAt: null, decidedBy: null, auto: !actor || actor === 'system'
  };
  req.total = rows.reduce(function(s,r){ return s + r.total; }, 0);
  DB.payouts.unshift(req);
  log(actor ? actor.login : 'system', 'PAYOUT_REQUEST', period, rows.length + ' строк на ' + req.total + ' ₽');
  saveDB();
  return req;
}
function scheduleAutoPayout(){
  setInterval(function(){
    if (!DB.settings.autoPayout) return;
    const d = new Date();
    const period = prevMonthKey();
    if (d.getUTCDate() === DB.settings.autoPayoutDay && d.getUTCHours() === DB.settings.autoPayoutHour){
      buildPayoutRequest(period, 'system');
    }
  }, 60*1000);
}

/* ============================ ACTIVITY ============================ */
function activity(user){
  const deals = DB.deals.filter(function(d){ return d.managerId === user.id; });
  const week = now() - 7*864e5;
  const weekDeals = deals.filter(function(d){ return d.created > week; });
  const lastSeen = user.lastSeen || 0;
  const daysIdle = lastSeen ? Math.floor((now() - lastSeen)/864e5) : 999;
  const score = Math.min(100, weekDeals.length*20 + (lastSeen > now()-864e5 ? 40 : 0) + (deals.length ? 20 : 0));
  let status = 'ok';
  if (user.blocked || !user.active) status = 'blocked';
  else if (daysIdle >= (DB.settings.autoBlockDays || 5)) status = 'idle';
  else if (daysIdle >= 2) status = 'warn';
  return { deals: deals.length, weekDeals: weekDeals.length, lastSeen: lastSeen || null, daysIdle: daysIdle === 999 ? null : daysIdle, score, status };
}

/* ============================ HTTP HELPERS ============================ */
function send(res, code, obj, headers){
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  }, headers || {}));
  res.end(body);
}
function readBody(req){
  return new Promise(function(resolve){
    let b = ''; let tooBig = false;
    req.on('data', function(c){ b += c; if (b.length > 2e6){ tooBig = true; req.destroy(); } });
    req.on('end', function(){ if (tooBig) return resolve({}); try { resolve(JSON.parse(b || '{}')); } catch(e){ resolve({}); } });
    req.on('error', function(){ resolve({}); });
  });
}
function ok(res, data){ send(res, 200, Object.assign({ ok: true }, data || {})); }
function err(res, code, msg, extra){ send(res, code, Object.assign({ ok: false, error: msg }, extra || {})); }

/* rate limit */
const hits = new Map();
function rateLimit(key, limit, ms){
  const t = now();
  const rec = hits.get(key);
  if (!rec || t > rec.reset){ hits.set(key, { n: 1, reset: t + ms }); return true; }
  rec.n++;
  return rec.n <= limit;
}

/* ============================ PERMISSIONS ============================ */
function can(user, action){
  const r = user.role;
  switch(action){
    case 'invite.create':      return r === 'founder';
    case 'user.create':        return r === 'founder';     // только основатель
    case 'user.block':         return r === 'founder';
    case 'user.delete':        return r === 'founder';
    case 'code.issue':         return r === 'founder' || r === 'head';
    case 'payout.build':       return r === 'founder' || r === 'head';
    case 'payout.approve':     return r === 'founder';
    case 'settings.edit':      return r === 'founder';
    case 'venues.viewAll':     return r === 'founder' || r === 'head';
    case 'deals.viewAll':      return r === 'founder' || r === 'head';
    default:                   return false;
  }
}

/* ============================ API ============================ */
async function api(req, res, url){
  const p = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const sess = getSession(req);
  const ip = clientIp(req);

  /* ---------- public ---------- */
  if (p === '/bootstrap' && method === 'GET'){
    const d = getDaily();
    return ok(res, {
      app: 'SGAX CRM', version: '1.0',
      codeRequired: !!DB.settings.codeRequired,
      codeIssued: !!(d.code && !d.revoked),
      hasUsers: DB.users.length > 0
    });
  }
  if (p === '/daily/preview' && method === 'GET'){
    // код виден на экране входа только если он уже выдан лидом; сам код не отдаём
    const d = getDaily();
    return ok(res, { issued: !!(d.code && !d.revoked) });
  }

  if (p === '/login' && method === 'POST'){
    if (!rateLimit('login:' + ip, 20, 5*60e3)) return err(res, 429, 'Слишком много попыток. Подожди 5 минут.');
    const b = await readBody(req);
    const login = String(b.login || '').trim().toLowerCase();
    const u = DB.users.find(function(x){ return x.login.toLowerCase() === login; });
    if (!u) { log(login || '?', 'LOGIN_FAIL', 'no user', ''); return err(res, 401, 'Неверный логин или пароль'); }
    if (u.lockUntil && u.lockUntil > now()) return err(res, 423, 'Аккаунт временно заблокирован до ' + new Date(u.lockUntil).toLocaleTimeString('ru-RU'));
    if (u.blocked || !u.active) return err(res, 403, 'Доступ закрыт. Обратись к основателю.');
    if (!verifyPassword(b.password || '', u.pw)){
      u.fails = (u.fails || 0) + 1;
      if (u.fails >= DB.settings.maxCodeAttempts){ u.lockUntil = now() + DB.settings.lockMinutes*60e3; u.fails = 0; log(u.login,'LOCK','','слишком много попыток'); }
      saveDB();
      return err(res, 401, 'Неверный логин или пароль', { left: Math.max(0, DB.settings.maxCodeAttempts - u.fails) });
    }
    if (DB.settings.codeRequired && u.role !== 'founder'){
      const d = getDaily();
      const code = String(b.code || '').trim();
      if (!d.code || d.revoked) return err(res, 409, 'Сменный код на сегодня ещё не выдан. Напиши руководителю.', { needCode: 'not_issued' });
      if (code !== d.code){
        u.fails = (u.fails || 0) + 1;
        if (u.fails >= DB.settings.maxCodeAttempts){ u.lockUntil = now() + DB.settings.lockMinutes*60e3; u.fails = 0; log(u.login,'LOCK','','неверный код'); }
        saveDB();
        return err(res, 401, 'Неверный сменный код', { needCode: 'wrong', left: Math.max(0, DB.settings.maxCodeAttempts - u.fails) });
      }
    }
    u.fails = 0; u.lockUntil = 0; u.lastLogin = now(); u.lastSeen = now();
    const token = newSession(u, req);
    log(u.login, 'LOGIN', 'role ' + u.role, 'ip ' + ip);
    saveDB();
    return send(res, 200, { ok: true, token: token, user: publicUser(u) }, {
      'Set-Cookie': 'sgax_sid=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + ((DB.settings.sessionHours||12)*3600)
    });
  }

  /* ---------- everything below needs auth ---------- */
  if (!sess) return err(res, 401, 'Не авторизован');
  const me = sess.user;
  me.lastSeen = now();
  const body = (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') ? await readBody(req) : {};

  if (p === '/logout' && method === 'POST'){
    sessions.delete(sess.token);
    log(me.login, 'LOGOUT', '', '');
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sgax_sid=; Path=/; Max-Age=0' });
  }
  if (p === '/me' && method === 'GET') return ok(res, { user: publicUser(me), perms: permsOf(me) });
  if (p === '/change-password' && method === 'POST'){
    if (!verifyPassword(body.old || '', me.pw)) return err(res, 400, 'Старый пароль неверен');
    const np = String(body.new || '');
    if (np.length < 8) return err(res, 400, 'Пароль короче 8 символов');
    me.pw = hashPassword(np); me.mustChange = false;
    log(me.login, 'PASSWORD_CHANGE', '', '');
    saveDB();
    return ok(res);
  }

  /* ---------- dashboard ---------- */
  if (p === '/dashboard' && method === 'GET') return ok(res, dashboard(me));

  /* ---------- users ---------- */
  if (p === '/users' && method === 'GET'){
    let list = DB.users;
    if (me.role === 'head') list = DB.users.filter(function(u){ return u.headId === me.id || u.id === me.id; });
    if (me.role === 'manager' || me.role === 'senior_manager') list = DB.users.filter(function(u){ return u.id === me.id; });
    return ok(res, { users: list.map(function(u){ return Object.assign(publicUser(u), { activity: activity(u) }); }) });
  }
  if (p === '/users' && method === 'POST'){
    if (!can(me, 'user.create')) return err(res, 403, 'Создавать учётки может только основатель');
    const b = body;
    if (!b.login || !b.password || !b.name || !b.role) return err(res, 400, 'Заполни логин, пароль, имя, роль');
    if (DB.users.some(function(u){ return u.login.toLowerCase() === String(b.login).toLowerCase(); })) return err(res, 409, 'Такой логин уже есть');
    const u = {
      id: id('u'), login: String(b.login).trim(), name: String(b.name).trim(), role: b.role,
      pw: hashPassword(b.password), email: b.email || '', tg: b.tg || '',
      active: true, blocked: false, created: now(), lastLogin: null, lastSeen: null,
      headId: b.headId || null, base: Number(b.base) || 0, fails: 0, lockUntil: 0, mustChange: !!b.mustChange
    };
    DB.users.push(u);
    if (u.headId){ const h = DB.users.find(function(x){ return x.id === u.headId; }); if (h){ h.team = h.team || []; } }
    log(me.login, 'USER_CREATE', u.login, u.role);
    saveDB();
    return ok(res, { user: publicUser(u) });
  }
  if (p.match(/^\/users\/[\w]+\/block$/) && method === 'POST'){
    if (!can(me, 'user.block')) return err(res, 403, 'Только основатель');
    const uid = p.split('/')[2];
    const u = DB.users.find(function(x){ return x.id === uid; });
    if (!u) return err(res, 404, 'Нет такого пользователя');
    if (u.role === 'founder') return err(res, 400, 'Основателя блокировать нельзя');
    u.blocked = !!body.blocked; u.active = !body.blocked;
    log(me.login, body.blocked ? 'USER_BLOCK' : 'USER_UNBLOCK', u.login, '');
    saveDB();
    return ok(res, { user: publicUser(u) });
  }
  if (p.match(/^\/users\/[\w]+\/reset$/) && method === 'POST'){
    if (!can(me, 'user.block')) return err(res, 403, 'Только основатель');
    const uid = p.split('/')[2];
    const u = DB.users.find(function(x){ return x.id === uid; });
    if (!u) return err(res, 404, 'Нет такого пользователя');
    u.pw = hashPassword(body.password || 'sgax2026'); u.fails = 0; u.lockUntil = 0; u.mustChange = true;
    log(me.login, 'PASSWORD_RESET', u.login, '');
    saveDB();
    return ok(res);
  }
  if (p.match(/^\/users\/[\w]+\/patch$/) && method === 'POST'){
    if (me.role !== 'founder' && me.role !== 'head') return err(res, 403, 'Нет прав');
    const uid = p.split('/')[2];
    const u = DB.users.find(function(x){ return x.id === uid; });
    if (!u) return err(res, 404, 'Нет пользователя');
    if (me.role === 'head' && u.headId !== me.id) return err(res, 403, 'Это не твой сотрудник');
    ['name','email','tg','headId'].forEach(function(k){ if (k in body) u[k] = body[k]; });
    if ('base' in body && me.role === 'founder') u.base = Number(body.base) || 0;
    if ('role' in body && me.role === 'founder' && u.role !== 'founder') u.role = body.role;
    log(me.login, 'USER_PATCH', u.login, Object.keys(body).join(','));
    saveDB();
    return ok(res, { user: publicUser(u) });
  }

  /* ---------- invite ---------- */
  if (p === '/invites' && method === 'GET'){
    if (!can(me,'invite.create')) return err(res, 403, 'Нет прав');
    return ok(res, { invites: DB.invites });
  }
  if (p === '/invites' && method === 'POST'){
    if (!can(me, 'invite.create')) return err(res, 403, 'Приглашения создаёт только основатель');
    if (!DB.settings.invitesEnabled) return err(res, 403, 'Регистрация по приглашению выключена. Включи её в админке или создай учётку вручную.');
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const inv = {
      id: id('i'), code: code, role: body.role || 'manager', headId: me.role === 'head' ? me.id : (body.headId || null),
      limit: Number(body.limit) || 1, used: 0, created: now(), createdBy: me.id, expires: now() + 7*864e5, active: true
    };
    DB.invites.push(inv);
    log(me.login, 'INVITE_CREATE', code, inv.role);
    saveDB();
    return ok(res, { invite: inv });
  }
  if (p === '/invites/revoke' && method === 'POST'){
    if (!can(me,'invite.create')) return err(res, 403, 'Нет прав');
    const inv = DB.invites.find(function(i){ return i.id === body.id; });
    if (inv){ inv.active = false; log(me.login,'INVITE_REVOKE', inv.code,''); saveDB(); }
    return ok(res);
  }
  if (p === '/register' && method === 'POST'){
    if (!DB.settings.invitesEnabled) return err(res, 403, 'Регистрация по приглашению выключена');
    const inv = DB.invites.find(function(i){ return i.code === String(body.code||'').toUpperCase() && i.active; });
    if (!inv) return err(res, 404, 'Код приглашения не найден или отозван');
    if (inv.used >= inv.limit) return err(res, 409, 'Лимит приглашения исчерпан');
    if (inv.expires < now()) return err(res, 410, 'Приглашение истекло');
    if (!body.login || !body.password || !body.name) return err(res, 400, 'Заполни все поля');
    if (DB.users.some(function(u){ return u.login.toLowerCase() === String(body.login).toLowerCase(); })) return err(res, 409, 'Логин занят');
    const u = {
      id: id('u'), login: String(body.login).trim(), name: String(body.name).trim(), role: inv.role,
      pw: hashPassword(body.password), email: body.email || '', tg: body.tg || '',
      active: true, blocked: false, created: now(), lastLogin: null, lastSeen: null,
      headId: inv.headId, base: 0, fails: 0, lockUntil: 0
    };
    DB.users.push(u); inv.used++;
    log(me? me.login : 'anon', 'REGISTER_BY_INVITE', u.login, inv.code);
    saveDB();
    return ok(res, { user: publicUser(u) });
  }

  /* ---------- daily code ---------- */
  if (p === '/code/today' && method === 'GET'){
    const d = getDaily();
    const out = { date: dayKey(), issued: !!(d.code && !d.revoked), issuedAt: d.issuedAt, revoked: d.revoked,
      usedBy: d.used.map(function(x){ const u = DB.users.find(function(y){ return y.id === x.userId; }); return { name: u ? u.name : '?', at: x.at }; }) };
    if (can(me,'code.issue') && d.issuedAt && d.issuedAt < now() - 24*3600e3) out.warn = 'Код старше суток — выдай новый';
    if (can(me,'code.issue')) out.code = d.code;
    out.history = Object.keys(DB.daily).sort().reverse().slice(0,10).map(function(k){
      const x = DB.daily[k];
      const u = DB.users.find(function(y){ return y.id === x.issuedBy; });
      return { date: k, code: can(me,'code.issue') ? x.code : (x.code ? '••••••' : null), issuedAt: x.issuedAt, by: u ? u.name : 'система', revoked: x.revoked, used: x.used.length };
    });
    return ok(res, out);
  }
  if (p === '/code/issue' && method === 'POST'){
    if (!can(me, 'code.issue')) return err(res, 403, 'Код выдаёт основатель или руководитель');
    const d = issueCode(me);
    return ok(res, { code: d.code, date: dayKey(), issuedAt: d.issuedAt });
  }
  if (p === '/code/revoke' && method === 'POST'){
    if (!can(me, 'code.issue')) return err(res, 403, 'Нет прав');
    const d = getDaily(); d.revoked = true; d.code = null;
    log(me.login, 'CODE_REVOKE', dayKey(), '');
    saveDB();
    return ok(res);
  }

  /* ---------- venues ---------- */
  if (p === '/venues' && method === 'GET'){
    return ok(res, { venues: visibleVenues(me) });
  }
  if (p === '/venues' && method === 'POST'){
    const v = {
      id: id('v'), name: String(body.name||'').trim(), type: body.type || 'discord', niche: body.niche || 'Другое',
      subs: Number(body.subs)||0, reach: Number(body.reach)||0, owner: body.owner||'', ownerTg: body.ownerTg||'',
      price: Number(body.price)||0, status: body.status || 'new', note: body.note || '',
      headId: me.role === 'head' ? me.id : (body.headId || null), created: now(), createdBy: me.id
    };
    if (!v.name) return err(res, 400, 'Нужно название площадки');
    DB.venues.push(v);
    log(me.login, 'VENUE_CREATE', v.name, v.niche);
    saveDB();
    return ok(res, { venue: v });
  }
  if (p.match(/^\/venues\/[\w]+\/patch$/) && method === 'POST'){
    const vid = p.split('/')[2];
    const v = DB.venues.find(function(x){ return x.id === vid; });
    if (!v) return err(res, 404, 'Нет площадки');
    ['name','type','niche','subs','reach','owner','ownerTg','price','status','note'].forEach(function(k){ if (k in body) v[k] = body[k]; });
    log(me.login, 'VENUE_PATCH', v.name, '');
    saveDB();
    return ok(res, { venue: v });
  }
  if (p.match(/^\/venues\/[\w]+$/) && method === 'DELETE'){
    const vid = p.split('/')[2];
    DB.venues = DB.venues.filter(function(x){ return x.id !== vid; });
    log(me.login, 'VENUE_DELETE', vid, '');
    saveDB();
    return ok(res);
  }

  /* ---------- deals ---------- */
  if (p === '/deals' && method === 'GET'){
    return ok(res, { deals: visibleDeals(me) });
  }
  if (p === '/deals' && method === 'POST'){
    const b = body;
    const gRate = Number(b.rate) || 15;
    const calc = computeDeal(b, gRate);
    const d = {
      id: id('d'), client: String(b.client||'').trim(), niche: b.niche||'', type: b.type||'',
      budget: Number(b.budget)||0, dealDate: b.dealDate||'',
      venues: calc.venues,
      rate: gRate, ownerBase: calc.ownerBase, clientVenues: calc.clientVenues,
      services: calc.services, servicesSum: calc.servicesSum,
      overhead: calc.overhead, refRate: calc.refRate, refSum: calc.refSum, round: calc.round,
      clientTotal: calc.clientTotal, our: calc.our, net: calc.net, margin: calc.margin,
      status: b.status || 'lead',
      managerId: (me.role === 'manager' || me.role === 'senior_manager') ? me.id : (b.managerId || me.id),
      headId: me.headId || null, created: now(), closedAt: null, note: b.note || ''
    };
    if (!d.client) return err(res, 400, 'Нужно название клиента');
    if (!d.venues.length) return err(res, 400, 'Добавь хотя бы одну площадку в пакет');
    DB.deals.unshift(d);
    log(me.login, 'DEAL_CREATE', d.client, d.venues.length + ' площадок / клиент ' + d.clientTotal + ' / нам ' + d.net);
    saveDB();
    return ok(res, { deal: d });
  }
  if (p.match(/^\/deals\/[\w]+\/mediaplan$/) && method === 'GET'){
    const did = p.split('/')[2];
    const d = DB.deals.find(function(x){ return x.id === did; });
    if (!d) return err(res, 404, 'Нет сделки');
    if (!canSeeDeal(me, d)) return err(res, 403, 'Это не твоя сделка');
    const csv = mediaplanCSV(d, me);
    return send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mediaplan-' + String(d.client||'deal').replace(/[^a-zA-Zа-яА-Я0-9_-]/g,'_') + '.csv"'
    });
  }
  if (p.match(/^\/deals\/[\w]+$/) && method === 'GET'){
    const did = p.split('/')[2];
    const d = DB.deals.find(function(x){ return x.id === did; });
    if (!d) return err(res, 404, 'Нет сделки');
    if (!canSeeDeal(me, d)) return err(res, 403, 'Это не твоя сделка');
    return ok(res, { deal: d });
  }
  if (p.match(/^\/deals\/[\w]+$/) && method === 'PUT'){
    const did = p.split('/')[2];
    const d = DB.deals.find(function(x){ return x.id === did; });
    if (!d) return err(res, 404, 'Нет сделки');
    if (!canSeeDeal(me, d)) return err(res, 403, 'Не твоя сделка');
    const b = body;
    const gRate = Number(b.rate) || d.rate || 15;
    const calc = computeDeal(b, gRate);
    if (b.client) d.client = String(b.client).trim();
    if (b.niche !== undefined) d.niche = b.niche;
    if (b.type !== undefined) d.type = b.type;
    if (b.budget !== undefined) d.budget = Number(b.budget)||0;
    if (b.dealDate !== undefined) d.dealDate = b.dealDate;
    if (b.status) d.status = b.status;
    Object.assign(d, {
      rate: gRate, venues: calc.venues, ownerBase: calc.ownerBase, clientVenues: calc.clientVenues,
      services: calc.services, servicesSum: calc.servicesSum, overhead: calc.overhead,
      refRate: calc.refRate, refSum: calc.refSum, round: calc.round,
      clientTotal: calc.clientTotal, our: calc.our, net: calc.net, margin: calc.margin
    });
    log(me.login, 'DEAL_UPDATE', d.client, d.venues.length + ' площадок / клиент ' + d.clientTotal);
    saveDB();
    return ok(res, { deal: d });
  }
  if (p.match(/^\/deals\/[\w]+$/) && method === 'DELETE'){
    const did = p.split('/')[2];
    const d = DB.deals.find(function(x){ return x.id === did; });
    if (!d) return err(res, 404, 'Нет сделки');
    if (!canSeeDeal(me, d)) return err(res, 403, 'Не твоя сделка');
    DB.deals = DB.deals.filter(function(x){ return x.id !== did; });
    log(me.login, 'DEAL_DELETE', d.client, '');
    saveDB();
    return ok(res);
  }

  if (p.match(/^\/deals\/[\w]+\/status$/) && method === 'POST'){
    const did = p.split('/')[2];
    const d = DB.deals.find(function(x){ return x.id === did; });
    if (!d) return err(res, 404, 'Нет сделки');
    const st = body.status;
    if (['lead','negotiation','confirmed','paid','done','lost'].indexOf(st) < 0) return err(res, 400, 'Неизвестный статус');
    d.status = st;
    if (st === 'paid' || st === 'done'){ d.closedAt = now(); d.paidAt = now(); }
    log(me.login, 'DEAL_STATUS', d.client, st);
    saveDB();
    return ok(res, { deal: d });
  }

  /* ---------- payouts ---------- */
  if (p === '/payouts' && method === 'GET'){
    let list = DB.payouts;
    if (me.role === 'manager' || me.role === 'senior_manager'){
      list = DB.payouts.map(function(x){ return Object.assign({}, x, { rows: x.rows.filter(function(r){ return r.userId === me.id; }) }); });
    }
    return ok(res, { payouts: list, calcNow: can(me,'payout.build') ? calcPayouts(monthKey()) : null });
  }
  if (p === '/payouts/build' && method === 'POST'){
    if (!can(me,'payout.build')) return err(res, 403, 'Заявку формирует основатель или руководитель');
    const req2 = buildPayoutRequest(body.period || prevMonthKey(), me);
    return ok(res, { payout: req2 });
  }
  if (p === '/payouts/approve' && method === 'POST'){
    if (!can(me,'payout.approve')) return err(res, 403, 'Утверждает только основатель');
    const x = DB.payouts.find(function(y){ return y.id === body.id; });
    if (!x) return err(res, 404, 'Нет заявки');
    x.status = body.reject ? 'rejected' : 'approved';
    x.decidedAt = now(); x.decidedBy = me.id; x.comment = body.comment || '';
    log(me.login, body.reject ? 'PAYOUT_REJECT' : 'PAYOUT_APPROVE', x.period, (x.total||0) + ' ₽');
    saveDB();
    return ok(res, { payout: x });
  }

  /* ---------- monitoring ---------- */
  if (p === '/monitor' && method === 'GET'){
    if (!can(me,'users.patch') && me.role !== 'founder' && me.role !== 'head') return err(res, 403, 'Нет прав');
    let list = DB.users.filter(function(u){ return u.role !== 'founder'; });
    if (me.role === 'head') list = list.filter(function(u){ return u.headId === me.id; });
    const rows = list.map(function(u){
      const a = activity(u);
      return Object.assign({ id: u.id, name: u.name, login: u.login, role: u.role, blocked: u.blocked, base: u.base, lastLogin: u.lastLogin, lastSeen: u.lastSeen }, a);
    });
    const online = rows.filter(function(r){ return r.lastSeen && r.lastSeen > now()-15*60e3; }).length;
    return ok(res, { rows: rows, online: online, alerts: alerts(list) });
  }
  if (p === '/log' && method === 'GET'){
    if (me.role !== 'founder' && me.role !== 'head') return err(res, 403, 'Только основатель/руководитель');
    return ok(res, { log: DB.log.slice(0, 200) });
  }

  /* ---------- settings ---------- */
  if (p === '/settings' && method === 'GET'){
    if (!can(me,'settings.edit')) return err(res, 403, 'Только основатель');
    return ok(res, { settings: DB.settings, roles: ROLES });
  }
  if (p === '/settings' && method === 'POST'){
    if (!can(me,'settings.edit')) return err(res, 403, 'Только основатель');
    DB.settings = Object.assign(DB.settings, body);
    log(me.login, 'SETTINGS', '', Object.keys(body).join(','));
    saveDB();
    return ok(res, { settings: DB.settings });
  }

  return err(res, 404, 'Неизвестный метод: ' + p);
}


/* ============================ DEAL ACCESS ============================ */
function canSeeDeal(me, d){
  if (!d) return false;
  if (me.role === 'founder') return true;
  if (me.role === 'head'){
    if (d.headId === me.id) return true;
    const team = DB.users.filter(function(u){ return u.headId === me.id; }).map(function(u){ return u.id; });
    return team.indexOf(d.managerId) >= 0;
  }
  return d.managerId === me.id;
}

/* ============================ DEAL MATH ============================ */
const VENUE_OPTS = {
  pin:   { n:'Закрепление поста', v:50, mode:'pct' },
  nodl:  { n:'Без удаления',      v:60, mode:'pct' },
  here:  { n:'Пинг @here',        v:40, mode:'pct' },
  every: { n:'Пинг @everyone',    v:60, mode:'pct' },
  role:  { n:'Пинг роли',         v:30, mode:'pct' },
  chan:  { n:'Отдельный канал',   v:15, mode:'pct' },
  urgent:{ n:'Срочный запуск',    v:20, mode:'pct' }
};

function computeDeal(b, gRate){
  const list = Array.isArray(b.venues) ? b.venues : [];
  const venues = list.map(function(v){
    const price = Number(v.price) || 0;
    const qty = Math.max(1, parseInt(v.qty, 10) || 1);
    const base = price * qty;
    let optPct = 0;
    const opts = Array.isArray(v.opts) ? v.opts : [];
    opts.forEach(function(k){ if (VENUE_OPTS[k]) optPct += VENUE_OPTS[k].v / 100; });
    const optsSum = Math.round(base * optPct + (Number(v.customOptSum) || 0));
    const ownerTotal = base + optsSum;
    let rate = (v.ownRate !== null && v.ownRate !== undefined && v.ownRate !== '') ? Number(v.ownRate) : null;
    if (rate === null || !(rate > 0) || rate >= 100) rate = gRate;
    const clientPlace = Math.round(ownerTotal / (1 - rate/100));
    return {
      venueId: v.venueId || null, name: String(v.name||'Без названия'), type: v.type || 'discord',
      niche: v.niche || '', subs: Number(v.subs)||0, reach: Number(v.reach)||0,
      price: price, qty: qty, base: base, opts: opts, optsSum: optsSum,
      ownerTotal: ownerTotal, rate: rate, clientPlace: clientPlace,
      our: clientPlace - ownerTotal, format: v.format || '', date: v.date || ''
    };
  });
  const ownerBase = venues.reduce(function(s,v){ return s + v.ownerTotal; }, 0);
  const clientVenues = venues.reduce(function(s,v){ return s + v.clientPlace; }, 0);
  const services = (Array.isArray(b.services) ? b.services : []).map(function(x){
    return { name: String(x.name||'Услуга'), price: Number(x.price)||0 };
  });
  const servicesSum = services.reduce(function(s,x){ return s + x.price; }, 0);
  const overhead = Number(b.overhead) || 0;
  const refRate = Number(b.refRate) || 0;
  const round = Number(b.round) || 0;
  let clientTotal = clientVenues + servicesSum;
  const our = clientVenues - ownerBase;
  const refSum = Math.round(our * refRate / 100);
  let net = our + servicesSum - overhead - refSum;
  let roundDiff = 0;
  if (round > 0){
    const r = Math.ceil(clientTotal / round) * round;
    roundDiff = r - clientTotal;
    clientTotal = r;
    net += roundDiff;
  }
  return {
    venues: venues, ownerBase: ownerBase, clientVenues: clientVenues,
    services: services, servicesSum: servicesSum, overhead: overhead,
    refRate: refRate, refSum: refSum, round: round, roundDiff: roundDiff,
    clientTotal: clientTotal, our: our, net: net,
    margin: clientTotal > 0 ? net / clientTotal : 0
  };
}

function mediaplanCSV(d, me){
  const L = [];
  const q = function(x){ return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; };
  L.push(['МЕДИАПЛАН SGAX'].map(q).join(';'));
  L.push(['Клиент', d.client, 'Ниша', d.niche, 'Дата', d.dealDate || new Date(d.created).toLocaleDateString('ru-RU')].map(q).join(';'));
  L.push([]);
  L.push(['№','Площадка','Тип','Ниша','Подписчиков','Охват поста','Формат','Допродажи','Дата выхода','Владельцу','Клиент платит'].map(q).join(';'));
  (d.venues||[]).forEach(function(v,i){
    L.push([i+1, v.name, v.type, v.niche, v.subs, v.reach,
      (v.opts||[]).map(function(k){ return (VENUE_OPTS[k]||{}).n || k; }).join(', '),
      v.optsSum || 0, v.date || '', v.ownerTotal || 0, v.clientPlace || 0].map(q).join(';'));
  });
  L.push([]);
  L.push(['','','','','','','','','Сумма владельцам', d.ownerBase].map(q).join(';'));
  (d.services||[]).forEach(function(s){ L.push(['','Услуга','','','','','','',s.name, s.price].map(q).join(';')); });
  if (d.servicesSum) L.push(['','','','','','','','','Услуги итого', d.servicesSum].map(q).join(';'));
  if (d.overhead) L.push(['','','','','','','','','Прочие расходы', d.overhead].map(q).join(';'));
  L.push(['','','','','','','','','КЛИЕНТ ПЛАТИТ', d.clientTotal].map(q).join(';'));
  L.push([]);
  L.push(['Ставка SGAX', (d.rate||0) + '%'].map(q).join(';'));
  if (me.role === 'founder' || me.role === 'head'){
    L.push(['Наш доход (внутреннее)', d.net].map(q).join(';'));
  }
  L.push([]);
  L.push(['Владельцам платим вперёд, до публикации. SGAX — агент площадок.'].map(q).join(';'));
  return '\uFEFF' + L.join('\r\n');
}

/* ============================ VIEW MODELS ============================ */
function publicUser(u){
  return {
    id: u.id, login: u.login, name: u.name, role: u.role, roleLabel: (ROLES[u.role]||{}).label || u.role,
    emoji: (ROLES[u.role]||{}).emoji || '•', email: u.email, tg: u.tg, active: u.active, blocked: !!u.blocked,
    headId: u.headId, base: u.base, lastLogin: u.lastLogin, lastSeen: u.lastSeen,
    created: u.created, mustChange: !!u.mustChange, fails: u.fails || 0,
    lockUntil: u.lockUntil || 0
  };
}
function permsOf(u){
  const keys = ['invite.create','user.create','user.block','user.delete','code.issue','payout.build','payout.approve','settings.edit','venues.viewAll','deals.viewAll'];
  const o = {}; keys.forEach(function(k){ o[k] = can(u,k); });
  o.canLoginWithoutCode = !DB.settings.codeRequired;
  return o;
}
function visibleVenues(u){
  if (u.role === 'founder') return DB.venues;
  if (u.role === 'head') return DB.venues.filter(function(v){ return v.headId === u.id || v.createdBy === u.id; });
  return DB.venues.filter(function(v){ return v.createdBy === u.id || u.headId === v.headId; });
}
function visibleDeals(u){
  if (u.role === 'founder') return DB.deals;
  if (u.role === 'head'){
    const team = DB.users.filter(function(x){ return x.headId === u.id; }).map(function(x){ return x.id; });
    return DB.deals.filter(function(d){ return d.headId === u.id || team.indexOf(d.managerId) >= 0; });
  }
  return DB.deals.filter(function(d){ return d.managerId === u.id; });
}
function alerts(list){
  const out = [];
  const lim = DB.settings.autoBlockDays || 5;
  list.forEach(function(u){
    const a = activity(u);
    if (a.status === 'idle') out.push({ level: 'red', text: u.name + (a.daysIdle === null ? ' ещё ни разу не заходил' : ' не заходил ' + a.daysIdle + ' дн.'), userId: u.id });
    else if (a.status === 'warn') out.push({ level: 'amber', text: u.name + ' не заходил ' + a.daysIdle + ' дн.', userId: u.id });
    if (!a.deals) out.push({ level: 'amber', text: u.name + ': ни одной сделки', userId: u.id });
  });
  const d = getDaily();
  if (!d.issuedAt || d.issuedAt < now() - 30*3600e3) out.push({ level: 'amber', text: 'Сменный код на сегодня не выдан', userId: null });
  return out;
}
function dashboard(me){
  const all = visibleDeals(me);
  const sum = function(arr, f){ return arr.reduce(function(s,x){ return s + (Number(f(x))||0); }, 0); };
  const won = all.filter(function(d){ return d.status==='paid' || d.status==='done'; });
  const today = dayKey();
  const month = monthKey();
  const monthDeals = all.filter(function(d){ return dayKey(new Date(d.created)) .slice(0,7) === month; });
  const out = {
    kpi: {
      dealsTotal: all.length,
      dealsWon: won.length,
      revenue: sum(won, function(d){ return d.our; }),
      net: sum(won, function(d){ return d.net || d.our; }),
      pipeline: sum(all.filter(function(d){ return d.status==='lead' || d.status==='negotiation'; }), function(d){ return d.our; }),
      monthDeals: monthDeals.length,
      monthNet: sum(monthDeals.filter(function(d){ return d.status==='paid'||d.status==='done'; }), function(d){ return d.net || d.our; }),
      conversion: all.length ? Math.round(won.length / all.length * 100) : 0,
      venues: visibleVenues(me).length
    },
    team: [],
    alerts: []
  };
  if (me.role === 'founder'){
    const people = DB.users.filter(function(u){ return u.role !== 'founder'; });
    out.team = people.map(function(u){
      const ds = DB.deals.filter(function(d){ return d.managerId === u.id; });
      const w = ds.filter(function(d){ return d.status==='paid'||d.status==='done'; });
      return Object.assign(publicUser(u), { activity: activity(u), deals: ds.length, won: w.length, net: sum(w, function(d){ return d.net||d.our; }) });
    });
    out.alerts = alerts(people);
    out.online = people.filter(function(u){ return u.lastSeen && u.lastSeen > now()-15*60e3; }).length;
  } else if (me.role === 'head'){
    const team = DB.users.filter(function(u){ return u.headId === me.id; });
    out.team = team.map(function(u){
      const ds = DB.deals.filter(function(d){ return d.managerId === u.id; });
      const w = ds.filter(function(d){ return d.status==='paid'||d.status==='done'; });
      return Object.assign(publicUser(u), { activity: activity(u), deals: ds.length, won: w.length, net: sum(w, function(d){ return d.net||d.our; }) });
    });
    out.alerts = alerts(team);
  }
  const d = getDaily();
  out.code = { date: today, issued: !!(d.code && !d.revoked), code: can(me,'code.issue') ? d.code : null, issuedAt: d.issuedAt };
  out.myActivity = activity(me);
  out.lastLog = DB.log.slice(0, 12).map(function(l){ return { at: l.at, actor: l.actor, action: l.action, target: l.target }; });
  return out;
}

/* ============================ STATIC ============================ */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json; charset=utf-8', '.ico':'image/x-icon' };
function serveStatic(req, res, url){
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, 'public', p.replace(/\.\./g, ''));
  if (!file.startsWith(path.join(ROOT,'public'))) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, function(e, buf){
    if (e){ res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'}); return res.end('<meta charset="utf-8"><body style="background:#06070b;color:#e9ecf6;font-family:sans-serif;padding:40px"><h1>404</h1><a style="color:#6d5efc" href="/">На главную</a></body>'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      'X-Content-Type-Options':'nosniff' });
    res.end(buf);
  });
}

/* ============================ SERVER ============================ */
bootstrap();
const server = http.createServer(async function(req, res){
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')){
    try { await api(req, res, url); }
    catch(e){ console.log('API error', e); try { err(res, 500, 'Ошибка сервера: ' + e.message); } catch(_){} }
    return;
  }
  serveStatic(req, res, url);
});
server.listen(PORT, '0.0.0.0', function(){
  console.log('SGAX CRM on http://0.0.0.0:' + PORT);
});
