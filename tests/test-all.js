const { JSDOM } = require('jsdom');
const BASE = process.env.SGAX_URL || 'http://localhost:8080';
let fails = [];
const log = x => console.log(x);

async function boot(login, pass){
  const dom = new JSDOM(await (await fetch(BASE + '/')).text(), { url: BASE+'/', runScripts:'outside-only', pretendToBeVisual:true });
  const { window } = dom;
  let JAR = '';
  window.fetch = async (u,o) => {
    o = Object.assign({}, o||{}); const h = Object.assign({}, o.headers||{});
    if (JAR) h['Cookie'] = JAR; o.headers = h;
    const r = await fetch(u.startsWith('http')?u:BASE+u, o);
    const sc = r.headers.get('set-cookie'); if (sc) JAR = sc.split(';')[0];
    return r;
  };
  window.localStorage.setItem('x','1');
  window.eval(await (await fetch(BASE+'/app.js')).text());
  await sleep(500);
  // получаем код
  const t = await (await window.fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'faraday',password:'sgax2026'})})).json();
  const code = (await (await window.fetch('/api/code/today',{headers:{Cookie:'sgax_sid='+t.token}})).json()).code;
  window.document.getElementById('aLogin').value = login;
  window.document.getElementById('aPass').value = pass;
  window.document.getElementById('aNext').click();
  await sleep(200);
  const ins = window.document.querySelectorAll('#codeIn input');
  code.split('').forEach((d,i)=>{ ins[i].value = d; });
  window.document.getElementById('aGo').click();
  await sleep(1000);
  return { window, doc: window.document };
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function run(){
  const { window, doc } = await boot('faraday','sgax2026');
  if (!doc.getElementById('app').classList.contains('on')) { fails.push('вход'); return rep(); }
  const dash = doc.getElementById('dash');
  const nav = v => [...doc.querySelectorAll('.nitem')].find(b => b.dataset.v === v);

  // Площадки
  nav('venues').click(); await sleep(700);
  log('Площадки: ' + (dash.textContent.includes('База партнёрских') ? 'ОК ('+doc.querySelectorAll('[data-niche]').length+' ниш-блоков)' : 'ПУСТО'));
  if (!dash.textContent.includes("База партнёрских")) fails.push("площадки");
  const vNew = doc.getElementById('vNew');
  log('  кнопка «+ Площадка»: ' + (vNew?'есть':'НЕТ'));
  vNew.click(); await sleep(300);
  log('  модалка открылась: ' + (doc.querySelector('#vnName')?'ДА':'НЕТ'));
  doc.querySelector('#vnName').value = 'Тест • Канал';
  doc.querySelector('#vnPrice').value = '2000';
  [...doc.querySelectorAll('[data-mb]')].find(b=>b.textContent==='Добавить').click();
  await sleep(900);
  log('  площадка создана: ' + (dash.textContent.includes('Тест • Канал')?'ДА':'НЕТ'));
  if (!dash.textContent.includes('Тест • Канал')) fails.push('создание площадки');

  // Код дня
  nav('code').click(); await sleep(700);
  const codeOk = dash.textContent.includes('Сменный код дня');
  log('Код дня: ' + (codeOk?'ОК':'ПУСТО') + ', код на экране: ' + (dash.querySelector('.big-code')?dash.querySelector('.big-code').textContent:'—'));
  if (!codeOk) fails.push('код дня');

  // Выплаты
  nav('payouts').click(); await sleep(800);
  log('Выплаты: ' + (dash.textContent.includes('Расчёт на текущий месяц')?'ОК':'ПУСТО'));
  if (!dash.textContent.includes('Расчёт на текущий месяц')) fails.push('выплаты');
  const pb = doc.getElementById('pBuild');
  if (pb){ pb.click(); await sleep(1000); log('  заявка сформирована: ' + (dash.textContent.includes('Заявка за')?'ДА':'НЕТ'));
    if (!dash.textContent.includes('Заявка за')) fails.push('заявка на выплаты'); }

  // Контроль
  nav('monitor').click(); await sleep(800);
  log('Контроль: ' + (dash.textContent.includes('Онлайн сейчас')?'ОК':'ПУСТО'));
  if (!dash.textContent.includes('Онлайн сейчас')) fails.push('контроль');

  // Команда
  nav('team').click(); await sleep(800);
  log('Команда: ' + (dash.textContent.includes('Создать учётку')?'ОК, кнопка создания есть':'нет кнопки'));
  const un = doc.getElementById('uNew');
  if (un){ un.click(); await sleep(300);
    doc.querySelector('#nuName').value='Тест Сотрудник';
    doc.querySelector('#nuLogin').value='test_emp'+Math.floor(Math.random()*999);
    [...doc.querySelectorAll('[data-mb]')].find(b=>b.textContent==='Создать').click();
    await sleep(900);
    log('  учётка создана: ' + (dash.textContent.includes('Тест Сотрудник')?'ДА':'НЕТ'));
    if (!dash.textContent.includes('Тест Сотрудник')) fails.push('создание учётки');
  }

  // Админка
  nav('settings').click(); await sleep(800);
  log('Админка: ' + (dash.textContent.includes('Матрица прав')?'ОК':'ПУСТО'));
  if (!dash.textContent.includes('Матрица прав')) fails.push('админка');
  const ss = doc.getElementById('stSave');
  if (ss){ ss.click(); await sleep(800); log('  сохранение настроек: ' + (doc.querySelector('#toast div')?'ДА':'НЕТ')); }

  // Журнал
  nav('log').click(); await sleep(700);
  log('Журнал: ' + (dash.textContent.includes('Журнал действий')?'ОК, записей: '+doc.querySelectorAll('tbody tr').length:'ПУСТО'));
  if (!dash.textContent.includes('Журнал действий')) fails.push('журнал');

  // Профиль
  nav('profile').click(); await sleep(700);
  log('Профиль: ' + (dash.textContent.includes('Сменить пароль')?'ОК':'ПУСТО'));
  if (!dash.textContent.includes('Сменить пароль')) fails.push('профиль');

  // Приглашения (только основатель)
  const inv = nav('invites');
  log('Приглашения в меню: ' + (inv?'есть':'скрыто (выключено в админке)'));

  // выход
  doc.getElementById('btnLogout').click(); await sleep(600);
  log('Выход: ' + (doc.getElementById('auth').classList.contains('on')?'ОК':'НЕТ'));
  if (!doc.getElementById('auth').classList.contains('on')) fails.push('выход');

  // ---- вход менеджером: проверяем что меню урезано ----
  const m = await boot('maks','maks2026');
  const d2 = m.doc;
  if (d2.getElementById('app').classList.contains('on')){
    const items = [...d2.querySelectorAll('.nitem')].map(b=>b.dataset.v);
    log('Меню менеджера: ' + items.join(', '));
    if (items.includes('settings')) fails.push('менеджер видит админку!');
    if (items.includes('invites')) fails.push('менеджер видит приглашения!');
    if (items.includes('team')) fails.push('менеджер видит команду!');
    log('  админка скрыта: ' + (!items.includes('settings')?'ДА':'НЕТ'));
    const d2dash = d2.getElementById('dash');
    log('  дашборд менеджера: ' + (d2dash.textContent.includes('Выручка')?'ОК':'ПУСТО'));
  }
  rep();
}
function rep(){
  console.log('\n──────── ИТОГ ────────');
  if (fails.length){ console.log('❌ проблемы: ' + fails.join(', ')); process.exit(1); }
  console.log('✅ все экраны работают'); process.exit(0);
}
run().catch(e=>{ console.log('УПАЛ:', e.stack.split('\n').slice(0,4).join('\n')); process.exit(1); });
