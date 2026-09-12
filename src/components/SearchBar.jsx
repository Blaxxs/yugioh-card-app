import { SearchIcon } from "./icons";

export default function SearchBar({ value, onChange, onSearch, loading }) {
  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    onSearch();
  };

  return (
    <div className="search">
      <div className="search__field">
        <SearchIcon className="search__icon" />
        <input
          className="search__input"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="카드 이름을 입력하세요 (예: 푸른 눈의 백룡)"
          aria-label="카드 이름 검색"
        />
      </div>
      <button type="button" className="btn btn--gold" onClick={onSearch} disabled={loading}>
        {loading ? "검색 중" : "검색"}
      </button>
    </div>
  );
}
