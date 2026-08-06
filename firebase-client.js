// jellywatch-busan Firebase 웹 설정
const firebaseConfig = {
  apiKey: 'AIzaSyDKymtZqfzrgl2E7rMrLpZiLN8PIzELzto',
  authDomain: 'jellywatch-busan.firebaseapp.com',
  projectId: 'jellywatch-busan',
  storageBucket: 'jellywatch-busan.firebasestorage.app',
  messagingSenderId: '744134539428',
  appId: '1:744134539428:web:0e2f834815763571e58e31',
  measurementId: 'G-9CC350MQBY'
};

window.jellyFirebaseReady = (async () => {
  const [{ initializeApp }, auth, firestore] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const authClient = auth.getAuth(app);
  const db = firestore.getFirestore(app);
  const userDoc = (uid) => firestore.doc(db, 'users', uid);

  window.jellyFirebase = {
    ready: true,
    auth: authClient,
    signUp: (email, password) => auth.createUserWithEmailAndPassword(authClient, email, password),
    signIn: (email, password) => auth.signInWithEmailAndPassword(authClient, email, password),
    signOut: () => auth.signOut(authClient),
    onAuthStateChanged: (callback) => auth.onAuthStateChanged(authClient, callback),
    addReport: (report) => firestore.addDoc(firestore.collection(db, 'reports'), {
      ...report,
      createdAt: firestore.serverTimestamp()
    }),
    subscribeReports: (onChange, onError) => firestore.onSnapshot(
      firestore.collection(db, 'reports'),
      (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    ),
    saveGameState: (uid, state) => firestore.setDoc(userDoc(uid), {
      gameState: state,
      updatedAt: firestore.serverTimestamp()
    }, { merge: true }),
    loadGameState: async (uid) => {
      const snapshot = await firestore.getDoc(userDoc(uid));
      return snapshot.exists() ? snapshot.data().gameState || null : null;
    }
  };
  return window.jellyFirebase;
})().catch((error) => {
  console.warn('Firebase 초기화 실패:', error);
  window.jellyFirebase = { ready: false, error };
  return window.jellyFirebase;
});
