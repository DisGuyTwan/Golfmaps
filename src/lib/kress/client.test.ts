import { afterEach, describe, it, expect, vi } from "vitest";
import { KressApiError, KressClient } from "./client";
import { KRESS_API_VERSION } from "./config";

vi.mock("./oidc", () => ({
  refreshTokens: vi.fn(async () => ({ accessToken: "fresh", expiresAt: 0, refreshToken: "rt2" })),
}));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("KressClient", () => {
  it("sends the version and bearer headers and follows pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 1 }], 200, { "Pagination-Next-Token": "p2" }))
      .mockResolvedValueOnce(json([{ id: 2 }]));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KressClient({ accessToken: "t", expiresAt: 0, refreshToken: null }, () => {});
    expect(await client.getAll("/users")).toEqual([{ id: 1 }, { id: 2 }]);

    const [, first] = fetchMock.mock.calls[0];
    expect(first.headers["Accept-Version"]).toBe(KRESS_API_VERSION);
    expect(first.headers.Authorization).toBe("Bearer t");
    expect(fetchMock.mock.calls[1][1].headers["Pagination-Starting-Token"]).toBe("p2");
  });

  it("backs off and retries on 429", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new KressClient({ accessToken: "t", expiresAt: 0, refreshToken: null }, () => {});
    const pending = client.get("/x");
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("refreshes once on 401 and persists the new tokens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onRefresh = vi.fn();
    const client = new KressClient({ accessToken: "old", expiresAt: 0, refreshToken: "rt" }, onRefresh);

    expect(await client.get("/x")).toEqual({ ok: true });
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "fresh" }));
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
  });

  it("gives up with a 401 error when there is no refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    const client = new KressClient({ accessToken: "t", expiresAt: 0, refreshToken: null }, () => {});
    await expect(client.get("/x")).rejects.toMatchObject({ status: 401 });
    await expect(client.get("/x")).rejects.toBeInstanceOf(KressApiError);
  });
});
