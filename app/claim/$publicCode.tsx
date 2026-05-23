"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Rarity } from "@/lib/lixiPolicy";
import FortuneStage from "@/app/draw/FortuneStage";
import { normalizePublicClaimCode } from "@/lib/publicAppUrlPolicy";

type PrizeResult = {
  amount: number;
  rarity: Rarity;
};

export const Route = createFileRoute("/claim/$publicCode")({
  component: PublicClaimPage,
});

function PublicClaimPage() {
  const { publicCode } = Route.useParams();
  const normalizedPublicCode = normalizePublicClaimCode(publicCode);
  const redeemPublicSession = useMutation(api.draw.redeemPublicSession);
  const publicSession = useQuery(
    api.draw.getPublicSession,
    normalizedPublicCode ? { publicCode: normalizedPublicCode } : "skip"
  );
  const [sessionSnapshot, setSessionSnapshot] = useState<
    NonNullable<typeof publicSession> | null
  >(null);
  const [claimCompleted, setClaimCompleted] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (publicSession) {
      setSessionSnapshot(publicSession);
    }
  }, [publicSession]);

  const handleRevealStateChange = useCallback((revealing: boolean) => {
    setIsRevealing(revealing);
  }, []);

  const handleRedeem = async (envelopeIndex: number): Promise<PrizeResult> => {
    if (!normalizedPublicCode || !publicSession) {
      throw new Error("Lượt rút không còn hiệu lực");
    }

    setError("");
    setIsRevealing(true);

    try {
      const result = await redeemPublicSession({
        publicCode: normalizedPublicCode,
        envelopeIndex,
      });

      return {
        amount: result.amount,
        rarity: result.rarity,
      };
    } catch (unknownError) {
      const message =
        unknownError instanceof Error
          ? unknownError.message
          : "Không thể rút phong bao";
      setError(message);
      setIsRevealing(false);
      throw new Error(message);
    }
  };

  const visibleSession =
    publicSession ?? (isRevealing && sessionSnapshot ? sessionSnapshot : null);

  if (claimCompleted) {
    return (
      <ClaimClosedState
        title="Đã ghi nhận phần thưởng"
        message="Lượt rút đã hoàn tất và link này đã đóng."
      />
    );
  }

  if (!normalizedPublicCode) {
    return (
      <ClaimClosedState
        title="Link không hợp lệ"
        message="Link rút này không đúng định dạng hoặc đã bị chỉnh sửa."
      />
    );
  }

  if (publicSession === undefined && !visibleSession) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black-ink p-6 text-center">
        <section className="grid gap-4 justify-items-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-gold-base/20 border-t-gold-base shadow-[0_0_20px_rgba(212,175,55,0.2)]" />
          <p className="font-cinzel text-sm uppercase tracking-[0.18em] text-gold-shine/75">
            Đang kiểm tra link rút
          </p>
        </section>
      </main>
    );
  }

  if (!visibleSession) {
    return (
      <ClaimClosedState
        title="Lượt rút đã đóng"
        message="Link này không còn hiệu lực hoặc phần thưởng đã được nhận."
      />
    );
  }

  return (
    <main className="h-dvh w-screen overflow-hidden bg-black-ink">
      {error ? (
        <div className="pointer-events-none fixed left-1/2 top-4 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-red-vivid/40 bg-red-deep/80 px-4 py-3 text-center font-vn text-sm text-gold-shine shadow-2xl">
          {error}
        </div>
      ) : null}
      <FortuneStage
        sessionKey={normalizedPublicCode}
        guestName={visibleSession.guestNameDisplay}
        campaignTitle={
          visibleSession.campaign?.claimHeadline ??
          visibleSession.campaign?.name ??
          undefined
        }
        campaignSubtitle={
          visibleSession.campaign?.claimSubtitle ??
          visibleSession.campaign?.brandName ??
          visibleSession.campaign?.description ??
          undefined
        }
        ctaLabel={visibleSession.campaign?.claimCtaLabel ?? undefined}
        collectLabel={visibleSession.campaign?.claimCollectLabel ?? undefined}
        waitingMessage={visibleSession.campaign?.claimWaitingMessage ?? undefined}
        heroAssetUrl={visibleSession.campaign?.heroAssetUrl ?? null}
        canStart={!isRevealing}
        disabled={!visibleSession || isRevealing}
        rewardPool={visibleSession.rewardPool}
        onRedeem={handleRedeem}
        onRevealStateChange={handleRevealStateChange}
        onCollect={() => {
          setClaimCompleted(true);
          setIsRevealing(false);
        }}
      />
    </main>
  );
}

function ClaimClosedState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-black-ink p-6">
      <div className="absolute inset-0 noise-overlay opacity-[0.03]" />
      <section className="relative z-10 w-full max-w-[460px] rounded-2xl border border-gold-base/20 bg-linear-to-br from-red-deep/90 via-black-ink/95 to-black-ink p-8 text-center shadow-2xl">
        <h1 className="font-cinzel text-4xl text-gold-shine">{title}</h1>
        <p className="mt-3 font-playfair text-gold-shine/70">{message}</p>
      </section>
    </main>
  );
}
