export interface Game {
	app_id: number;
	name: string;
}

export interface GameSearchResponse {
  games: Game[];
  total?: number;
  start: number;
  count: number;
}


