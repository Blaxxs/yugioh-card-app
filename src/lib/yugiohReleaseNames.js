const releaseNames = [
  ["LIMIT OVER COLLECTION THE RIVALS", "리미트 오버 컬렉션 라이벌즈"],
  ["LIMIT OVER COLLECTION THE HEROES", "리미트 오버 컬렉션 히어로즈"],
];

const normalizeTitle = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();

export const getYugiohReleaseDisplayName = (name) =>
  releaseNames.find(([original]) => normalizeTitle(original) === normalizeTitle(name))?.[1] || name;

export const normalizeYugiohReleaseSearch = (value) =>
  normalizeTitle(getYugiohReleaseDisplayName(value))
    .replace(/limitover/g, "리미트오버")
    .replace(/collection/g, "컬렉션")
    .replace(/the(?=heroes|rivals)/g, "")
    .replace(/heroes/g, "히어로즈")
    .replace(/rivals/g, "라이벌즈")
    .replace(/리밋/g, "리미트")
    .replace(/히어로스/g, "히어로즈")
    .replace(/라이벌스/g, "라이벌즈")
    .replace(/더(?=히어로즈|라이벌즈)/g, "");

export const getYugiohReleaseSearchTerms = (query) => {
  const normalized = normalizeYugiohReleaseSearch(query);
  return normalized
    ? releaseNames.filter(([, name]) => normalizeYugiohReleaseSearch(name).includes(normalized)).map(([name]) => name)
    : [];
};
