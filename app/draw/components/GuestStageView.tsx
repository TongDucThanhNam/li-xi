import FortuneStage from "@/app/draw/FortuneStage";
import type { Id } from "@/convex/_generated/dataModel";
import type { Rarity } from "@/lib/lixiPolicy";

type RewardPoolItem = {
  amount: number;
  rarity: Rarity;
  remainingQuantity: number;
};

type GuestStageViewProps = {
  sessionId: Id<"drawSessions"> | null;
  canStart: boolean;
  disabled: boolean;
  statusMessage?: string;
  rewardPool: RewardPoolItem[];
  onRedeem: (envelopeIndex: number) => Promise<{ amount: number; rarity: Rarity }>;
  onRevealStateChange: (revealing: boolean) => void;
  onCollect: () => void;
  onExit: () => void;
};

export default function GuestStageView({
  sessionId,
  canStart,
  disabled,
  statusMessage,
  rewardPool,
  onRedeem,
  onRevealStateChange,
  onCollect,
  onExit,
}: GuestStageViewProps) {
  return (
    <main className="min-h-screen bg-[#0a0101] p-0">
      <FortuneStage
        sessionId={sessionId}
        canStart={canStart}
        disabled={disabled}
        statusMessage={statusMessage}
        rewardPool={rewardPool}
        onRedeem={onRedeem}
        onRevealStateChange={onRevealStateChange}
        onCollect={onCollect}
        onExit={onExit}
      />
    </main>
  );
}
