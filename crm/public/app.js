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
  $('auth').classList.remove('on');
  $('app').classList.add('on');
  api('/me').then(function(j){
    if (j.ok){ ME = j.user; PERMS = j.perms; }
    render();
    if (ME && ME.mustChange) forcePassword();
  });
}

function renderShell(){
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
  if (typeof monitorTimer !== 'undefined' && monitorTimer && VIEW !== 'monitor'){ clearInterval(monitorTimer); monitorTimer = null; }
  renderShell();
  var c = $('content');
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
    if (!j.ok) return $('content').innerHTML = '<div class="wrap"><div class="card">'+esc(j.error)+'</div></div>';
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
    $('content').innerHTML = h;
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
    h += '<div class="page-h"><div><h2>Сделки</h2><p>Кто нашёл клиента — тот и закреплён менеджером. Площадки берутся из базы.</p></div><div class="sp"></div>'+
      '<button class="btn" id="dNew">+ Новая сделка</button></div>';
    var totalNet = deals.reduce(function(s,d){ return s + (d.net||d.our||0); },0);
    h += '<div class="grid g4" style="margin-bottom:14px">'+
      kpi('Всего сделок', deals.length, '', '')+
      kpi('Закрыто', deals.filter(function(d){return d.status==='paid'||d.status==='done';}).length, '', 'acc')+
      kpi('Наш доход', rub(totalNet), 'по всем сделкам', 'gold')+
      kpi('Средний чек', deals.length ? rub(deals.reduce(function(s,d){return s+(d.clientTotal||0);},0)/deals.length) : '—', '', '')+
      '</div>';

    h += '<div class="card pad0"><div class="tw"><table><thead><tr><th>Клиент</th><th>Ниша</th><th class="num">Площадок</th><th class="num">Ставка</th><th class="num">Владельцам</th><th class="num">Клиент платит</th><th class="num">Нам</th><th>Статус</th><th></th></tr></thead><tbody>';
    if (!deals.length) h += '<tr><td colspan="9"><div class="empty"><div class="ee">🤝</div>Сделок пока нет — создай первую</div></td></tr>';
    deals.forEach(function(d){
      h += '<tr><td><b>'+esc(d.client)+'</b>'+(d.type?'<div class="login-badge">'+esc(d.type)+'</div>':'')+'</td>'+
        '<td><span class="tag n">'+esc(d.niche||'—')+'</span></td>'+
        '<td class="num">'+(d.venues||[]).length+'</td>'+
        '<td class="num">'+d.rate+'%</td>'+
        '<td class="num muted">'+rub(d.ownerBase)+'</td>'+
        '<td class="num">'+rub(d.clientTotal)+'</td>'+
        '<td class="num" style="color:var(--acc2);font-weight:800">'+rub(d.our)+'</td>'+
        '<td>'+dealTag(d.status)+'</td>'+
        '<td><select data-dst="'+d.id+'" style="background:#0a0c12;color:var(--txt);border:1px solid var(--line);border-radius:7px;padding:5px 7px;font-size:12px">'+
          ['lead','negotiation','confirmed','paid','done','lost'].map(function(s){ return '<option value="'+s+'"'+(d.status===s?' selected':'')+'>'+({lead:'лид',negotiation:'переговоры',confirmed:'подтверждена',paid:'оплачена',done:'закрыта',lost:'отказ'})[s]+'</option>'; }).join('')+
        '</select></td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    $('content').innerHTML = h;
    $('dNew').onclick = function(){ dealModal(venues); };
    $('content').querySelectorAll('[data-dst]').forEach(function(sel){
      sel.onchange = function(){
        api('/deals/'+sel.dataset.dst+'/status','POST',{ status: sel.value }).then(function(j){
          if (j.ok){ toast('Статус обновлён: '+sel.value); render(); } else toast(j.error,true);
        });
      };
    });
  });
}

function dealModal(venues){
  var st = { client:'', niche:'RUST', type:'Игра', rate:15, pick:{}, srv:0, over:0, status:'lead' };
  var niches = ['RUST','Гейминг','Крипта / Web3','IT / разработка','Аниме','Мемы','Учёба','Бизнес','Другое'];
  var types = ['Telegram Mini App','Игра','Сервис','Магазин','Инфопродукт','Канал','Другое'];
  function body(){
    var h = '';
    h += '<div class="f"><label>Клиент</label><input id="mClient" value="'+esc(st.client)+'" placeholder="Название или ник"></div>';
    h += '<div class="f"><label>Ниша</label><div class="chip-pick">'+niches.map(function(n){ return '<button data-n="'+esc(n)+'" class="'+(st.niche===n?'on':'')+'">'+n+'</button>'; }).join('')+'</div></div>';
    h += '<div class="f"><label>Что рекламируем</label><div class="chip-pick">'+types.map(function(n){ return '<button data-t="'+esc(n)+'" class="'+(st.type===n?'on':'')+'">'+n+'</button>'; }).join('')+'</div></div>';
    h += '<div class="f"><label>Площадки из базы</label>';
    var list = venues.filter(function(v){ return !st.niche || v.niche === st.niche || true; });
    if (!list.length) h += '<div class="hint">В базе нет площадок — добавь на странице «Площадки».</div>';
    h += '<div style="max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:10px">';
    list.forEach(function(v){
      var on = !!st.pick[v.id];
      h += '<label style="display:flex;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid rgba(35,40,56,.5);font-size:12.5px;cursor:pointer">'+
        '<input type="checkbox" data-pick="'+v.id+'" '+(on?'checked':'')+' style="accent-color:#6d5efc">'+
        '<span style="flex:1"><b>'+esc(v.name)+'</b> <span class="dim">· '+esc(v.niche)+' · '+rub0(v.subs)+' подп.</span></span>'+
        '<span class="muted">'+rub(v.price)+'</span></label>';
    });
    h += '</div></div>';
    var ownerBase = 0;
    Object.keys(st.pick).forEach(function(k){ if(st.pick[k]){ var v = venues.filter(function(x){return x.id===k;})[0]; if(v) ownerBase += Number(v.price)||0; } });
    h += '<div class="grid g2"><div class="f"><label>Ставка</label><div class="chip-pick"><button data-rate="15" class="'+(st.rate===15?'on':'')+'">эксклюзив 15%</button><button data-rate="35" class="'+(st.rate===35?'on':'')+'">стандарт 35%</button></div></div>'+
      '<div class="f"><label>Статус</label><select id="mStatus">'+['lead','negotiation','confirmed','paid','done','lost'].map(function(s){ return '<option value="'+s+'"'+(st.status===s?' selected':'')+'>'+s+'</option>'; }).join('')+'</select></div></div>';
    h += '<div class="grid g2"><div class="f"><label>Услуги, ₽</label><input type="number" id="mSrv" value="'+(st.srv||'')+'" placeholder="креатив, текст…"></div>'+
      '<div class="f"><label>Прочие расходы, ₽</label><input type="number" id="mOver" value="'+(st.over||'')+'" placeholder="0"></div></div>';
    var clientTotal = ownerBase / (1 - st.rate/100);
    var net = clientTotal - ownerBase + (Number(st.srv)||0) - (Number(st.over)||0);
    h += '<div class="card" style="background:var(--card2);margin-top:6px"><div class="row" style="justify-content:space-between;font-size:13px"><span class="muted">Владельцам</span><b>'+rub(ownerBase)+'</b></div>'+
      '<div class="row" style="justify-content:space-between;font-size:13px;margin-top:5px"><span class="muted">Клиент платит</span><b>'+rub(clientTotal + (Number(st.srv)||0))+'</b></div>'+
      '<div class="row" style="justify-content:space-between;font-size:13px;margin-top:5px"><span class="muted">Нам чистыми</span><b style="color:var(--acc2)">'+rub(net)+'</b></div></div>';
    return h;
  }
  modal('Новая сделка', body(), [
    { t:'Отмена', cls:'ghost', fn: closeModal },
    { t:'Создать', cls:'ok', fn: function(mb){
        var c = document.getElementById('mClient').value.trim();
        if (!c) return toast('Введи клиента', true);
        var picked = venues.filter(function(v){ return st.pick[v.id]; }).map(function(v){ return { venueId:v.id, name:v.name, price:Number(v.price)||0, ownerPays:Number(v.price)||0 }; });
        var ownerBase = picked.reduce(function(s,v){ return s + v.price; },0);
        api('/deals','POST',{ client:c, niche:st.niche, type:st.type, rate:st.rate, ownerBase:ownerBase,
          venues:picked, services:[], overhead:Number(st.over)||0, status:st.status }).then(function(j){
          if (!j.ok) return toast(j.error,true);
          closeModal(); toast('Сделка создана'); render();
        });
      }}
  ]);
  bind();
  function bind(){
    var mb = document.querySelector('.mbox');
    mb.querySelectorAll('[data-n]').forEach(function(b){ b.onclick = function(){ st.niche=b.dataset.n; refresh(); }; });
    mb.querySelectorAll('[data-t]').forEach(function(b){ b.onclick = function(){ st.type=b.dataset.t; refresh(); }; });
    mb.querySelectorAll('[data-rate]').forEach(function(b){ b.onclick = function(){ st.rate=Number(b.dataset.rate); refresh(); }; });
    mb.querySelectorAll('[data-pick]').forEach(function(cb){ cb.onchange = function(){ st.pick[cb.dataset.pick]=cb.checked; refresh(); }; });
    var s = document.getElementById('mSrv'), o = document.getElementById('mOver');
    if (s) s.oninput = function(){ st.srv = s.value; };
    if (o) o.oninput = function(){ st.over = o.value; };
  }
  function refresh(){
    var c = document.getElementById('mClient');
    if (c) st.client = c.value;
    var mb = document.querySelector('.mbox .mbody');
    mb.innerHTML = body(); bind();
  }
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
    $('content').innerHTML = h;
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
    $('content').innerHTML = h;
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
    $('content').innerHTML = h;

    var n = $('uNew'); if (n) n.onclick = userModal;
    $('content').querySelectorAll('[data-block]').forEach(function(b){
      b.onclick = function(){ api('/users/'+b.dataset.block+'/block','POST',{ blocked: b.dataset.cur==='0' }).then(function(j){ if(j.ok){ toast('Готово'); render(); } else toast(j.error,true); }); };
    });
    $('content').querySelectorAll('[data-reset]').forEach(function(b){
      b.onclick = function(){
        var p = prompt('Новый пароль (мин. 8 символов):', 'sgax'+Math.floor(Math.random()*9000+1000));
        if (!p) return;
        api('/users/'+b.dataset.reset+'/reset','POST',{ password:p }).then(function(j){ j.ok?toast('Пароль сброшен: '+p):toast(j.error,true); });
      };
    });
    $('content').querySelectorAll('[data-edit]').forEach(function(b){
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
    $('content').innerHTML = h;

    var b = $('pBuild'); if (b) b.onclick = function(){
      api('/payouts/build','POST',{}).then(function(r){ if(r.ok){ toast('Заявка сформирована: '+rub(r.payout.total)); render(); } else toast(r.error,true); });
    };
    $('content').querySelectorAll('[data-approve]').forEach(function(x){
      x.onclick = function(){ api('/payouts/approve','POST',{ id:x.dataset.approve }).then(function(r){ r.ok?(toast('Заявка утверждена'),render()):toast(r.error,true); }); };
    });
    $('content').querySelectorAll('[data-reject]').forEach(function(x){
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
      if (!j.ok) return $('content').innerHTML = '<div class="wrap"><div class="card">'+esc(j.error)+'</div></div>';
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
      $('content').innerHTML = h;
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
    $('content').innerHTML = h;
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
    $('content').querySelectorAll('[data-rev]').forEach(function(b){
      b.onclick = function(){ api('/invites/revoke','POST',{ id:b.dataset.rev }).then(function(j){ j.ok?(toast('Отозван'),render()):toast(j.error,true); }); };
    });
  });
}

/* ================= SETTINGS / ADMIN ================= */
function viewSettings(){
  api('/settings').then(function(j){
    if (!j.ok) return $('content').innerHTML = '<div class="wrap"><div class="card">'+esc(j.error)+'</div></div>';
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
    $('content').innerHTML = h;
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
    $('content').innerHTML = h;
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
    $('content').innerHTML = h;
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
document.addEventListener('DOMContentLoaded', boot);
})();
