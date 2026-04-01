import { FitAddon } from "@xterm/addon-fit";
import type { IDisposable } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";

export type TerminalConnectionState = "connecting" | "open" | "closed";

type TerminalServerMessage =
	| {
			type: "data";
			data: string;
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: "exit";
			exitCode: number;
			signal: number;
	  };

export interface AttachTerminalRuntimeOptions {
	paneId: string;
	sessionKey: string;
	workspaceId: string;
	websocketUrl: string;
	host: HTMLElement;
}

interface TerminalRuntime {
	paneId: string;
	sessionKey: string;
	workspaceId: string;
	websocketUrl: string;
	connectionState: TerminalConnectionState;
	connectionVersion: number;
	host: HTMLElement | null;
	wrapper: HTMLDivElement;
	terminal: XTerm;
	fitAddon: FitAddon;
	inputDisposable: IDisposable;
	resizeObserver: ResizeObserver | null;
	socket: WebSocket | null;
	listeners: Set<(state: TerminalConnectionState) => void>;
}

function setConnectionState(
	runtime: TerminalRuntime,
	nextState: TerminalConnectionState,
): void {
	if (runtime.connectionState === nextState) {
		return;
	}

	runtime.connectionState = nextState;

	for (const listener of runtime.listeners) {
		listener(nextState);
	}
}

function createWrapperElement(): HTMLDivElement {
	const wrapper = document.createElement("div");
	wrapper.className =
		"h-full w-full overflow-hidden rounded-md border border-border bg-[#14100f] p-2";
	return wrapper;
}

function createRuntime(options: AttachTerminalRuntimeOptions): TerminalRuntime {
	const fitAddon = new FitAddon();
	const terminal = new XTerm({
		cursorBlink: true,
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 12,
		theme: {
			background: "#14100f",
			foreground: "#f5efe9",
		},
	});
	const wrapper = createWrapperElement();

	options.host.replaceChildren(wrapper);
	terminal.loadAddon(fitAddon);
	terminal.open(wrapper);

	const runtime: TerminalRuntime = {
		paneId: options.paneId,
		sessionKey: options.sessionKey,
		workspaceId: options.workspaceId,
		websocketUrl: options.websocketUrl,
		connectionState: "connecting",
		connectionVersion: 0,
		host: options.host,
		wrapper,
		terminal,
		fitAddon,
		inputDisposable: terminal.onData(() => {}),
		resizeObserver: null,
		socket: null,
		listeners: new Set(),
	};

	runtime.inputDisposable.dispose();
	runtime.inputDisposable = terminal.onData((data) => {
		if (runtime.socket?.readyState !== WebSocket.OPEN) {
			return;
		}

		runtime.socket.send(
			JSON.stringify({
				type: "input",
				data,
			}),
		);
	});

	return runtime;
}

function attachToHost(runtime: TerminalRuntime, host: HTMLElement): void {
	runtime.host = host;
	host.replaceChildren(runtime.wrapper);

	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = new ResizeObserver(() => {
		runtime.fitAddon.fit();
		sendResize(runtime);
	});
	runtime.resizeObserver.observe(host);

	runtime.fitAddon.fit();
	runtime.terminal.focus();
	sendResize(runtime);
}

function sendResize(runtime: TerminalRuntime): void {
	if (runtime.socket?.readyState !== WebSocket.OPEN) {
		return;
	}

	runtime.socket.send(
		JSON.stringify({
			type: "resize",
			cols: runtime.terminal.cols,
			rows: runtime.terminal.rows,
		}),
	);
}

function connectSocket(runtime: TerminalRuntime): void {
	runtime.connectionVersion += 1;
	const connectionVersion = runtime.connectionVersion;

	runtime.socket?.close();
	setConnectionState(runtime, "connecting");

	const socket = new WebSocket(runtime.websocketUrl);
	runtime.socket = socket;

	socket.addEventListener("open", () => {
		if (runtime.connectionVersion !== connectionVersion) {
			return;
		}

		setConnectionState(runtime, "open");
		sendResize(runtime);
	});

	socket.addEventListener("message", (event) => {
		if (runtime.connectionVersion !== connectionVersion) {
			return;
		}

		let message: TerminalServerMessage;
		try {
			message = JSON.parse(String(event.data)) as TerminalServerMessage;
		} catch {
			runtime.terminal.writeln("\r\n[terminal] invalid server payload");
			return;
		}

		if (message.type === "data") {
			runtime.terminal.write(message.data);
			return;
		}

		if (message.type === "error") {
			runtime.terminal.writeln(`\r\n[terminal] ${message.message}`);
			return;
		}

		runtime.terminal.writeln(
			`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
		);
	});

	socket.addEventListener("close", () => {
		if (runtime.connectionVersion !== connectionVersion) {
			return;
		}

		setConnectionState(runtime, "closed");
	});

	socket.addEventListener("error", () => {
		if (runtime.connectionVersion !== connectionVersion) {
			return;
		}

		runtime.terminal.writeln("\r\n[terminal] websocket error");
	});
}

class TerminalRuntimeRegistry {
	private readonly runtimes = new Map<string, TerminalRuntime>();
	private readonly deferredListeners = new Map<
		string,
		Set<(state: TerminalConnectionState) => void>
	>();

	attach(options: AttachTerminalRuntimeOptions): void {
		let runtime = this.runtimes.get(options.paneId);

		if (!runtime) {
			runtime = createRuntime(options);
			const deferredListeners = this.deferredListeners.get(options.paneId);
			if (deferredListeners) {
				for (const listener of deferredListeners) {
					runtime.listeners.add(listener);
				}
			}
			this.runtimes.set(options.paneId, runtime);
			connectSocket(runtime);
		}

		runtime.sessionKey = options.sessionKey;
		runtime.workspaceId = options.workspaceId;

		if (runtime.websocketUrl !== options.websocketUrl) {
			runtime.websocketUrl = options.websocketUrl;
			connectSocket(runtime);
		}

		attachToHost(runtime, options.host);
	}

	detach(paneId: string): void {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) {
			return;
		}

		runtime.resizeObserver?.disconnect();
		runtime.resizeObserver = null;
		runtime.host = null;
		runtime.wrapper.remove();
	}

	dispose(paneId: string): void {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) {
			return;
		}

		runtime.resizeObserver?.disconnect();
		runtime.resizeObserver = null;
		runtime.inputDisposable.dispose();
		runtime.socket?.close();
		runtime.socket = null;
		runtime.wrapper.remove();
		runtime.terminal.dispose();
		runtime.listeners.clear();
		this.runtimes.delete(paneId);
	}

	reconnect(paneId: string, websocketUrl?: string): void {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) {
			return;
		}

		if (websocketUrl) {
			runtime.websocketUrl = websocketUrl;
		}

		connectSocket(runtime);
	}

	getConnectionState(paneId: string): TerminalConnectionState {
		return this.runtimes.get(paneId)?.connectionState ?? "closed";
	}

	subscribe(
		paneId: string,
		listener: (state: TerminalConnectionState) => void,
	): () => void {
		let runtime = this.runtimes.get(paneId);
		if (!runtime) {
			let deferredListeners = this.deferredListeners.get(paneId);
			if (!deferredListeners) {
				deferredListeners = new Set();
				this.deferredListeners.set(paneId, deferredListeners);
			}

			deferredListeners.add(listener);
			listener("closed");

			return () => {
				this.deferredListeners.get(paneId)?.delete(listener);
				this.runtimes.get(paneId)?.listeners.delete(listener);
			};
		}

		runtime.listeners.add(listener);
		listener(runtime.connectionState);

		return () => {
			runtime = this.runtimes.get(paneId);
			runtime?.listeners.delete(listener);
		};
	}
}

export const terminalRuntimeRegistry = new TerminalRuntimeRegistry();
