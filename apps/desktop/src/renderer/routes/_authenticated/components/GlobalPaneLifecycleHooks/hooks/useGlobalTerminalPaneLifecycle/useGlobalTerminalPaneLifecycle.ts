import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/terminalRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { collectPersistedTerminalPaneIds } from "./utils/collectPersistedTerminalPaneIds";

const TERMINAL_DISPOSE_RECHECK_MS = 50;

export function useGlobalTerminalPaneLifecycle() {
	const collections = useCollections();
	const { data: workspaceRows = [] } = useLiveQuery(
		(query) =>
			query.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState }),
		[collections],
	);
	const previousPaneIdsRef = useRef<Set<string> | null>(null);
	const terminalPaneIds = useMemo(
		() => collectPersistedTerminalPaneIds(workspaceRows),
		[workspaceRows],
	);

	useEffect(() => {
		const previousPaneIds = previousPaneIdsRef.current;
		previousPaneIdsRef.current = terminalPaneIds;

		if (!previousPaneIds) {
			return;
		}

		const removedPaneIds = Array.from(previousPaneIds).filter(
			(paneId) => !terminalPaneIds.has(paneId),
		);

		if (removedPaneIds.length === 0) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			const currentPaneIds = collectPersistedTerminalPaneIds(
				Array.from(collections.v2WorkspaceLocalState.state.values()),
			);

			for (const paneId of removedPaneIds) {
				if (!currentPaneIds.has(paneId)) {
					terminalRuntimeRegistry.dispose(paneId);
				}
			}
		}, TERMINAL_DISPOSE_RECHECK_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [collections, terminalPaneIds]);
}
