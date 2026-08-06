/* JellyDex Firebase 인증 화면 */
(function () {
  const overlay = document.querySelector('#jellydexOverlay');
  const auth = document.querySelector('#jellyAuth');
  const game = document.querySelector('.jellydex-game');
  const status = document.querySelector('#authStatus');
  let pendingOpen = null;

  const message = (error) => {
    const code = error?.code || '';
    if (code.includes('email-already-in-use')) return '이미 가입된 이메일이에요.';
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return '이메일 또는 비밀번호를 확인해 주세요.';
    if (code.includes('weak-password')) return '비밀번호는 6자 이상으로 입력해 주세요.';
    if (code.includes('invalid-email')) return '올바른 이메일 주소를 입력해 주세요.';
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  };
  const setUser = (user) => {
    window.jellyDexUser = { uid: user.uid, email: user.email };
    localStorage.setItem('jellydex_current_user', user.email || '');
  };
  const finish = async (user) => {
    setUser(user);
    try {
      const remote = await window.jellyFirebase?.loadGameState?.(user.uid);
      window.jellyDexApplyCloudState?.(remote);
    } catch (error) { console.warn('게임 저장 데이터 불러오기 실패:', error); }
    auth.hidden = true; game.hidden = false; pendingOpen?.();
  };
  window.jellyDexRequireLogin = (openGame) => {
    pendingOpen = openGame;
    if (window.jellyFirebase?.auth?.currentUser) { finish(window.jellyFirebase.auth.currentUser); return; }
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    auth.hidden = false; game.hidden = true; status.textContent = '게임 기록을 저장하려면 로그인해 주세요.';
  };
  window.jellyDexLogout = async () => {
    await window.jellyFirebase?.signOut?.();
    localStorage.removeItem('jellydex_current_user'); window.jellyDexUser = null; location.reload();
  };
  document.querySelectorAll('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => {
    const signup = button.dataset.authTab === 'signup';
    document.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelector('#jellyLoginForm').hidden = signup;
    document.querySelector('#jellySignupForm').hidden = !signup;
    status.textContent = '';
  }));
  document.querySelector('#jellyLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    status.textContent = '로그인 중이에요...';
    try { await window.jellyFirebaseReady; const result = await window.jellyFirebase.signIn(data.email, data.password); await finish(result.user); }
    catch (error) { status.textContent = message(error); }
  });
  document.querySelector('#jellySignupForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.password !== data.passwordConfirm) { status.textContent = '비밀번호가 서로 다릅니다.'; return; }
    status.textContent = '계정 만드는 중이에요...';
    try { await window.jellyFirebaseReady; const result = await window.jellyFirebase.signUp(data.email, data.password); await finish(result.user); }
    catch (error) { status.textContent = message(error); }
  });
  document.querySelector('#authCancel').addEventListener('click', () => { auth.hidden = true; game.hidden = false; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); });
  document.querySelector('#jellydexLaunch').addEventListener('click', () => window.jellyDexRequireLogin(() => {
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
  }), true);
  window.jellyFirebaseReady?.then((firebase) => firebase?.onAuthStateChanged?.((user) => { if (user) setUser(user); }));
})();
