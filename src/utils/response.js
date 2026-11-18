/**
 * Response shapes match the frontend contract in `src/lib/api-client.ts`:
 * - single resources: `{ data, message? }`
 * - collections:      `{ data, page, pageSize, total }`
 */
export function ok(res, data, message) {
  const body = { data };
  if (message) body.message = message;
  res.json(body);
}

export function created(res, data, message = "Created") {
  res.status(201).json({ data, message });
}

export function paginated(res, { data, page, pageSize, total }) {
  res.json({ data, page, pageSize, total });
}
