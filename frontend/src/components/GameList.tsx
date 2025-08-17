import React, { useMemo, useState } from "react";
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
										<Button
											onClick={() => onAdd(g)}
											className="whitespace-nowrap"
											variant={disabled ? "outline" : "gradient"}
											disabled={disabled}
											data-testid={`add-${g.app_id}`}
										>
											{disabled ? "Added" : "Add"}
										</Button>
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