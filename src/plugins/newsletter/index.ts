import { ISSUES } from "@adapters/newsletter/issues";
import { definePlugin } from "emdash";
import { routes } from "./routes";
import { registersEmailTransport, runtime } from "./runtime";
import { transport } from "./transport";

const EMAIL_TRANSPORT = {
	"email:deliver": {
		exclusive: true,
		timeout: 15_000,
		handler: transport(async () => {
			const { mailer, config } = await runtime();
			return { mailer, from: config.from };
		}),
	},
} as const;

/**
 * Native EmDash plugin for the quarterly newsletter (spec FR-6, FR-7, FR-8.1): issue storage,
 * Admin routes to build, test and approve an issue, the public signup route and the Resend
 * `email:deliver` transport. The Resend SDK is reached only through these server modules.
 */
export function createPlugin() {
	return definePlugin({
		id: ISSUES.pluginId,
		version: "1.0.0",
		capabilities: ["content:read", "hooks.email-transport:register"],
		storage: { [ISSUES.collection]: { indexes: ISSUES.indexes } },
		hooks: registersEmailTransport() ? EMAIL_TRANSPORT : {},
		routes,
		admin: {
			// A flag only: EmDash loads the module named by the descriptor's adminEntry.
			entry: "newsletter/admin",
			pages: [{ path: "/", label: "Newsletter", icon: "envelope" }],
		},
	});
}
