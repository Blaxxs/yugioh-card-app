import { Search } from "lucide-react";

export default function CatalogSearchHeader({ title, value, onChange, onSubmit, placeholder, inputLabel, action }) {
  return (
    <div className="catalog-search-header">
      <h2>{title}</h2>
      <div className="catalog-search-row">
        <label className="catalog-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onSubmit?.();
              event.currentTarget.blur();
            }}
            placeholder={placeholder}
            aria-label={inputLabel}
          />
        </label>
        <div className="catalog-search-action">{action}</div>
        <button className="catalog-search-submit" type="button" onClick={onSubmit}>
          검색
        </button>
      </div>
    </div>
  );
}
