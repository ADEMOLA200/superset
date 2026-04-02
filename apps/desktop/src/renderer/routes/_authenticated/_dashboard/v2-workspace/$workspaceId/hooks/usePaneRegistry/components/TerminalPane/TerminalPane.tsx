import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useWorkspaceWsUrl } from "../../../../../providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";
import { terminalRuntimeRegistry } from "./terminalRuntimeRegistry";

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
	const websocketUrl = useWorkspaceWsUrl(`/terminal/pane/${paneId}`);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		terminalRuntimeRegistry.attach({
			paneId,
			sessionKey,
			workspaceId,
			websocketUrl,
			host: container,
		});

		return () => {
			terminalRuntimeRegistry.detach(paneId);
		};
	}, [paneId, sessionKey, websocketUrl, workspaceId]);

	return <div ref={containerRef} className="size-full" />;
}
