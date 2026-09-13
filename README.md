# Yu-Gi-Oh Card App

## Google 로그인과 개인 데이터

이 앱은 Supabase Auth를 통해 Google 로그인을 사용하고, 사용자별 덱·재고·판매 데이터를 Supabase PostgreSQL에 저장할 수 있습니다.

1. Supabase 프로젝트를 생성합니다.
2. Google Cloud Console에서 OAuth 클라이언트를 만들고 Supabase의 Google Provider를 설정합니다.
3. `.env.example`을 `.env`로 복사하고 Supabase URL과 anon key를 입력합니다.
4. `supabase-schema.sql`을 Supabase SQL Editor에서 실행합니다.
5. Google OAuth Redirect URI에 `https://<project-id>.supabase.co/auth/v1/callback`을 등록합니다.
6. 로컬 개발 주소 `http://localhost:5173`을 Supabase Auth URL 설정의 허용 주소에 추가합니다.

## 공개 배포

이 프로젝트는 Vercel 배포를 기준으로 운영 프록시를 포함합니다.

1. GitHub에 저장소를 push합니다.
2. Vercel에서 저장소를 Import합니다.
3. Framework Preset은 `Vite`로 둡니다.
4. Vercel Project Settings → Environment Variables에 다음 값을 등록합니다.

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
```

네이버 쇼핑 API 키는 Vercel 환경변수에만 등록합니다. `NAVER_CLIENT_SECRET`은 절대 `VITE_` 접두사를 붙이지 않으며 브라우저에 노출하지 않습니다. 카드 상세의 각 세트 코드·레어도 옆 `네이버 가격 조회` 버튼이 서버 프록시를 통해 검색합니다.

5. Deploy 후 발급된 `https://프로젝트명.vercel.app` 주소를 Supabase Authentication → URL Configuration의 Site URL과 Redirect URLs에 추가합니다.
6. Google Cloud OAuth 클라이언트의 승인된 JavaScript 원본과 Supabase Google Provider 설정도 같은 공개 주소 기준으로 확인합니다.

공식 한국 카드 DB 요청은 `api/official-ygo/[...path].js` 서버리스 프록시를 통해 처리하므로 공개 배포에서도 브라우저 CORS에 막히지 않습니다.

Supabase와 Google은 무료 사용량 구간에서 시작할 수 있지만, 저장공간·요청량·인증 사용량이 무료 한도를 넘으면 과금될 수 있습니다. 실제 운영 전에는 각 서비스의 현재 요금과 한도를 확인해야 합니다.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
