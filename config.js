const REQUIRED_ENV = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "DASHBOARD_API_KEY"
];

export function loadConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const accountId = env.META_AD_ACCOUNT_ID.trim().replace(/^act_/, "");
  if (!/^\d+$/.test(accountId)) {
    throw new Error("META_AD_ACCOUNT_ID must contain digits only (with or without act_). ");
  }

  const graphVersion = (env.META_GRAPH_VERSION || "v26.0").trim();
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("META_GRAPH_VERSION must look like v26.0.");
  }

  return {
    port: readPositiveInteger(env.PORT, 3000, "PORT"),
    metaAccessToken: env.META_ACCESS_TOKEN.trim(),
    metaAdAccountId: accountId,
    metaGraphVersion: graphVersion,
    adNameContains: env.AD_NAME_CONTAINS?.trim() || "",
    dashboardApiKey: env.DASHBOARD_API_KEY,
    allowedOrigin: env.ALLOWED_ORIGIN?.trim() || "",
    maxDateRangeDays: readPositiveInteger(
      env.MAX_DATE_RANGE_DAYS,
      93,
      "MAX_DATE_RANGE_DAYS"
    ),
    rateLimitPerMinute: readPositiveInteger(
      env.RATE_LIMIT_PER_MINUTE,
      60,
      "RATE_LIMIT_PER_MINUTE"
    ),
    metaRequestTimeoutMs: readPositiveInteger(
      env.META_REQUEST_TIMEOUT_MS,
      120_000,
      "META_REQUEST_TIMEOUT_MS"
    )
  };
}

function readPositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}
