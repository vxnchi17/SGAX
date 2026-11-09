const { JSDOM } = require('jsdom');
const BASE = process.env.SGAX_URL || 'http://localhost:8080';
let failures = [];

function log(x){ process.stdout.write(x + '\n'); }

async function run(){
  const dom = new JSDOM(await (await fetch(BASE + '/')).text(), {
    url: BASE + '/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  global.window = window; global.document = window.document;
  let JAR = '';
  window.fetch = async (u, o) => {
    o = Object.assign({}, o || {});
    const h = Object.assign({}, o.headers || {});
    if (JAR) h['Cookie'] = JAR;
    o.headers = h;
    const r = await fetch(u.startsWith('http') ? u : BASE + u, o);
    const sc = r.headers.get('set-cookie');
    if (sc) JAR = sc.split(';')[0];
    return r;
  };
  window.localStorage.setItem('x','1');
  const appjs = await (await fetch(BASE + '/app.js')).text();
  const errors = [];
  window.addEventListener('error', e => errors.push('window error: ' + e.message));

  // выполняем app.js
  try { window.eval(appjs); } catch(e){ failures.push('app.js упал: ' + e.message); return report(); }

  await sleep(600);
  log('1. экран входа отрисован: ' + (window.document.querySelector('#aLogin') ? 'ДА' : 'НЕТ'));
  if(!window.document.querySelector('#aLogin')) failures.push('экран входа не отрисован');

  // --- вход ---
  window.document.getElementById('aLogin').value = 'faraday';
  window.document.getElementById('aPass').value = 'sgax2026';
  window.document.getElementById('aNext').click();
  await sleep(300);
  const codeInputs = window.document.querySelectorAll('#codeIn input');
  log('2. шаг 2 (код) отрисован: ' + (codeInputs.length === 6 ? 'ДА, 6 полей' : 'НЕТ (' + codeInputs.length + ')'));
  if (codeInputs.length !== 6) failures.push('шаг с кодом не отрисован');

  // берём сегодняшний код у сервера и вводим
  const tok = await (await window.fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'faraday',password:'sgax2026'})})).json();
  const code = (await (await window.fetch('/api/code/today',{headers:{Cookie:'sgax_sid='+tok.token}})).json()).code;
  log('   код дня с сервера: ' + code);
  const ins = window.document.querySelectorAll('#codeIn input');
  code.split('').forEach((d,i)=>{ ins[i].value = d; });
  window.document.getElementById('aGo').click();
  await sleep(900);
  const inApp = window.document.getElementById('app').classList.contains('on');
  log('3. вошли в приложение: ' + (inApp ? 'ДА' : 'НЕТ — ' + (window.document.querySelector('.auth-err') ? window.document.querySelector('.auth-err').textContent : '')));
  if (!inApp) failures.push('вход не выполнен');
  if (!inApp) return report();

  log('4. меню слева отрисовано: ' + (window.document.querySelectorAll('.nitem').length + ' пунктов'));
  if (window.document.querySelectorAll('.nitem').length < 6) failures.push('меню не отрисовано');

  const content = window.document.getElementById('dash');
  log('5. дашборд: ' + (content.textContent.includes('Выручка') ? 'цифры есть' : 'ПУСТО'));
  if (!content.textContent.includes('Выручка')) failures.push('дашборд не загрузился');

  // --- переход в сделки ---
  const dealsBtn = [...window.document.querySelectorAll('.nitem')].find(b => b.dataset.v === 'deals');
  dealsBtn.click();
  await sleep(700);
  log('6. страница «Сделки»: ' + (content.textContent.includes('Собрать пакет') ? 'ОК' : 'НЕ ЗАГРУЗИЛАСЬ'));

  // --- открываем мастер ---
  const newBtn = window.document.getElementById('dNew');
  if (!newBtn){ failures.push('кнопки «Собрать пакет» нет'); return report(); }
  newBtn.click();
  await sleep(500);
  const wiz = window.document.getElementById('wizard');
  log('7. мастер открылся: ' + (wiz.classList.contains('on') ? 'ДА' : 'НЕТ'));
  if (!wiz.classList.contains('on')) { failures.push('мастер не открылся'); return report(); }
  log('   шагов в меню мастера: ' + wiz.querySelectorAll('[data-ws]').length);
  log('   заголовок: ' + (wiz.querySelector('.wh-t') ? wiz.querySelector('.wh-t').textContent : '—'));

  // заполняем шаг 1
  wiz.querySelector('#wClient').value = 'RustLand';
  wiz.querySelector('#wClient').dispatchEvent(new window.Event('input'));
  const nicheBtn = [...wiz.querySelectorAll('[data-niche]')].find(b => b.dataset.niche === 'RUST');
  nicheBtn.click();
  await sleep(200);
  log('8. шаг 1 заполнен, ниша RUST выбрана: ' + (wiz.querySelector('[data-niche="RUST"]').classList.contains('on') ? 'ДА' : 'НЕТ'));

  // на шаг 2
  wiz.querySelector('#wNext').click();
  await sleep(300);
  log('9. перешли на шаг: ' + (wiz.querySelector('.wiz-hint') ? wiz.querySelector('.wiz-hint').textContent : '?'));

  // добавляем площадку вручную
  const manual = wiz.querySelector('#wAddManual');
  log('   кнопка «+ Вручную»: ' + (manual ? 'есть' : 'НЕТ'));
  manual.click();
  await sleep(400);
  log('10. карточка площадки открылась: ' + (wiz.querySelector('#vName') ? 'ДА' : 'НЕТ') + ', блоков: ' + wiz.querySelectorAll('.wblock').length);
  if (!wiz.querySelector('#vName')) failures.push('карточка площадки не открылась');

  // заполняем площадку
  const setVal = (sel, val, ev) => { const el = wiz.querySelector(sel); if(!el){ failures.push('нет поля ' + sel); return; } el.value = val; el.dispatchEvent(new window.Event(ev||'input')); };
  setVal('#vName', 'RUST • Сервер #1');
  setVal('#vSubs', '3000');
  setVal('#vPrice', '1500');
  await sleep(300);
  setVal('#vReach30', null, 'click');
  wiz.querySelector('#vReach30') && wiz.querySelector('#vReach30').click();
  await sleep(300);
  log('11. охват посчитался 30%: ' + (wiz.querySelector('#vReach') ? wiz.querySelector('#vReach').value : '?'));

  // допродажа
  const optCb = wiz.querySelector('[data-opt="every"]');
  optCb.checked = true; optCb.dispatchEvent(new window.Event('change'));
  await sleep(300);
  log('12. допродажа @everyone включена, чек площадки: ' + (wiz.querySelector('.wcard .wsum b') ? 'есть' : '—'));

  // назад к списку
  wiz.querySelector('#wBackList2').click();
  await sleep(300);
  log('13. вернулись к списку, площадок в списке: ' + wiz.querySelectorAll('[data-vopen]').length);

  // шаг 3 — ставим 35%
  wiz.querySelector('#wNext').click(); await sleep(300);
  log('14. шаг: ' + wiz.querySelector('.wiz-hint').textContent);
  const r35 = [...wiz.querySelectorAll('[data-rate]')].find(b => b.dataset.rate === '35');
  r35.click(); await sleep(300);

  // шаг 4 — услуга
  wiz.querySelector('#wNext').click(); await sleep(300);
  wiz.querySelector('#wSvcAdd').click(); await sleep(300);
  log('15. услуга добавлена: ' + (wiz.querySelector('[data-svcname]') ? 'ДА' : 'НЕТ'));

  // шаг 5
  wiz.querySelector('#wNext').click(); await sleep(300);
  // шаг 6
  wiz.querySelector('#wNext').click(); await sleep(500);
  log('16. шаг 6, итог: ' + (wiz.querySelector('.whv') ? wiz.querySelector('.whv').textContent.trim() : 'НЕТ'));
  log('   проверок показано: ' + wiz.querySelectorAll('.wcard .row').length);

  // сохраняем
  const saveBtn = wiz.querySelector('#wSave');
  log('17. кнопка сохранения: ' + (saveBtn ? saveBtn.textContent.trim() : 'НЕТ'));
  saveBtn.click();
  await sleep(1200);
  const backToDash = window.document.getElementById('dash').classList.contains('on');
  log('18. после сохранения вернулись в список: ' + (backToDash ? 'ДА' : 'НЕТ'));
  const toastTxt = [...window.document.querySelectorAll('#toast div')].map(d=>d.textContent).join(' | ');
  log('   уведомление: ' + (toastTxt || 'нет'));
  if (!toastTxt.includes('Сделка создана')) failures.push('сохранение сделки не подтвердилось');

  await sleep(600);
  log('19. сделка в списке: ' + (window.document.getElementById('dash').textContent.includes('RustLand') ? 'ДА' : 'НЕТ'));
  if (!window.document.getElementById('dash').textContent.includes('RustLand')) failures.push('сделка не появилась в списке');

  if (errors.length) failures.push('ошибки JS: ' + errors.join('; '));
  report();
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function report(){
  log('\n──────── ИТОГ ────────');
  if (failures.length){ log('❌ ПРОБЛЕМЫ (' + failures.length + '):'); failures.forEach(f=>log('  • ' + f)); }
  else log('✅ всё прошло без ошибок');
  process.exit(failures.length ? 1 : 0);
}
run().catch(e => { console.log('ТЕСТ УПАЛ:', e.message); process.exit(1); });
