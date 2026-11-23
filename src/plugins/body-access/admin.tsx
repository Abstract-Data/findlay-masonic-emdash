import { useEffect, useState, type ReactElement } from "react";

const API = "/_emdash/api/plugins/body-access";
const HEADERS = { "X-EmDash-Request": "1", "Content-Type": "application/json" };
const ADMIN_ROLE = 50;

interface Body {
	readonly id: string;
	readonly name: string;
}
interface User {
	readonly id: string;
	readonly name: string | null;
	readonly email: string;
	readonly role: number;
}
interface GrantList {
	readonly users: readonly User[];
	readonly bodies: readonly Body[];
	readonly grants: readonly { readonly userId: string; readonly bodyId: string }[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, { ...init, headers: HEADERS });
	const json: unknown = await response.json();
	if (!response.ok || typeof json !== "object" || json === null) {
		const error: unknown = json === null ? null : Reflect.get(Object(json), "error");
		const message: unknown = error === null ? null : Reflect.get(Object(error), "message");
		throw new Error(typeof message === "string" ? message : `Request failed (${response.status})`);
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- EmDash wraps plugin route results in { data }.
	return Reflect.get(json, "data") as T;
}

function useRole(): number | null | "error" {
	const [role, setRole] = useState<number | null | "error">(null);
	useEffect(() => {
		api<{ role: number }>("/_emdash/api/auth/me").then(
			(me) => setRole(me.role),
			() => setRole("error"),
		);
	}, []);
	return role;
}

function GrantRow(props: {
	user: User;
	bodies: readonly Body[];
	initial: ReadonlySet<string>;
}): ReactElement {
	const { user, bodies, initial } = props;
	const [selected, setSelected] = useState(() => new Set(initial));
	const [status, setStatus] = useState("");
	const label = user.name ?? user.email;
	const toggle = (body: string) =>
		setSelected((current) => {
			const next = new Set(current);
			if (!next.delete(body)) next.add(body);
			return next;
		});
	const save = () => {
		setStatus("Saving…");
		api(`${API}/grants/set`, {
			method: "POST",
			body: JSON.stringify({ userId: user.id, bodyIds: [...selected] }),
		}).then(
			() => setStatus("Saved"),
			(error: unknown) => setStatus(error instanceof Error ? error.message : "Not saved"),
		);
	};
	return (
		<tr data-testid={`grants-${user.email}`}>
			<th scope="row">
				{label}
				<br />
				<small>{user.role >= ADMIN_ROLE ? "Admin (all bodies)" : user.email}</small>
			</th>
			{bodies.map((body) => (
				<td key={body.id}>
					<input
						type="checkbox"
						aria-label={`${body.name} for ${label}`}
						checked={selected.has(body.id)}
						onChange={() => toggle(body.id)}
					/>
				</td>
			))}
			<td>
				<button type="button" onClick={save}>
					Save
				</button>{" "}
				<span role="status">{status}</span>
			</td>
		</tr>
	);
}

function BodyAccessPage(): ReactElement {
	const role = useRole();
	const [list, setList] = useState<GrantList | "error" | null>(null);
	const isAdmin = typeof role === "number" && role >= ADMIN_ROLE;
	useEffect(() => {
		if (!isAdmin) return;
		api<GrantList>(`${API}/grants/list`).then(setList, () => setList("error"));
	}, [isAdmin]);

	if (role === null) return <p>Loading…</p>;
	if (!isAdmin) {
		return (
			<section data-testid="body-access-denied">
				<h1>Body Access</h1>
				<p>Only Temple administrators can manage body access.</p>
			</section>
		);
	}
	if (list === null) return <p>Loading…</p>;
	if (list === "error") return <p role="alert">The grants could not be loaded.</p>;
	const grantsByUser = new Map<string, Set<string>>();
	for (const grant of list.grants) {
		const held = grantsByUser.get(grant.userId) ?? new Set<string>();
		held.add(grant.bodyId);
		grantsByUser.set(grant.userId, held);
	}
	return (
		<section data-testid="body-access">
			<h1>Body Access</h1>
			<p>
				Tick the bodies each editor maintains, then save that row. An editor can write only their
				bodies' officers, events and news. Admins can write every body.
			</p>
			<table>
				<caption>Body grants by user</caption>
				<thead>
					<tr>
						<th scope="col">User</th>
						{list.bodies.map((body) => (
							<th scope="col" key={body.id}>
								{body.name}
							</th>
						))}
						<th scope="col">Save</th>
					</tr>
				</thead>
				<tbody>
					{list.users.map((user) => (
						<GrantRow
							key={user.id}
							user={user}
							bodies={list.bodies}
							initial={grantsByUser.get(user.id) ?? new Set()}
						/>
					))}
				</tbody>
			</table>
		</section>
	);
}

interface FieldProps {
	readonly value: unknown;
	readonly onChange: (value: unknown) => void;
	readonly label: string;
	readonly id: string;
	readonly required?: boolean;
}

/** The `body` field: the bodies the editor may write, plus the entry's current body. */
function BodyField(props: FieldProps): ReactElement {
	const { value, onChange, label, id, required } = props;
	const [bodies, setBodies] = useState<readonly (Body & { granted: boolean })[] | null>(null);
	const current = typeof value === "string" ? value : "";
	useEffect(() => {
		api<{ bodies: (Body & { granted: boolean })[] }>(`${API}/my-bodies`).then(
			(result) => setBodies(result.bodies),
			() => setBodies([]),
		);
	}, []);
	const granted = bodies?.filter((body) => body.granted) ?? [];
	const only = granted.length === 1 ? granted[0] : undefined;
	useEffect(() => {
		if (current === "" && only !== undefined) onChange(only.id);
	}, [current, only, onChange]);
	const options = bodies?.filter((body) => body.granted || body.id === current) ?? [];
	return (
		<div>
			<label htmlFor={id}>{label}</label>
			<select
				id={id}
				data-testid="body-field"
				required={required}
				value={current}
				onChange={(event) => onChange(event.target.value)}
			>
				<option value="">Choose a body</option>
				{options.map((body) => (
					<option key={body.id} value={body.id}>
						{body.granted ? body.name : `${body.name} (no grant)`}
					</option>
				))}
			</select>
		</div>
	);
}

export const pages = { "/": BodyAccessPage };
export const fields = { body: BodyField };
