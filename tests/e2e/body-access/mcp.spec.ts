import type { APIRequestContext, APIResponse } from "@playwright/test";
import { NEWS, createNews, data, expect, expectDenied, test, unique } from "../body-access";
import { BODY_NAMES } from "../roles";

const TOOLS_LIST = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
const MCP_HEADERS = { Accept: "application/json, text/event-stream" };
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** OAuth answers carry their fields at the top level; EmDash wraps some in `data`. */
async function field(response: APIResponse, key: string): Promise<string> {
	const body: unknown = await response.json();
	const value: unknown =
		Reflect.get(Object(body), key) ?? Reflect.get(Object(Reflect.get(Object(body), "data")), key);
	expect(typeof value, `${key} in ${response.status()} ${JSON.stringify(body)}`).toBe("string");
	return String(value);
}

/** A bearer token for the signed-in `client`, through the device flow an MCP client uses. */
async function bearer(client: APIRequestContext): Promise<string> {
	const code = await client.post("/_emdash/api/oauth/device/code", { data: {} });
	const userCode = await field(code, "user_code");
	await data(
		client.post("/_emdash/api/oauth/device/authorize", {
			data: { user_code: userCode, action: "approve" },
		}),
	);
	const token = await client.post("/_emdash/api/oauth/device/token", {
		data: {
			device_code: await field(code, "device_code"),
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		},
	});
	return field(token, "access_token");
}

test.describe("MCP (ADR-002)", () => {
	test("is refused to an Editor holding a valid token, and serves an Admin", async ({
		as,
		playwright,
		baseURL,
	}) => {
		const anonymous = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
		const call = async (token: string) =>
			anonymous.post("/_emdash/api/mcp", {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/json, text/event-stream",
				},
				data: TOOLS_LIST,
			});
		await expectDenied(call(await bearer(await as("blue-lodge"))), "cannot use the MCP endpoint");
		const admin = await call(await bearer(await as("admin")));
		expect(admin.status(), await admin.text()).toBe(200);
		await anonymous.dispose();
	});

	test("@redteam an Editor's self-minted token, from public client registration and the device flow, keeps the Editor's bodies", async ({
		as,
		bodies,
		playwright,
		baseURL,
	}) => {
		const anonymous = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
		const registered = await anonymous.post("/_emdash/api/oauth/register", {
			data: {
				client_name: unique("editor-cli"),
				redirect_uris: ["http://127.0.0.1:8976/callback"],
				grant_types: [DEVICE_GRANT],
				token_endpoint_auth_method: "none",
			},
		});
		expect(registered.status(), await registered.text()).toBe(201);
		const code = await anonymous.post("/_emdash/api/oauth/device/code", {
			data: { client_id: await field(registered, "client_id") },
		});
		await data(
			(await as("blue-lodge")).post("/_emdash/api/oauth/device/authorize", {
				data: { user_code: await field(code, "user_code"), action: "approve" },
			}),
		);
		const token = await anonymous.post("/_emdash/api/oauth/token", {
			data: { grant_type: DEVICE_GRANT, device_code: await field(code, "device_code") },
		});
		const minted = await playwright.request.newContext({
			baseURL,
			ignoreHTTPSErrors: true,
			extraHTTPHeaders: { Authorization: `Bearer ${await field(token, "access_token")}` },
		});

		await createNews(minted, bodies["blue-lodge"]);
		const chapterNews = await createNews(await as("chapter"), bodies.chapter);
		await expectDenied(
			minted.put(`${NEWS}/${chapterNews}`, { data: { data: { title: "Via a minted token" } } }),
			BODY_NAMES.chapter,
		);
		await expectDenied(
			minted.post("/_emdash/api/mcp", { headers: MCP_HEADERS, data: TOOLS_LIST }),
			"cannot use the MCP endpoint",
		);
		await Promise.all([anonymous.dispose(), minted.dispose()]);
	});
});
