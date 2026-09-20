/* T0124 予約ランチャー 共通ロジック
   kokuba_version: 2026-09-20.1
   - 個人情報（名前・診察券番号・誕生日・電話・キャンセルコード）は
     この端末の localStorage にだけ保存する。サーバーへは一切送らない。 */
'use strict';

/* ===== 医院の定義 ===================================================== */
var CLINICS = {
  shibata: {
    key: 'shibata', name: 'しばた小児科', formal: '北村記念しばた小児科医院',
    color: '#96502a', cls: 'sb',
    closedDows: [0, 4],              // 日・木 休診（＋祝日）
    hours: { am: '9:00-12:00', pm: '15:00-18:30（土は17:00まで）' },
    openDows: { am: [1, 2, 3, 5, 6], pm: [1, 2, 3, 5, 6] },
    fire: { am: '08:30:01', pm: '14:30:01' },
    fireFixed: true,                 // 医院が公表している開始時刻（午前8:30／午後14:30）
    target: 'https://park.paa.jp/park2/clinics/2368/businesses/01/bookings/new',
    appUrl: 'https://apps.apple.com/jp/app/id1054442915',
    maxPeople: 5,
    steps: [
      ['予約へ  を押す', '医院からのメッセージを下までスクロール'],
      ['予約人数を選ぶ', '今日は「{N}」を選ぶ（最大5人まで選べる）'],
      ['次へ  を押す', '「空き枠がないため…」と出たらその回は取れない'],
      ['{N}人ぶんを入力', '名前・診察券番号・生年月日・電話・キャンセルコード'],
      ['利用規約に同意', 'チェックすると確認が1枚出る → はい'],
      ['次へ  を押す', '確認画面が出る（まだ完了していない）'],
      ['予約する  を押す', 'ここが確定。押すのは自分'],
      ['受付番号を控える', '下の「控え」に入れておく']
    ],
    notes: [
      '初診はネット受付できない。初診は電話（059-386-0362）で取る。一度受診すると診察券番号がもらえて、次からネット受付できる',
      '診察券番号を入れていない子は、この画面に出てこない（ネット受付できないため）',
      '公式アプリは、このページのリンクからは開かない（別ルート）。アプリで取る日は、上のカウントダウンを見て時刻になったらアプリを開く',
      '平日午後は14:45から院内先着10名に1〜10番。行けるならそちらが速い（土曜はなし）',
      '発熱のときは受付を取ったあと電話で症状を伝える'
    ]
  },
  shindo: {
    key: 'shindo', name: 'しんどう小児科', formal: '新藤小児科クリニック',
    color: '#1b5566', cls: 'sd',
    closedDows: [0, 3],              // 日・水 休診（＋祝日）
    hours: { am: '9:00-12:00', pm: '15:00-18:30（火は17:00まで／土は15:30-）' },
    openDows: { am: [1, 2, 4, 5, 6], pm: [1, 2, 4, 5, 6] },
    fire: { am: '08:30:01', pm: '14:30:01' },
    fireFixed: false,                // ★受付開始時刻は未確定。実測して設定で直す
    target: 'https://c.inet489.jp/snd0101/yoyaku/login.cgi',
    postUrl: 'https://c.inet489.jp/snd0101/yoyaku/menu.cgi',
    deepUrl: 'https://c.inet489.jp/snd0101/yoyaku/auth_continue.cgi',
    todayUrl: 'https://c.inet489.jp/snd0101/yoyaku/todayinfo.cgi',
    maxPeople: 5,
    steps: [
      ['診察  を押す', 'ログイン済みの画面から始まる'],
      ['受診者を選ぶ', '家族登録してあれば子の名前が並ぶ'],
      ['午前／午後 を選ぶ', ''],
      ['確認  を押す', ''],
      ['予約  を押す', 'ここが確定。押すのは自分']
    ],
    notes: [
      '受付開始時刻は医院が公表していない。実測して設定で直すこと',
      'ログインは診察券番号＋誕生日（月・日）だけ',
      '家族登録（最大5人）をしておくと1回のログインで子を切り替えられる',
      'ここも診察券番号が要る。通っていない子は、まず電話で初診を取る'
    ]
  }
};

/* ===== 祝日（2026-2027・休診日判定用） ================================
   ※ 2026/9/22 は敬老の日と秋分の日に挟まれた国民の休日 */
var HOLIDAYS = [
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20',
  '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
  '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
  '2026-10-12', '2026-11-03', '2026-11-23',
  '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21',
  '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05',
  '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23', '2027-10-11',
  '2027-11-03', '2027-11-23'
];

/* ===== 設定の保存（この端末の中だけ） ================================= */
var SKEY = 't0124.settings.v2';
var DEFAULTS = {
  people: [
    { name: '', cardShibata: '', cardShindo: '', y: '', m: '', d: '' },
    { name: '', cardShibata: '', cardShindo: '', y: '', m: '', d: '' },
    { name: '', cardShibata: '', cardShindo: '', y: '', m: '', d: '' }
  ],
  tel: '', cancelCode: '', memo: '',
  fire: { shibata: { am: '08:30:01', pm: '14:30:01' }, shindo: { am: '08:30:01', pm: '14:30:01' } },
  auto: { shibata: true, shindo: true },
  shindoLanding: 'menu',
  sel: { shibata: [0, 1, 2], shindo: [0, 1, 2] },
  log: []
};

function loadCfg() {
  var c;
  try { c = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { c = null; }
  if (!c) c = JSON.parse(JSON.stringify(DEFAULTS));
  // 足りないキーを既定で埋める（版が上がっても壊れないように）
  var d = DEFAULTS;
  if (!Array.isArray(c.people) || !c.people.length) c.people = JSON.parse(JSON.stringify(d.people));
  c.people = c.people.map(function (p) {
    return { name: p.name || '', cardShibata: p.cardShibata || '', cardShindo: p.cardShindo || '',
             y: p.y || '', m: p.m || '', d: p.d || '' };
  });
  c.tel = c.tel || ''; c.cancelCode = c.cancelCode || ''; c.memo = c.memo || '';
  c.fire = c.fire || {}; c.auto = c.auto || {}; c.sel = c.sel || {};
  ['shibata', 'shindo'].forEach(function (k) {
    c.fire[k] = c.fire[k] || {};
    c.fire[k].am = c.fire[k].am || d.fire[k].am;
    c.fire[k].pm = c.fire[k].pm || d.fire[k].pm;
    if (typeof c.auto[k] !== 'boolean') c.auto[k] = true;
    if (!Array.isArray(c.sel[k])) c.sel[k] = [0, 1, 2];
  });
  c.shindoLanding = c.shindoLanding || 'menu';
  if (!Array.isArray(c.log)) c.log = [];
  return c;
}
function saveCfg(c) {
  try { localStorage.setItem(SKEY, JSON.stringify(c)); return true; }
  catch (e) { return false; }
}
/** その医院の診察券番号を返す（無ければ空文字） */
function cardOf(person, clinicKey) {
  return ((clinicKey === 'shibata' ? person.cardShibata : person.cardShindo) || '').trim();
}
/** その医院でネット受付できるか。診察券番号が無い＝初診なので不可（2院とも番号が必須） */
function canBook(person, clinicKey) {
  return !!(person.name && cardOf(person, clinicKey));
}
function activePeople(cfg, clinicKey) {
  var sel = cfg.sel[clinicKey] || [];
  return cfg.people.map(function (p, i) { return { p: p, i: i }; })
    .filter(function (x) { return sel.indexOf(x.i) >= 0 && canBook(x.p, clinicKey); })
    .map(function (x) { return x.p; });
}

/* ===== 時計合わせ ====================================================
   自分のページへHEADを1回投げ、応答のDateヘッダと端末時計の差を測る。
   Dateヘッダは秒までしか持たないので平均0.5秒ぶんを足して補正する。 */
var clockOffset = 0, clockOk = false;
function syncClock() {
  return new Promise(function (resolve) {
    var t0 = Date.now();
    fetch(location.pathname + '?_=' + t0, { method: 'HEAD', cache: 'no-store' })
      .then(function (res) {
        var h = res.headers.get('Date');
        if (!h) { resolve(false); return; }
        var rtt = Date.now() - t0;
        var server = new Date(h).getTime() + 500 + rtt / 2;
        clockOffset = server - Date.now();
        clockOk = true;
        resolve(true);
      })
      .catch(function () { resolve(false); });
  });
}
function now() { return new Date(Date.now() + clockOffset); }

/* ===== 休診日・次の発射時刻 ========================================== */
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function isHoliday(d) { return HOLIDAYS.indexOf(ymd(d)) >= 0; }
function isOpen(clinic, d, sess) {
  if (isHoliday(d)) return false;
  if (clinic.closedDows.indexOf(d.getDay()) >= 0) return false;
  return clinic.openDows[sess].indexOf(d.getDay()) >= 0;
}
function parseHms(s) {
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((s || '').trim());
  if (!m) return null;
  return { h: +m[1], mi: +m[2], s: m[3] ? +m[3] : 0 };
}
/** 指定した診療枠の「次の発射時刻」を返す。無ければ null */
function nextFire(clinic, cfg, sess, baseDate) {
  var hms = parseHms(cfg.fire[clinic.key][sess]);
  if (!hms) return null;
  var base = baseDate || now();
  for (var i = 0; i < 21; i++) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, hms.h, hms.mi, hms.s, 0);
    if (!isOpen(clinic, d, sess)) continue;
    if (d.getTime() > base.getTime()) return d;
  }
  return null;
}
var DOW = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDate(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + DOW[d.getDay()] + ')'; }
function fmtTime(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') +
         ':' + String(d.getSeconds()).padStart(2, '0');
}
function fmtRemain(ms) {
  if (ms < 0) ms = 0;
  var t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/* ===== 発射 ==========================================================
   iPhoneのSafariはタイマーからの window.open を塞ぐので、同じタブで移動する。
   しんどうは「診察券番号＋誕生日」をその場で組んだフォームでPOSTしてログインする。 */
function fireShibata(clinic) { location.href = clinic.target; }
function fireShindo(clinic, cfg, personIndex) {
  var p = cfg.people[personIndex] || cfg.people[0] || {};
  var recno = (p.cardShindo || '').trim();
  if (!recno || !p.m || !p.d) { location.href = clinic.target; return; }
  var url = cfg.shindoLanding === 'deep'
    ? clinic.deepUrl + '?action=reservation_availability&type=01'
    : clinic.postUrl;
  var f = document.createElement('form');
  f.method = 'POST'; f.action = url; f.style.display = 'none';
  [['recno', recno], ['birthmonth', String(+p.m)], ['birthday', String(+p.d)], ['login', '1']]
    .forEach(function (kv) {
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = kv[0]; i.value = kv[1]; f.appendChild(i);
    });
  document.body.appendChild(f);
  f.submit();
}

/* ===== 画面のつけっぱなし（対応端末のみ） ============================= */
var wakeLock = null;
function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(function (wl) {
    wakeLock = wl;
    wl.addEventListener('release', function () { wakeLock = null; });
  }).catch(function () {});
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') { if (!wakeLock) keepAwake(); }
});

/* ===== 小道具 ======================================================== */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function toast(msg) {
  var t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 1600);
}
function copyText(text, btn) {
  function done() {
    if (btn) { var o = btn.textContent; btn.textContent = 'コピー済'; btn.classList.add('done');
      setTimeout(function () { btn.textContent = o; btn.classList.remove('done'); }, 1400); }
    toast('コピーしました');
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, function () { fallback(); });
  } else { fallback(); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした'); }
    document.body.removeChild(ta);
  }
}

/* ===== 自動入力スクリプトの本体（段3） ================================
   しばたの受付ページで走らせる。欄は「見えているラベル」で探すので、
   画面の作りが多少変わっても効く。送信ボタンは絶対に押さない。 */
function fillerSource() {
  return `(function(){
var P=__DATA__, AGREE=__AGREE__;
function vis(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}
function kindOf(s){
 if(!s)return '';
 if(/名前|氏名|なまえ|ナマエ|name/i.test(s))return 'name';
 if(/診察券|受診券|card/i.test(s))return 'card';
 if(/電話|tel|phone/i.test(s))return 'tel';
 if(/キャンセル|cancel/i.test(s))return 'cancel';
 return '';}
function attrKind(el){
 return kindOf([el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.name,el.id].join(' '));}
function nearKind(el){
 var k=attrKind(el); if(k)return k;
 if(el.labels&&el.labels.length){k=kindOf(el.labels[0].textContent||''); if(k)return k;}
 var n=el;
 for(var hop=0;n&&hop<5;hop++,n=n.parentElement){
  var p=n.previousElementSibling,cnt=0;
  while(p&&cnt<4){
   var t=(p.innerText||p.textContent||'');
   var k2=kindOf(t.slice(-60)); if(k2)return k2;
   p=p.previousElementSibling;cnt++;}}
 return '';}
function selKind(el){
 var mx=0,c=0;
 for(var i=0;i<el.options.length;i++){
  var x=(el.options[i].textContent||'').replace(/[^0-9]/g,'');
  if(x){c++; if(+x>mx)mx=+x;}}
 if(!c)return '';
 if(mx>1900)return 'y';
 if(mx<=12)return 'm';
 if(mx<=31)return 'd';
 return '';}
function setv(el,v){
 if(v===''||v==null)return 0;
 if(el.value&&el.value!=='')return 0;
 var pr=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
 var st=Object.getOwnPropertyDescriptor(pr,'value').set;
 if(el.tagName==='SELECT'){
  var hit=null;
  for(var i=0;i<el.options.length;i++){
   var o=el.options[i];
   var tx=(o.textContent||'').replace(/[^0-9]/g,'');
   var va=(o.value||'').replace(/[^0-9]/g,'');
   if(va===String(+v)||tx===String(+v)){hit=o.value;break;}}
  if(hit===null)return 0;
  st.call(el,hit);
 }else{st.call(el,v);}
 el.dispatchEvent(new Event('input',{bubbles:true}));
 el.dispatchEvent(new Event('change',{bubbles:true}));
 return 1;}
var ctrls=[].slice.call(document.querySelectorAll('input,select')).filter(vis).filter(function(e){
 return !(e.type==='hidden'||e.type==='submit'||e.type==='button'||e.disabled||e.readOnly);});
var idx=-1,n=0,seen={};
ctrls.forEach(function(el){
 if(el.type==='checkbox'||el.type==='radio')return;
 var k=(el.tagName==='SELECT')?selKind(el):nearKind(el);
 if(!k)return;
 if(seen[k]||idx<0){idx++;seen={};}
 if(idx>=P.length)return;
 seen[k]=1;
 var p=P[idx];
 var v=(k==='name')?p.name:(k==='card')?p.card:(k==='tel')?p.tel:(k==='cancel')?p.cancel:(k==='y')?p.y:(k==='m')?p.m:(k==='d')?p.d:'';
 n+=setv(el,v);});
var box=[].slice.call(document.querySelectorAll('input[type=checkbox]')).filter(vis).filter(function(e){return !e.checked;});
var msg=n+'か所に入れました（'+Math.min(idx+1,P.length)+'人ぶん）';
if(box.length&&AGREE){box[0].click();msg+=' / 同意にもチェック';}
var d=document.createElement('div');
d.textContent=msg+'　送信はしていません';
d.setAttribute('style','position:fixed;left:8px;right:8px;bottom:14px;z-index:99999;background:#12313a;color:#fff;font:700 15px -apple-system,sans-serif;padding:13px 14px;border-radius:12px;text-align:center;box-shadow:0 3px 12px rgba(0,0,0,.4)');
document.body.appendChild(d);
setTimeout(function(){d.remove();},4000);
})();`;
}
function buildFiller(cfg, clinicKey, agree) {
  var people = activePeople(cfg, clinicKey).map(function (p) {
    return {
      name: p.name,
      card: cardOf(p, clinicKey),
      y: p.y, m: p.m, d: p.d, tel: cfg.tel, cancel: cfg.cancelCode
    };
  });
  return fillerSource()
    .replace('__DATA__', JSON.stringify(people))
    .replace('__AGREE__', agree ? 'true' : 'false');
}
