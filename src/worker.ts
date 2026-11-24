import handler, {
	createScheduledHandler,
	EmDashRoom,
	EmDashRoomSite,
	PluginBridge,
} from "@emdash-cms/cloudflare/worker";
import { pingHeartbeat } from "@adapters/heartbeat";

export { EmDashRoom, EmDashRoomSite, PluginBridge };

const scheduled = createScheduledHandler();

export default {
	...handler,
	async scheduled(controller, env, ctx) {
		// A run that throws skips the ping, so Checkly alerts when scheduling stops working.
		await scheduled(controller, env, ctx);
		ctx.waitUntil(
			pingHeartbeat(
				Reflect.get(env, "CHECKLY_HEARTBEAT_URL"),
				controller.scheduledTime,
				async (url) => fetch(url),
			),
		);
	},
} satisfies ExportedHandler<Env>;
