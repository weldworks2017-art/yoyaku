/* T0124 予約ランチャー 発射台ページの組み立て
   kokuba_version: 2026-09-20.3 */
'use strict';
(function () {
  var clinic = CLINICS[document.body.dataset.clinic];
  var cfg = loadCfg();
  var sess = (function () {
    var h = new Date().getHours();
    return h < 12 ? 'am' : 'pm';
  })();
  document.documentElement.style.setProperty('--c', clinic.color);
  var fired = false, stopped = false, target = null;
  /* ?dry=1 … 実際には開かずに練習だけする / ?test=20 … 20秒後を発射時刻にする */
  var q = new URLSearchParams(location.search);
  var DRY = q.get('dry') === '1';
  var TEST = parseInt(q.get('test') || '', 10);

  /* ---- 画面を組む ---- */
  var root = document.getElementById('app');
  root.innerHTML =
    '<div class="hd ' + clinic.cls + '"><a href="settings.html">設定</a>' +
      '<div class="ttl">' + clinic.name + '</div>' +
      '<div class="sub">' + clinic.formal + '</div></div>' +
    '<div class="seg">' +
      '<div class="s" data-s="am">午前<span class="t">' + clinic.hours.am + '</span></div>' +
      '<div class="s" data-s="pm">午後<span class="t">' + clinic.hours.pm + '</span></div>' +
    '</div>' +
    '<div class="cd">' +
      '<div class="lbl" id="cdlbl">受付開始まで</div>' +
      '<div class="big" id="cdbig">--:--</div>' +
      '<div class="at" id="cdat"></div>' +
      '<div id="pills"></div>' +
      '<div class="note" id="cdnote"></div>' +
    '</div>' +
    '<button class="go" id="gonow">いま受付ページを開く</button>' +
    '<div class="card"><h3>受診する子<span class="tag">タップで選ぶ</span></h3>' +
      '<div class="kids" id="kids"></div></div>' +
    '<div class="card"><h3>押す順番<span class="tag">カンペ</span></h3>' +
      '<ol class="steps" id="steps"></ol></div>' +
    '<div class="card"><h3>入れる値<span class="tag">タップでコピー</span></h3>' +
      '<div class="vals" id="vals"></div></div>' +
    '<div class="card"><h3>取れた番号の控え</h3>' +
      '<div class="row2"><input type="text" id="gotno" placeholder="受付番号" inputmode="numeric">' +
      '<button class="cp" id="gotsave" style="flex:none;border:1.5px solid #d8d2c7;background:#faf8f4;' +
      'border-radius:9px;padding:0 14px;font-weight:700;font-family:inherit">控える</button></div>' +
      '<div class="mini" id="gotlog"></div></div>' +
    '<div class="card"><h3>この医院のきまり</h3>' +
      '<p>' + clinic.notes.join('</p><p>') + '</p></div>' +
    '<div class="foot">診察券番号などはこの端末の中だけに保存しています。<br>' +
      '確定（予約するボタン）は必ず自分で押してください。</div>';

  /* 午前午後 */
  function paintSeg() {
    $$('.seg .s').forEach(function (el) { el.classList.toggle('on', el.dataset.s === sess); });
  }
  $$('.seg .s').forEach(function (el) {
    el.addEventListener('click', function () { sess = el.dataset.s; paintSeg(); recalc(); });
  });

  /* 受診者 */
  function paintKids() {
    var sel = cfg.sel[clinic.key];
    var rows = cfg.people.map(function (p, i) {
      if (!p.name) return '';
      /* 診察券番号が無い＝この医院には通っていない（初診）→ ネット受付できないので選べない */
      if (!canBook(p, clinic.key)) {
        return '<div class="kid no">' + p.name +
          '<span class="n">初診（診察券なし）・電話で取る</span></div>';
      }
      return '<div class="kid' + (sel.indexOf(i) >= 0 ? ' on' : '') + '" data-i="' + i + '">' +
        p.name + '<span class="n">' + (sel.indexOf(i) >= 0 ? '選ばれています' : 'はずれています') + '</span></div>';
    }).join('');
    /* しんどうは「誰の診察券でログインするか」で、画面に出てくる子が決まる */
    var tail = '';
    if (clinic.key === 'shindo' && activePeople(cfg, 'shindo').length) {
      var li = shindoLoginIndex(cfg), who = (cfg.people[li] || {}).name || '';
      tail = '<div class="mini" style="margin-top:10px">ログインに使うのは <b>' + who +
        '</b> の診察券です。ほかの子をこの画面で選ぶには、' + who +
        ' を代表者にした<b>家族登録</b>が要ります（設定から変えられます）。</div>';
    }
    $('#kids').innerHTML = (rows || '<div class="mini">設定で子の名前を入れると、ここに並びます。</div>') + tail;
    $$('#kids .kid[data-i]').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = +el.dataset.i, s = cfg.sel[clinic.key], at = s.indexOf(i);
        if (at >= 0) s.splice(at, 1); else { s.push(i); s.sort(); }
        saveCfg(cfg); paintKids(); paintVals(); paintSteps();
      });
    });
  }

  /* 手順カンペ（{N} は、いま選ばれている人数に置き換える） */
  function paintSteps() {
    var n = activePeople(cfg, clinic.key).length || 1;
    $('#steps').innerHTML = clinic.steps.map(function (s) {
      function fill(t) { return String(t).replace(/\{N\}/g, n); }
      return '<li>' + fill(s[0]) + (s[1] ? '<small>' + fill(s[1]) + '</small>' : '') + '</li>';
    }).join('');
  }

  /* 入れる値 */
  function row(k, v, small) {
    if (!v) return '';
    return '<div class="vrow"><div class="k">' + k + '</div>' +
      '<div class="v' + (small ? ' small' : '') + '">' + v + '</div>' +
      '<button class="cp" data-v="' + String(v).replace(/"/g, '&quot;') + '">コピー</button></div>';
  }
  function paintVals() {
    var ps = activePeople(cfg, clinic.key);
    if (!ps.length) {
      $('#vals').innerHTML = '<div class="mini">この医院の診察券番号を入れた子がいません。' +
        '設定で名前・診察券番号・生年月日を入れてください。<br>' +
        '通ったことがない子（初診）はネット受付できないので、電話で取ってください。</div>';
      return;
    }
    $('#vals').innerHTML = ps.map(function (p) {
      var card = cardOf(p, clinic.key);
      var bd = (p.y && p.m && p.d) ? (p.y + '年' + (+p.m) + '月' + (+p.d) + '日') : '';
      return '<div class="pname">' + p.name + '</div>' +
        row('名前', p.name, true) + row('診察券', card) +
        (bd ? '<div class="vrow"><div class="k">生年月日</div><div class="v small">' + bd + '</div></div>' : '') +
        row('電話', cfg.tel) + row('キャンセル', cfg.cancelCode);
    }).join('');
    $$('#vals .cp').forEach(function (b) {
      b.addEventListener('click', function () { copyText(b.dataset.v, b); });
    });
  }

  /* 控え */
  function paintLog() {
    var l = (cfg.log || []).filter(function (x) { return x.c === clinic.key; }).slice(-5).reverse();
    $('#gotlog').innerHTML = l.length
      ? l.map(function (x) { return x.at + '　' + x.no + '番'; }).join('<br>')
      : '取れた番号をここに残しておくと、あとで確認できます。';
  }
  $('#gotsave').addEventListener('click', function () {
    var v = $('#gotno').value.trim();
    if (!v) { toast('番号を入れてください'); return; }
    var d = now();
    cfg.log.push({ c: clinic.key, no: v, at: fmtDate(d) + ' ' + fmtTime(d).slice(0, 5) });
    cfg.log = cfg.log.slice(-40);
    saveCfg(cfg); $('#gotno').value = ''; paintLog(); toast('控えました');
  });

  /* ---- カウントダウン ---- */
  function recalc() {
    target = (TEST > 0) ? new Date(now().getTime() + TEST * 1000) : nextFire(clinic, cfg, sess);
    var auto = cfg.auto[clinic.key];
    var pills = [];
    if (DRY) pills.push('<span class="pill wait">練習（実際には開きません）</span>');
    pills.push(clockOk ? '<span class="pill on">時計合わせ済み</span>'
                       : '<span class="pill wait">時計合わせ中</span>');
    pills.push(auto ? '<span class="pill on">時刻になったら自動で開く</span>'
                    : '<span class="pill off">自動で開かない設定</span>');
    if (!clinic.fireFixed) pills.push('<span class="pill wait">開始時刻は未確定</span>');
    $('#pills').innerHTML = pills.join(' ');
    $('#cdnote').innerHTML = target
      ? '画面を消すとiPhoneはタイマーを止めます。1〜2分前に開いて、そのままにしてください。'
      : '次の診療日が見つかりませんでした。設定の発射時刻を確かめてください。';
    $('#cdat').innerHTML = target
      ? fmtDate(target) + ' の <em>' + fmtTime(target) + '</em> に開きます'
      : '';
    fired = false; stopped = false;
    tick();
  }
  function tick() {
    if (stopped) return;
    if (!target) { $('#cdbig').textContent = '--:--'; return; }
    var left = target.getTime() - now().getTime();
    var big = $('#cdbig');
    big.textContent = fmtRemain(left);
    big.classList.toggle('soon', left < 60000);
    $('#cdlbl').textContent = left > 0 ? '受付開始まで' : '受付開始しました';
    if (left <= 0 && !fired) {
      fired = true;
      if (cfg.auto[clinic.key]) { go(); }
      else { setTimeout(recalc, 1500); }
      if (stopped) return;
    }
    var iv = left < 3000 ? 40 : (left < 120000 ? 200 : 500);
    clearTimeout(tick._t); tick._t = setTimeout(tick, iv);
  }

  /* ---- 発射 ---- */
  function go() {
    if (DRY) {
      stopped = true;
      clearTimeout(tick._t);
      toast('ここで受付ページが開きます（練習なので開きません）');
      $('#cdlbl').textContent = '練習の発射をしました';
      $('#cdbig').textContent = '00:00';
      $('#cdnote').textContent = '本番はこの瞬間に受付ページへ移ります。';
      return;
    }
    if (clinic.key === 'shindo') {
      /* 家族登録の「代表者」でログインしないと他の子が画面に出てこない。
         設定の指定を最優先にする（未指定なら選ばれている子の先頭）。 */
      fireShindo(clinic, cfg, shindoLoginIndex(cfg));
    } else {
      fireShibata(clinic);
    }
  }
  $('#gonow').addEventListener('click', go);

  /* ---- 起動 ---- */
  paintSeg(); paintKids(); paintSteps(); paintVals(); paintLog(); recalc();
  keepAwake();
  syncClock().then(function () { recalc(); });
  setInterval(syncClock, 5 * 60 * 1000);
})();
