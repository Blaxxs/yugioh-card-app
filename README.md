# Yu-Gi-Oh Card App

## Google 로그인과 개인 데이터

이 앱은 Supabase Auth를 통해 Google 로그인을 사용하고, 사용자별 덱·재고·판매 데이터를 Supabase PostgreSQL에 저장할 수 있습니다.

1. Supabase 프로젝트를 생성합니다.
2. Google Cloud Console에서 OAuth 클라이언트를 만들고 Supabase의 Google Provider를 설정합니다.
3. `.env.example`을 `.env`로 복사하고 Supabase URL과 anon key를 입력합니다.
4. `supabase-schema.sql`을 Supabase SQL Editor에서 실행합니다.
5. Google OAuth Redirect URI에 `https://<project-id>.supabase.co/auth/v1/callback`을 등록합니다.
6. 로컬 개발 주소 `http://localhost:5173`을 Supabase Auth URL 설정의 허용 주소에 추가합니다.

## 재고 비고별 분리

비고가 없는 카드와 비고가 있는 카드는 별도 재고로 저장하며, 비고 내용이 다르면 각각 별도 항목입니다. 같은 카드·코드·레어도·비고로 다시 입고하면 해당 항목의 수량만 증가합니다. 비고 앞뒤 공백은 제거하고 빈 비고는 같은 값으로 취급합니다.

기존 `supabase-migration-inventory-variants.sql`과 `supabase-migration-inventory-variant-constraint.sql` 적용 후, Supabase SQL Editor에서 [supabase-migration-inventory-memo-variants.sql](supabase-migration-inventory-memo-variants.sql)을 실행한 다음 앱을 배포하세요. 이 마이그레이션은 기존 재고 ID와 거래 이력을 유지하고 비고 식별용 `memo_key` 컬럼과 고유 제약조건을 추가합니다. 적용 전에는 새 앱의 재고 저장이 정상 동작하지 않습니다. 수정한 비고가 기존 항목과 같아지면 자동 병합하지 않고 중복 오류를 표시합니다.

## 공개 배포

이 프로젝트는 Vercel 배포를 기준으로 운영 프록시를 포함합니다.

1. GitHub에 저장소를 push합니다.
2. Vercel에서 저장소를 Import합니다.
3. Framework Preset은 `Vite`로 둡니다.
4. Vercel Project Settings → Environment Variables에 다음 값을 등록합니다.

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

5. Deploy 후 발급된 `https://프로젝트명.vercel.app` 주소를 Supabase Authentication → URL Configuration의 Site URL과 Redirect URLs에 추가합니다.
6. Google Cloud OAuth 클라이언트의 승인된 JavaScript 원본과 Supabase Google Provider 설정도 같은 공개 주소 기준으로 확인합니다.

공식 한국 카드 DB 요청은 `api/official-ygo/[...path].js` 서버리스 프록시를 통해 처리하므로 공개 배포에서도 브라우저 CORS에 막히지 않습니다.

유희왕 카드 이미지는 URL에 판본(`request_locale=ko/ja`)을 명시하며, 이미지 프록시가 공식 사이트의 익명 언어 세션을 판본별로 분리해 유지합니다. 한글판 요청에서는 원어 이미지 플래그를 제거합니다. 익명 세션 쿠키는 서버 메모리에서만 짧게 재사용하며 브라우저나 로그로 전달하지 않습니다. 검색·상세 이미지 캐시의 언어를 정규화하지만 개인 재고의 수량·비고·거래 이력은 변경하지 않습니다.

## 공용 카드 캐시 설정

운영 환경의 일반 카드명 검색과 상세 조회는 `/api/cards`를 사용합니다. 처음 조회한 데이터는 Supabase에 JSON으로 저장되고, 이후 사용자는 공식 DB 대신 공용 캐시를 사용합니다. 로컬 Vite 개발 서버는 기본적으로 기존 프록시를 사용합니다.

1. Supabase Dashboard의 SQL Editor에서 `supabase-migration-card-catalog.sql`을 실행합니다.
2. Supabase Dashboard의 Project Settings → API에서 Project URL과 `service_role` 키를 확인합니다.
3. Vercel Project Settings → Environment Variables에 다음 값을 추가합니다.

```text
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

`SUPABASE_SERVICE_ROLE_KEY`은 모든 RLS를 우회하므로 `VITE_` 접두사를 붙이거나 브라우저 코드에 넣으면 안 됩니다.

4. Vercel에서 다시 배포합니다.
5. 배포 주소에서 같은 카드명을 두 번 검색하고 `/api/cards` 응답의 `X-Card-Cache` 헤더를 확인합니다. 첫 요청은 `MISS`, 이후 요청은 `HIT`이어야 합니다.

캐시 없이 API 동작만 로컬에서 확인하려면 `.env`에 `VITE_USE_CARD_API=true`를 추가하고 `vercel dev`로 실행합니다. 일반 `npm run dev`에서는 Vercel 서버리스 함수가 실행되지 않습니다.

브라우저는 동일한 카드 API 요청을 공유하고, 성공한 전체 응답을 최대 100건까지 60초 동안 재사용합니다. 이 캐시는 카드 검색·상세·팩·번역 데이터에만 적용되며 개인 재고나 판매 데이터에는 적용되지 않습니다. 새로고침하면 브라우저 요청 캐시는 초기화됩니다. 일본판 포켓몬 일괄입고는 카드 목록을 먼저 표시한 뒤 코드를 보완하며, 화면 밖 이미지는 스크롤 시 불러옵니다. 카드 수나 표시 필드를 줄이지 않습니다.

Supabase와 Google은 무료 사용량 구간에서 시작할 수 있지만, 저장공간·요청량·인증 사용량이 무료 한도를 넘으면 과금될 수 있습니다. 실제 운영 전에는 각 서비스의 현재 요금과 한도를 확인해야 합니다.

## 일본어 검색어 AI 번역 (선택)

일본판의 카드·수록 팩은 원본 일본어 ID와 이름을 보존하면서 화면에 한국어 표시명을 제공합니다. 유희왕은 공통 공식 카드 ID, 원피스는 공통 카드 코드·상품 코드를 기준으로 한국 정발명을 우선 연결합니다. 공식 한국판 대응을 찾지 못한 이름은 AI가 한국어로 번역하며, 일본판에서 한글 카드명이나 팩 이름을 검색할 때도 일본어 후보를 생성합니다.

일본어↔한국어 이름 변환은 Google Gemini API 하나를 사용합니다. Vercel 서버 환경변수에 Google AI Studio 키 `GEMINI_API_KEY`를 등록하고, 필요하면 `GEMINI_MODEL`을 설정합니다. 기본적으로 Google Search Grounding은 꺼져 있으며, 사용하려면 서버 환경변수 `GEMINI_SEARCH_GROUNDING=true`를 설정하세요. Grounding 지원 여부와 요금은 모델 및 계정 등급에 따라 다릅니다. 무료 사용을 보장하지 않으며, 요청 전에 [Gemini API 가격 및 무료 등급](https://ai.google.dev/gemini-api/docs/pricing)을 확인하세요.

키는 서버 환경변수로만 설정하고 `VITE_` 접두사를 붙이지 마세요. AI에는 카드/팩 이름만 보내며, 카드 데이터는 각 공식 DB에서 조회합니다. 키가 없거나 Gemini가 실패하면 공식 ID·코드 매핑을 우선 사용하고, 그것도 없으면 일본어 원본 이름을 유지합니다.

한국어 카드명·팩명 검색 사전과 성공한 AI 번역은 서버 프로세스 메모리뿐 아니라 Supabase의 `japanese_search_dictionary`에도 저장합니다. 이 테이블은 API 서버의 `SUPABASE_SERVICE_ROLE_KEY`로만 접근하며 브라우저 권한은 부여하지 않습니다. 서버 사전 테이블을 준비하려면 Supabase SQL Editor에서 [supabase-migration-japanese-search-dictionary.sql](supabase-migration-japanese-search-dictionary.sql)을 한 번 실행한 뒤 배포하세요. 마이그레이션을 적용하지 않았거나 서버 DB 연결이 없으면 코드 내 기본 사전과 Gemini fallback으로 계속 동작합니다.

## 포켓몬 · 원피스 카드 지원

앱 상단의 게임 선택 UI에서 유희왕/포켓몬/원피스를 전환할 수 있습니다. 포켓몬과 원피스 카드 데이터는
각 게임의 한국 공식 사이트에서 서버(`/api/cards`)가 직접 조회하여 캐시합니다. 외부 유료 API나 API 키가
전혀 필요하지 않습니다.

- 포켓몬: [pokemoncard.co.kr](https://pokemoncard.co.kr/) (포켓몬코리아 공식 카드 검색)
- 원피스: [onepiece-cardgame.kr](https://onepiece-cardgame.kr/) (반다이 원피스 카드게임 한국 공식 사이트)

일본 포켓몬 상세에서 수집 번호가 비어 있을 때는 [Art of Pokémon](https://www.artofpkm.com/cards)의 공개 세트/카드 페이지를 보조 조회해 번호만 보완합니다. 결과는 서버 메모리에 24시간 캐시하며, 사이트의 카드 이미지나 카드 텍스트는 가져오거나 재배포하지 않습니다. ArtOfPKM은 Pokémon 권리자와 제휴하지 않은 아카이브이므로 실제 운영 시 해당 사이트와 권리자의 이용 조건을 확인하세요.

일본판 레어도는 공식 상세에서 확인할 수 없는 경우 [TCGdex](https://tcgdex.dev/)의 무료 일본판 메타데이터를 보조 조회합니다. 공식 이미지의 세트 코드, 수집 번호, 일본어 카드명이 모두 일치할 때만 연결하며 결과를 24시간 캐시합니다. TCGdex의 이미지·카드 텍스트·가격은 사용하지 않습니다. 레어도 기호가 없는 일반 카드(`None`)는 `N` / `노멀`로 표시하고, 인쇄 기호 여부를 별도 데이터로 보존해 조회 실패와 구분합니다. 일반·미러·몬스터볼/마스터볼 등의 표면 가공은 번호만으로 자동 판별하지 않습니다. 이전 `N (레어도 기호 없음)` 재고도 레어도 보완에서 다시 조회할 수 있습니다.

재고 화면의 `레어도 보완`에서 일본판 포켓몬의 누락 항목을 조회하고 원본 백업 후 적용할 수 있습니다. 카드 ID와 수록 코드가 확인되지 않거나 기존 재고와 중복되는 항목은 자동 병합하지 않고 건너뜁니다. 재고 ID·수량·가격·상태·비고와 거래 이력은 유지하며, 레어도 필드와 해당 스냅샷만 보완합니다. 포켓몬 일괄입고는 코드 또는 레어도가 누락된 미리보기를 상세 조회로 보완하고, 확인할 수 없는 레어도는 빈 값으로 저장하지 않습니다.

보조 데이터가 누락된 SV4a의 코지오 `107/190`(공식 ID `44630`)와 음뱃 `134/190`(공식 ID `44657`)은 공식 인쇄 이미지를 직접 확인한 값으로 연결합니다. 공식 이미지 ID·세트 코드·수집 번호·일본어 이름이 모두 일치해야 이 확인값을 사용하며 출처는 `official-image`로 기록합니다. 다른 미확인 카드에 노멀 값을 일괄 적용하지 않습니다. 보조 API의 404·레어도 필드 누락 응답은 장기 캐시하지 않습니다.

SV4a `131/190`(공식 ID `44654`, ブロロローム), `175/190`(`44698`, ネルケ), `182/190`(`44705`, ボタン), `190/190`(`44713`, ルミナスエネルギー) 역시 카탈로그의 잘못된 이름/분류 대신 공식 인쇄 이미지를 확인한 노멀 값으로 연결합니다. 여러 상품에 연결된 카드는 전체 수록명을 확인해 하이클래스 팩 정보를 놓치지 않습니다. 이전 카탈로그 결과로 SV4a C/U가 저장된 항목은 보완에서 N을 재확인할 수 있으며 다른 팩 C/U는 자동 변경하지 않습니다. `보완 대기`는 미리보기일 뿐 실제 저장 완료가 아닙니다. 원본 백업 후 적용하고 각 행의 `보완 완료` 또는 실패 사유를 확인하세요.

일본판 레어도 조회는 특정 팩에 한정하지 않습니다. 공식 상세에 직접 제공되는 기호를 우선 사용하고, TCGdex의 세트·번호·이름 대조가 실패하거나 데이터가 누락되면 [Pokellector 일본판 전체 색인](https://jp.pokellector.com/sets)에서 공식 세트 코드에 맞는 카탈로그 경로를 동적으로 찾습니다. 색인에서 코드가 확인되지 않거나 경로가 중복되면 임의로 연결하지 않습니다. SV4a는 기존 메타데이터가 불완전해 일본판 카탈로그를 우선 사용합니다.

카탈로그 세트·수집 번호·일본어 이름을 대조하며, 누락된 이름은 세트 이름 목록으로 교차 대조하거나 검증된 공식 이미지·동일 카탈로그 세트·고유 카드 번호로 한정해 연결합니다. 출처는 `pokellector-ja`로 기록하고 조회를 캐시합니다. 일반 팩의 C/U와 공식 상품명에 하이클래스팩으로 명시된 팩의 N을 구분합니다. 카탈로그 이미지·가격·카드 텍스트는 사용하지 않으며, 세대별로 의미가 다른 모호한 영문 레어도는 자동 적용하지 않습니다. UI는 포켓몬 전용 기호 목록을 사용합니다. 모든 세트가 조회 대상이지만 외부 출처에 미등록되거나 서로 충돌하는 정보까지 정확히 채울 수는 없으므로 해당 항목은 미확인으로 남기고 빈 레어도 입고를 차단합니다. 한국판은 한국 공식 상세의 레어도를 사용합니다.

1. Supabase Dashboard의 SQL Editor에서 `supabase-migration-multi-game-catalog.sql`을 실행합니다. (기존 `card_catalog` 테이블에 `game` 컬럼을 추가해 유희왕/포켓몬/원피스 카드 ID 충돌을 방지합니다.)
2. `public/card-backs/` 폴더에 다음 파일명을 정확히 맞춰 카드 뒷면 이미지를 넣습니다. 파일이 없으면 게임 선택 버튼에는 이름만 표시됩니다.

```text
public/card-backs/yugioh_card_back.png
public/card-backs/pokemon_card_back.png
public/card-backs/one_piece_card_back.png
```

두 공식 사이트 모두 비공식 스크래핑이므로, 사이트 구조가 바뀌면 `api/_lib/pokemon-kr-parser.js`,
`api/_lib/onepiece-kr-parser.js`의 선택자(class명, 폼 필드명)를 다시 확인해야 합니다. 또한 각 사이트의
이용약관을 반드시 확인하고, 과도한 요청으로 서버에 부담을 주지 않도록 캐시(검색 1일, 상세 30일, 수록 7일)를
유지한 채로 운영하세요.

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
