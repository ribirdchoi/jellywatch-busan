# Firebase 및 Render 연결

1. Firebase Console의 `jellywatch-busan` 프로젝트에서 `프로젝트 설정 > 내 앱 > 웹 앱 추가`를 선택합니다.
2. 앱 이름을 `jellywatch-busan-web`으로 등록하고, 표시되는 웹 구성 객체의 값을 `firebase-client.js`의 `firebaseConfig`에 넣습니다.
3. Firestore Rules에 아래 규칙을 저장합니다. 신고 위치는 숫자 좌표와 생성 시각이 있는 경우에만 저장됩니다.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reports/{reportId} {
      allow create: if request.resource.data.latitude is number
        && request.resource.data.longitude is number
        && request.resource.data.createdAt is timestamp;
      allow read: if true;
    }
  }
}
```

4. GitHub 저장소에서 `New > Render Blueprint` 또는 Render 대시보드의 `New > Static Site`를 선택하고 `ribirdchoi/jellywatch-busan` 저장소를 연결합니다. 저장소의 `render.yaml`을 사용하면 설정이 자동 입력됩니다.
5. Render가 배포되면 신고하기에서 Firestore 저장을 시도하고, 설정 전에는 기존처럼 브라우저 임시 저장으로 동작합니다.
