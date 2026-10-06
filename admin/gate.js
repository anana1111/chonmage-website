// Password screen for /admin/. GitHub Pages is static, so this only keeps casual visitors out:
// publishing still needs the owner's GitHub login. Only a salted PBKDF2 hash of the password is
// stored here; to change the password, replace SALT and HASH (see admin/README.md).
(function () {
  var SALT = '91c885a2f8baa058b3242a99c7612bd8';
  var HASH = '9e06018654272ea14463bc3c1652fd88ac344865948d75336ccf7b8f21c04360';
  var ITERATIONS = 210000;
  var KEY = 'chonmage-admin-unlock';
  var root = document.documentElement;

  function remembered() {
    try { return localStorage.getItem(KEY) === HASH; } catch (error) { return false; }
  }
  if (remembered()) return;
  root.classList.add('admin-locked');

  function hex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function derive(password) {
    var salt = new Uint8Array(SALT.match(/../g).map(function (h) { return parseInt(h, 16); }));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ITERATIONS }, key, 256); })
      .then(hex);
  }

  function build() {
    var gate = document.createElement('form');
    gate.className = 'admin-gate';
    gate.innerHTML =
      '<div class="admin-gate-card">' +
        '<span class="brand-mark" aria-hidden="true">ちょ</span>' +
        '<h1>管理画面</h1>' +
        '<label for="admin-gate-password">パスワード</label>' +
        '<input id="admin-gate-password" type="password" autocomplete="current-password" required autofocus />' +
        '<p class="admin-gate-error" role="alert" hidden>パスワードが違います</p>' +
        '<button class="button primary" type="submit">開く</button>' +
      '</div>';
    var input = gate.querySelector('input');
    var error = gate.querySelector('.admin-gate-error');
    var button = gate.querySelector('button');
    gate.addEventListener('submit', function (event) {
      event.preventDefault();
      button.disabled = true;
      error.hidden = true;
      derive(input.value.trim()).then(function (value) {
        if (value !== HASH) throw new Error('wrong');
        try { localStorage.setItem(KEY, HASH); } catch (ignore) {}
        root.classList.remove('admin-locked');
        gate.remove();
      }).catch(function () {
        error.hidden = false;
        input.select();
      }).then(function () { button.disabled = false; });
    });
    document.body.appendChild(gate);
    input.focus();
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
