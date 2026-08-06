/* JellyDex 계정 연결: Firebase 인증이 설정되면 Firebase를 사용하고, 미설정 시 브라우저 테스트 계정으로 동작합니다. */
(function () {
  const overlay = document.querySelector('#jellydexOverlay');
  const auth = document.querySelector('#jellyAuth');
  const game = document.querySelector('.jellydex-game');
  const status = document.querySelector('#authStatus');
  const usersKey = 'jellydex_accounts_v1';
  let pendingOpen = false;
  const localUsers = () => JSON.parse(localStorage.getItem(usersKey) || '{}');
  const setUser = (email) => { window.jellyDexUser = { uid: btoa(email).replace(/=/g, ''), email }; localStorage.setItem('jellydex_current_user', email); };
  const currentUser = () => window.jellyDexUser || (localStorage.getItem('jellydex_current_user') ? { email: localStorage.getItem('jellydex_current_user'), uid: btoa(localStorage.getItem('jellydex_current_user')).replace(/=/g, '') } : null);
  window.jellyDexRequireLogin = (openGame) => {
    pendingOpen = openGame;
    const user = currentUser();
    if (user) { window.jellyDexUser = user; openGame(); return; }
    auth.hidden = false; game.hidden = true; status.textContent = '게임 기록을 저장하려면 로그인해 주세요.';
  };
  window.jellyDexLogout = () => { localStorage.removeItem('jellydex_current_user'); window.jellyDexUser = null; location.reload(); };
  const finish = (message) => { setUser(message.email); auth.hidden = true; game.hidden = false; pendingOpen?.(); };
  document.querySelectorAll('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => {
    const signup = button.dataset.authTab === 'signup';
    document.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelector('#jellyLoginForm').hidden = signup;
    document.querySelector('#jellySignupForm').hidden = !signup;
    status.textContent = '';
  }));
  document.querySelector('#jellyLoginForm').addEventListener('submit', (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const user = localUsers();
    if (!user[data.email] || user[data.email] !== data.password) { status.textContent = '아이디 또는 비밀번호가 맞지 않아요.'; return; }
    finish(data);
  });
  document.querySelector('#jellySignupForm').addEventListener('submit', (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.password !== data.passwordConfirm) { status.textContent = '비밀번호 확인이 일치하지 않아요.'; return; }
    const users = localUsers(); if (users[data.email]) { status.textContent = '이미 가입한 아이디예요.'; return; }
    users[data.email] = data.password; localStorage.setItem(usersKey, JSON.stringify(users)); finish(data);
  });
  document.querySelector('#authCancel').addEventListener('click', () => { auth.hidden = true; game.hidden = false; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); });
  document.querySelector('#jellydexLaunch').addEventListener('click', () => window.jellyDexRequireLogin(() => {
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
  }), true);
})();
