import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../services/tournament.js", () => ({
  getByGuild: vi.fn(),
}));

import { getByGuild } from "../../services/tournament.js";
import { createTournamentSelect, parseTournamentSelectInteraction } from "./tournamentSelect.js";

describe("tournament select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("incluye la opcion Sin torneo cuando se solicita", async () => {
    vi.mocked(getByGuild).mockResolvedValue([
      {
        id: "lec-1",
        name: "LEC Spring",
        status: "ACTIVE",
      },
    ] as any);

    const { row } = await createTournamentSelect("guild-1", null, "pred-leaderboard", { includeNoneOption: true });
    const data = row.toJSON();
    const select = data.components[0];

    expect(select.options.map((option) => option.value)).toEqual(["none", "lec-1"]);
  });

  it("mantiene una opcion informativa si no hay torneos y no hay modo global", async () => {
    vi.mocked(getByGuild).mockResolvedValue([] as any);

    const { row } = await createTournamentSelect("guild-1");
    const data = row.toJSON();
    const select = data.components[0];

    expect(select.options.map((option) => option.value)).toEqual(["none"]);
    expect(select.options[0]?.label).toBe("Sin torneos activos");
  });

  it("interpreta la opcion none como seleccion global", () => {
    expect(parseTournamentSelectInteraction("tournament-select-pred-leaderboard", ["none"])).toEqual({
      command: "pred-leaderboard",
      tournamentId: null,
    });
  });
});
