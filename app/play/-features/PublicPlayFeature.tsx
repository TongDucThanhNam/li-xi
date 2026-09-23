"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
	gameTemplates as gameTemplateRegistry,
	resolveCampaignGameTemplateId,
} from "@/app/game-templates/registry";
import { api } from "@/convex/_generated/api";
import type { Rarity } from "@/lib/lixiPolicy";
import { normalizePublicPlayCode } from "@/lib/publicAppUrlPolicy";

type PrizeResult = {
  amount: number;
  rarity: Rarity;
};

export function PublicPlayFeature({ publicCode }: { publicCode: string }) {
  const normalizedPublicCode = normalizePublicPlayCode(publicCode);
  const recordPublicPlayOpen = useMutation(api.draw.recordPublicPlayOpen);
  const redeemPublicSession = useMutation(api.draw.redeemPublicSession);
  const publicSession = useQuery(
    api.draw.getPublicSession,
    normalizedPublicCode ? { publicCode: normalizedPublicCode } : "skip"
  );
  const [sessionSnapshot, setSessionSnapshot] = useState<
    NonNullable<typeof publicSession> | null
  >(null);
  const [claimCompleted, setClaimCompleted] = useState(false);
  const [openRecordedForCode, setOpenRecordedForCode] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (publicSession) {
      setSessionSnapshot(publicSession);
    }
  }, [publicSession]);

  useEffect(() => {
    if (
      !normalizedPublicCode ||
      !publicSession ||
      openRecordedForCode === normalizedPublicCode
    ) {
      return;
    }

    setOpenRecordedForCode(normalizedPublicCode);
    void recordPublicPlayOpen({ publicCode: normalizedPublicCode }).catch(() => {
      setOpenRecordedForCode(null);
    });
  }, [normalizedPublicCode, openRecordedForCode, publicSession, recordPublicPlayOpen]);

  const handleRevealStateChange = useCallback((revealing: boolean) => {
    setIsRevealing(revealing);
  }, []);

  const handleRedeem = async (envelopeIndex: number): Promise<PrizeResult> => {
    if (!normalizedPublicCode || !publicSession) {
      throw new Error("Lượt chơi không còn hiệu lực");
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
          : "Không thể hoàn tất lượt chơi";
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
        icon={CheckCircle2}
        tone="complete"
        title="Đã ghi nhận phần thưởng"
        message="Lượt chơi đã hoàn tất và link này đã đóng."
      />
    );
  }

  if (!normalizedPublicCode) {
    return (
      <ClaimClosedState
        icon={AlertTriangle}
        tone="danger"
        title="Liên kết chơi không hợp lệ"
        message="Liên kết chơi này không đúng định dạng hoặc đã bị chỉnh sửa."
      />
    );
  }

  if (publicSession === undefined && !visibleSession) {
    return (
      <ClaimStatusShell>
        <section
          aria-live="polite"
          className="relative z-10 grid w-full max-w-[420px] justify-items-center gap-4 rounded-2xl border border-gold-base/20 bg-linear-to-br from-red-deep/80 via-black-ink/95 to-black-ink p-7 text-center shadow-[0_18px_42px_rgba(5,0,0,0.42)]"
          role="status"
        >
          <div className="grid size-14 place-items-center rounded-full border border-gold-base/25 bg-gold-base/10">
            <div
              aria-hidden="true"
              className="size-8 animate-spin rounded-full border-[3px] border-gold-base/20 border-t-gold-base"
            />
          </div>
          <p className="font-cinzel text-sm leading-6 tracking-[0.12em] text-gold-shine/75">
            Đang kiểm tra liên kết chơi
          </p>
        </section>
      </ClaimStatusShell>
    );
  }

  if (!visibleSession) {
    return (
      <ClaimClosedState
        icon={Link2}
        tone="neutral"
        title="Lượt chơi đã đóng"
        message="Liên kết chơi này không còn hiệu lực hoặc phần thưởng đã được nhận."
      />
    );
  }

  // Legacy /play links only ever wrap li xi draw sessions; resolve the legacy
  // Stage from the concrete li xi template entry.
  const legacyStage =
    resolveCampaignGameTemplateId(visibleSession.gameTemplateId) === "li-xi"
      ? gameTemplateRegistry["li-xi"].Stage
      : null;

  if (!legacyStage) {
    return (
      <ClaimClosedState
        icon={AlertTriangle}
        tone="danger"
        title="Trò chơi không được hỗ trợ"
        message="Liên kết chơi cổ điển chỉ dành cho trò chơi li xi."
      />
    );
  }
  const Stage = legacyStage;

  return (
    <main className="h-dvh w-screen overflow-hidden bg-black-ink">
      {error ? (
        <div
          aria-live="assertive"
          className="pointer-events-none fixed left-1/2 top-4 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-red-vivid/40 bg-red-deep/80 px-4 py-3 text-center font-vn text-sm text-gold-shine shadow-2xl"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <Stage
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
  icon: Icon,
  tone,
  title,
  message,
}: {
  icon: LucideIcon;
  tone: "complete" | "danger" | "neutral";
  title: string;
  message: string;
}) {
  const toneClasses = {
    complete: "border-gold-base/25 bg-gold-base/10 text-gold-base",
    danger: "border-red-vivid/35 bg-red-deep/35 text-red-vivid",
    neutral: "border-gold-base/20 bg-gold-base/8 text-gold-base",
  } satisfies Record<typeof tone, string>;

  return (
    <ClaimStatusShell>
      <section className="relative z-10 grid w-full max-w-[540px] justify-items-center rounded-2xl border border-gold-base/20 bg-linear-to-br from-red-deep/85 via-black-ink/95 to-black-ink p-7 text-center shadow-[0_18px_42px_rgba(5,0,0,0.42)] sm:p-8">
        <div className={`mb-4 grid size-12 place-items-center rounded-full border ${toneClasses[tone]}`}>
          <Icon aria-hidden="true" size={22} strokeWidth={2} />
        </div>
        <h1 className="max-w-[12em] text-balance font-cinzel text-[clamp(26px,6vw,34px)] leading-tight text-gold-shine">
          {title}
        </h1>
        <p className="mt-3 max-w-sm font-playfair text-base leading-7 text-gold-shine/70">
          {message}
        </p>
      </section>
    </ClaimStatusShell>
  );
}

function ClaimStatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-black-ink p-6">
      <div className="absolute inset-0 bg-linear-to-br from-red-deep/65 via-black-ink to-black-ink" />
      <div className="absolute inset-0 noise-overlay opacity-[0.035]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-red-deep/30 to-transparent" />
      {children}
    </main>
  );
}
