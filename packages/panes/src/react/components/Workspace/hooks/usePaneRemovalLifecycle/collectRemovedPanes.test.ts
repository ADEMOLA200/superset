import { describe, expect, it } from "bun:test";
import type { Pane, Tab, WorkspaceState } from "../../../../../types";
import { collectRemovedPanes } from "./collectRemovedPanes";

interface TestData {
	label: string;
}

function makePane(id: string, label = id): Pane<TestData> {
	return {
		id,
		kind: "test",
		data: { label },
	};
}

function makeTab(id: string, panes: Pane<TestData>[]): Tab<TestData> {
	const panesById = Object.fromEntries(panes.map((pane) => [pane.id, pane]));

	return {
		id,
		createdAt: 0,
		activePaneId: panes[0]?.id ?? null,
		layout: { type: "pane", paneId: panes[0]?.id ?? "" },
		panes: panesById,
	};
}

function makeState(tabs: Tab<TestData>[]): WorkspaceState<TestData> {
	return {
		version: 1,
		tabs,
		activeTabId: tabs[0]?.id ?? null,
	};
}

describe("collectRemovedPanes", () => {
	it("detects panes removed from an existing tab", () => {
		const prevState = makeState([
			makeTab("t1", [makePane("p1"), makePane("p2")]),
		]);
		const nextState = makeState([makeTab("t1", [makePane("p2")])]);

		expect(collectRemovedPanes(prevState, nextState)).toEqual([
			{
				pane: makePane("p1"),
				tab: makeTab("t1", [makePane("p1"), makePane("p2")]),
			},
		]);
	});

	it("detects all panes removed with a tab", () => {
		const prevState = makeState([
			makeTab("t1", [makePane("p1")]),
			makeTab("t2", [makePane("p2"), makePane("p3")]),
		]);
		const nextState = makeState([makeTab("t1", [makePane("p1")])]);

		expect(collectRemovedPanes(prevState, nextState)).toEqual([
			{
				pane: makePane("p2"),
				tab: makeTab("t2", [makePane("p2"), makePane("p3")]),
			},
			{
				pane: makePane("p3"),
				tab: makeTab("t2", [makePane("p2"), makePane("p3")]),
			},
		]);
	});

	it("ignores state changes when pane IDs remain the same", () => {
		const tab = makeTab("t1", [makePane("p1")]);
		const prevState = makeState([tab]);
		const nextState = {
			...makeState([tab]),
			activeTabId: "t1",
		};

		expect(collectRemovedPanes(prevState, nextState)).toEqual([]);
	});

	it("treats replacePane as a removal of the replaced pane", () => {
		const prevState = makeState([makeTab("t1", [makePane("p1")])]);
		const nextState = makeState([makeTab("t1", [makePane("p2")])]);

		expect(collectRemovedPanes(prevState, nextState)).toEqual([
			{
				pane: makePane("p1"),
				tab: makeTab("t1", [makePane("p1")]),
			},
		]);
	});
});
