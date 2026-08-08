import { createHash, randomBytes } from "crypto";

const SKYLIGHT_BASE = "https://app.ourskylight.com";
const SKYLIGHT_FRAME_ID = "5519401";
const SKYLIGHT_EMAIL = "marisolpinilla@hotmail.com";
const SKYLIGHT_PASSWORD = "Bera8484!!";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const API_UA = "calendario-marisol-skylight/1.0";

export type SkylightTask = {
  id: string;
  summary: string;
  emoji_icon: string | null;
  routine: boolean;
  reward_points: number | null;
};

type TokenCache = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

class CookieJar {
  private cookies = new Map<string, string>();

  ingest(setCookie: string | null) {
    if (!setCookie) return;
    for (const part of setCookie.split(/,(?=\s*[^;]+=[^;]+)/)) {
      const [pair] = part.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function authFetch(
  url: string,
  opts: RequestInit & { jar?: CookieJar } = {},
): Promise<Response> {
  const jar = opts.jar ?? new CookieJar();
  const headers = new Headers(opts.headers);
  headers.set("User-Agent", BROWSER_UA);
  const cookie = jar.header();
  if (cookie) headers.set("Cookie", cookie);
  const resp = await fetch(url, { ...opts, headers, redirect: "manual" });
  for (const c of resp.headers.getSetCookie?.() ?? []) jar.ingest(c);
  jar.ingest(resp.headers.get("set-cookie"));
  return resp;
}

async function followRedirects(resp: Response, jar: CookieJar): Promise<Response> {
  let hops = 0;
  while ([301, 302, 303, 307, 308].includes(resp.status) && hops < 10) {
    const loc = resp.headers.get("location");
    if (!loc || loc.startsWith("skylight-family:")) break;
    resp = await authFetch(loc.startsWith("http") ? loc : SKYLIGHT_BASE + loc, { jar });
    hops++;
  }
  return resp;
}

async function chaseSkylightRedirect(resp: Response, jar: CookieJar): Promise<string | null> {
  let loc = resp.headers.get("location");
  let hops = 0;
  while (loc && !loc.startsWith("skylight-family:") && hops < 8) {
    resp = await authFetch(loc.startsWith("http") ? loc : SKYLIGHT_BASE + loc, { jar });
    loc = resp.headers.get("location");
    hops++;
  }
  return loc;
}

async function oauthLogin(): Promise<TokenCache> {
  const jar = new CookieJar();
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(18));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "skylight-mobile",
    redirect_uri: "skylight-family://welcome",
    scope: "everything",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
  });

  let resp = await authFetch(`${SKYLIGHT_BASE}/oauth/authorize?${params}`, { jar });
  resp = await followRedirects(resp, jar);
  const html = await resp.text();
  const csrf = html.match(/name="authenticity_token"[^>]*value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error("Skylight: no se pudo obtener CSRF");

  resp = await authFetch(`${SKYLIGHT_BASE}/auth/session`, {
    method: "POST",
    jar,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      authenticity_token: csrf,
      email: SKYLIGHT_EMAIL,
      password: SKYLIGHT_PASSWORD,
    }),
  });

  const location = await chaseSkylightRedirect(resp, jar);
  if (!location?.startsWith("skylight-family:")) {
    throw new Error("Skylight: credenciales inválidas");
  }
  const parsed = new URL(location);
  if (parsed.searchParams.get("state") !== state) {
    throw new Error("Skylight: state OAuth inválido");
  }
  const code = parsed.searchParams.get("code");
  if (!code) throw new Error("Skylight: código OAuth ausente");

  const tokenResp = await authFetch(`${SKYLIGHT_BASE}/oauth/token`, {
    method: "POST",
    jar,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "skylight-mobile",
      code,
      redirect_uri: "skylight-family://welcome",
      code_verifier: verifier,
    }),
  });
  const payload = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    created_at?: number;
  };
  if (!payload.access_token) {
    throw new Error("Skylight: token ausente");
  }
  const created = payload.created_at ?? Math.floor(Date.now() / 1000);
  const expiresIn = payload.expires_in ?? 7200;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: (created + expiresIn) * 1000,
  };
}

async function oauthRefresh(refreshToken: string): Promise<TokenCache> {
  const resp = await fetch(`${SKYLIGHT_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "skylight-mobile",
      refresh_token: refreshToken,
    }),
  });
  const payload = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    created_at?: number;
  };
  if (!payload.access_token) {
    throw new Error("Skylight: refresh falló");
  }
  const created = payload.created_at ?? Math.floor(Date.now() / 1000);
  const expiresIn = payload.expires_in ?? 7200;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: (created + expiresIn) * 1000,
  };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }
  if (tokenCache?.refreshToken) {
    try {
      tokenCache = await oauthRefresh(tokenCache.refreshToken);
      return tokenCache.accessToken;
    } catch {
      tokenCache = null;
    }
  }
  tokenCache = await oauthLogin();
  return tokenCache.accessToken;
}

async function skylightApi<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken();
  const resp = await fetch(`${SKYLIGHT_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": API_UA,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) {
    tokenCache = null;
    return skylightApi(method, path, body);
  }
  const text = await resp.text();
  if (!resp.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { errors?: unknown };
      msg = JSON.stringify(parsed.errors ?? parsed);
    } catch {
      /* raw */
    }
    throw new Error(`Skylight ${resp.status}: ${msg}`);
  }
  if (resp.status === 204 || !text) return undefined as T;
  return JSON.parse(text) as T;
}

function parseTask(row: {
  id: string;
  attributes?: Record<string, unknown>;
}): SkylightTask {
  const a = row.attributes ?? {};
  return {
    id: String(row.id),
    summary: String(a.summary ?? ""),
    emoji_icon: a.emoji_icon == null ? null : String(a.emoji_icon),
    routine: Boolean(a.routine),
    reward_points:
      a.reward_points == null ? null : Number(a.reward_points),
  };
}

export async function listSkylightTasks(): Promise<SkylightTask[]> {
  const data = await skylightApi<{ data?: Array<{ id: string; attributes?: Record<string, unknown> }> }>(
    "GET",
    `/api/frames/${SKYLIGHT_FRAME_ID}/task_box/items`,
  );
  return (data.data ?? []).map(parseTask);
}

export async function createSkylightTask(input: {
  summary: string;
  emoji_icon?: string;
  routine?: boolean;
  reward_points?: number;
}): Promise<SkylightTask> {
  const summary = input.summary.trim();
  if (!summary) throw new Error("summary requerido");
  const body: Record<string, unknown> = { summary };
  if (input.emoji_icon) body.emoji_icon = input.emoji_icon;
  if (input.routine != null) body.routine = input.routine;
  if (input.reward_points != null) body.reward_points = input.reward_points;
  const data = await skylightApi<{ data: { id: string; attributes?: Record<string, unknown> } }>(
    "POST",
    `/api/frames/${SKYLIGHT_FRAME_ID}/task_box/items`,
    body,
  );
  return parseTask(data.data);
}

export async function updateSkylightTask(
  id: string,
  patch: {
    summary?: string;
    emoji_icon?: string;
    routine?: boolean;
    reward_points?: number;
  },
): Promise<SkylightTask> {
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) {
    const summary = patch.summary.trim();
    if (!summary) throw new Error("summary vacío");
    body.summary = summary;
  }
  if (patch.emoji_icon !== undefined) body.emoji_icon = patch.emoji_icon;
  if (patch.routine !== undefined) body.routine = patch.routine;
  if (patch.reward_points !== undefined) body.reward_points = patch.reward_points;
  if (Object.keys(body).length === 0) throw new Error("Nada que actualizar");
  const data = await skylightApi<{ data: { id: string; attributes?: Record<string, unknown> } }>(
    "PATCH",
    `/api/frames/${SKYLIGHT_FRAME_ID}/task_box/items/${id}`,
    body,
  );
  return parseTask(data.data);
}

export async function deleteSkylightTask(id: string): Promise<void> {
  await skylightApi("DELETE", `/api/frames/${SKYLIGHT_FRAME_ID}/task_box/items/${id}`);
}

export type SkylightCalendarEventInput = {
  summary: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
};

export async function createSkylightCalendarEvent(
  input: SkylightCalendarEventInput,
): Promise<string> {
  const summary = input.summary.trim();
  if (!summary) throw new Error("summary requerido");
  const body: Record<string, unknown> = {
    summary,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    all_day: input.all_day ?? false,
  };
  if (input.description?.trim()) body.description = input.description.trim();
  const data = await skylightApi<{ data: { id: string } }>(
    "POST",
    `/api/frames/${SKYLIGHT_FRAME_ID}/calendar_events`,
    body,
  );
  return String(data.data.id);
}

export async function updateSkylightCalendarEvent(
  id: string,
  patch: Partial<SkylightCalendarEventInput>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) {
    const summary = patch.summary.trim();
    if (!summary) throw new Error("summary vacío");
    body.summary = summary;
  }
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.starts_at !== undefined) body.starts_at = patch.starts_at;
  if (patch.ends_at !== undefined) body.ends_at = patch.ends_at;
  if (patch.all_day !== undefined) body.all_day = patch.all_day;
  if (Object.keys(body).length === 0) throw new Error("Nada que actualizar");
  await skylightApi(
    "PUT",
    `/api/frames/${SKYLIGHT_FRAME_ID}/calendar_events/${id}`,
    body,
  );
}

export async function deleteSkylightCalendarEvent(id: string): Promise<void> {
  await skylightApi(
    "DELETE",
    `/api/frames/${SKYLIGHT_FRAME_ID}/calendar_events/${id}`,
  );
}

export type SkylightListKind = "shopping" | "to_do";

export type SkylightList = {
  id: string;
  label: string;
  kind: string;
  color: string;
  default_grocery_list: boolean;
};

export type SkylightListItem = {
  id: string;
  label: string;
  status: string;
  section: string | null;
  position: number | null;
};

const LIST_COLORS: Record<SkylightListKind, string> = {
  shopping: "#B6E085",
  to_do: "#A8D4D3",
};

function parseList(row: {
  id: string;
  attributes?: Record<string, unknown>;
}): SkylightList {
  const a = row.attributes ?? {};
  return {
    id: String(row.id),
    label: String(a.label ?? ""),
    kind: String(a.kind ?? ""),
    color: String(a.color ?? ""),
    default_grocery_list: Boolean(a.default_grocery_list),
  };
}

function parseListItem(row: {
  id: string;
  attributes?: Record<string, unknown>;
}): SkylightListItem {
  const a = row.attributes ?? {};
  return {
    id: String(row.id),
    label: String(a.label ?? ""),
    status: String(a.status ?? "pending"),
    section: a.section == null ? null : String(a.section),
    position: a.position == null ? null : Number(a.position),
  };
}

export async function listSkylightLists(): Promise<SkylightList[]> {
  const data = await skylightApi<{ data?: Array<{ id: string; attributes?: Record<string, unknown> }> }>(
    "GET",
    `/api/frames/${SKYLIGHT_FRAME_ID}/lists`,
  );
  return (data.data ?? []).map(parseList);
}

export async function resolveSkylightListId(input: {
  list_id?: string;
  list_name?: string;
  kind?: string;
}): Promise<string> {
  if (input.list_id?.trim()) return input.list_id.trim();
  const lists = await listSkylightLists();
  const name = input.list_name?.trim().toLowerCase();
  if (name) {
    const byName = lists.find((l) => l.label.toLowerCase() === name);
    if (byName) return byName.id;
    const partial = lists.find((l) => l.label.toLowerCase().includes(name));
    if (partial) return partial.id;
  }
  const kind = (input.kind?.trim() || "shopping") as SkylightListKind;
  const byKind = lists.find((l) => l.kind === kind);
  if (byKind) return byKind.id;
  throw new Error(`Lista no encontrada (${input.list_name || kind})`);
}

export async function createSkylightList(input: {
  label: string;
  kind?: SkylightListKind;
  color?: string;
}): Promise<SkylightList> {
  const label = input.label.trim();
  if (!label) throw new Error("label requerido");
  const kind = input.kind ?? "shopping";
  const color = input.color?.trim() || LIST_COLORS[kind];
  const data = await skylightApi<{ data: { id: string; attributes?: Record<string, unknown> } }>(
    "POST",
    `/api/frames/${SKYLIGHT_FRAME_ID}/lists`,
    { label, kind, color },
  );
  return parseList(data.data);
}

export async function listSkylightListItems(listId: string): Promise<SkylightListItem[]> {
  const data = await skylightApi<{ data?: Array<{ id: string; attributes?: Record<string, unknown> }> }>(
    "GET",
    `/api/frames/${SKYLIGHT_FRAME_ID}/lists/${listId}/list_items`,
  );
  return (data.data ?? []).map(parseListItem);
}

export async function addSkylightListItem(
  listId: string,
  input: { label: string; section?: string },
): Promise<SkylightListItem> {
  const label = input.label.trim();
  if (!label) throw new Error("label requerido");
  const body: Record<string, unknown> = { label };
  if (input.section?.trim()) body.section = input.section.trim();
  const data = await skylightApi<{ data: { id: string; attributes?: Record<string, unknown> } }>(
    "POST",
    `/api/frames/${SKYLIGHT_FRAME_ID}/lists/${listId}/list_items`,
    body,
  );
  return parseListItem(data.data);
}

export async function addSkylightListItems(
  listId: string,
  labels: string[],
): Promise<SkylightListItem[]> {
  const out: SkylightListItem[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    out.push(await addSkylightListItem(listId, { label }));
  }
  if (out.length === 0) throw new Error("items vacíos");
  return out;
}

export async function updateSkylightListItem(
  listId: string,
  itemId: string,
  patch: { label?: string; completed?: boolean },
): Promise<SkylightListItem> {
  const body: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw new Error("label vacío");
    body.label = label;
  }
  if (patch.completed !== undefined) {
    body.status = patch.completed ? "completed" : "pending";
  }
  if (Object.keys(body).length === 0) throw new Error("Nada que actualizar");
  const data = await skylightApi<{ data: { id: string; attributes?: Record<string, unknown> } }>(
    "PUT",
    `/api/frames/${SKYLIGHT_FRAME_ID}/lists/${listId}/list_items/${itemId}`,
    body,
  );
  return parseListItem(data.data);
}

export async function deleteSkylightListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  await skylightApi(
    "DELETE",
    `/api/frames/${SKYLIGHT_FRAME_ID}/lists/${listId}/list_items/${itemId}`,
  );
}

export async function deleteSkylightList(listId: string): Promise<void> {
  await skylightApi("DELETE", `/api/frames/${SKYLIGHT_FRAME_ID}/lists/${listId}`);
}
