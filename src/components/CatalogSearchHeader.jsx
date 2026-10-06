import { Search } from "lucide-react";

export default function CatalogSearchHeader({ title, value, onChange, onSubmit, placeholder, inputLabel, action }) {
  return (
    <div className="catalog-search-header">
      <h2>{title}</h2>
      <form
        className="catalog-search-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
          event.currentTarget.querySelector("input")?.blur();
        }}
      >
        <label className="catalog-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-label={inputLabel}
          />
        </label>
        <div className="catalog-search-action">{action}</div>
        <button className="catalog-search-submit" type="submit">
          검색
        </button>
      </form>
    </div>
  );
}
