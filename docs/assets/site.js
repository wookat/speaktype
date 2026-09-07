(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* mobile nav */
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav-toggle');
  if (nav && toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    });
  }

  /* scroll reveal */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* screenshot tabs */
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (n < 0 && e.key !== 'Home') return;
        e.preventDefault();
        select(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
  });

  /* OS-aware primary download button */
  var ua = navigator.userAgent || '';
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var isMac = /Mac/i.test(plat) && !/iPhone|iPad|iPod/i.test(ua);
  var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  document.querySelectorAll('[data-os-primary]').forEach(function (btn) {
    if (isMac) {
      btn.href = btn.getAttribute('data-mac-href');
      btn.querySelector('.label').textContent = btn.getAttribute('data-mac-label');
      var s = btn.querySelector('.sub'); if (s) s.textContent = btn.getAttribute('data-mac-sub') || '';
    } else if (isMobile) {
      btn.href = '#download';
      btn.querySelector('.label').textContent = btn.getAttribute('data-mobile-label');
      var s2 = btn.querySelector('.sub'); if (s2) s2.textContent = '';
    }
  });

  /* hero live demo */
  var demo = document.querySelector('.demo');
  if (demo) {
    var phrases = [];
    try { phrases = JSON.parse(demo.getAttribute('data-phrases') || '[]'); } catch (e) { phrases = []; }
    var typed = demo.querySelector('.typed');
    var status = demo.querySelector('.fbar .txt');
    var listening = demo.getAttribute('data-listening') || 'Listening…';
    var released = demo.getAttribute('data-released') || 'Release to type';
    var holdKey = demo.getAttribute('data-hold') || 'RightCtrl';
    if (!typed || !status || !phrases.length) return;

    if (reduce) {
      typed.innerHTML = phrases.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
      status.innerHTML = '<b>' + esc(holdKey) + '</b> · ' + esc(released);
      demo.classList.add('idle');
      return;
    }

    var i = 0;
    function run() {
      var phrase = phrases[i % phrases.length];
      if (i % phrases.length === 0) typed.innerHTML = '';
      i++;
      demo.classList.remove('idle');
      var caption = '';
      var p = document.createElement('p');
      typed.appendChild(p);
      var caret = document.createElement('span'); caret.className = 'caret';
      p.appendChild(caret);
      // phase 1: live caption grows in the floating bar while "speaking"
      var words = phrase.split(/(\s+)/).filter(Boolean);
      var w = 0;
      var cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(phrase);
      if (cjk) words = phrase.split('');
      var t1 = setInterval(function () {
        caption += words[w++] || '';
        status.innerHTML = '<span class="sr-only">' + esc(listening) + '</span>' + esc(caption);
        if (w >= words.length) {
          clearInterval(t1);
          // phase 2: release → text lands at the cursor
          setTimeout(function () {
            demo.classList.add('idle');
            status.innerHTML = '<b>' + esc(holdKey) + '</b> · ' + esc(released);
            var k = 0;
            var t2 = setInterval(function () {
              k += cjk ? 1 : 3;
              p.textContent = phrase.slice(0, k);
              p.appendChild(caret);
              if (k >= phrase.length) {
                clearInterval(t2);
                setTimeout(function () { status.innerHTML = esc(listening); run(); }, 2200);
              }
            }, cjk ? 45 : 22);
          }, 500);
        }
      }, cjk ? 110 : 160);
    }
    status.textContent = listening;
    setTimeout(run, 600);
  }
})();
