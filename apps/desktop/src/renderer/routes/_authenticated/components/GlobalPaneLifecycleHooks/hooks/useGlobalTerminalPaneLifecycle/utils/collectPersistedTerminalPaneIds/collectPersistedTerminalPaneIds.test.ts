import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { WorkspaceLocalStateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { collectPersistedTerminalPaneIds } from "./collectPersistedTerminalPaneIds";

function makeWorkspaceRow(args: {
	workspaceId: string;
	paneLayout: WorkspaceState<unknown>;
}): WorkspaceLocalStateRow {
	return {
		workspaceId: args.workspaceId,
		createdAt: new Date(0),
		sidebarState: {
			projectId: crypto.randomUUID(),
			tabOrder: 0,
			sectionId: null,
		},
		paneLayout: args.paneLayout,
	};
}

describe("collectPersistedTerminalPaneIds", () => {
	it("collects terminal pane ids across all persisted workspaces", () => {
		const paneIds = collectPersistedTerminalPaneIds([
			makeWorkspaceRow({
				workspaceId: "workspace-a",
				paneLayout: {
					version: 1,
					activeTabId: "tab-a",
					tabs: [
						{
							id: "tab-a",
							createdAt: 0,
							activePaneId: "terminal-a",
							layout: { type: "pane", paneId: "terminal-a" },
							panes: {
								"terminal-a": {
									id: "terminal-a",
									kind: "terminal",
									data: {},
								},
								"browser-a": {
									id: "browser-a",
									kind: "browser",
									data: {},
								},
							},
						},
					],
				},
			}),
			makeWorkspaceRow({
				workspaceId: "workspace-b",
				paneLayout: {
					version: 1,
					activeTabId: "tab-b",
					tabs: [
						{
							id: "tab-b",
							createdAt: 0,
							activePaneId: "terminal-b",
							layout: { type: "pane", paneId: "terminal-b" },
							panes: {
								"terminal-b": {
									id: "terminal-b",
									kind: "terminal",
									data: {},
								},
							},
						},
					],
				},
			}),
		]);

		expect(Array.from(paneIds)).toEqual(["terminal-a", "terminal-b"]);
	});

	it("preserves a terminal when the same pane id exists in another workspace", () => {
		const paneIds = collectPersistedTerminalPaneIds([
			makeWorkspaceRow({
				workspaceId: "workspace-a",
				paneLayout: {
					version: 1,
					activeTabId: "tab-a",
					tabs: [
						{
							id: "tab-a",
							createdAt: 0,
							activePaneId: "shared-terminal",
							layout: { type: "pane", paneId: "shared-terminal" },
							panes: {
								"shared-terminal": {
									id: "shared-terminal",
									kind: "terminal",
									data: {},
								},
							},
						},
					],
				},
			}),
			makeWorkspaceRow({
				workspaceId: "workspace-b",
				paneLayout: {
					version: 1,
					activeTabId: "tab-b",
					tabs: [
						{
							id: "tab-b",
							createdAt: 0,
							activePaneId: "shared-terminal",
							layout: { type: "pane", paneId: "shared-terminal" },
							panes: {
								"shared-terminal": {
									id: "shared-terminal",
									kind: "terminal",
									data: {},
								},
							},
						},
					],
				},
			}),
		]);

		expect(Array.from(paneIds)).toEqual(["shared-terminal"]);
	});
});
