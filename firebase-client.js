// Firebase web client bridge. Replace the placeholder values with the config
// shown in Firebase Console > Project settings > Your apps > Web app.
const firebaseConfig = {
  apiKey: 'REPLACE_WITH_FIREBASE_API_KEY',
  authDomain: 'jellywatch-busan.firebaseapp.com',
  projectId: 'jellywatch-busan',
  storageBucket: 'jellywatch-busan.firebasestorage.app',
  messagingSenderId: 'REPLACE_WITH_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID'
};

window.jellyFirebaseReady = (async () => {
  if (firebaseConfig.apiKey.startsWith('REPLACE_')) {
    window.jellyFirebase = { ready: false };
    return window.jellyFirebase;
  }

  const [{ initializeApp }, firestore] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const db = firestore.getFirestore(app);

  window.jellyFirebase = {
    ready: true,
    addReport: (report) => firestore.addDoc(firestore.collection(db, 'reports'), {
      ...report,
      createdAt: firestore.serverTimestamp()
    }),
    subscribeReports: (onChange, onError) => firestore.onSnapshot(
      firestore.collection(db, 'reports'),
      (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    )
  };
  return window.jellyFirebase;
})().catch((error) => {
  console.warn('Firebase 초기화 실패:', error);
  window.jellyFirebase = { ready: false, error };
  return window.jellyFirebase;
});
