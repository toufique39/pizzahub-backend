export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive `$or` search across the given fields.
 * Returns `null` when there is no term so it can be spread safely.
 */
export function buildSearchFilter(fields, term) {
  if (typeof term !== "string" || !term.trim()) return null;

  const pattern = new RegExp(escapeRegex(term.trim()), "i");
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

export function mergeFilters(...filters) {
  return Object.assign({}, ...filters.filter(Boolean));
}
