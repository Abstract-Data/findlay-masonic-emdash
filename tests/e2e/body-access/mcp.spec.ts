import type { APIRequestContext, APIResponse } from "@playwright/test";
import { data, expect, expectDenied, test } from "../body-access";

const TOOLS_LIST = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

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
});
