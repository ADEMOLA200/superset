import { Button } from "@superset/ui/button";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceWsUrl } from "../../../../../providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";
import {
	type TerminalConnectionState,
	terminalRuntimeRegistry,
} from "./terminalRuntimeRegistry";

interface WorkspaceTerminalProps {
	paneId: string;
	sessionKey: string;
	workspaceId: string;
}

export function TerminalPane({
	paneId,
	sessionKey,
	workspaceId,
}: WorkspaceTerminalProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [connectionState, setConnectionState] =
		useState<TerminalConnectionState>(() =>
			terminalRuntimeRegistry.getConnectionState(paneId),
		);
	const [reconnectKey, setReconnectKey] = useState(0);

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${workspaceId}`, {
		reconnect: String(reconnectKey),
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const unsubscribe = terminalRuntimeRegistry.subscribe(
			paneId,
			setConnectionState,
		);

		terminalRuntimeRegistry.attach({
			paneId,
			sessionKey,
			workspaceId,
			websocketUrl,
			host: container,
		});

		return () => {
			unsubscribe();
			terminalRuntimeRegistry.detach(paneId);
		};
	}, [paneId, sessionKey, websocketUrl, workspaceId]);

	return (
		<div className="w-full rounded-lg border border-border p-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<h2 className="text-sm font-medium">terminal</h2>
					<p className="text-xs text-muted-foreground">
						{connectionState === "open"
							? "Connected"
							: connectionState === "connecting"
								? "Connecting..."
								: "Disconnected"}
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => setReconnectKey((value) => value + 1)}
				>
					Reconnect
				</Button>
			</div>
			<div ref={containerRef} className="h-[360px] overflow-hidden" />
		</div>
	);
}
