import type { WorkspaceState } from "@superset/panes";
import type { WorkspaceLocalStateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export function collectPersistedTerminalPaneIds(
	workspaceRows: WorkspaceLocalStateRow[],
): Set<string> {
	const terminalPaneIds = new Set<string>();

	for (const workspaceRow of workspaceRows) {
		const paneLayout = workspaceRow.paneLayout as WorkspaceState<unknown>;

		if (!paneLayout || !Array.isArray(paneLayout.tabs)) {
			continue;
		}

		for (const tab of paneLayout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind === "terminal") {
					terminalPaneIds.add(pane.id);
				}
			}
		}
	}

	return terminalPaneIds;
}
