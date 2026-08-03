// This is an allowlist. Cost, budget, bid and ROAS fields must never be added.
export const SAFE_META_FIELDS = Object.freeze([
  "ad_id",
  "ad_name",
  "impressions",
  "reach",
  "clicks",
  "actions"
]);

export function sanitizeInsightRow(
  row,
  imageUrl = "",
  postUrl = "",
  pageName = "",
  optimizationGoal = ""
) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyInsight();
  }

  const result = getResult(row, optimizationGoal);
  return {
    ad_name: typeof row.ad_name === "string" ? row.ad_name : "",
    impressions: toNonNegativeNumber(row.impressions),
    reach: toNonNegativeNumber(row.reach),
    clicks: toNonNegativeNumber(row.clicks),
    reactions: getActionValue(row.actions, "post_reaction"),
    engagements: getActionValue(row.actions, "post_engagement"),
    follows: getFirstActionValue(row.actions, [
      "onsite_conversion.instagram_follow",
      "instagram_follow",
      "follow",
      "like"
    ]),
    messages: getFirstActionValue(row.actions, [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection"
    ]),
    image_url: typeof imageUrl === "string" ? imageUrl : "",
    post_url: typeof postUrl === "string" ? postUrl : "",
    page_name: typeof pageName === "string" ? pageName : "",
    result: result.value,
    result_type: result.type
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

function getFirstActionValue(actions, actionTypes) {
  for (const actionType of actionTypes) {
    const value = getActionValue(actions, actionType);
    if (value > 0) return value;
  }
  return 0;
}

function getResult(row, optimizationGoal) {
  const actions = row.actions;
  const candidates = [
    { types: ["onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"], label: "Cuộc trò chuyện bắt đầu" },
    { types: ["onsite_conversion.instagram_follow", "instagram_follow", "follow", "like"], label: "Lượt theo dõi" },
    { types: ["lead", "onsite_conversion.lead_grouped"], label: "Khách hàng tiềm năng" },
    { types: ["purchase", "omni_purchase"], label: "Lượt mua hàng" },
    { types: ["landing_page_view"], label: "Lượt xem trang đích" },
    { types: ["link_click"], label: "Lượt nhấp liên kết" },
    { types: ["post_engagement"], label: "Lượt tương tác" },
    { types: ["video_view"], label: "Lượt xem video" }
  ];

  const goal = String(optimizationGoal || "").toUpperCase();
  const priority = candidates.slice().sort((left, right) => {
    const leftMatch = left.types.some((type) => goal.includes(type.toUpperCase().replace(/^ONSITE_CONVERSION\./, "")));
    const rightMatch = right.types.some((type) => goal.includes(type.toUpperCase().replace(/^ONSITE_CONVERSION\./, "")));
    return Number(rightMatch) - Number(leftMatch);
  });

  for (const candidate of priority) {
    const value = getFirstActionValue(actions, candidate.types);
    if (value > 0) return { value, type: candidate.label };
  }

  if (goal.includes("REACH")) return { value: toNonNegativeNumber(row.reach), type: "Tiếp cận" };
  if (goal.includes("IMPRESSION")) return { value: toNonNegativeNumber(row.impressions), type: "Lượt hiển thị" };
  return { value: 0, type: goal ? `Mục tiêu: ${goal}` : "Chưa xác định" };
}

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function emptyInsight() {
  return {
    ad_name: "",
    impressions: 0,
    reach: 0,
    clicks: 0,
    reactions: 0,
    engagements: 0,
    follows: 0,
    messages: 0,
    image_url: "",
    post_url: "",
    page_name: "",
    result: 0,
    result_type: "Chưa xác định"
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
