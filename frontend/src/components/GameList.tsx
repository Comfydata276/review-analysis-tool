import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Game } from "../types";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";

interface Props {
	games: Game[];
	onAdd: (game: Game) => void;
	activeGames: Game[];
	total?: number;
}

export const GameList: React.FC<Props> = ({ games, onAdd, activeGames, total }) => {
	const activeSet = new Set(activeGames.map((g) => g.app_id));
	const [expanded, setExpanded] = useState(false);
	const needsExpand = useMemo(() => games.length > 8, [games.length]);
	const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

	const downloadExport = async (appId: number, format: "csv" | "xlsx") => {
		try {
			const url = `${BACKEND_URL}/reviews/export/${appId}?format=${format}`;
			const resp = await fetch(url);
			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(text || `HTTP ${resp.status}`);
			}

			// derive filename from Content-Disposition or fallback
			const disposition = resp.headers.get("Content-Disposition") || "";
			let filename = `reviews_${appId}.${format === "csv" ? "csv" : "xlsx"}`;
			const m = /filename="?([^";]+)"?/.exec(disposition);
			if (m && m[1]) filename = m[1];

			const blob = await resp.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(blobUrl);
			toast.success("Download started");
		} catch (e: any) {
			toast.error(e.message || "Download failed");
		}
	};

	return (
		<div className="space-y-2" data-testid="game-list">
			{games.length === 0 ? (
				<div className="text-sm text-muted-foreground">No results</div>
			) : (
				<Card>
					{/* Total line inside the card */}
					<div className="px-4 pt-2 text-sm text-muted-foreground">
						{typeof total === "number" ? `Showing ${games.length} of ${total} results` : `Showing ${games.length} results`}
					</div>

					<div className={`overflow-y-auto ${expanded ? "" : "max-h-64"}`}>
						<ul className="divide-y divide-border">
							{games.map((g) => {
								const disabled = activeSet.has(g.app_id);
								return (
									<li key={g.app_id} className="flex items-center justify-between gap-4 px-2 py-3">
										<div className="min-w-0">
											<div className="truncate font-medium text-foreground">{g.name}</div>
											<div className="text-xs text-muted-foreground">AppID: {g.app_id}</div>
										</div>
										<div className="flex items-center gap-2">
											<Button
												onClick={() => onAdd(g)}
												className="whitespace-nowrap"
												variant={disabled ? "outline" : "gradient"}
												disabled={disabled}
												data-testid={`add-${g.app_id}`}
											>
												{disabled ? "Added" : "Add"}
											</Button>
											<Button size="sm" variant="outline" onClick={() => downloadExport(g.app_id, "csv")}>
												CSV
											</Button>
											<Button size="sm" variant="outline" onClick={() => downloadExport(g.app_id, "xlsx")}>
												XLSX
											</Button>
										</div>
									</li>
								);
							})}
						</ul>
					</div>

					{needsExpand && (
						<div className="px-4 py-2">
							<Button variant="ghost" className="text-sm" onClick={() => setExpanded((s) => !s)}>
								{expanded ? "Show less" : `Show all (${games.length})`}
							</Button>
						</div>
					)}
				</Card>
			)}
		</div>
	);
};