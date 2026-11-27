import type { EmDashCollections } from "emdash";
import { describe, expectTypeOf, it } from "vitest";
import type { BodyType } from "@core/acl/officer-titles";

// Type-level: `pnpm astro check` fails if emdash-env.d.ts drifts from the seed.
describe("generated collection types (T1.9)", () => {
	it("exposes the body reference and the fields M2 reads", () => {
		expectTypeOf<EmDashCollections["officers"]["body"]>().toEqualTypeOf<string>();
		expectTypeOf<EmDashCollections["officers"]["term_year"]>().toEqualTypeOf<number>();
		expectTypeOf<EmDashCollections["events"]["body"]>().toEqualTypeOf<string>();
		expectTypeOf<EmDashCollections["events"]["rrule"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<EmDashCollections["news"]["body"]>().toEqualTypeOf<string>();
		expectTypeOf<EmDashCollections["news"]["include_in_newsletter"]>().toEqualTypeOf<
			boolean | undefined
		>();
	});

	it("types body_type as exactly the title table's keys", () => {
		expectTypeOf<EmDashCollections["bodies"]["body_type"]>().toEqualTypeOf<BodyType>();
	});
});
