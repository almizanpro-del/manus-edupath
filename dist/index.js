// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var LIVE_SOURCE = "https://universities.hipolabs.com/search";
var supportedCountries = ["Hungary", "Turkey", "Poland", "United Kingdom", "Malaysia", "Germany", "United Arab Emirates"];
var verifiedPrograms = {
  debrecen: [
    { name: "Computer Science, MSc", tuitionAmount: 7500, tuitionCurrency: "USD", tuitionPeriod: "per year", academicYear: "2026/27", applicationDeadline: "1 November 2026", deadlineNote: "Conservative deadline for February 2027 intake; the individual program page also states 15 November for self-financed applicants.", sourceUrl: "https://edu.unideb.hu/p/computer-science-msc" },
    { name: "Data Science, MSc", tuitionAmount: 7500, tuitionCurrency: "USD", tuitionPeriod: "per year", academicYear: "2026/27", applicationDeadline: "1 November 2026", deadlineNote: "Conservative deadline for February 2027 intake; confirm the 1 November versus 15 November discrepancy with Admissions.", sourceUrl: "https://edu.unideb.hu/p/data-science-msc" },
    { name: "International Economy and Business, MSc", tuitionAmount: 7500, tuitionCurrency: "USD", tuitionPeriod: "per year", academicYear: "2026/27", applicationDeadline: "1 November 2026", deadlineNote: "Conservative deadline for February 2027 intake; confirm the 1 November versus 15 November discrepancy with Admissions.", sourceUrl: "https://edu.unideb.hu/p/international-economy-and-business-msc" }
  ],
  sdu: [
    { name: "Business Administration (English)", tuitionAmount: 38599, tuitionCurrency: "TRY", tuitionPeriod: "per semester", academicYear: "2026-2027", applicationDeadline: "30 August 2026", deadlineNote: "Second-round international application deadline; the 2027-2028 schedule was not published in the reviewed official sources.", sourceUrl: "https://oidb.sdu.edu.tr/assets/uploads/sites/73/files/2026-2027-egitim-ogretim-yili-donemlik-uluslararasi-ogrenci-ogrenim-ucretleri.pdf" },
    { name: "English Language Education", tuitionAmount: 22874, tuitionCurrency: "TRY", tuitionPeriod: "per semester", academicYear: "2026-2027", applicationDeadline: "30 August 2026", deadlineNote: "Second-round international application deadline; the 2027-2028 schedule was not published in the reviewed official sources.", sourceUrl: "https://oidb.sdu.edu.tr/assets/uploads/sites/73/files/2026-2027-egitim-ogretim-yili-donemlik-uluslararasi-ogrenci-ogrenim-ucretleri.pdf" },
    { name: "English Language and Literature", tuitionAmount: 22874, tuitionCurrency: "TRY", tuitionPeriod: "per semester", academicYear: "2026-2027", applicationDeadline: "30 August 2026", deadlineNote: "Second-round international application deadline; the 2027-2028 schedule was not published in the reviewed official sources.", sourceUrl: "https://oidb.sdu.edu.tr/assets/uploads/sites/73/files/2026-2027-egitim-ogretim-yili-donemlik-uluslararasi-ogrenci-ogrenim-ucretleri.pdf" }
  ],
  pecs: [
    { name: "Mechanical Engineering BSc", tuitionAmount: 3400, tuitionCurrency: "USD", tuitionPeriod: "per semester", academicYear: "2027/28", applicationDeadline: "15 June 2027, 23:59 CET", deadlineNote: "Published 2027/28 deadline; applicable deadline may vary by applicant category or citizenship.", sourceUrl: "https://apply.pte.hu/en_GB/courses/course/568-mechanical-engineering-bsc?search=648784" },
    { name: "Biomedical Engineering MSc", tuitionAmount: 4e3, tuitionCurrency: "USD", tuitionPeriod: "per semester", academicYear: "2027/28", applicationDeadline: "15 June 2027, 23:59 CET", deadlineNote: "Published 2027/28 deadline; applicable deadline may vary by applicant category or citizenship.", sourceUrl: "https://apply.pte.hu/en_GB/courses/course/458-biomedical-engineering-msc" },
    { name: "English Studies MA", tuitionAmount: 2500, tuitionCurrency: "EUR", tuitionPeriod: "per semester", academicYear: "2027/28", applicationDeadline: "30 June 2027, 23:59 CET", deadlineNote: "Published 2027/28 deadline; applicable deadline may vary by applicant category or citizenship.", sourceUrl: "https://apply.pte.hu/en_GB/courses/course/306-english-studies-ma" }
  ],
  lodz: [
    { name: "Business Management (in English), BA", tuitionAmount: 2500, tuitionCurrency: "EUR", tuitionPeriod: "per year", academicYear: "2026/2027", applicationDeadline: "13 July 2026", deadlineNote: "International IRK deadline for candidates without Polish citizenship; no rolling deadline was listed.", sourceUrl: "https://www.rekrutacja.uni.lodz.pl/en-gb/offer/WYZSZE2026C/programme/DLBMa_08/?from=field:BM" },
    { name: "International Marketing, BA", tuitionAmount: 2900, tuitionCurrency: "EUR", tuitionPeriod: "per year", academicYear: "2026/2027", applicationDeadline: "14 September 2026", deadlineNote: "Late international IRK deadline for candidates without Polish citizenship; no rolling deadline was listed.", sourceUrl: "https://www.rekrutacja.uni.lodz.pl/en-gb/offer/WYZSZE2026C/programme/DLIMa_13/?from=registration:WYZSZE2026C" },
    { name: "Business and Digital Analytics, MSc", tuitionAmount: 2500, tuitionCurrency: "EUR", tuitionPeriod: "per year", academicYear: "2026/2027", applicationDeadline: "20 July 2026", deadlineNote: "International IRK deadline for candidates without Polish citizenship; no rolling deadline was listed.", sourceUrl: "https://www.rekrutacja.uni.lodz.pl/en-gb/offer/WYZSZE2026C/programme/DUBDAa_08/?from=registration:WYZSZE2026C" }
  ],
  northampton: [
    { name: "International Business Management MSc", tuitionAmount: 19e3, tuitionCurrency: "GBP", tuitionPeriod: "per academic year", academicYear: "2026/27 January intake", applicationDeadline: "Rolling; may close at short notice", deadlineNote: "January 2027 processing is open; last arrival and enrolment is 22 February 2027. Courses may close once full.", sourceUrl: "https://www.northampton.ac.uk/courses/international-business-management-msc/" },
    { name: "Business Analytics MSc", tuitionAmount: 19e3, tuitionCurrency: "GBP", tuitionPeriod: "per academic year", academicYear: "2026/27 January intake", applicationDeadline: "Rolling; may close at short notice", deadlineNote: "January 2027 processing is open; last arrival and enrolment is 22 February 2027. Courses may close once full.", sourceUrl: "https://www.northampton.ac.uk/courses/business-analytics-msc/" },
    { name: "Master of Business Administration MBA", tuitionAmount: 19500, tuitionCurrency: "GBP", tuitionPeriod: "per academic year", academicYear: "2026/27 January intake", applicationDeadline: "Rolling; may close at short notice", deadlineNote: "January 2027 processing is open; last arrival and enrolment is 22 February 2027. Courses may close once full.", sourceUrl: "https://www.northampton.ac.uk/courses/master-of-business-administration-mba/" }
  ],
  apu: [
    { name: "BSc (Hons) Computer Science (Cyber Security)", tuitionAmount: 108500, tuitionCurrency: "MYR", tuitionPeriod: "total for 3 years", academicYear: "2026 intake", applicationDeadline: "29 September 2026 (recommended 8-week cutoff)", deadlineNote: "APU recommends complete international applications at least 8 weeks before the 24 November 2026 intake for visa processing; 29 September is a derived planning date, not a fixed university cutoff.", sourceUrl: "https://www.apu.edu.my/course/bsc-hons-in-computer-science-cyber-security" },
    { name: "MSc Data Science and Business Analytics", tuitionAmount: 45800, tuitionCurrency: "MYR", tuitionPeriod: "total full-time programme", academicYear: "2026 intake", applicationDeadline: "5 October 2026 (recommended 8-week cutoff)", deadlineNote: "APU recommends complete international applications at least 8 weeks before the 30 November 2026 intake for visa processing; 5 October is a derived planning date, not a fixed university cutoff.", sourceUrl: "https://www.apu.edu.my/course/msc-in-data-science-and-business-analytics" }
  ]
};
var seedUniversities = [
  { id: 1, name: "University of Debrecen", country: "Hungary", city: "Debrecen", tuition: 7500, total: 7500, subjects: ["Medicine", "Engineering", "Business"], programs: verifiedPrograms.debrecen.map((item) => item.name), programDetails: verifiedPrograms.debrecen, language: "English", source: "Official University of Debrecen pages" },
  { id: 2, name: "Suleyman Demirel University", country: "Turkey", city: "Isparta", tuition: 38599, total: 38599, subjects: ["Computer Science", "Design", "Health"], programs: verifiedPrograms.sdu.map((item) => item.name), programDetails: verifiedPrograms.sdu, language: "English / Turkish", source: "Official SDU fee and admissions pages" },
  { id: 3, name: "University of P\xE9cs", country: "Hungary", city: "P\xE9cs", tuition: 2500, total: 4e3, subjects: ["Medicine", "Arts", "Psychology"], programs: verifiedPrograms.pecs.map((item) => item.name), programDetails: verifiedPrograms.pecs, language: "English", source: "Official University of P\xE9cs course pages" },
  { id: 4, name: "University of Lodz", country: "Poland", city: "Lodz", tuition: 2500, total: 2900, subjects: ["Business", "Economics", "Data"], programs: verifiedPrograms.lodz.map((item) => item.name), programDetails: verifiedPrograms.lodz, language: "English", source: "Official University of Lodz IRK pages" },
  { id: 5, name: "University of Northampton", country: "United Kingdom", city: "Northampton", tuition: 19e3, total: 19e3, subjects: ["Business", "Computing", "Education"], programs: verifiedPrograms.northampton.map((item) => item.name), programDetails: verifiedPrograms.northampton, language: "English", source: "Official University of Northampton pages" },
  { id: 6, name: "Asia Pacific University", country: "Malaysia", city: "Kuala Lumpur", tuition: 45800, total: 108500, subjects: ["Technology", "Cybersecurity", "Business"], programs: verifiedPrograms.apu.map((item) => item.name), programDetails: verifiedPrograms.apu, language: "English", source: "Official APU course and fee pages" }
];
var countryHints = {
  Hungary: ["Medicine", "Engineering", "Business"],
  Turkey: ["Computer Science", "Design", "Health"],
  Poland: ["Business", "Economics", "Data"],
  "United Kingdom": ["Business", "Computing", "Education"],
  Malaysia: ["Technology", "Cybersecurity", "Business"],
  Germany: ["Engineering", "Computer Science", "Economics"],
  "United Arab Emirates": ["Business", "Engineering", "Media"]
};
var arabicTermMap = {
  "\u0637\u0628": ["medicine", "health"],
  "\u0647\u0646\u062F\u0633\u0629": ["engineering"],
  "\u062D\u0627\u0633\u0648\u0628": ["computer science", "computing", "technology"],
  "\u0628\u0631\u0645\u062C\u0629": ["computer science", "technology"],
  "\u0623\u0639\u0645\u0627\u0644": ["business"],
  "\u0627\u0642\u062A\u0635\u0627\u062F": ["economics"],
  "\u062A\u0635\u0645\u064A\u0645": ["design"],
  "\u0639\u0644\u0648\u0645": ["science", "data"],
  "\u0623\u0644\u0645\u0627\u0646\u064A\u0627": ["germany"],
  "\u062A\u0631\u0643\u064A\u0627": ["turkey"],
  "\u0647\u0646\u063A\u0627\u0631\u064A\u0627": ["hungary"],
  "\u0627\u0644\u0645\u062C\u0631": ["hungary"],
  "\u0628\u0648\u0644\u0646\u062F\u0627": ["poland"],
  "\u0645\u0627\u0644\u064A\u0632\u064A\u0627": ["malaysia"],
  "\u0628\u0631\u064A\u0637\u0627\u0646\u064A\u0627": ["united kingdom"],
  "\u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A": ["united arab emirates"],
  "\u062F\u0648\u0644\u0627\u0631": ["usd"]
};
function normalizeLiveUniversity(raw, id) {
  const seed = seedUniversities.find((item) => item.name.toLowerCase() === raw.name.toLowerCase());
  const subjects = seed?.subjects ? [...seed.subjects] : countryHints[raw.country] ?? ["Business", "Engineering", "Computer Science"];
  const programs = seed?.programs ? [...seed.programs] : subjects.map((subject) => `${subject} degree`);
  const estimatedTuition = seed?.tuition ?? (raw.country === "United Kingdom" ? 12500 : raw.country === "Germany" ? 4200 : 6800);
  const website = raw.web_pages?.[0];
  return { id, name: raw.name, country: raw.country, city: raw.name, tuition: estimatedTuition, total: estimatedTuition + 4200, subjects, programs, programDetails: seed?.programDetails, language: raw.country === "Turkey" ? "English / Turkish" : "English", source: seed?.source ?? "HipoLabs live directory", domain: raw.domains?.[0], website };
}
async function fetchLiveDirectory(countries) {
  const selected = countries.length ? countries : [...supportedCountries];
  const responses = await Promise.all(selected.slice(0, 7).map(async (country) => {
    try {
      const response = await fetch(`${LIVE_SOURCE}?country=${encodeURIComponent(country)}`, { signal: AbortSignal.timeout(2800) });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.warn(`[EduPath live directory] Could not load ${country}`, error);
      return [];
    }
  }));
  const records = responses.flatMap((data, countryIndex) => data.slice(0, 10).map((university, index) => normalizeLiveUniversity(university, 100 + countryIndex * 10 + index)));
  const merged = [...seedUniversities, ...records.filter((record) => !seedUniversities.some((seed) => seed.name.toLowerCase() === record.name.toLowerCase()))];
  return merged.slice(0, 42);
}
var aiSearchOutput = {
  type: "json_schema",
  json_schema: {
    name: "edupath_search_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        universityIds: { type: "array", items: { type: "integer" } },
        summary: { type: "string" },
        interpretedBudget: { type: ["integer", "null"] },
        interpretedCountry: { type: ["string", "null"] },
        interpretedSubject: { type: ["string", "null"] }
      },
      required: ["universityIds", "summary", "interpretedBudget", "interpretedCountry", "interpretedSubject"],
      additionalProperties: false
    }
  }
};
function heuristicSearch(query, catalog = seedUniversities) {
  const normalized = query.toLowerCase();
  const expanded = Object.entries(arabicTermMap).reduce((text2, [term, translations]) => text2.replaceAll(term, `${term} ${translations.join(" ")}`), normalized);
  const budgetMatch = expanded.match(/(?:under|below|less than|budget of)\s*\$?\s*(\d[\d,]*)/);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : null;
  const matches = catalog.filter((university) => {
    const text2 = `${university.name} ${university.country} ${university.city} ${university.subjects.join(" ")} ${university.programs.join(" ")}`.toLowerCase();
    return text2.includes(expanded) || (budget ? university.total <= budget : false) || university.subjects.some((subject) => expanded.includes(subject.toLowerCase())) || university.programs.some((program) => expanded.includes(program.toLowerCase()));
  });
  const selected = matches.length ? matches : catalog;
  const isArabic = /[\u0600-\u06FF]/.test(query);
  return { universityIds: selected.map((university) => university.id), summary: matches.length ? isArabic ? `\u0648\u062C\u062F\u062A ${matches.length} \u062E\u064A\u0627\u0631\u0627\u062A \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0628\u062D\u062B\u0643.` : `I found ${matches.length} options that fit your search.` : isArabic ? "\u0644\u0645 \u0623\u062C\u062F \u062A\u0637\u0627\u0628\u0642\u0627\u064B \u062F\u0642\u064A\u0642\u0627\u064B\u060C \u0644\u0630\u0644\u0643 \u0623\u0639\u0631\u0636 \u0644\u0643 \u0627\u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u0643\u0627\u0645\u0644." : "I could not find an exact match, so I am showing the full directory to help you explore.", interpretedBudget: budget, interpretedCountry: null, interpretedSubject: null };
}
async function interpretSearch(query, catalog) {
  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are EduPath's bilingual university and program search assistant. Match the student's request only to catalog IDs provided. Understand Arabic and English. Match program names and subjects, not just university names. Never invent a university. If the query is Arabic, answer the summary in Arabic. If a budget is implied, use the total estimated annual cost." },
        { role: "user", content: `Student request: ${query}

Catalog:
${JSON.stringify(catalog)}` }
      ],
      response_format: aiSearchOutput,
      reasoning: { effort: "minimal" }
    });
    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!parsed || !Array.isArray(parsed.universityIds)) throw new Error("Invalid search response");
    const validIds = new Set(catalog.map((university) => university.id));
    return { ...parsed, universityIds: parsed.universityIds.filter((id) => validIds.has(id)) };
  } catch (error) {
    console.warn("[EduPath AI search] Falling back to bilingual heuristic search", error);
    return heuristicSearch(query, catalog);
  }
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  university: router({
    directory: publicProcedure.input(z2.object({ countries: z2.array(z2.string()).optional() }).optional()).query(({ input }) => fetchLiveDirectory(input?.countries ?? [])),
    aiSearch: publicProcedure.input(z2.object({ query: z2.string().trim().min(2).max(240), catalog: z2.array(z2.object({ id: z2.number(), name: z2.string(), country: z2.string(), city: z2.string(), tuition: z2.number(), total: z2.number(), subjects: z2.array(z2.string()), programs: z2.array(z2.string()), language: z2.string(), source: z2.string(), domain: z2.string().optional(), website: z2.string().optional() })).optional() })).mutation(({ input }) => interpretSearch(input.query, input.catalog?.length ? input.catalog : [...seedUniversities]))
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
