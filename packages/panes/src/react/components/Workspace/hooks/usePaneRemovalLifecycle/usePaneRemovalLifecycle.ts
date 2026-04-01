import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import type { PaneRegistry } from "../../../../types";
import { collectRemovedPanes } from "./collectRemovedPanes";

interface UsePaneRemovalLifecycleOptions<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	registry: PaneRegistry<TData>;
}

export function usePaneRemovalLifecycle<TData>({
	store,
	registry,
}: UsePaneRemovalLifecycleOptions<TData>) {
	useEffect(() => {
		return store.subscribe((nextState, prevState) => {
			const removedPanes = collectRemovedPanes(prevState, nextState);

			for (const removedPane of removedPanes) {
				void registry[removedPane.pane.kind]?.onRemovePane?.({
					pane: removedPane.pane,
					tab: removedPane.tab,
					store,
				});
			}
		});
	}, [store, registry]);
}
