import type { BodyType } from "../acl/officer-titles";

const SHORT_NAME: Readonly<Record<BodyType, string>> = {
	"Blue Lodge": "Lodge",
	Chapter: "Chapter",
	Council: "Council",
	Commandery: "Commandery",
	"Order of the Eastern Star": "Eastern Star",
	"Temple Board": "Temple Board",
};

/** "Findlay Lodge No. 227" */
export function displayName(name: string, number: number | null): string {
	return number === null ? name : `${name} No. ${number}`;
}

/** FR-4.4's text label on calendars and news lists: "Lodge 227", "Temple Board". */
export function shortLabel(bodyType: BodyType | null, name: string, number: number | null): string {
	if (bodyType === null) return displayName(name, number);
	return number === null ? SHORT_NAME[bodyType] : `${SHORT_NAME[bodyType]} ${number}`;
}
