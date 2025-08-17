import React, { useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";

interface Props {
	onSearch: (query: string) => void;
	loading?: boolean;
}

export const SearchBar: React.FC<Props> = ({ onSearch, loading = false }) => {
	const [value, setValue] = useState("");

	return (
		<div className="flex items-center gap-3" data-testid="search-bar">
			<div className="flex w-full items-center gap-2">
				<div className="flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 w-full">
					<MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground" />
					<Input
						value={value}
						placeholder="Search games or AppID"
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && value.trim()) onSearch(value.trim());
						}}
						className="bg-transparent"
						data-testid="search-input"
					/>
					{value && (
						<button onClick={() => setValue("")} className="rounded p-1 text-muted-foreground" aria-label="Clear">
							<XMarkIcon className="h-4 w-4" />
						</button>
					)}
				</div>
			</div>
			<Button variant="gradient" onClick={() => value.trim() && onSearch(value.trim())} data-testid="search-button" disabled={!value.trim() || loading}>
				{loading ? "Searching..." : "Search"}
			</Button>
		</div>
	);
};