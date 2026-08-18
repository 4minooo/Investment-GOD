# 투자의 신

실제 한국 주식 과거 차트를 바탕으로 만든 10라운드 투자 판단 게임입니다. 각 라운드의 차트를 이 프로젝트에서는 **맵**이라고 부릅니다.

## 포함된 기능

- 실제 한국 주식 종목의 과거 일봉 데이터로 만든 맵 100개
- 싱글플레이 10라운드
- 한 판 총 1,000만 원 한도에서 직접 매수 금액 입력
- Firebase Realtime Database 기반 2-4인 온라인 방 대전
- 닉네임 기반 방 생성 및 참가
- 맵 보관함의 100개 차트 상세 열람
- 종목명, 날짜, 실제 가격은 마지막 결과 화면에서 공개
- Vercel 정적 배포 + 서버리스 Firebase 설정 주입

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다.

## Firebase 설정

Firebase 콘솔에서 Web App을 만들고 Realtime Database를 생성한 뒤, Vercel 환경 변수 또는 로컬 `.env`에 아래 값을 넣습니다.

```bash
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_DATABASE_URL=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

빠른 MVP 테스트용 규칙은 `database.rules.json`에 들어 있습니다. 공개 서비스에서는 익명 인증, 방별 쓰기 권한, 제출값 검증 규칙을 더 엄격하게 바꾸는 것을 권장합니다.

## 맵 데이터

맵 데이터는 `scripts/generate-maps.mjs`로 생성했습니다. Yahoo Finance chart endpoint에서 한국 종목의 과거 일봉을 받아 60거래일 히스토리와 20거래일 결과 구간으로 자릅니다. 게임 수익률은 차트 마지막 날 종가에 매수하고 20번째 다음 거래일 종가에 정산한 값입니다.

상업 서비스 또는 공개 대규모 운영 전에는 KRX Open API/데이터 상품의 이용 조건을 확인하고, 허가된 데이터 소스로 교체하는 것이 안전합니다.

```bash
npm run generate:maps
npm run build
```
