import React, { useState } from "react";
import { Game } from "../types";
import { ConfirmModal } from "./../components/ConfirmModal";
import { Button } from "./ui/Button";

interface Props {
  games: Game[];
  onRemove: (selectedIds: number[]) => void;
}

export const ActiveList: React.FC<Props> = ({ games, onRemove }) => {
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const allSelected = selected.length > 0 && selected.length === games.length;
  const toggleAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(games.map((g) => g.app_id));
  };

  const confirmAndRemove = () => {
    if (selected.length === 0) return;
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-3" data-testid="active-list">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Active Games</h2>
        <Button
          onClick={confirmAndRemove}
          variant={selected.length === 0 ? "outline" : "destructive"}
          disabled={selected.length === 0}
          data-testid="remove-selected"
        >
          Remove Selected
        </Button>
      </div>

      {games.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No active games yet
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card p-4">
          <table className="min-w-full divide-y divide-border border-collapse">
            <thead className="bg-card">
              <tr>
                <th className="pl-4 py-2">
                  <div className="flex items-center justify-left">
                    <input
                      className="h-4 w-4"
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      data-testid="select-all"
                    />
                  </div>
                </th>
                <th className="pl-4 py-2 align-middle text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="pl-4 py-2 align-middle text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  AppID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {games.map((g) => {
                const checked = selected.includes(g.app_id);
                return (
                  <tr key={g.app_id} className="hover:bg-card/40">
                    <td className="pl-4 py-2">
                      <div className="flex items-center justify-left">
                        <input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked)
                              setSelected((s) => [...s, g.app_id]);
                            else
                              setSelected((s) =>
                                s.filter((id) => id !== g.app_id)
                              );
                          }}
                          data-testid={`select-${g.app_id}`}
                        />
                      </div>
                    </td>
                    <td className="pl-4 py-2 align-middle text-sm text-foreground">
                      {g.name}
                    </td>
                    <td className="pl-4 py-2 align-middle text-sm text-muted-foreground">
                      {g.app_id}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={
          selected.length === 1
            ? "Remove 1 game from the active list?"
            : `Remove ${selected.length} games from the active list?`
        }
        description="This will stop scraping for these games until you add them back."
        confirmLabel="Remove"
        onConfirm={() => {
          onRemove(selected);
          setSelected([]);
        }}
      />
    </div>
  );
};