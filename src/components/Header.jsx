import { CardsIcon, GoogleIcon } from "./icons";

export default function Header({ session, isSupabaseConfigured, onLogin, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark">
          <CardsIcon />
        </span>
        <div>
          <h1 className="brand__title">유희왕 카드 & 시세</h1>
          <p className="brand__subtitle">국내 OCG 공식 데이터베이스 검색</p>
        </div>
      </div>

      <div className="account">
        {session ? (
          <>
            <span className="account__email">{session.user.email}</span>
            <button type="button" className="btn btn--ghost" onClick={onLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--gold" onClick={onLogin} disabled={!isSupabaseConfigured}>
            <GoogleIcon />
            Google 로그인
          </button>
        )}
      </div>
    </header>
  );
}
