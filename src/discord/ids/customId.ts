export type VoteCustomId = {
    kind: "predVote";
    predictionId: string;
    optionId: string;
    v: number;
};

export function encodeVoteId(x: Omit<VoteCustomId, "kind">): string {
    // predVote:<v>:<predictionId>:<optionId>
    return `predVote:${x.v}:${x.predictionId}:${x.optionId}`;
}

export function decodeVoteId(customId: string): VoteCustomId | null {
    const parts = customId.split(":");
    if (parts.length !== 4) return null;
    const [kind, vStr, predictionId, optionId] = parts;
    if (kind !== "predVote") return null;
    const v = Number(vStr);
    if (!Number.isFinite(v)) return null;
    if (!predictionId || !optionId) return null;
    return { kind: "predVote", v, predictionId, optionId };
}
