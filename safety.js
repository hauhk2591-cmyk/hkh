// This is an allowlist. Cost, budget, bid and ROAS fields must never be added.
export const SAFE_META_FIELDS = Object.freeze([
  "ad_id",
  "ad_name",
  "impressions",
  "clicks",
  "actions"
]);

export function sanitizeInsightRow(row, imageUrl = "") {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyInsight();
  }

  return {
    ad_name: typeof row.ad_name === "string" ? row.ad_name : "",
    impressions: toNonNegativeNumber(row.impressions),
    clicks: toNonNegativeNumber(row.clicks),
    reactions: getActionValue(row.actions, "post_reaction"),
    engagements: getActionValue(row.actions, "post_engagement"),
    image_url: typeof imageUrl === "string" ? imageUrl : ""
  };
}

export function sanitizeInsightRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(sanitizeInsightRow);
}

export function filterInsightsByAdName(rows, requiredText) {
  if (!Array.isArray(rows)) return [];
  const needle = requiredText?.trim().toLocaleLowerCase() || "";
  if (!needle) return rows;

  return rows.filter((row) =>
    row.ad_name.toLocaleLowerCase().includes(needle)
  );
}

function getActionValue(actions, actionType) {
  if (!Array.isArray(actions)) return 0;

  return actions.reduce((total, action) => {
    if (action?.action_type !== actionType) return total;
    return total + toNonNegativeNumber(action.value);
  }, 0);
}

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function emptyInsight() {
  return {
    ad_name: "",
    impressions: 0,
    clicks: 0,
    reactions: 0,
    engagements: 0,
    image_url: ""
  };
}

export function parseDateRange(searchParams, maxDays, now = new Date()) {
  const untilDefault = formatDateUtc(now);
  const sinceDefaultDate = new Date(`${untilDefault}T00:00:00.000Z`);
  sinceDefaultDate.setUTCDate(sinceDefaultDate.getUTCDate() - 29);

  const since = searchParams.get("since") || formatDateUtc(sinceDefaultDate);
  const until = searchParams.get("until") || untilDefault;

  if (!isIsoDate(since) || !isIsoDate(until)) {
    throw new ClientInputError("since and until must use YYYY-MM-DD format.");
  }

  const sinceDate = new Date(`${since}T00:00:00.000Z`);
  const untilDate = new Date(`${until}T00:00:00.000Z`);
  if (sinceDate > untilDate) {
    throw new ClientInputError("since must be earlier than or equal to until.");
  }

  const inclusiveDays = Math.floor((untilDate - sinceDate) / 86_400_000) + 1;
  if (inclusiveDays > maxDays) {
    throw new ClientInputError(`Date range cannot exceed ${maxDays} days.`);
  }

  return { since, until };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && formatDateUtc(parsed) === value;
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

export class ClientInputError extends Error {}
