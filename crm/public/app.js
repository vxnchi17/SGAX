/* SGAX CRM — интерфейс */
(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };

var ME = null, PERMS = {};
var VIEW = 'dash';
var CACHE = { users: [], venues: [], deals: [], payouts: [], payoutsCalc: [], settings: null, log: [], invites: [] };
var TOAST_T;

/* ================= helpers ================= */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function rub(n){ n = Math.round(Number(n)||0); return n.toLocaleString('ru-RU').replace(/\u00A0/g,' ') + ' ₽'; }
function rub0(n){ return Math.round(Number(n)||0).toLocaleString('ru-RU').replace(/\u00A0/g,' '); }
function dt(ts){ if(!ts) return '—'; var d = new Date(ts); return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); }
function ago(ts){ if(!ts) return 'никогда'; var m = Math.floor((Date.now()-ts)/60000); if(m<1) return 'только что'; if(m<60) return m+' мин назад'; var h=Math.floor(m/60); if(h<24) return h+' ч назад'; return Math.floor(h/24)+' дн назад'; }

function api(path, method, body){
  return fetch('/api'+path, {
    method: method || 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r){
    return r.json().catch(function(){ return { ok:false, error:'Сервер вернул не JSON ('+r.status+')' }; })
      .then(function(j){ if(r.status === 401 && path !== '/login'){ hardLogout(); } return j; });
  }).catch(function(e){ return { ok:false, error:'Нет связи с сервером: '+e.message }; });
}

function toast(msg, isErr){
  var box = $('toast');
  var d = document.createElement('div');
  if(isErr) d.className = 'err';
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(function(){ d.style.opacity='0'; d.style.transform='translateY(8px)'; }, 3200);
  setTimeout(function(){ d.remove(); }, 3600);
}

/* ================= AUTH SCREEN ================= */
var AUTH = { step:1, login:'', password:'', code:'' };

function authRender(){
  var el = $('auth');
  var h = '';
  h += '<div class="auth-box">';
  h += '<div class="auth-logo">'+logoSVG()+'</div>';
  h += '<div class="auth-h1"><span>SGAX</span></div>';
  h += '<div class="auth-sub">'+(AUTH.step===1?'Вход в систему — шаг 1 из 2':'Подтверждение — шаг 2 из 2')+'</div>';
  h += '<div class="auth-step"><div class="'+(AUTH.step===1?'on':'done')+'"></div><div class="'+(AUTH.step===2?'on':'')+'"></div></div>';
  h += '<div class="auth-err" id="authErr"></div>';

  if (AUTH.step === 1){
    h += '<div class="f"><label>Логин</label><input id="aLogin" autocomplete="username" placeholder="твой логин" value="'+esc(AUTH.login)+'"></div>';
    h += '<div class="f"><label>Пароль</label><input id="aPass" type="password" autocomplete="current-password" placeholder="••••••••"></div>';
    h += '<button class="btn wide" id="aNext">Дальше → <span style="opacity:.6;font-weight:600">сменный код</span></button>';
    h += '<div class="demo-list on" id="demoList"><b style="color:var(--muted)">Демо-доступы (пароли для теста):</b>'+
         '<div><code>faraday</code> / sgax2026 — 👑 Founder · полный доступ</div>'+
         '<div><code>head</code> / head2026 — 🎖️ Руководитель</div>'+
         '<div><code>maks</code> / maks2026 — 🧑‍💼 Менеджер</div>'+
         '<div><code>lera</code> / lera2026 — ⭐ Старший менеджер</div></div>';
    h += '<div class="auth-note">Учётку создаёт только основатель через админку.<br>Самостоятельной регистрации нет.</div>';
  } else {
    h += '<div class="f"><label>Ежедневный сменный код</label></div>';
    h += '<div class="code-in" id="codeIn">';
    for (var i=0;i<6;i++) h += '<input maxlength="1" inputmode="numeric" data-i="'+i+'">';
    h += '</div>';
    h += '<div class="hint" style="text-align:center;margin-bottom:14px">Код на сегодня выдаёт руководитель или основатель.<br>Один код на всех, действует до конца дня.</div>';
    h += '<button class="btn wide" id="aGo">Войти в систему</button>';
    h += '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn ghost sm" id="aBack">← Назад</button></div>';
    h += '<div class="auth-note" id="codeStatus">Проверяю, выдан ли код…</div>';
  }
  h += '</div>';
  el.innerHTML = h;
  el.classList.add('on');

  if (AUTH.step === 1){
    $('aNext').onclick = authStep1;
    $('aPass').onkeydown = function(e){ if(e.key==='Enter') authStep1(); };
    setTimeout(function(){ var f = $('aLogin'); if (f) f.focus(); }, 50);
  } else {
    var inps = Array.prototype.slice.call($('codeIn').querySelectorAll('input'));
    inps.forEach(function(inp, idx){
      inp.oninput = function(){
        inp.value = inp.value.replace(/\D/g,'').slice(0,1);
        if (inp.value && idx < 5) inps[idx+1].focus();
        if (idx === 5 && inp.value) setTimeout(doLogin, 120);
      };
      inp.onkeydown = function(e){
        if (e.key === 'Backspace' && !inp.value && idx > 0) inps[idx-1].focus();
        if (e.key === 'Enter') doLogin();
      };
      inp.onpaste = function(e){
        var t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
        if (t){ e.preventDefault(); t.split('').forEach(function(c,k){ if(inps[k]) inps[k].value = c; if(k<5) inps[k].focus(); }); setTimeout(doLogin,150); }
      };
    });
    if (inps[0]) inps[0].focus();
    $('aGo').onclick = doLogin;
    $('aBack').onclick = function(){ AUTH.step = 1; authRender(); };
    api('/daily/preview').then(function(j){
      var el2 = $('codeStatus'); if (!el2) return;
      el2.innerHTML = j.issued
        ? 'Код на сегодня <b style="color:var(--green)">выдан</b>. Спроси у руководителя.'
        : '<b style="color:var(--warn)">Код на сегодня ещё не выдан</b> — войти нельзя, пока его не выдадут.';
    });
  }
}

function authErr(msg){
  var e = $('authErr'); if (!e) return;
  e.textContent = msg; e.classList.add('on');
}

function authStep1(){
  AUTH.login = ($('aLogin').value||'').trim();
  AUTH.password = $('aPass').value || '';
  if (!AUTH.login || !AUTH.password) return authErr('Введи логин и пароль');
  AUTH.step = 2; authRender();
}

function doLogin(){
  var inps = Array.prototype.slice.call(document.querySelectorAll('#codeIn input'));
  var code = inps.map(function(i){ return i.value; }).join('');
  if (code.length !== 6) return authErr('Нужно 6 цифр кода');
  var btn = $('aGo'); if (btn){ btn.disabled = true; btn.textContent = 'Проверяю…'; }
  api('/login','POST',{ login: AUTH.login, password: AUTH.password, code: code }).then(function(j){
    if (!j.ok){
      if (btn){ btn.disabled = false; btn.textContent = 'Войти в систему'; }
      inps.forEach(function(i){ i.value=''; });
      if (inps[0]) inps[0].focus();
      authErr(j.error || 'Не удалось войти');
      return;
    }
    ME = j.user; AUTH.step = 1; AUTH.password = ''; AUTH.code = '';
    PERMS = {};
    api('/me').then(function(m){ if (m.ok) PERMS = m.perms; });
    enterApp();
  });
}

function hardLogout(){
  ME = null; PERMS = {};
  $('app').classList.remove('on');
  AUTH.step = 1; authRender();
}

/* ================= SHELL ================= */
var NAV = [
  { g:'Работа', items:[
    { id:'dash',   ic:'📊', t:'Обзор' },
    { id:'deals',  ic:'🤝', t:'Сделки' },
    { id:'venues', ic:'📡', t:'Площадки' },
    { id:'payouts',ic:'💰', t:'Выплаты' }
  ]},
  { g:'Управление', items:[
    { id:'monitor', ic:'👁', t:'Контроль' },
    { id:'code',    ic:'🔐', t:'Код дня' },
    { id:'team',    ic:'👥', t:'Команда' },
    { id:'invites', ic:'✉️', t:'Приглашения' }
  ]},
  { g:'Система', items:[
    { id:'settings', ic:'⚙️', t:'Админка' },
    { id:'log',      ic:'📜', t:'Журнал' },
    { id:'profile',  ic:'🙋', t:'Профиль' }
  ]}
];

function roleMeta(role){
  return ({
    founder:{ e:'👑', l:'Founder', cls:'founder' },
    head:{ e:'🎖️', l:'Руководитель', cls:'head' },
    manager:{ e:'🧑‍💼', l:'Менеджер', cls:'' },
    senior_manager:{ e:'⭐', l:'Старший менеджер', cls:'' }
  })[role] || { e:'•', l:role, cls:'' };
}

function enterApp(){
  if (!ME){ hardLogout(); return; }
  $('auth').classList.remove('on');
  $('app').classList.add('on');
  render();
  if (ME.mustChange) forcePassword();
  api('/me').then(function(j){
    if (j.ok){ ME = j.user; PERMS = j.perms; renderShell(); }
  }).catch(function(){ /* сеть недоступна — работаем на данных входа */ });
}

function renderShell(){
  if (!ME) return;
  var m = roleMeta(ME.role);
  var crown = ME.role === 'founder' ? '👑 ' : '';
  $('side').innerHTML =
    '<div class="brand">'+logoSVG()+'<div><div class="bn">SGAX</div><div class="bv">crm · v1.0</div></div></div>'+
    NAV.map(function(g){
      return '<div class="nav-g">'+g.g+'</div>' + g.items.map(function(it){
        var hide = false;
        if (it.id === 'invites') hide = !PERMS['invite.create'];
        if (it.id === 'settings') hide = !PERMS['settings.edit'];
        if (it.id === 'log') hide = !(ME.role === 'founder' || ME.role === 'head');
        if (it.id === 'monitor') hide = !(ME.role === 'founder' || ME.role === 'head');
        if (it.id === 'team') hide = !(ME.role === 'founder' || ME.role === 'head');
        if (hide) return '';
        return '<button class="nitem'+(VIEW===it.id?' on':'')+'" data-v="'+it.id+'"><span class="ni">'+it.ic+'</span>'+it.t+
          (it.id==='code'?'<span class="nb amber" id="navCode" style="display:none">!</span>':'')+
          (it.id==='payouts'?'<span class="nb" id="navPay" style="display:none">1</span>':'')+'</button>';
      }).join('');
    }).join('')+
    '<div class="side-foot">Вход: '+esc(ME.login)+'<br>'+m.e+' '+esc(m.l)+'</div>';

  $('side').querySelectorAll('[data-v]').forEach(function(b){
    b.onclick = function(){ VIEW = b.dataset.v; renderShell(); render(); if (window.innerWidth < 1000) document.body.classList.remove('nav-open'); };
  });

  $('top').innerHTML =
    '<button class="btn ghost sm" id="burger" style="display:none">☰</button>'+
    '<h1 id="topTitle">'+titleOf(VIEW)+'</h1><div class="sp"></div>'+
    '<span class="pill" id="codePill" style="display:none"></span>'+
    '<div class="uchip '+m.cls+'"><div class="ue">'+m.e+'</div><div><div class="un">'+crown+esc(ME.name)+'</div><div class="ur">'+esc(m.l)+'</div></div></div>'+
    '<button class="btn ghost sm" id="btnLogout">Выйти</button>';

  $('btnLogout').onclick = function(){ api('/logout','POST').then(function(){ hardLogout(); }); };
  var bg = $('burger');
  if (bg){ bg.onclick = function(){ document.body.classList.toggle('nav-open'); }; }
}

function titleOf(v){
  var m = { dash:'Обзор', deals:'Сделки', venues:'Площадки', payouts:'Выплаты', monitor:'Контроль работы',
    code:'Сменный код дня', team:'Команда', invites:'Приглашения', settings:'Админка', log:'Журнал действий', profile:'Профиль' };
  return m[v] || v;
}

function render(){
  if (!ME){ hardLogout(); return; }
  if (typeof monitorTimer !== 'undefined' && monitorTimer && VIEW !== 'monitor'){ clearInterval(monitorTimer); monitorTimer = null; }
  renderShell();
  var c = $('dash');
  c.innerHTML = '<div class="wrap"><div class="empty">Загрузка…</div></div>';
  if (VIEW === 'dash') return viewDash();
  if (VIEW === 'deals') return viewDeals();
  if (VIEW === 'venues') return viewVenues();
  if (VIEW === 'payouts') return viewPayouts();
  if (VIEW === 'monitor') return viewMonitor();
  if (VIEW === 'code') return viewCode();
  if (VIEW === 'team') return viewTeam();
  if (VIEW === 'invites') return viewInvites();
  if (VIEW === 'settings') return viewSettings();
  if (VIEW === 'log') return viewLog();
  if (VIEW === 'profile') return viewProfile();
}

function logoSVG(){
  return '<svg viewBox="0 0 64 64" fill="none"><defs><linearGradient id="lg'+Math.random().toString(36).slice(2,7)+'" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#6d5efc"/><stop offset="1" stop-color="#00e0b8"/></linearGradient></defs>'+
    '<rect x="2" y="2" width="60" height="60" rx="17" fill="rgba(109,94,252,.13)" stroke="rgba(109,94,252,.85)" stroke-width="1.6"/>'+
    '<path d="M21 19.5 L33.5 32 L21 44.5" stroke="#6d5efc" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>'+
    '<path d="M35 19.5 L47.5 32 L35 44.5" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/></svg>';
}

/* ================= DASH ================= */
function viewDash(){
  api('/dashboard').then(function(j){
    if (!j.ok) return $('dash').innerHTML = '<div class="wrap"><div class="card">'+esc(j.error)+'</div></div>';
    var k = j.kpi, h = '<div class="wrap">';
    h += '<div class="page-h"><div><h2>'+greet()+'</h2><p>'+roleMeta(ME.role).e+' '+esc(ME.role==='founder'?'Полный контроль системы':'Твои показатели')+'</p></div><div class="sp"></div>'+
      '<button class="btn ghost sm" id="dRefresh">↻ Обновить</button></div>';

    h += '<div class="grid g4" style="margin-bottom:14px">';
    h += kpi('Выручка (закрытые)', rub(k.net), k.dealsWon+' сделок', 'acc');
    h += kpi('В работе', rub(k.pipeline), 'потенциал', '');
    h += kpi('Этот месяц', rub(k.monthNet), k.monthDeals+' сделок');
    h += kpi('Конверсия', k.conversion+'%', 'закрыто из всех');
    h += '</div>';

    if (ME.role === 'founder' || ME.role === 'head'){
      h += '<div class="grid g3" style="margin-bottom:14px">';
      h += kpi('Команда', (j.online||0)+' онлайн', (j.team.length)+' человек', 'gold');
      h += kpi('Сменный код', j.code.issued ? (j.code.code || 'выдан') : 'не выдан', j.code.issued ? 'на сегодня' : 'войти нельзя', j.code.issued?'acc':'red');
      h += kpi('Площадок в базе', k.venues, 'доступно тебе');
      h += '</div>';
    }

    if (j.alerts && j.alerts.length){
      h += '<div class="card" style="margin-bottom:14px;border-color:rgba(255,92,122,.32)"><div class="card-h"><h3>⚠️ Система сообщает</h3></div>';
      j.alerts.forEach(function(a){
        h += '<div class="row" style="padding:6px 0;border-bottom:1px solid rgba(35,40,56,.5);font-size:13px">'+
          '<span class="tag '+(a.level==='red'?'r':'y')+'">'+(a.level==='red'?'проблема':'внимание')+'</span>'+
          '<span>'+esc(a.text)+'</span></div>';
      });
      h += '</div>';
      $('navCode') && ($('navCode').style.display = j.code.issued ? 'none' : 'inline-block');
    }

    if (j.team && j.team.length){
      h += '<div class="card pad0" style="margin-bottom:14px"><div class="card-h" style="padding:14px 16px;margin:0"><h3>Кто как работает (7 дней)</h3><div class="sp"></div><span class="pill">'+j.team.length+' сотрудников</span></div><div class="tw"><table><thead><tr><th>Сотрудник</th><th>Роль</th><th>Был в сети</th><th class="num">Сделок</th><th class="num">Закрыто</th><th class="num">Принёс</th><th>Статус</th></tr></thead><tbody>';
      j.team.forEach(function(u){
        var m = roleMeta(u.role), a = u.activity;
        h += '<tr><td><b>'+esc(u.name)+'</b><div class="login-badge">@'+esc(u.login)+'</div></td>'+
          '<td><span class="role-tag">'+m.e+' '+m.l+'</span></td>'+
          '<td class="muted">'+ago(a.lastSeen)+'</td>'+
          '<td class="num">'+u.deals+'</td><td class="num">'+u.won+'</td><td class="num" style="color:var(--acc2)">'+rub(u.net)+'</td>'+
          '<td>'+statusTag(a.status)+'</td></tr>';
      });
      h += '</tbody></table></div></div>';
    }

    var k2 = k.dealsTotal ? '' : '';
    h += '<div class="card"><div class="card-h"><h3>Последние действия</h3></div><div class="tw"><table><tbody>';
    (j.lastLog||[]).forEach(function(l){
      h += '<tr><td style="width:110px" class="dim">'+dt(l.at)+'</td><td><b>'+esc(l.actor)+'</b> <span class="muted">'+esc(l.action)+'</span></td><td class="muted">'+esc(l.target)+'</td></tr>';
    });
    if (!(j.lastLog||[]).length) h += '<tr><td class="dim">пока пусто</td></tr>';
    h += '</tbody></table></div></div>';

    h += '</div>';
    $('dash').innerHTML = h;
    $('dRefresh').onclick = render;

    // обновляем бейджи
    var navPay = $('navPay'); if (navPay) navPay.style.display = 'none';
  });
}
function greet(){
  var hr = new Date().getHours();
  var g = hr < 6 ? 'Ночная смена' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
  return g + ', ' + esc(ME.name);
}
function kpi(l,v,d,cls){
  return '<div class="kpi '+(cls||'')+'"><div class="kl">'+esc(l)+'</div><div class="kv">'+v+'</div><div class="kd">'+esc(d||'')+'</div></div>';
}
function statusTag(s){
  if (s==='ok') return '<span class="tag g">работает</span>';
  if (s==='warn') return '<span class="tag y">2+ дня тихо</span>';
  if (s==='idle') return '<span class="tag r">не работает</span>';
  if (s==='blocked') return '<span class="tag n">заблокирован</span>';
  return '<span class="tag n">—</span>';
}
function dealTag(s){
  var m = { lead:['n','лид'], negotiation:['y','переговоры'], confirmed:['b','подтверждена'], paid:['g','оплачена'], done:['g','закрыта'], lost:['r','отказ'] };
  var x = m[s] || ['n', s];
  return '<span class="tag '+x[0]+'">'+x[1]+'</span>';
}

/* ================= DEALS ================= */
function viewDeals(){
  Promise.all([api('/deals'), api('/venues')]).then(function(res){
    var deals = res[0].deals || [], venues = res[1].venues || [];
    CACHE.deals = deals; CACHE.venues = venues;
    var h = '<div class="wrap">';
    h += '<div class="page-h"><div><h2>Сделки</h2><p>Пакет собирается из базы площадок. Цена считается по каждой площадке и по всему пакету.</p></div><div class="sp"></div>'+
      '<button class="btn" id="dNew">+ Собрать пакет</button></div>';
    var won = deals.filter(function(d){ return d.status==='paid'||d.status==='done'; });
    var totalNet = won.reduce(function(s,d){ return s + (d.net||0); },0);
    var sumClient = deals.reduce(function(s,d){ return s + (d.clientTotal||0); },0);
    h += '<div class="grid g4" style="margin-bottom:14px">'+
      kpi('Всего сделок', deals.length, '', '')+
      kpi('Закрыто', won.length, 'оплачено/закрыто', 'acc')+
      kpi('Оборот пакетов', rub(sumClient), 'сумма клиентов', '')+
      kpi('Наш доход', rub(totalNet), 'по закрытым', 'gold')+
      '</div>';

    h += '<div class="card pad0"><div class="tw"><table><thead><tr><th>Клиент</th><th>Ниша</th><th class="num">Площадок</th><th class="num">Ставка</th><th class="num">Владельцам</th><th class="num">Клиент платит</th><th class="num">Нам</th><th>Статус</th><th>Действия</th></tr></thead><tbody>';
    if (!deals.length) h += '<tr><td colspan="9"><div class="empty"><div class="ee">📐</div>Сделок ещё нет — собери первый пакет</div></td></tr>';
    deals.forEach(function(d){
      h += '<tr><td><b>'+esc(d.client)+'</b>'+(d.type?'<div class="login-badge">'+esc(d.type)+'</div>':'')+'</td>'+
        '<td><span class="tag n">'+esc(d.niche||'—')+'</span></td>'+
        '<td class="num">'+(d.venues||[]).length+'</td>'+
        '<td class="num">'+d.rate+'%</td>'+
        '<td class="num muted">'+rub(d.ownerBase)+'</td>'+
        '<td class="num">'+rub(d.clientTotal)+'</td>'+
        '<td class="num" style="color:var(--acc2);font-weight:800">'+rub(d.net)+'</td>'+
        '<td>'+dealTag(d.status)+'</td>'+
        '<td class="row" style="gap:5px">'+
          '<button class="btn ghost sm" data-open="'+d.id+'">Открыть</button>'+
          '<select data-dst="'+d.id+'" style="background:#0a0c12;color:var(--txt);border:1px solid var(--line);border-radius:7px;padding:5px 6px;font-size:11.5px">'+
            ['lead','negotiation','confirmed','paid','done','lost'].map(function(st){ return '<option value="'+st+'"'+(d.status===st?' selected':'')+'>'+({lead:'лид',negotiation:'переговоры',confirmed:'подтверждена',paid:'оплачена',done:'закрыта',lost:'отказ'})[st]+'</option>'; }).join('')+
          '</select></td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    $('dash').innerHTML = h;
    $('dNew').onclick = function(){ W.confirm = false; wizardOpen(venues); };
    $('dash').querySelectorAll('[data-open]').forEach(function(b){
      b.onclick = function(){
        api('/deals/'+b.dataset.open).then(function(j){
          if (!j.ok) return toast(j.error,true);
          W.confirm = true; wizardOpen(venues, j.deal);
        });
      };
    });
    $('dash').querySelectorAll('[data-dst]').forEach(function(sel){
      sel.onchange = function(){
        api('/deals/'+sel.dataset.dst+'/status','POST',{ status: sel.value }).then(function(j){
          if (j.ok){ toast('Статус обновлён'); render(); } else toast(j.error,true);
        });
      };
    });
  });
}

/* ================= WIZARD (калькулятор v6 внутри CRM) ================= */
var OPTS = [
  { k:'pin',    n:'Закрепление поста', d:'Висит сверху ещё 24 часа',      v:50 },
  { k:'nodl',   n:'Без удаления',      d:'Остаётся в истории навсегда',   v:60 },
  { k:'here',   n:'Пинг @here',        d:'Уведомление активным',          v:40 },
  { k:'every',  n:'Пинг @everyone',    d:'Уведомление всем участникам',   v:60 },
  { k:'role',   n:'Пинг роли',         d:'Только выбранная роль',         v:30 },
  { k:'chan',   n:'Отдельный канал',   d:'В своём канале, не в общем',    v:15 },
  { k:'urgent', n:'Срочный запуск',    d:'Публикация в течение 24 часов', v:20 }
];
var SVC_LIB = [
  { name:'Редактура поста', price:2000 }, { name:'Текст с нуля', price:4000 },
  { name:'Нативная подача', price:6000 }, { name:'Креатив / баннер', price:6000 },
  { name:'Видео 15 сек', price:15000 }, { name:'Медиаплан и стратегия', price:8000 },
  { name:'Рубрика (мес)', price:25000 }, { name:'Бриф и аналитика', price:5000 }
];
var W = { step:1, active:null, confirm:false, opened:null, data:null };

function wBlank(){
  return { client:'', niche:'', type:'', budget:'', dealDate:'', rate:15,
    venues:[], services:[], overhead:0, refRate:0, round:0, status:'lead', dealId:null };
}
function wNormalize(d){
  var o = wBlank();
  Object.keys(o).forEach(function(k){ if (d[k] !== undefined) o[k] = d[k]; });
  o.venues = (d.venues||[]).map(function(v){
    return { id:'v'+Math.random().toString(36).slice(2,8), venueId:v.venueId||null, name:v.name||'', type:v.type||'discord',
      niche:v.niche||'', subs:v.subs||0, reach:v.reach||0, price:v.price||0, qty:v.qty||1,
      opts:v.opts||[], customOptSum:v.customOptSum||0, ownRate:v.ownRate===undefined?null:v.ownRate,
      format:v.format||'', date:v.date||'' };
  });
  o.services = (d.services||[]).map(function(x){ return { name:x.name||'', price:x.price||0 }; });
  return o;
}

function wizardOpen(venues, deal){
  W.venues = venues;
  W.data = deal ? wNormalize(deal) : wBlank();
  W.step = 1; W.active = null; W.opened = null;
  $('dash').classList.remove('on');
  $('wizard').classList.add('on');
  wRender();
}
function wizardClose(){
  $('wizard').classList.remove('on');
  $('dash').classList.add('on');
  W.data = null; W.active = null; W.step = 1;
  render();
}

/* расчёт на клиенте — 1:1 с сервером */
function wCalc(){
  var s = W.data;
  var rate = Number(s.rate) || 15;
  var venues = s.venues.map(function(v){
    var price = Number(v.price)||0, qty = Math.max(1, parseInt(v.qty,10)||1);
    var base = price*qty, optPct = 0;
    (v.opts||[]).forEach(function(k){ var o = OPTS.filter(function(x){return x.k===k;})[0]; if(o) optPct += o.v/100; });
    var optsSum = Math.round(base*optPct + (Number(v.customOptSum)||0));
    var ownerTotal = base + optsSum;
    var r = (v.ownRate!==null && v.ownRate!==undefined && v.ownRate!=='') ? Number(v.ownRate) : rate;
    if (!(r>0) || r>=100) r = rate;
    var clientPlace = Math.round(ownerTotal/(1-r/100));
    return { price:price, qty:qty, base:base, optsSum:optsSum, ownerTotal:ownerTotal, rate:r, clientPlace:clientPlace, our:clientPlace-ownerTotal };
  });
  var ownerBase = venues.reduce(function(a,v){return a+v.ownerTotal;},0);
  var clientVenues = venues.reduce(function(a,v){return a+v.clientPlace;},0);
  var servicesSum = s.services.reduce(function(a,x){return a+(Number(x.price)||0);},0);
  var overhead = Number(s.overhead)||0;
  var refRate = Number(s.refRate)||0;
  var round = Number(s.round)||0;
  var our = clientVenues - ownerBase;
  var refSum = Math.round(our*refRate/100);
  var clientTotal = clientVenues + servicesSum;
  var net = our + servicesSum - overhead - refSum;
  var roundDiff = 0;
  if (round>0){ var rr = Math.ceil(clientTotal/round)*round; roundDiff = rr-clientTotal; clientTotal = rr; net += roundDiff; }
  var reach = s.venues.reduce(function(a,v){ return a + (Number(v.reach)||0)*(Math.max(1,parseInt(v.qty,10)||1)); },0);
  return { venues:venues, ownerBase:ownerBase, clientVenues:clientVenues, servicesSum:servicesSum,
    overhead:overhead, refRate:refRate, refSum:refSum, round:round, roundDiff:roundDiff,
    clientTotal:clientTotal, our:our, net:net, reach:reach,
    margin: clientTotal>0 ? net/clientTotal : 0, cpv: reach>0 ? clientVenues/reach : 0 };
}

var WSTEPS = [
  { n:1, t:'Клиент',      d:'кто и что рекламируем',               ic:'👤' },
  { n:2, t:'Площадки',    d:'список и условия',                     ic:'📡' },
  { n:3, t:'Наш процент', d:'тариф сделки',                         ic:'％' },
  { n:4, t:'Услуги',      d:'креатив и прочее',                     ic:'🎨' },
  { n:5, t:'Расходы',     d:'реферал, правила',                     ic:'➗' },
  { n:6, t:'Итог',        d:'цена и сохранение',                    ic:'💎' }
];

function wRender(){
  var c = wCalc();
  var h = '';
  h += '<div class="wiz-head"><div class="wh-l"><button class="btn ghost sm" id="wClose">← Выйти</button>'+
    '<div><div class="wh-t">'+(W.data.dealId?'Сделка: '+esc(W.data.client):'Новый пакет')+'</div>'+
    '<div class="wh-s">'+(W.data.venues.length?W.data.venues.length+' площадок':'пока пусто')+'</div></div></div>'+
    '<div class="sp"></div>'+
    '<div class="wh-chips">'+
      '<div class="whc"><span>Клиент платит</span><b>'+rub(c.clientTotal)+'</b></div>'+
      '<div class="whc"><span>Владельцам</span><b style="color:var(--owner)">'+rub(c.ownerBase)+'</b></div>'+
      '<div class="whc"><span>Нам</span><b style="color:var(--acc2)">'+rub(c.net)+'</b></div>'+
      '<div class="whc"><span>Маржа</span><b>'+(c.clientTotal>0?(c.margin*100).toFixed(1)+'%':'—')+'</b></div>'+
    '</div></div>';

  h += '<div class="wiz-body"><div class="wiz-side">';
  WSTEPS.forEach(function(st){
    var done = wStepDone(st.n);
    h += '<button class="wstep'+(W.step===st.n?' on':'')+(done&&W.step!==st.n?' done':'')+'" data-ws="'+st.n+'">'+
      '<div class="wsn">'+(done&&W.step!==st.n?'✓':st.ic)+'</div>'+
      '<div><div class="wst">'+st.t+'</div><div class="wsd">'+st.d+'</div></div></button>';
  });
  h += '</div><div class="wiz-main">'+wStepBody()+'</div></div>';

  h += '<div class="wiz-foot"><button class="btn ghost" id="wPrev"'+(W.step===1?' disabled':'')+'>← Назад</button>'+
    '<div class="sp"></div>'+
    '<span class="wiz-hint">шаг '+W.step+' из 6</span>'+
    '<div class="sp"></div>'+
    (W.step<6 ? '<button class="btn" id="wNext">Далее →</button>'
              : '<button class="btn ok" id="wSave">'+(W.data.dealId?'Сохранить изменения':'Создать сделку')+'</button>')+
    '</div>';

  $('wizard').innerHTML = h;
  $('wClose').onclick = wizardClose;
  var pv = $('wPrev'), nx = $('wNext');
  if (pv) pv.onclick = function(){ W.step = Math.max(1,W.step-1); W.active=null; wRender(); };
  if (nx) nx.onclick = function(){ wStepNext(); };
  var sv = $('wSave'); if (sv) sv.onclick = wSave;
  $('wizard').querySelectorAll('[data-ws]').forEach(function(b){
    b.onclick = function(){ W.step = parseInt(b.dataset.ws,10); W.active=null; wRender(); };
  });
  wBind();
}

function wStepDone(n){
  var s = W.data;
  if (n===1) return !!(s.client && s.niche);
  if (n===2) return s.venues.length>0 && s.venues.every(function(v){ return v.name && Number(v.price)>0; });
  return n<=5;
}

/* ---------- STEP BODIES ---------- */
function wStepBody(){
  var s = W.data;
  if (W.step===1){
    var niches = ['RUST','Гейминг','Крипта / Web3','IT / разработка','Аниме','Мемы','Учёба','Бизнес','Другое'];
    var types = ['Telegram Mini App','Игра','Сервис','Магазин','Инфопродукт','Канал','Другое'];
    var h = '<div class="wp-title">Шаг 1. Клиент</div><div class="wp-sub">Что рекламируем и в какой нише — от этого зависит, из каких площадок собирать пакет.</div>';
    h += '<div class="wcard">';
    h += wField('Название клиента или ник','<input id="wClient" value="'+esc(s.client)+'" placeholder="RustLand / @manager">');
    h += '<div class="wf"><label>Что рекламируем</label><div class="chip-pick">'+types.map(function(t){ return '<button data-type="'+esc(t)+'" class="'+(s.type===t?'on':'')+'">'+t+'</button>'; }).join('')+'</div></div>';
    h += '<div class="wf"><label>Ниша — от неё зависит состав пакета</label><div class="chip-pick">'+niches.map(function(t){ return '<button data-niche="'+esc(t)+'" class="'+(s.niche===t?'on':'')+'">'+t+'</button>'; }).join('')+'</div>'+
      '<div class="hint">Пакет собирается из площадок одной тематики. Меньше 3 площадок в нише — пакет не продаётся.</div></div>';
    h += '<div class="grid g2"><div class="wf"><label>Бюджет клиента, ₽</label><input type="number" id="wBudget" value="'+(s.budget||'')+'" placeholder="необязательно"></div>'+
      '<div class="wf"><label>Дата сделки</label><input type="date" id="wDate" value="'+(s.dealDate||'')+'"></div></div>';
    h += '</div>';
    return h;
  }
  if (W.step===2){
    if (W.active){
      var v = s.venues.filter(function(x){ return x.id===W.active; })[0];
      if (!v){ W.active=null; return wStepBody(); }
      var idx = s.venues.indexOf(v)+1;
      var c = wCalc().venues[s.venues.indexOf(v)];
      var hh = '<button class="btn ghost sm" id="wBackList">← К списку площадок</button>';
      hh += '<div class="wp-title" style="margin-top:12px">Площадка '+idx+'. '+(v.name?esc(v.name):'без названия')+'</div>';
      hh += '<div class="wp-sub">'+esc(v.niche||s.niche||'—')+' · '+(v.type||'discord')+' · '+rub0(v.subs)+' подписчиков</div>';
      var BL = {};
      // блок 1
      BL[1] = ([
        wField('Название','<input id="vName" value="'+esc(v.name)+'" placeholder="RUST • Сервер #1">'),
        '<div class="wf"><label>Тип</label><div class="chip-pick">'+['discord','telegram','tma','vk'].map(function(t){ return '<button data-vtype="'+t+'" class="'+(v.type===t?'on':'')+'">'+t+'</button>'; }).join('')+'</div></div>',
        '<div class="wf"><label>Ниша</label><div class="chip-pick">'+['RUST','Гейминг','Крипта / Web3','IT / разработка','Аниме','Мемы','Учёба','Бизнес'].map(function(t){ return '<button data-vniche="'+esc(t)+'" class="'+(v.niche===t?'on':'')+'">'+t+'</button>'; }).join('')+'</div></div>'
      ]).join('');
      // блок 2
      BL[2] = ([
        '<div class="grid g2"><div class="wf"><label>Подписчиков</label><input type="number" id="vSubs" value="'+(v.subs||'')+'"></div>'+
        '<div class="wf"><label>Охват одного поста</label><input type="number" id="vReach" value="'+(v.reach||'')+'"></div></div>',
        '<button class="btn ghost sm" id="vReach30">Оценить охват как 30% от подписчиков</button>'
      ]).join('');
      // блок 3
      BL[3] = ([
        '<div class="grid g2"><div class="wf"><label>Цена владельца за 1 размещение, ₽</label><input type="number" id="vPrice" value="'+(v.price||'')+'"></div>'+
        '<div class="wf"><label>Сколько размещений</label><input type="number" id="vQty" value="'+(v.qty||1)+'" min="1"></div></div>',
        '<div class="wsum"><span>Владельцу за всё</span><b>'+rub(c.ownerTotal)+'</b></div>'
      ]).join('');
      // блок 4
      var optRows = OPTS.map(function(o){
        var on = (v.opts||[]).indexOf(o.k)>=0;
        return '<label class="wopt'+(on?' on':'')+'"><input type="checkbox" data-opt="'+o.k+'" '+(on?'checked':'')+'>'+
          '<div style="flex:1"><b>'+o.n+'</b><div class="dim" style="font-size:11.5px">'+o.d+'</div></div>'+
          '<span class="woptp">+'+o.v+'%</span></label>';
      }).join('');
      BL[4] = ([ optRows,
        '<div class="wf" style="margin-top:10px"><label>Своя допродажа суммой, ₽</label><input type="number" id="vCustom" value="'+(v.customOptSum||'')+'" placeholder="0"></div>'
      ]).join('');
      // блок 5
      BL[5] = ([
        '<div class="wf"><div class="chip-pick">'+
          '<button data-vrate="global" class="'+(v.ownRate===null?'on':'')+'">Общая ('+s.rate+'%)</button>'+
          '<button data-vrate="own" class="'+(v.ownRate!==null?'on':'')+'">Своя</button></div></div>',
        (v.ownRate!==null ? '<div class="wf"><label>Ставка для этой площадки, %</label><input type="number" id="vOwnRate" value="'+(v.ownRate||'')+'"></div>' : '')
      ]).join('');

      hh += wBlock(1,'Что это за площадка', BL[1]);
      hh += wBlock(2,'Аудитория', BL[2]);
      hh += wBlock(3,'Условия владельца', BL[3]);
      hh += wBlock(4,'Допродажи', BL[4]);
      hh += wBlock(5,'Наша ставка', BL[5]);
      // итог по площадке
      hh += '<div class="wcard" style="margin-top:14px;background:var(--card2)">'+
        '<div class="wsum"><span>Владельцу</span><b style="color:var(--owner)">'+rub(c.ownerTotal)+'</b></div>'+
        '<div class="wsum"><span>Клиент платит за эту площадку</span><b>'+rub(c.clientPlace)+'</b></div>'+
        '<div class="wsum"><span>Ставка</span><b>'+c.rate+'%</b></div>'+
        '<div class="wsum"><span>Нам с площадки</span><b style="color:var(--acc2)">'+rub(c.our)+'</b></div>'+
        '<div style="margin-top:12px" class="row"><button class="btn ok sm" id="wBackList2">Готово, к списку</button>'+
        '<button class="btn ghost sm" id="wDelVenue" style="color:var(--red);border-color:rgba(255,92,122,.35)">Удалить площадку</button></div></div>';
      return hh;
    }
    // список площадок
    var h2 = '<div class="wp-title">Шаг 2. Площадки</div><div class="wp-sub">Список пакета. Нажми на площадку — откроются её условия, допродажи и ставка.</div>';
    h2 += '<div class="card pad0" style="margin-bottom:12px"><div class="tw"><table><tbody>';
    if (!s.venues.length) h2 += '<tr><td><div class="empty" style="padding:26px"><div class="ee">📡</div>Пакет пустой. Добавь площадку из базы или создай вручную.</div></td></tr>';
    s.venues.forEach(function(v,i){
      var cc = wCalc().venues[i];
      h2 += '<tr style="cursor:pointer" data-vopen="'+v.id+'">'+
        '<td style="width:32px"><div class="vnum">'+(i+1)+'</div></td>'+
        '<td><b>'+esc(v.name||'без названия')+'</b><div class="login-badge">'+esc(v.type||'discord')+' · охват '+rub0(v.reach)+'</div></td>'+
        '<td>'+(Number(v.price)>0?'<span class="tag g">в пакете</span>':'<span class="tag y">нет цены</span>')+'</td>'+
        '<td class="num muted">'+rub(cc.ownerTotal)+'<div class="login-badge">владельцу</div></td>'+
        '<td class="num">'+rub(cc.clientPlace)+'<div class="login-badge">клиенту</div></td>'+
        '<td style="width:24px;text-align:right;color:var(--dim);font-size:18px">›</td></tr>';
    });
    h2 += '</tbody></table></div></div>';
    h2 += '<div class="row"><button class="btn" id="wAddFromBase">+ Из базы площадок</button>'+
      '<button class="btn ghost" id="wAddManual">+ Вручную</button>'+
      (s.venues.length>=3?'':'<span class="pill" style="color:var(--warn)">минимум 3 площадки для пакета</span>')+'</div>';
    return h2;
  }
  if (W.step===3){
    var h3 = '<div class="wp-title">Шаг 3. Наш процент</div><div class="wp-sub">Ставка применяется ко всем площадкам, где не задана своя.</div>';
    h3 += '<div class="grid g2" style="margin-bottom:14px">'+
      wRateCard(15,'Эксклюзив','Все размещения по площадкам идут через нас. Владелец не продаёт нишу сам.', s.rate===15)+
      wRateCard(35,'Стандарт','Владелец размещает и свои прямые продажи параллельно. Эксклюзива нет.', s.rate===35)+
      '</div>';
    h3 += '<div class="wcard"><div class="wf"><label>Своя ставка, % (5–50)</label>'+
      '<input type="range" id="wRateR" min="5" max="50" step="1" value="'+s.rate+'" style="width:100%;accent-color:#6d5efc">'+
      '<div class="row" style="justify-content:space-between"><span class="dim">5%</span><b id="wRateVal" style="font-size:19px;color:var(--acc2)">'+s.rate+'%</b><span class="dim">50%</span></div></div>';
    var c3 = wCalc();
    h3 += '<div class="wsum"><span>Владельцам при этой ставке</span><b style="color:var(--owner)">'+rub(c3.ownerBase)+'</b></div>'+
      '<div class="wsum"><span>Клиент платит</span><b>'+rub(c3.clientVenues)+'</b></div>'+
      '<div class="wsum"><span>Нам</span><b style="color:var(--acc2)">'+rub(c3.our)+'</b></div></div>';
    h3 += '<div class="hint">15% даёт наценку +17,6% к сумме владельцев, 35% — +53,8%. Владельцы всегда получают свои цены целиком.</div>';
    return h3;
  }
  if (W.step===4){
    var h4 = '<div class="wp-title">Шаг 4. Услуги</div><div class="wp-sub">Креатив, тексты, аналитика. Это чистая маржа сверх пакета.</div>';
    h4 += '<div class="wcard"><div class="card-h"><h3>Услуги в сделке</h3><div class="sp"></div><button class="btn ghost sm" id="wSvcLib">+ Из списка готовых</button><button class="btn ghost sm" id="wSvcAdd">+ Своя</button></div>';
    h4 += '<div class="tw"><table><tbody>';
    if (!s.services.length) h4 += '<tr><td><div class="empty" style="padding:20px">Услуг нет — только пакет площадок</div></td></tr>';
    s.services.forEach(function(x,i){
      h4 += '<tr><td><input value="'+esc(x.name)+'" data-svcname="'+i+'" style="background:#0a0c12;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:7px 9px;width:100%"></td>'+
        '<td style="width:130px"><input type="number" value="'+(x.price||'')+'" data-svcprice="'+i+'" style="background:#0a0c12;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:7px 9px;width:100%;text-align:right"></td>'+
        '<td style="width:36px"><button class="btn ghost sm" data-svcdel="'+i+'" style="color:var(--red)">×</button></td></tr>';
    });
    h4 += '</tbody></table></div>';
    h4 += '<div class="wsum" style="margin-top:12px"><span>Услуги итого</span><b>'+rub(wCalc().servicesSum)+'</b></div></div>';
    return h4;
  }
  if (W.step===5){
    var c5 = wCalc();
    var h5 = '<div class="wp-title">Шаг 5. Расходы и правила</div><div class="wp-sub">Что вычитается из нашего дохода и как округляется цена клиенту.</div>';
    h5 += '<div class="wcard">';
    h5 += '<div class="grid g2"><div class="wf"><label>Прочие расходы, ₽</label><input type="number" id="wOver" value="'+(s.overhead||'')+'" placeholder="0"><div class="hint">Подрядчики, транспорт, мелочи</div></div>'+
      '<div class="wf"><label>Реферал, % от нашего дохода</label><input type="number" id="wRef" value="'+(s.refRate||'')+'" placeholder="0"><div class="hint">Если клиента привёл кто-то со стороны</div></div></div>';
    h5 += '<div class="wf"><label>Округление цены клиенту</label><div class="chip-pick">'+
      [[0,'без округления'],[100,'до 100 ₽'],[500,'до 500 ₽'],[1000,'до 1 000 ₽']].map(function(r){
        return '<button data-round="'+r[0]+'" class="'+(Number(s.round)===r[0]?'on':'')+'">'+r[1]+'</button>';
      }).join('')+'</div></div>';
    h5 += '<div class="hr"></div><b style="font-size:13px">Пороги, при которых пакет не берём</b>';
    h5 += '<div class="wsum" style="margin-top:8px"><span>Минимальный доход с пакета</span><b>3 000 ₽</b></div>'+
      '<div class="wsum"><span>Минимум площадок в пакете</span><b>3</b></div>'+
      '<div class="wsum"><span>Наш доход сейчас</span><b style="color:'+(c5.net>=3000?'var(--acc2)':'var(--red)')+'">'+rub(c5.net)+'</b></div>';
    if (c5.net<3000) h5 += '<div class="hint" style="color:var(--warn)">⚠️ Доход ниже порога — такой пакет по правилам не берём. Добавь площадок или подними ставку.</div>';
    h5 += '</div>';
    return h5;
  }
  // STEP 6 — итог
  var c6 = wCalc();
  var h6 = '<div class="wp-title">Шаг 6. Итог</div><div class="wp-sub">Проверь цифры и сохрани сделку.</div>';
  h6 += '<div class="whero"><div class="whl">Клиент платит</div><div class="whv">'+rub(c6.clientTotal)+'</div>'+
    '<div class="whs">'+(s.venues.length)+' площадок · '+(s.services.length? s.services.length+' услуг · ':'')+'ставка '+s.rate+'%</div></div>';
  h6 += '<div class="grid g3" style="margin-bottom:14px">'+
    kpi('Владельцам', rub(c6.ownerBase), 'получают целиком', '')+
    kpi('Нам', rub(c6.net), 'после расходов', 'acc')+
    kpi('Маржа', (c6.clientTotal>0?(c6.margin*100).toFixed(1)+'%':'—'), 'от чека клиента', 'gold')+'</div>';
  h6 += '<div class="wcard"><div class="card-h"><h3>Разбор по площадкам</h3></div><div class="tw"><table><thead><tr><th>Площадка</th><th class="num">Владельцу</th><th class="num">Ставка</th><th class="num">Клиенту</th><th class="num">Нам</th></tr></thead><tbody>';
  s.venues.forEach(function(v,i){
    var cc = c6.venues[i];
    h6 += '<tr><td>'+esc(v.name||'—')+'</td><td class="num muted">'+rub(cc.ownerTotal)+'</td><td class="num">'+cc.rate+'%</td>'+
      '<td class="num">'+rub(cc.clientPlace)+'</td><td class="num" style="color:var(--acc2)">'+rub(cc.our)+'</td></tr>';
  });
  h6 += '</tbody></table></div></div>';
  // проверки
  var checks = [
    [s.venues.length>0,'в пакете есть площадки'],
    [s.venues.length>=3,'минимум 3 площадки ('+s.venues.length+')'],
    [s.venues.every(function(v){return Number(v.price)>0;}),'у всех площадок есть цена'],
    [s.venues.every(function(v){return Number(v.reach)>0;}),'у всех указан охват'],
    [!!s.niche,'выбрана ниша'],
    [c6.net>=3000,'доход выше порога 3 000 ₽']
  ];
  h6 += '<div class="wcard" style="margin-top:14px"><div class="card-h"><h3>Проверки</h3></div>';
  checks.forEach(function(x){
    h6 += '<div class="row" style="padding:5px 0;font-size:12.5px"><span style="color:'+(x[0]?'var(--green)':'var(--warn)')+'">'+(x[0]?'✓':'⚠')+'</span><span class="'+(x[0]?'':'muted')+'">'+x[1]+'</span></div>';
  });
  h6 += '</div>';
  h6 += '<div class="row" style="margin-top:14px"><button class="btn ghost" id="wExport">Скачать медиаплан CSV</button>'+
    '<button class="btn ghost" id="wPrint">Печать</button>'+
    (s.dealId?'<button class="btn danger sm" id="wDelete">Удалить сделку</button>':'')+'</div>';
  return h6;
}

function wField(label, input){ return '<div class="wf"><label>'+label+'</label>'+input+'</div>'; }
function wBlock(n, title, body){
  var open = (W.opened===n);
  var inner = Array.isArray(body) ? body.join('') : String(body || '');
  return '<div class="wblock'+(open?' open':'')+'" data-block="'+n+'">'+
    '<div class="wbh"><div class="wbn">'+n+'</div><div style="flex:1"><b>'+title+'</b></div><span class="wchev">▶</span></div>'+
    '<div class="wbb">'+inner+'</div></div>';
}
function wRateCard(val, title, sub, on){
  return '<div class="wrate'+(on?' on':'')+'" data-rate="'+val+'">'+
    '<div class="wrt">'+val+'%</div><div class="wrn">'+title+'</div><div class="wrs">'+sub+'</div></div>';
}

/* ---------- bindings ---------- */
function wOn(sel, ev, fn){
  var el = document.querySelector(sel);
  if (el) el[ev] = fn(el);
  return el;
}
function wAll(sel, ev, fn){
  document.querySelectorAll(sel).forEach(function(el){ el[ev] = fn(el); });
}

function wBind(){
  var s = W.data;

  /* --- шаг 1 --- */
  wOn('#wClient','oninput', function(el){ return function(){ s.client = el.value; }; });
  wOn('#wBudget','oninput', function(el){ return function(){ s.budget = el.value; }; });
  wOn('#wDate','onchange',  function(el){ return function(){ s.dealDate = el.value; }; });
  wAll('[data-type]','onclick',  function(el){ return function(){ s.type = el.dataset.type; wRender(); }; });
  wAll('[data-niche]','onclick', function(el){ return function(){ s.niche = el.dataset.niche; wRender(); }; });

  /* --- шаг 2: список --- */
  wAll('[data-vopen]','onclick', function(el){ return function(){ W.active = el.dataset.vopen; W.opened = 1; wRender(); }; });
  wOn('#wAddManual','onclick',  function(){ return function(){ addVenue(null); }; });
  wOn('#wAddFromBase','onclick',function(){ return function(){ pickFromBase(); }; });
  wOn('#wBackList','onclick',   function(){ return function(){ W.active = null; wRender(); }; });
  wOn('#wBackList2','onclick',  function(){ return function(){ W.active = null; wRender(); }; });
  wOn('#wDelVenue','onclick',   function(){ return function(){
    W.data.venues = W.data.venues.filter(function(x){ return x.id !== W.active; });
    W.active = null; wRender();
  }; });

  /* --- шаг 2: карточка площадки --- */
  var v = W.active ? s.venues.filter(function(x){ return x.id === W.active; })[0] : null;
  if (v){
    wOn('#vName','oninput',    function(el){ return function(){ v.name = el.value; }; });
    wOn('#vSubs','oninput',    function(el){ return function(){ v.subs = el.value; }; });
    wOn('#vReach','oninput',   function(el){ return function(){ v.reach = el.value; }; });
    wOn('#vPrice','oninput',   function(el){ return function(){ v.price = el.value; wRender(); }; });
    wOn('#vQty','oninput',     function(el){ return function(){ v.qty = el.value; wRender(); }; });
    wOn('#vCustom','oninput',  function(el){ return function(){ v.customOptSum = el.value; wRender(); }; });
    wOn('#vOwnRate','oninput', function(el){ return function(){ v.ownRate = el.value; wRender(); }; });
    wOn('#vReach30','onclick', function(){ return function(){ v.reach = Math.round((Number(v.subs)||0) * 0.3); wRender(); }; });
    wAll('[data-vtype]','onclick',  function(el){ return function(){ v.type = el.dataset.vtype; wRender(); }; });
    wAll('[data-vniche]','onclick', function(el){ return function(){ v.niche = el.dataset.vniche; wRender(); }; });
    wAll('[data-opt]','onchange', function(el){ return function(){
      v.opts = v.opts || [];
      if (el.checked){ if (v.opts.indexOf(el.dataset.opt) < 0) v.opts.push(el.dataset.opt); }
      else { v.opts = v.opts.filter(function(k){ return k !== el.dataset.opt; }); }
      wRender();
    }; });
    wAll('[data-vrate]','onclick', function(el){ return function(){
      v.ownRate = el.dataset.vrate === 'own' ? (v.ownRate === null ? 15 : v.ownRate) : null;
      wRender();
    }; });
    wAll('.wbh','onclick', function(el){ return function(){
      var n = Number(el.parentElement.dataset.block);
      W.opened = (W.opened === n ? null : n);
      wRender();
    }; });
  }

  /* --- шаг 3 --- */
  wOn('#wRateR','oninput', function(el){ return function(){
    s.rate = Number(el.value);
    var d = document.getElementById('wRateVal');
    if (d) d.textContent = s.rate + '%';
  }; });
  wOn('#wRateR','onchange', function(el){ return function(){ s.rate = Number(el.value); wRender(); }; });
  wAll('[data-rate]','onclick', function(el){ return function(){ s.rate = Number(el.dataset.rate); wRender(); }; });

  /* --- шаг 4 --- */
  wOn('#wSvcAdd','onclick', function(){ return function(){ s.services.push({ name:'Новая услуга', price:0 }); wRender(); }; });
  wOn('#wSvcLib','onclick', function(){ return function(){ svcLib(); }; });
  wAll('[data-svcname]','oninput',  function(el){ return function(){ s.services[Number(el.dataset.svcname)].name = el.value; }; });
  wAll('[data-svcprice]','oninput', function(el){ return function(){ s.services[Number(el.dataset.svcprice)].price = Number(el.value) || 0; }; });
  wAll('[data-svcdel]','onclick',   function(el){ return function(){ s.services.splice(Number(el.dataset.svcdel),1); wRender(); }; });

  /* --- шаг 5 --- */
  wOn('#wOver','oninput', function(el){ return function(){ s.overhead = el.value; }; });
  wOn('#wRef','oninput',  function(el){ return function(){ s.refRate = el.value; }; });
  wAll('[data-round]','onclick', function(el){ return function(){ s.round = Number(el.dataset.round); wRender(); }; });

  /* --- шаг 6 --- */
  wOn('#wExport','onclick', function(){ return function(){ wExport(); }; });
  wOn('#wPrint','onclick',  function(){ return function(){ window.print(); }; });
  wOn('#wDelete','onclick', function(){ return function(){ wDelete(); }; });
}

function addVenue(fromBase){
  var s = W.data;
  var v = { id:'v'+Math.random().toString(36).slice(2,8), venueId: fromBase?fromBase.id:null,
    name: fromBase?fromBase.name:'', type: fromBase?fromBase.type:'discord', niche: fromBase?fromBase.niche:(s.niche||''),
    subs: fromBase?fromBase.subs:0, reach: fromBase?fromBase.reach:0, price: fromBase?fromBase.price:0,
    qty:1, opts:[], customOptSum:0, ownRate:null, format:'', date:'' };
  s.venues.push(v);
  W.active = v.id; W.opened = 1;
  wRender();
}

function pickFromBase(){
  var list = W.venues.filter(function(v){
    return !W.data.venues.some(function(x){ return x.venueId===v.id; });
  });
  var body = '<div class="hint" style="margin-bottom:12px">Площадки из базы. Выбери одну или несколько — цены и охваты подтянутся.</div>';
  if (!list.length) body += '<div class="empty"><div class="ee">📡</div>Свободных площадок в базе нет. Добавь их на странице «Площадки».</div>';
  body += '<div style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px">';
  list.forEach(function(v){
    body += '<label style="display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid rgba(35,40,56,.5);font-size:12.5px;cursor:pointer">'+
      '<input type="checkbox" data-pickv="'+v.id+'" style="accent-color:#6d5efc">'+
      '<span style="flex:1"><b>'+esc(v.name)+'</b> <span class="dim">· '+esc(v.niche)+' · '+rub0(v.subs)+' подп.</span></span>'+
      '<span class="muted">'+rub(v.price)+'</span></label>';
  });
  body += '</div>';
  modal('Добавить из базы', body, [
    { t:'Отмена', cls:'ghost', fn: closeModal },
    { t:'Добавить', cls:'ok', fn: function(){
        var picked = [];
        document.querySelectorAll('[data-pickv]').forEach(function(cb){ if (cb.checked) picked.push(cb.dataset.pickv); });
        picked.forEach(function(id){ var v = W.venues.filter(function(x){return x.id===id;})[0]; if (v) addVenue(v); });
        closeModal();
        if (!picked.length) toast('Ничего не выбрано', true);
      }}
  ]);
}

function svcLib(){
  var body = '<div class="hint" style="margin-bottom:12px">Готовые услуги. Отметь — добавятся в сделку, цены можно поправить.</div>';
  body += '<div style="border:1px solid var(--line);border-radius:10px">';
  SVC_LIB.forEach(function(x,i){
    body += '<label style="display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid rgba(35,40,56,.5);font-size:12.5px;cursor:pointer">'+
      '<input type="checkbox" data-svcp="'+i+'" style="accent-color:#6d5efc"><span style="flex:1">'+x.name+'</span><span class="muted">'+rub(x.price)+'</span></label>';
  });
  body += '</div>';
  modal('Готовые услуги', body, [
    { t:'Отмена', cls:'ghost', fn: closeModal },
    { t:'Добавить', cls:'ok', fn: function(){
        document.querySelectorAll('[data-svcp]').forEach(function(cb){
          if (cb.checked){ var x = SVC_LIB[Number(cb.dataset.svcp)]; W.data.services.push({ name:x.name, price:x.price }); }
        });
        closeModal(); wRender();
      }}
  ]);
}

function wStepNext(){
  W.active = null;
  if (W.step===1 && !W.data.client){ return toast('Введи название клиента', true); }
  if (W.step===2 && !W.data.venues.length){ return toast('Добавь хотя бы одну площадку', true); }
  W.step = Math.min(6, W.step+1);
  wRender();
}

function wSave(){
  var s = W.data, c = wCalc();
  if (!s.client) return toast('Нет названия клиента', true);
  if (!s.venues.length) return toast('В пакете нет площадок', true);
  var payload = {
    client:s.client, niche:s.niche, type:s.type, budget:s.budget, dealDate:s.dealDate,
    rate:s.rate, venues:s.venues.map(function(v){
      return { venueId:v.venueId, name:v.name, type:v.type, niche:v.niche, subs:v.subs, reach:v.reach,
        price:v.price, qty:v.qty, opts:v.opts, customOptSum:v.customOptSum, ownRate:v.ownRate,
        format:v.format, date:v.date };
    }),
    services:s.services, overhead:s.overhead, refRate:s.refRate, round:s.round, status:s.status
  };
  var url = s.dealId ? '/deals/'+s.dealId : '/deals';
  var method = s.dealId ? 'PUT' : 'POST';
  api(url, method, payload).then(function(j){
    if (!j.ok) return toast(j.error, true);
    toast(s.dealId ? 'Сделка обновлена' : 'Сделка создана: '+rub(j.deal.clientTotal));
    W.data.dealId = j.deal.id;
    wizardClose();
  });
}

function wExport(){
  if (!W.data.dealId) return toast('Сначала сохрани сделку', true);
  window.location = '/api/deals/'+W.data.dealId+'/mediaplan';
}
function wDelete(){
  if (!W.data.dealId) return;
  if (!confirm('Удалить сделку?')) return;
  api('/deals/'+W.data.dealId,'DELETE').then(function(j){
    if (!j.ok) return toast(j.error,true);
    toast('Удалено'); wizardClose();
  });
}

/* ================= VENUES ================= */
function viewVenues(){
  api('/venues').then(function(j){
    var vs = j.venues || [];
    var h = '<div class="wrap"><div class="page-h"><div><h2>Площадки</h2><p>База партнёрских каналов и серверов. Одна тематика = один пакет.</p></div><div class="sp"></div><button class="btn" id="vNew">+ Площадка</button></div>';
    var niches = {};
    vs.forEach(function(v){ niches[v.niche] = (niches[v.niche]||0)+1; });
    h += '<div class="grid g4" style="margin-bottom:14px">'+kpi('Всего', vs.length, 'в базе')+kpi('Средняя цена', vs.length? rub(vs.reduce(function(s,v){return s+(v.price||0);},0)/vs.length):'—','за пост','gold')+
      kpi('Суммарный охват', rub0(vs.reduce(function(s,v){return s+(v.reach||0);},0)), 'человек')+
      kpi('Ниш', Object.keys(niches).length, 'тематик')+'</div>';
    Object.keys(niches).forEach(function(n){
      h += '<div class="card" style="margin-bottom:12px"><div class="card-h"><h3>'+esc(n)+'</h3><div class="sp"></div><span class="tag '+(niches[n]>=3?'g':'y')+'">'+niches[n]+' / мин. 3</span></div><div class="tw"><table><thead><tr><th>Площадка</th><th>Тип</th><th class="num">Подписчиков</th><th class="num">Охват</th><th>Владелец</th><th class="num">Цена</th><th>Статус</th></tr></thead><tbody>';
      vs.filter(function(v){ return v.niche===n; }).forEach(function(v){
        h += '<tr><td><b>'+esc(v.name)+'</b></td><td class="muted">'+esc(v.type)+'</td><td class="num">'+rub0(v.subs)+'</td><td class="num">'+rub0(v.reach)+'</td>'+
          '<td class="muted">'+esc(v.owner||'—')+(v.ownerTg?' <span class="dim">'+esc(v.ownerTg)+'</span>':'')+'</td>'+
          '<td class="num">'+rub(v.price)+'</td><td>'+(v.status==='work'?'<span class="tag g">в работе</span>':v.status==='new'?'<span class="tag y">новая</span>':'<span class="tag n">архив</span>')+'</td></tr>';
      });
      h += '</tbody></table></div></div>';
    });
    if (!vs.length) h += '<div class="card"><div class="empty"><div class="ee">📡</div>База пуста</div></div>';
    h += '</div>';
    $('dash').innerHTML = h;
    $('vNew').onclick = venueModal;
  });
}
function venueModal(){
  var niches = ['RUST','Гейминг','Крипта / Web3','IT / разработка','Аниме','Мемы','Учёба','Бизнес','Другое'];
  var types = ['discord','telegram','tma','vk','youtube'];
  var body = '<div class="f"><label>Название</label><input id="vnName" placeholder="RUST • Сервер #1"></div>'+
    '<div class="grid g2"><div class="f"><label>Тип</label><select id="vnType">'+types.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select></div>'+
    '<div class="f"><label>Ниша</label><select id="vnNiche">'+niches.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select></div></div>'+
    '<div class="grid g2"><div class="f"><label>Подписчиков</label><input type="number" id="vnSubs" placeholder="3000"></div>'+
    '<div class="f"><label>Охват (реальный)</label><input type="number" id="vnReach" placeholder="2200"></div></div>'+
    '<div class="grid g2"><div class="f"><label>Владелец</label><input id="vnOwner" placeholder="ник"></div>'+
    '<div class="f"><label>Цена за пост, ₽</label><input type="number" id="vnPrice" placeholder="1500"></div></div>'+
    '<div class="f"><label>Статус</label><select id="vnStatus"><option value="new">новая</option><option value="work">в работе</option><option value="arch">архив</option></select></div>';
  modal('Новая площадка', body, [
    { t:'Отмена', cls:'ghost', fn: closeModal },
    { t:'Добавить', cls:'ok', fn: function(){
        var name = document.getElementById('vnName').value.trim();
        if (!name) return toast('Нужно название', true);
        api('/venues','POST',{ name:name, type:document.getElementById('vnType').value, niche:document.getElementById('vnNiche').value,
          subs:document.getElementById('vnSubs').value, reach:document.getElementById('vnReach').value,
          owner:document.getElementById('vnOwner').value, price:document.getElementById('vnPrice').value,
          status:document.getElementById('vnStatus').value }).then(function(j){
          if (!j.ok) return toast(j.error,true);
          closeModal(); toast('Площадка добавлена'); render();
        });
      }}
  ]);
}

/* ================= CODE ================= */
function viewCode(){
  api('/code/today').then(function(j){
    var canIssue = PERMS['code.issue'];
    var h = '<div class="wrap"><div class="page-h"><div><h2>Сменный код дня</h2><p>Один код на всех, действует сутки. Без него никто не войдёт — даже с верным паролем.</p></div><div class="sp"></div></div>';
    h += '<div class="grid g2" style="margin-bottom:14px">';
    h += '<div class="card" style="text-align:center;border-color:rgba(0,224,184,.3)">'+
      '<div class="kl" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);font-weight:800">Код на '+esc(j.date)+'</div>'+
      '<div style="margin:16px 0 6px">'+(j.issued ? '<div class="big-code">'+esc(j.code)+'</div>' : '<div style="font-size:18px;font-weight:800;color:var(--warn)">не выдан</div>')+'</div>'+
      '<div class="muted" style="font-size:12px">'+(j.issued ? 'выдан в '+dt(j.issuedAt) : 'сотрудники не могут войти')+'</div>'+
      '<div class="row" style="justify-content:center;margin-top:16px">'+
      (canIssue ? '<button class="btn" id="cIssue">'+(j.issued?'🔄 Перевыдать':'⚡ Выдать код')+'</button>'+
        '<button class="btn ghost" id="cCopy">Копировать</button>'+
        (j.issued?'<button class="btn ghost" id="cRevoke">Отозвать</button>':'') : '<span class="pill">Код выдаёт основатель или руководитель</span>')+
      '</div></div>';
    h += '<div class="card"><div class="card-h"><h3>Как это работает</h3></div>'+
      '<div style="font-size:13px;color:var(--muted);line-height:1.75">'+
      '<b style="color:var(--txt)">1.</b> Утром ты нажимаешь «Выдать код» — система генерирует 6 цифр.<br>'+
      '<b style="color:var(--txt)">2.</b> Кидаешь код в рабочую беседу (лид/руководитель раздаёт команде).<br>'+
      '<b style="color:var(--txt)">3.</b> Сотрудник вводит логин + пароль → потом код → попадает внутрь.<br>'+
      '<b style="color:var(--txt)">4.</b> Код одноразовый на день: в 00:00 он умирает, следующий никто не угадает.<br>'+
      '<b style="color:var(--txt)">5.</b> Забыл раздать — сотрудники стучатся, доступ только у тебя.</div>'+
      '<div class="hint">Все попытки входа и ошибки кода видно в журнале. 5 неверных попыток — блокровка на '+ (CACHE.settings? CACHE.settings.lockMinutes:15) +' мин.</div></div>';
    h += '</div>';
    if (canIssue && j.history){
      h += '<div class="card pad0"><div class="card-h" style="padding:14px 16px;margin:0"><h3>История кодов</h3></div><div class="tw"><table><thead><tr><th>Дата</th><th>Код</th><th>Выдал</th><th>Входов</th><th></th></tr></thead><tbody>';
      j.history.forEach(function(x){
        h += '<tr><td>'+esc(x.date)+'</td><td class="mono">'+esc(x.code||'—')+'</td><td class="muted">'+esc(x.by)+'</td><td>'+x.used+'</td>'+
          '<td>'+(x.revoked?'<span class="tag r">отозван</span>':x.used?'<span class="tag g">использован</span>':'<span class="tag n">не использован</span>')+'</td></tr>';
      });
      h += '</tbody></table></div></div>';
    }
    h += '</div>';
    $('dash').innerHTML = h;
    var i = $('cIssue'); if (i) i.onclick = function(){
      api('/code/issue','POST').then(function(r){ if(r.ok){ toast('Код выдан: '+r.code); render(); } else toast(r.error,true); });
    };
    var c = $('cCopy'); if (c) c.onclick = function(){
      navigator.clipboard.writeText(j.code||'').then(function(){ toast('Код скопирован'); });
    };
    var rv = $('cRevoke'); if (rv) rv.onclick = function(){
      if (!confirm('Отозвать код? Все, кто ещё не вошёл — не войдут.')) return;
      api('/code/revoke','POST').then(function(r){ if(r.ok){ toast('Код отозван'); render(); } else toast(r.error,true); });
    };
  });
}

/* ================= TEAM ================= */
function viewTeam(){
  api('/users').then(function(res){
    var users = res.users || [];
    CACHE.users = users;
    var canCreate = PERMS['user.create'], canBlock = PERMS['user.block'], canPatch = (ME.role==='founder'||ME.role==='head');
    var h = '<div class="wrap"><div class="page-h"><div><h2>Команда</h2><p>Роли: 👑 основатель → 🎖️ руководитель → 🧑‍💼 менеджеры. Ветку создаёт только основатель.</p></div><div class="sp"></div>'+
      (canCreate?'<button class="btn" id="uNew">+ Создать учётку</button>':'<span class="pill">Учётки создаёт только основатель</span>')+'</div>';
    if (!canCreate) h += '<div class="card" style="margin-bottom:14px;border-color:rgba(255,179,71,.3);font-size:13px;color:var(--muted)">🔒 Ты можешь смотреть состав и показатели, но не создавать и не удалять учётки. Это право только у основателя.</div>';

    var byRole = { founder:[], head:[], manager:[] };
    users.forEach(function(u){ (byRole[u.role] || byRole.manager).push(u); });
    // дерево
    h += '<div class="grid g3" style="margin-bottom:14px">'+kpi('👑 Основатели', byRole.founder.length,'', 'gold')+kpi('🎖️ Руководители', byRole.head.length,'')+kpi('🧑‍💼 Менеджеры', byRole.manager.length,'')+'</div>';
    h += '<div class="card pad0"><div class="tw"><table><thead><tr><th>Имя</th><th>Роль</th><th>Логин</th><th>Руководитель</th><th class="num">Оклад</th><th>Последний вход</th><th>Действия</th></tr></thead><tbody>';
    users.forEach(function(u){
      var m = roleMeta(u.role);
      var head = CACHE.users.filter(function(x){ return x.id === u.headId; })[0];
      h += '<tr><td><b>'+(u.role==='founder'?'👑 ':'')+esc(u.name)+'</b>'+(u.blocked?' <span class="tag r">заблокирован</span>':'')+'</td>'+
        '<td><span class="role-tag">'+m.e+' '+m.l+'</span></td>'+
        '<td class="mono muted">'+esc(u.login)+'</td>'+
        '<td class="muted">'+esc(head? head.name : '—')+'</td>'+
        '<td class="num">'+(u.base?rub(u.base):'—')+'</td>'+
        '<td class="muted">'+ago(u.lastLogin)+'</td>'+
        '<td class="row" style="gap:6px">'+
          (canBlock && u.role!=='founder' ? '<button class="btn ghost sm" data-block="'+u.id+'" data-cur="'+(u.blocked?1:0)+'">'+(u.blocked?'Разблок.':'Блок')+'</button>':'')+
          (canBlock && u.role!=='founder' ? '<button class="btn ghost sm" data-reset="'+u.id+'">Пароль</button>':'')+
          (canPatch ? '<button class="btn ghost sm" data-edit="'+u.id+'">Изменить</button>':'')+
        '</td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    $('dash').innerHTML = h;

    var n = $('uNew'); if (n) n.onclick = userModal;
    $('dash').querySelectorAll('[data-block]').forEach(function(b){
      b.onclick = function(){ api('/users/'+b.dataset.block+'/block','POST',{ blocked: b.dataset.cur==='0' }).then(function(j){ if(j.ok){ toast('Готово'); render(); } else toast(j.error,true); }); };
    });
    $('dash').querySelectorAll('[data-reset]').forEach(function(b){
      b.onclick = function(){
        var p = prompt('Новый пароль (мин. 8 символов):', 'sgax'+Math.floor(Math.random()*9000+1000));
        if (!p) return;
        api('/users/'+b.dataset.reset+'/reset','POST',{ password:p }).then(function(j){ j.ok?toast('Пароль сброшен: '+p):toast(j.error,true); });
      };
    });
    $('dash').querySelectorAll('[data-edit]').forEach(function(b){
      b.onclick = function(){ editUserModal(CACHE.users.filter(function(x){ return x.id===b.dataset.edit; })[0]); };
    });
  });
}

function userModal(){
  var roles = [['manager','🧑‍💼 Менеджер'],['senior_manager','⭐ Старший менеджер'],['head','🎖️ Руководитель'],['founder','👑 Founder']];
  var heads = CACHE.users.filter(function(u){ return u.role==='head'; });
  var body = '<div class="f"><label>Имя</label><input id="nuName" placeholder="Максим"></div>'+
    '<div class="grid g2"><div class="f"><label>Логин</label><input id="nuLogin" placeholder="maks"></div>'+
    '<div class="f"><label>Пароль</label><input id="nuPass" value="sgax'+Math.floor(Math.random()*9000+1000)+'"></div></div>'+
    '<div class="f"><label>Роль</label><div class="chip-pick" id="nuRoles">'+roles.map(function(r,i){ return '<button data-r="'+r[0]+'" class="'+(i===0?'on':'')+'">'+r[1]+'</button>'; }).join('')+'</div></div>'+
    '<div class="grid g2"><div class="f"><label>Руководитель</label><select id="nuHead"><option value="">—</option>'+heads.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+'</option>';}).join('')+'</select></div>'+
    '<div class="f"><label>Оклад, ₽</label><input type="number" id="nuBase" placeholder="0"></div></div>'+
    '<div class="grid g2"><div class="f"><label>Telegram</label><input id="nuTg" placeholder="@nick"></div>'+
    '<div class="f"><label>Email</label><input id="nuEmail" placeholder="mail@sgax.local"></div></div>'+
    '<div class="hint">Пароль можно передать сотруднику — система попросит его сменить при первом входе.</div>';
  modal('Создать учётку', body, [
    { t:'Отмена', cls:'ghost', fn: closeModal },
    { t:'Создать', cls:'ok', fn: function(){
        var role = (document.querySelector('#nuRoles .on')||{}).dataset && document.querySelector('#nuRoles .on').dataset.r;
        var payload = { name: document.getElementById('nuName').value.trim(), login: document.getElementById('nuLogin').value.trim(),
          password: document.getElementById('nuPass').value, role: role || 'manager',
          headId: document.getElementById('nuHead').value || null, base: document.getElementById('nuBase').value,
          tg: document.getElementById('nuTg').value, email: document.getElementById('nuEmail').value, mustChange: true };
        if (!payload.name || !payload.login) return toast('Имя и логин обязательны', true);
        api('/users','POST',payload).then(function(j){
          if (!j.ok) return toast(j.error,true);
          toast('Учётка создана: '+payload.login); closeModal(); render();
        });
      }}
  ]);
  document.querySelectorAll('#nuRoles button').forEach(function(b){
    b.onclick = function(){ document.querySelectorAll('#nuRoles button').forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on'); };
  });
}

function editUserModal(u){
  if (!u) return;
  var heads = CACHE.users.filter(function(x){ return x.role==='head'; });
  var roles = [['manager','🧑‍💼 Менеджер'],['senior_manager','⭐ Старший'],['head','🎖️ Руководитель'],['founder','👑 Founder']];
  var body = '<div class="f"><label>Имя</label><input id="euName" value="'+esc(u.name)+'"></div>'+
    '<div class="grid g2"><div class="f"><label>Telegram</label><input id="euTg" value="'+esc(u.tg||'')+'"></div>'+
    '<div class="f"><label>Email</label><input id="euEmail" value="'+esc(u.email||'')+'"></div></div>'+
    '<div class="grid g2"><div class="f"><label>Руководитель</label><select id="euHead"><option value="">—</option>'+heads.map(function(x){return '<option value="'+x.id+'"'+(u.headId===x.id?' selected':'')+'>'+esc(x.name)+'</option>';}).join('')+'</select></div>'+
    '<div class="f"><label>Оклад, ₽</label><input type="number" id="euBase" value="'+(u.base||'')+'" '+(ME.role!=='founder'?'disabled':'')+'></div></div>'+
    (ME.role==='founder'?'<div class="f"><label>Роль</label><select id="euRole">'+roles.map(function(r){return '<option value="'+r[0]+'"'+(u.role===r[0]?' selected':'')+'>'+r[1]+'</option>';}).join('')+'</select></div>':'');
  modal('Изменить: '+u.name, body, [
    { t:'Отмена', cls:'ghost', fn: closeModal },
    { t:'Сохранить', cls:'ok', fn: function(){
        var p = { name:document.getElementById('euName').value, tg:document.getElementById('euTg').value,
          email:document.getElementById('euEmail').value, headId:document.getElementById('euHead').value||null };
        if (ME.role==='founder'){ p.base = document.getElementById('euBase').value; var r = document.getElementById('euRole'); if (r) p.role = r.value; }
        api('/users/'+u.id+'/patch','POST',p).then(function(j){ j.ok?(closeModal(),toast('Сохранено'),render()):toast(j.error,true); });
      }}
  ]);
}

/* ================= PAYOUTS ================= */
function viewPayouts(){
  api('/payouts').then(function(j){
    var calc = j.calcNow || [], reqs = j.payouts || [];
    var h = '<div class="wrap"><div class="page-h"><div><h2>Выплаты</h2><p>Система сама считает бонусы и формирует заявку. Ты только утверждаешь или отклоняешь.</p></div><div class="sp"></div>'+
      (PERMS['payout.build']?'<button class="btn" id="pBuild">⚡ Сформировать заявку</button>':'')+'</div>';

    if (PERMS['payout.build'] && calc.length){
      h += '<div class="card pad0" style="margin-bottom:14px"><div class="card-h" style="padding:14px 16px;margin:0"><h3>Расчёт на текущий месяц (прогноз)</h3><div class="sp"></div><span class="pill">автоматически</span></div><div class="tw"><table><thead><tr><th>Кто</th><th>Роль</th><th class="num">Сделок</th><th class="num">Чистыми сделок</th><th class="num">Бонус</th><th class="num">Оклад</th><th class="num">Итого</th></tr></thead><tbody>';
      var tot = 0;
      calc.forEach(function(r){
        tot += r.total;
        var m = roleMeta(r.role);
        h += '<tr><td><b>'+esc(r.name)+'</b></td><td><span class="role-tag">'+m.e+' '+m.l+'</span></td><td class="num">'+r.deals+'</td>'+
          '<td class="num muted">'+rub(r.net)+'</td><td class="num">'+rub(r.bonus)+'</td><td class="num muted">'+(r.base?rub(r.base):'—')+'</td>'+
          '<td class="num" style="font-weight:800;color:var(--acc2)">'+rub(r.total)+'</td></tr>';
      });
      h += '<tr><td colspan="6" style="text-align:right;font-weight:800">Всего к выплате</td><td class="num" style="font-weight:900;color:var(--gold);font-size:15px">'+rub(tot)+'</td></tr>';
      h += '</tbody></table></div></div>';
    }

    h += '<div class="page-h" style="margin-top:18px"><div><h3 style="font-size:15px">Заявки на выплаты</h3><p>Создаются автоматически '+ (CACHE.settings?CACHE.settings.autoPayoutDay:5) +'-го числа, если включена автоматика.</p></div></div>';
    if (!reqs.length) h += '<div class="card"><div class="empty"><div class="ee">💰</div>Заявок пока нет</div></div>';
    reqs.forEach(function(p){
      h += '<div class="card" style="margin-bottom:12px"><div class="card-h"><h3>Заявка за '+(p.period||'—')+'</h3>'+
        '<span class="tag '+(p.status==='pending'?'y':p.status==='approved'?'g':'r')+'">'+
        (p.status==='pending'?'на утверждении':p.status==='approved'?'утверждена':'отклонена')+'</span>'+
        (p.auto?'<span class="pill">сформирована системой</span>':'<span class="pill">вручную</span>')+
        '<div class="sp"></div><b style="font-size:16px;color:var(--gold)">'+rub(p.total)+'</b></div>';
      h += '<div class="tw"><table><thead><tr><th>Кому</th><th>Роль</th><th class="num">Сделок</th><th class="num">Бонус</th><th class="num">Оклад</th><th class="num">К выплате</th></tr></thead><tbody>';
      (p.rows||[]).forEach(function(r){
        var m = roleMeta(r.role);
        h += '<tr><td>'+esc(r.name)+'</td><td><span class="role-tag">'+m.e+' '+m.l+'</span></td><td class="num">'+r.deals+'</td><td class="num">'+rub(r.bonus)+'</td><td class="num muted">'+(r.base?rub(r.base):'—')+'</td><td class="num" style="font-weight:800">'+rub(r.total)+'</td></tr>';
      });
      h += '</tbody></table></div>';
      if (p.status === 'pending' && PERMS['payout.approve']){
        h += '<div class="row" style="margin-top:12px"><button class="btn ok sm" data-approve="'+p.id+'">✓ Утвердить и выплатить</button><button class="btn danger sm" data-reject="'+p.id+'">Отклонить</button></div>';
      }
      if (p.status !== 'pending') h += '<div class="hint">Решение: '+dt(p.decidedAt)+(p.comment?' · '+esc(p.comment):'')+'</div>';
      h += '</div>';
    });
    h += '</div>';
    $('dash').innerHTML = h;

    var b = $('pBuild'); if (b) b.onclick = function(){
      api('/payouts/build','POST',{}).then(function(r){ if(r.ok){ toast('Заявка сформирована: '+rub(r.payout.total)); render(); } else toast(r.error,true); });
    };
    $('dash').querySelectorAll('[data-approve]').forEach(function(x){
      x.onclick = function(){ api('/payouts/approve','POST',{ id:x.dataset.approve }).then(function(r){ r.ok?(toast('Заявка утверждена'),render()):toast(r.error,true); }); };
    });
    $('dash').querySelectorAll('[data-reject]').forEach(function(x){
      x.onclick = function(){ var c = prompt('Причина отклонения:'); if(c===null) return;
        api('/payouts/approve','POST',{ id:x.dataset.reject, reject:true, comment:c }).then(function(r){ r.ok?(toast('Отклонено'),render()):toast(r.error,true); }); };
    });
  });
}

/* ================= MONITOR ================= */
var monitorTimer = null;
function viewMonitor(){
  if (monitorTimer) clearInterval(monitorTimer);
  function load(){
    api('/monitor').then(function(j){
      if (!j.ok) return $('dash').innerHTML = '<div class="wrap"><div class="card">'+esc(j.error)+'</div></div>';
      var rows = j.rows || [];
      var worked = rows.filter(function(r){ return r.daysIdle === 0; }).length;
      var idle = rows.filter(function(r){ return r.status === 'idle' || r.status === 'blocked'; }).length;
      var h = '<div class="wrap"><div class="page-h"><div><h2>Контроль работы</h2><p>Система сама следит: кто заходил, кто закрывал сделки, кого пора дёрнуть.</p></div><div class="sp"></div><span class="pill">обновление 30 сек</span></div>';
      h += '<div class="grid g4" style="margin-bottom:14px">'+kpi('Онлайн сейчас', j.online, 'за 15 мин', 'acc')+kpi('Работали сегодня', worked+' из '+rows.length,'')+kpi('Простаивают', idle, 'надо разобраться', idle?'red':'')+kpi('Сигналов', (j.alerts||[]).length, 'требуют внимания', (j.alerts||[]).length?'gold':'')+'</div>';
      if ((j.alerts||[]).length){
        h += '<div class="card" style="margin-bottom:14px;border-color:rgba(255,92,122,.3)"><div class="card-h"><h3>⚠️ Оповещения</h3></div>';
        j.alerts.forEach(function(a){ h += '<div class="row" style="padding:6px 0;border-bottom:1px solid rgba(35,40,56,.5);font-size:13px"><span class="tag '+(a.level==='red'?'r':'y')+'">'+(a.level==='red'?'!':'·')+'</span>'+esc(a.text)+'</div>'; });
        h += '</div>';
      }
      h += '<div class="card pad0"><div class="tw"><table><thead><tr><th>Сотрудник</th><th>Роль</th><th>В сети</th><th>Был</th><th class="num">Сделок / 7д</th><th class="num">Всего</th><th>Активность</th><th>Статус</th></tr></thead><tbody>';
      rows.forEach(function(r){
        var m = roleMeta(r.role);
        h += '<tr><td><b>'+esc(r.name)+'</b><div class="login-badge">@'+esc(r.login)+'</div></td>'+
          '<td><span class="role-tag">'+m.e+' '+m.l+'</span></td>'+
          '<td>'+(r.lastSeen && r.lastSeen > Date.now()-15*60000 ? '<span class="tag g">онлайн</span>':'<span class="tag n">оффлайн</span>')+'</td>'+
          '<td class="muted">'+ago(r.lastSeen)+'</td>'+
          '<td class="num">'+r.weekDeals+'</td><td class="num">'+r.deals+'</td>'+
          '<td style="min-width:110px"><div class="bar"><i style="width:'+r.score+'%"></i></div></td>'+
          '<td>'+statusTag(r.status)+'</td></tr>';
      });
      if (!rows.length) h += '<tr><td colspan="8"><div class="empty">Нет сотрудников</div></td></tr>';
      h += '</tbody></table></div></div></div>';
      $('dash').innerHTML = h;
    });
  }
  load();
  monitorTimer = setInterval(load, 30000);
}

/* ================= INVITES ================= */
function viewInvites(){
  Promise.all([api('/invites'), api('/users')]).then(function(res){
    var inv = res[0].invites || [], users = res[1].users || [];
    var h = '<div class="wrap"><div class="page-h"><div><h2>Приглашения <span class="tag n" style="vertical-align:middle">по желанию</span></h2><p>Ссылка-код для сотрудника. Он регистрируется сам — но только по твоему коду и только с той ролью, которую ты дал.</p></div><div class="sp"></div><button class="btn" id="iNew">+ Приглашение</button></div>';
    h += '<div class="card" style="margin-bottom:14px;border-color:rgba(109,94,252,.3);font-size:13px;color:var(--muted)">🔐 Это не открытая регистрация: без живого кода приглашения зарегистрироваться невозможно, а код может создать не больше N человек.</div>';
    h += '<div class="card pad0"><div class="tw"><table><thead><tr><th>Код</th><th>Роль</th><th>Руководитель</th><th class="num">Использовано</th><th>Живёт до</th><th>Статус</th><th></th></tr></thead><tbody>';
    if (!inv.length) h += '<tr><td colspan="7"><div class="empty"><div class="ee">✉️</div>Кодов нет</div></td></tr>';
    inv.forEach(function(i){
      var m = roleMeta(i.role);
      var head = users.filter(function(u){ return u.id===i.headId; })[0];
      var dead = !i.active || i.expires < Date.now() || i.used >= i.limit;
      h += '<tr><td class="mono" style="font-weight:800;color:var(--acc2);font-size:15px">'+esc(i.code)+'</td>'+
        '<td><span class="role-tag">'+m.e+' '+m.l+'</span></td><td class="muted">'+esc(head?head.name:'—')+'</td>'+
        '<td class="num">'+i.used+' / '+i.limit+'</td><td class="muted">'+new Date(i.expires).toLocaleDateString('ru-RU')+'</td>'+
        '<td>'+(dead?'<span class="tag n">закрыт</span>':'<span class="tag g">активен</span>')+'</td>'+
        '<td>'+(dead?'':'<button class="btn ghost sm" data-rev="'+i.id+'">Отозвать</button>')+'</td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    $('dash').innerHTML = h;
    $('iNew').onclick = function(){
      var roles = [['manager','🧑‍💼 Менеджер'],['senior_manager','⭐ Старший менеджер'],['head','🎖️ Руководитель']];
      modal('Новое приглашение', '<div class="f"><label>Роль</label><div class="chip-pick" id="ivRoles">'+roles.map(function(r,i){return '<button data-r="'+r[0]+'" class="'+(i===0?'on':'')+'">'+r[1]+'</button>';}).join('')+'</div></div>'+
        '<div class="f"><label>Сколько человек может использовать</label><input type="number" id="ivLimit" value="1"></div>'+
        '<div class="hint">Код живёт 7 дней. Отозвать можно в любой момент.</div>', [
        { t:'Отмена', cls:'ghost', fn: closeModal },
        { t:'Создать код', cls:'ok', fn: function(){
            var r = (document.querySelector('#ivRoles .on')||{}).dataset;
            api('/invites','POST',{ role: r? r.r : 'manager', limit: document.getElementById('ivLimit').value }).then(function(j){
              if(!j.ok) return toast(j.error,true);
              toast('Код: '+j.invite.code); closeModal(); render();
            });
          }}
      ]);
      document.querySelectorAll('#ivRoles button').forEach(function(b){
        b.onclick = function(){ document.querySelectorAll('#ivRoles button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); };
      });
    };
    $('dash').querySelectorAll('[data-rev]').forEach(function(b){
      b.onclick = function(){ api('/invites/revoke','POST',{ id:b.dataset.rev }).then(function(j){ j.ok?(toast('Отозван'),render()):toast(j.error,true); }); };
    });
  });
}

/* ================= SETTINGS / ADMIN ================= */
function viewSettings(){
  api('/settings').then(function(j){
    if (!j.ok) return $('dash').innerHTML = '<div class="wrap"><div class="card">'+esc(j.error)+'</div></div>';
    var s = j.settings; CACHE.settings = s;
    var h = '<div class="wrap"><div class="page-h"><div><h2>Админка</h2><p>Тарифы, автоматика выплат, безопасность и матрица прав. Видна только основателю.</p></div><div class="sp"></div><button class="btn" id="stSave">Сохранить</button></div>';
    h += '<div class="grid g2" style="margin-bottom:14px">';
    h += '<div class="card"><div class="card-h"><h3>💵 Проценты с продаж</h3></div>'+
      fi('Менеджер, % от бонусного пула','sMgr',s.rates.manager)+
      fi('Руководитель, % с прибыли команды','sHead',s.rates.head)+
      fi('Пул бонусов, % от чистой прибыли сделки','sNet',s.netRate)+
      fi('Доля руководителя от бонуса менеджера, %','sShare',s.headShareOfManager)+
      '<div class="hint">Считается автоматически по закрытым сделкам. Менеджер получает % от пула, руководитель — % с прибыли своей ветки плюс долю от бонусов менеджеров.</div></div>';
    h += '<div class="card"><div class="card-h"><h3>🤖 Автоматические выплаты</h3></div>'+
      tog('sAuto','Система сама формирует заявку','в начале месяца по закрытым сделкам', s.autoPayout)+
      fi('Число месяца','sDay',s.autoPayoutDay)+
      fi('Час (UTC)','sHour',s.autoPayoutHour)+
      '<div class="hint">Заявка создаётся сама: считает бонусы каждому, оклады, доли руководителей — и кладёт тебе на утверждение. Никто ничего не просит вручную.</div></div>';
    h += '</div>';
    h += '<div class="grid g2" style="margin-bottom:14px">';
    h += '<div class="card"><div class="card-h"><h3>🔐 Безопасность</h3></div>'+
      tog('sCode','Требовать сменный код','второй фактор при входе', s.codeRequired)+
      fi('Сессия, часов','sSess',s.sessionHours)+
      fi('Попыток до блокировки','sAtt',s.maxCodeAttempts)+
      fi('Блокировка, минут','sLock',s.lockMinutes)+
      tog('sInv','Регистрация по приглашению','если выкл — учётки только вручную', s.invitesEnabled)+
      '<div class="hint">Пароли хранятся в виде scrypt-хэша с солью. Сессия — HttpOnly cookie, не видна из JS. 20 попыток входа с одного IP за 5 минут — стоп.</div></div>';
    h += '<div class="card"><div class="card-h"><h3>👁 Контроль сотрудников</h3></div>'+
      fi('Дней без входа → сигнал «не работает»','sIdle',s.autoBlockDays)+
      '<div class="hint">Основателю приходит оповещение на «Обзоре» и в «Контроле»: кто не заходил, у кого нет сделок, кто онлайн. Плюс журнал всех действий.</div>'+
      '<div class="hr"></div><div class="card-h"><h3>🎭 Матрица прав</h3></div>'+permMatrix()+'</div>';
    h += '</div></div>';
    $('dash').innerHTML = h;
    // toggles
    $('sAuto').onclick = function(){ s.autoPayout = !s.autoPayout; $('sAuto').classList.toggle('on', s.autoPayout); };
    $('sCode').onclick = function(){ s.codeRequired = !s.codeRequired; $('sCode').classList.toggle('on', s.codeRequired); };
    $('sInv').onclick = function(){ s.invitesEnabled = !s.invitesEnabled; $('sInv').classList.toggle('on', s.invitesEnabled); };
    $('stSave').onclick = function(){
      var p = {
        rates: { founder:0, head:Number($('sHead').value)||0, manager:Number($('sMgr').value)||0 },
        netRate:Number($('sNet').value)||15, headShareOfManager:Number($('sShare').value)||0,
        autoPayout: s.autoPayout, autoPayoutDay:Number($('sDay').value)||5, autoPayoutHour:Number($('sHour').value)||10,
        codeRequired: s.codeRequired, invitesEnabled: !!s.invitesEnabled, sessionHours:Number($('sSess').value)||12,
        maxCodeAttempts:Number($('sAtt').value)||5, lockMinutes:Number($('sLock').value)||15,
        autoBlockDays:Number($('sIdle').value)||5
      };
      api('/settings','POST',p).then(function(r){ r.ok?(toast('Настройки сохранены'),render()):toast(r.error,true); });
    };
  });
  function fi(l,id,v){ return '<div class="setrow"><div class="stx"><b>'+l+'</b></div><input id="'+id+'" type="number" value="'+esc(v)+'" style="width:92px;background:#0a0c12;border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:7px 9px;text-align:right"></div>'; }
  function tog(id,l,sub,on){ return '<div class="setrow"><div class="stx"><b>'+l+'</b><span>'+sub+'</span></div><div class="switch '+(on?'on':'')+'" id="'+id+'"></div></div>'; }
}
function permMatrix(){
  var acts = [
    ['Создать учётку','user.create'],['Блокировать','user.block'],['Приглашения','invite.create'],
    ['Выдать код дня','code.issue'],['Сформировать заявку','payout.build'],['Утвердить выплату','payout.approve'],
    ['Настройки','settings.edit'],['Все сделки','deals.viewAll']
  ];
  var roles = [['founder','👑'],['head','🎖️'],['manager','🧑‍💼']];
  var h = '<div class="perm"><div class="ph">Право</div>'+roles.map(function(r){return '<div class="ph">'+r[1]+'</div>';}).join('');
  acts.forEach(function(a){
    h += '<div>'+a[0]+'</div>';
    var f = a[1]==='user.create'||a[1]==='user.block'||a[1]==='user.delete'||a[1]==='settings.edit'||a[1]==='payout.approve';
    var hd = a[1]==='code.issue'||a[1]==='invite.create'||a[1]==='payout.build'||a[1]==='deals.viewAll';
    h += '<div class="yn">'+(f?'✅':hd?'✅':'—')+'</div>';
    h += '<div class="yn">'+(hd?'✅':'—')+'</div>';
    h += '<div class="yn">—</div>';
  });
  h += '</div><div class="hint">Основатель делает всё. Руководитель — код дня, приглашения менеджеров, заявки на выплаты, видит свою ветку. Менеджер — только свои сделки и свои выплаты. Учётки и настройки — исключительно основатель.</div>';
  return h;
}

/* ================= LOG ================= */
function viewLog(){
  api('/log').then(function(j){
    var list = j.log || [];
    var h = '<div class="wrap"><div class="page-h"><div><h2>Журнал действий</h2><p>Каждый вход, каждая ошибка кода, каждое изменение — всё записано.</p></div><div class="sp"></div><button class="btn ghost sm" id="lgR">↻</button></div>';
    h += '<div class="card pad0"><div class="tw"><table><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead><tbody>';
    if (!list.length) h += '<tr><td colspan="5"><div class="empty">Пусто</div></td></tr>';
    list.forEach(function(l){
      var bad = /FAIL|LOCK|REJECT|REVOKE/.test(l.action);
      h += '<tr><td class="dim" style="white-space:nowrap">'+dt(l.at)+'</td><td><b>'+esc(l.actor)+'</b></td>'+
        '<td>'+(bad?'<span class="tag r">':'<span class="tag b">')+esc(l.action)+'</span></td>'+
        '<td class="muted">'+esc(l.target)+'</td><td class="dim">'+esc(String(l.meta).slice(0,70))+'</td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    $('dash').innerHTML = h;
    $('lgR').onclick = render;
  });
}

/* ================= PROFILE ================= */
function viewProfile(){
  api('/me').then(function(j){
    var u = j.user, m = roleMeta(u.role);
    var h = '<div class="wrap"><div class="page-h"><div><h2>Профиль</h2><p>Твоя учётка и безопасность.</p></div></div>';
    h += '<div class="grid g2"><div class="card"><div class="row" style="gap:14px;margin-bottom:14px"><div style="font-size:42px">'+m.e+'</div><div><div style="font-size:20px;font-weight:900">'+(u.role==='founder'?'👑 ':'')+esc(u.name)+'</div><div class="muted" style="font-size:12.5px">'+m.l+' · @'+esc(u.login)+'</div></div></div>'+
      '<div class="setrow"><div class="stx"><b>Telegram</b></div><span class="muted">'+esc(u.tg||'—')+'</span></div>'+
      '<div class="setrow"><div class="stx"><b>Email</b></div><span class="muted">'+esc(u.email||'—')+'</span></div>'+
      '<div class="setrow"><div class="stx"><b>Последний вход</b></div><span class="muted">'+dt(u.lastLogin)+'</span></div>'+
      '<div class="setrow"><div class="stx"><b>Неудачных попыток</b></div><span class="muted">'+u.fails+'</span></div></div>';
    h += '<div class="card"><div class="card-h"><h3>Сменить пароль</h3></div>'+
      '<div class="f"><label>Текущий пароль</label><input type="password" id="pwOld"></div>'+
      '<div class="f"><label>Новый пароль</label><input type="password" id="pwNew" placeholder="мин. 8 символов"></div>'+
      '<div class="f"><label>Повтори новый</label><input type="password" id="pwNew2"></div>'+
      '<button class="btn wide" id="pwGo">Сменить пароль</button>'+
      '<div class="hint">После смены пароля все текущие сессии остаются — но старый пароль больше не работает.</div></div>';
    h += '</div></div>';
    $('dash').innerHTML = h;
    $('pwGo').onclick = function(){
      var o = $('pwOld').value, n = $('pwNew').value, n2 = $('pwNew2').value;
      if (n !== n2) return toast('Пароли не совпадают', true);
      if (n.length < 8) return toast('Пароль короче 8 символов', true);
      api('/change-password','POST',{ old:o, new:n }).then(function(r){ r.ok?(toast('Пароль изменён'),render()):toast(r.error,true); });
    };
  });
}

function forcePassword(){
  modal('Смени пароль', '<div class="hint" style="margin-bottom:12px">Тебе выдали временный пароль. Поставь свой — иначе остальные смогут зайти под тобой.</div>'+
    '<div class="f"><label>Текущий пароль</label><input type="password" id="fpOld"></div>'+
    '<div class="f"><label>Новый пароль</label><input type="password" id="fpNew" placeholder="мин. 8 символов"></div>', [
    { t:'Позже', cls:'ghost', fn: closeModal },
    { t:'Сменить', cls:'ok', fn: function(){
        api('/change-password','POST',{ old:$('fpOld').value, new:$('fpNew').value }).then(function(r){
          r.ok?(toast('Пароль изменён'),closeModal()):toast(r.error,true);
        });
      }}
  ]);
}

/* ================= MODAL ================= */
function modal(title, body, buttons){
  var el = $('modal');
  el.innerHTML = '<div class="mbox"><div class="mhead"><h3>'+esc(title)+'</h3><button class="mclose" id="mX">×</button></div>'+
    '<div class="mbody">'+body+'</div><div class="mfoot">'+
    (buttons||[]).map(function(b,i){ return '<button class="btn '+b.cls+'" data-mb="'+i+'">'+esc(b.t)+'</button>'; }).join('')+
    '</div></div>';
  el.classList.add('on');
  $('mX').onclick = closeModal;
  el.querySelectorAll('[data-mb]').forEach(function(btn){
    btn.onclick = function(){ (buttons[Number(btn.dataset.mb)].fn||closeModal)(); };
  });
  el.onclick = function(e){ if (e.target === el) closeModal(); };
}
function closeModal(){ var el = $('modal'); el.classList.remove('on'); el.innerHTML = ''; }

/* ================= BOOT ================= */
function boot(){
  api('/bootstrap').then(function(j){
    if (!j.ok) { alert('Сервер не отвечает'); return; }
    var q = new URLSearchParams(location.search);
    AUTH.step = 1; authRender();
    // пробуем восстановить сессию
    fetch('/api/me',{credentials:'same-origin'}).then(function(r){ return r.json(); }).then(function(m){
      if (m && m.ok){ ME = m.user; PERMS = m.perms; enterApp(); }
    }).catch(function(){});
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
