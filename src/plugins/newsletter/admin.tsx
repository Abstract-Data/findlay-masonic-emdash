import "@react-email/editor/themes/default.css";
import { EmailEditor, type EmailEditorProps, type EmailEditorRef } from "@react-email/editor";
import { composeReactEmail } from "@react-email/editor/core";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { emailExtensions } from "./email-nodes";
import type { IssueView } from "./service";

const API = "/_emdash/api/plugins/newsletter";
const HEADERS = { "X-EmDash-Request": "1", "Content-Type": "application/json" };
const ADMIN_ROLE = 50;

class ApiError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
	}
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, { ...init, headers: HEADERS });
	const json: unknown = await response.json();
	if (!response.ok || typeof json !== "object" || json === null) {
		const error: unknown = json === null ? null : Reflect.get(Object(json), "error");
		const message: unknown = error === null ? null : Reflect.get(Object(error), "message");
		const code: unknown = error === null ? null : Reflect.get(Object(error), "code");
		throw new ApiError(
			typeof message === "string" ? message : `Request failed (${response.status})`,
			typeof code === "string" ? code : "UNKNOWN",
		);
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- EmDash wraps plugin route results in { data }.
	return Reflect.get(json, "data") as T;
}

const post = async <T,>(path: string, body: unknown) =>
	api<T>(`${API}/${path}`, { method: "POST", body: JSON.stringify(body) });

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Request failed.");

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

const STATUS_TEXT: Readonly<Record<IssueView["status"], string>> = {
	draft: "Draft",
	creating: "Sending",
	scheduled: "Scheduled",
	sent: "Sent",
};

const day = (iso: string) => new Date(iso).toLocaleDateString();

/** The body sections of a saved document, in order (FR-6.1). */
function sectionHeadings(doc: unknown): string[] {
	const content: unknown =
		typeof doc === "object" && doc !== null ? Reflect.get(doc, "content") : [];
	const nodes: unknown[] = Array.isArray(content) ? content : [];
	return nodes.flatMap((node: unknown): string[] => {
		if (typeof node !== "object" || node === null) return [];
		const attrs: unknown = Reflect.get(node, "attrs");
		const heading: unknown =
			typeof attrs === "object" && attrs !== null ? Reflect.get(attrs, "heading") : null;
		if (Reflect.get(node, "type") === "bodySection" && typeof heading === "string")
			return [heading];
		return sectionHeadings(node);
	});
}

function IssueEditor(props: { initial: IssueView; onClose: () => void }): ReactElement {
	const [issue, setIssue] = useState(props.initial);
	const [loaded, setLoaded] = useState(0);
	const [subject, setSubject] = useState(issue.subject);
	const [previewText, setPreviewText] = useState(issue.previewText);
	// An issue never saved from the editor has no composed email to test or send yet.
	const [dirty, setDirty] = useState(!issue.composed);
	const [busy, setBusy] = useState(false);
	const [sendAt, setSendAt] = useState("");
	const [status, setStatus] = useState("");
	const editor = useRef<EmailEditorRef>(null);
	const extensions = useMemo(() => emailExtensions(), []);
	const isDraft = issue.status === "draft";
	const tested = issue.testedRevision === issue.revision;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stored document is the editor's own getJSON().
	const content = issue.doc as unknown as EmailEditorProps["content"];

	const run = async (work: () => Promise<string>) => {
		setBusy(true);
		try {
			setStatus(await work());
		} catch (error) {
			setStatus(messageOf(error));
			if (error instanceof ApiError && error.code === "EVENTS_CHANGED") await reload();
		} finally {
			setBusy(false);
		}
	};

	const reload = async () => {
		const fresh = await api<IssueView>(`${API}/issues/get?id=${encodeURIComponent(issue.id)}`);
		setIssue(fresh);
		setSubject(fresh.subject);
		setPreviewText(fresh.previewText);
		setDirty(!fresh.composed);
		setLoaded((n) => n + 1);
	};

	const save = async () => {
		const ref = editor.current;
		if (!ref?.editor) return "The editor is still loading.";
		const doc = ref.getJSON();
		const email = await composeReactEmail({
			editor: ref.editor,
			...(previewText === "" ? {} : { preview: previewText }),
			pretty: false,
		});
		const saved = await post<IssueView>("issues/save", {
			id: issue.id,
			revision: issue.revision,
			subject,
			previewText,
			doc,
			email: { html: email.unformattedHtml, text: email.text },
		});
		setIssue(saved);
		setDirty(false);
		return `Saved version ${saved.revision}.`;
	};

	const testSend = async () => {
		const sent = await post<IssueView & { sentTo: string[] }>("issues/test-send", {
			id: issue.id,
			revision: issue.revision,
		});
		setIssue(sent);
		return `Test sent to ${sent.sentTo.join(", ")}. Check it, then approve.`;
	};

	const approve = async () => {
		const approved = await post<IssueView>("issues/approve", {
			id: issue.id,
			revision: issue.revision,
			sendAt: sendAt === "" ? null : new Date(sendAt).toISOString(),
		});
		setIssue(approved);
		return approved.status === "scheduled" && approved.at !== null
			? `Scheduled for ${new Date(approved.at).toLocaleString()}.`
			: "Approved and sent to subscribers.";
	};

	const discard = async () => {
		await post("issues/discard", { id: issue.id });
		props.onClose();
		return "Draft discarded.";
	};

	const sections = sectionHeadings(issue.doc);
	return (
		<section data-testid="newsletter-issue" aria-labelledby="newsletter-issue-title">
			<h2 id="newsletter-issue-title">{issue.subject}</h2>
			<p data-testid="newsletter-issue-state">
				{STATUS_TEXT[issue.status]}, version {issue.revision}.{" "}
				{isDraft
					? tested
						? "Test sent for this version."
						: "Not test-sent since the last edit."
					: ""}
				{issue.slug !== null && issue.status === "sent" ? (
					<>
						{" "}
						<a href={`/newsletters/${issue.slug}`}>View in the archive</a>
					</>
				) : null}
			</p>
			<p>
				News published from {day(issue.coverage.from)} to {day(issue.coverage.to)}.
			</p>
			<h3>Body sections</h3>
			{sections.length === 0 ? (
				<p>No body has news or upcoming events for this issue.</p>
			) : (
				<ol data-testid="newsletter-sections">
					{sections.map((heading) => (
						<li key={heading}>{heading}</li>
					))}
				</ol>
			)}
			<p>
				<label>
					Subject{" "}
					<input
						value={subject}
						disabled={!isDraft}
						onChange={(event) => {
							setSubject(event.target.value);
							setDirty(true);
						}}
					/>
				</label>
			</p>
			<p>
				<label>
					Preview text{" "}
					<input
						value={previewText}
						disabled={!isDraft}
						onChange={(event) => {
							setPreviewText(event.target.value);
							setDirty(true);
						}}
					/>
				</label>
			</p>
			<div data-testid="newsletter-editor" aria-label="Issue content">
				<EmailEditor
					key={`${issue.id}:${loaded}`}
					ref={editor}
					content={content}
					editable={isDraft}
					extensions={extensions}
					onUpdate={() => setDirty(true)}
				/>
			</div>
			{isDraft ? (
				<p>
					<button type="button" disabled={busy} onClick={() => void run(save)}>
						Save
					</button>{" "}
					<button type="button" disabled={busy || dirty} onClick={() => void run(testSend)}>
						Send test
					</button>{" "}
					<label>
						Send at (optional){" "}
						<input
							type="datetime-local"
							value={sendAt}
							onChange={(event) => setSendAt(event.target.value)}
						/>
					</label>{" "}
					<button type="button" disabled={busy || dirty} onClick={() => void run(approve)}>
						Approve and send
					</button>{" "}
					<button type="button" disabled={busy} onClick={() => void run(discard)}>
						Discard draft
					</button>
				</p>
			) : null}
			{dirty ? <p>Save your changes before sending a test or approving.</p> : null}
			<p role="status" data-testid="newsletter-status">
				{status}
			</p>
			<p>
				<button type="button" onClick={props.onClose}>
					Back to issues
				</button>
			</p>
		</section>
	);
}

function NewsletterPage(): ReactElement {
	const role = useRole();
	const isAdmin = typeof role === "number" && role >= ADMIN_ROLE;
	const [issues, setIssues] = useState<readonly IssueView[] | "error" | null>(null);
	const [open, setOpen] = useState<IssueView | null>(null);
	const [status, setStatus] = useState("");
	const refresh = () =>
		api<{ issues: IssueView[] }>(`${API}/issues/list`).then(
			(list) => setIssues(list.issues),
			() => setIssues("error"),
		);
	useEffect(() => {
		if (isAdmin && open === null) void refresh();
	}, [isAdmin, open]);

	if (role === null) return <p>Loading…</p>;
	if (!isAdmin) {
		return (
			<section data-testid="newsletter-denied">
				<h1>Newsletter</h1>
				<p>Only Temple administrators can build and send the newsletter.</p>
			</section>
		);
	}
	if (open !== null) return <IssueEditor initial={open} onClose={() => setOpen(null)} />;
	if (issues === null) return <p>Loading…</p>;
	if (issues === "error") return <p role="alert">The issues could not be loaded.</p>;
	const start = () => {
		setStatus("Assembling the issue…");
		post<IssueView>("issues/new", {}).then(
			(issue) => {
				setStatus("");
				setOpen(issue);
			},
			(error: unknown) => setStatus(messageOf(error)),
		);
	};
	return (
		<section data-testid="newsletter">
			<h1>Newsletter</h1>
			<p>
				Start an issue to gather each body's news and upcoming events into its own section. Edit it,
				send a test, then approve it to send to subscribers.
			</p>
			<p>
				<button type="button" onClick={start}>
					New issue
				</button>{" "}
				<span role="status">{status}</span>
			</p>
			{issues.length === 0 ? (
				<p>No issues yet.</p>
			) : (
				<table>
					<caption>Issues, newest first</caption>
					<thead>
						<tr>
							<th scope="col">Subject</th>
							<th scope="col">Status</th>
							<th scope="col">Started</th>
							<th scope="col">Open</th>
						</tr>
					</thead>
					<tbody>
						{issues.map((issue) => (
							<tr key={issue.id}>
								<th scope="row">{issue.subject}</th>
								<td>{STATUS_TEXT[issue.status]}</td>
								<td>{day(issue.createdAt)}</td>
								<td>
									<button
										type="button"
										aria-label={`Open ${issue.subject}`}
										onClick={() => setOpen(issue)}
									>
										Open
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}

export const pages = { "/": NewsletterPage };
