import type { Pane, Tab, WorkspaceState } from "../../../../../types";

export interface RemovedPaneRecord<TData> {
	pane: Pane<TData>;
	tab: Tab<TData>;
}

export function collectRemovedPanes<TData>(
	prevState: WorkspaceState<TData>,
	nextState: WorkspaceState<TData>,
): RemovedPaneRecord<TData>[] {
	const nextPaneIds = new Set<string>();

	for (const tab of nextState.tabs) {
		for (const pane of Object.values(tab.panes)) {
			nextPaneIds.add(pane.id);
		}
	}

	const removedPanes: RemovedPaneRecord<TData>[] = [];

	for (const tab of prevState.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (!nextPaneIds.has(pane.id)) {
				removedPanes.push({ pane, tab });
			}
		}
	}

	return removedPanes;
}
