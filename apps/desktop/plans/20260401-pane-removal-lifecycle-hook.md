# Pane Removal Lifecycle Hook

## Decision

Use two lifecycle boundaries:

- React pane mount/unmount = `attach` / `detach`
- pane removal from workspace store = `dispose`

Do not make `TerminalPane` guess whether unmount means hidden or closed.

## Why

In v2, switching tabs unmounts the old tab subtree, but that should not destroy durable pane runtimes like terminals.

A store-level removal hook is the right destructive boundary because it catches all removal paths:

- `closePane`
- `removeTab`
- `close other tabs`
- `close all tabs`
- `replacePane`
- `replaceState`

## Proposed API

Add `onRemovePane` to `PaneDefinition`:

```ts
export interface RemovedPaneContext<TData> {
  pane: Pane<TData>;
  tab: Tab<TData>;
  store: StoreApi<WorkspaceStore<TData>>;
}

export interface PaneDefinition<TData> {
  renderPane(context: RendererContext<TData>): ReactNode;
  onRemovePane?(context: RemovedPaneContext<TData>): void;
}
```

Example:

```tsx
terminal: {
  getIcon: () => <TerminalSquare className="size-4" />,
  getTitle: () => "Terminal",
  renderPane: (ctx) => {
    const data = ctx.pane.data as TerminalPaneData;
    return (
      <TerminalPane
        paneId={ctx.pane.id}
        sessionKey={data.sessionKey}
        workspaceId={workspaceId}
      />
    );
  },
  onRemovePane: ({ pane }) => {
    terminalRuntimeRegistry.dispose(pane.id);
  },
},
```

## New Hook

Add one hook in `@superset/panes` that subscribes to the workspace store and diffs previous panes against next panes. When a pane ID disappears, call its definition's `onRemovePane`.

That hook should live at the `Workspace` level so it runs once per store, not once per pane.

## TerminalPane Behavior

`TerminalPane` should only attach and detach:

```tsx
useEffect(() => {
  terminalRuntimeRegistry.attach({
    paneId,
    sessionKey,
    workspaceId,
    host: containerRef.current!,
  });

  return () => {
    terminalRuntimeRegistry.detach(paneId);
  };
}, [paneId, sessionKey, workspaceId]);
```

No `dispose()` in React cleanup.

## Notes

- `detach()` and `dispose()` should be idempotent.
- `onBeforeClosePane` is a separate pre-close veto hook. It is not the right primitive for runtime teardown.
- This matches the old browser pane model better: unmount parks the view, store removal destroys it.
