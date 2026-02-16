"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ENVELOPE_COUNT, Rarity } from "@/lib/lixiPolicy";
import styles from "./FortuneStage.module.css";

type Prize = {
  amount: number;
  rarity: Rarity;
};

type RewardPoolItem = {
  amount: number;
  rarity: Rarity;
  remainingQuantity: number;
};

type CardState = {
  isIn: boolean;
  isOpened: boolean;
  isMissed: boolean;
  prize: Prize | null;
};

type Phase = "IDLE" | "INTRO" | "READY" | "REVEAL";

type FortuneStageProps = {
  sessionId: string | null;
  canStart: boolean;
  disabled: boolean;
  statusMessage?: string;
  rewardPool: RewardPoolItem[];
  onRedeem: (envelopeIndex: number) => Promise<Prize>;
  onRevealStateChange: (revealing: boolean) => void;
  onCollect: () => void;
  onExit?: () => void;
};

const ENTRY_STAGGER_MS = 80;
const HERO_HIDE_MS = 500;
const READY_DELAY_MS = 1000;
const NORMAL_REVEAL_MS = 1500;
const LEGEND_REVEAL_MS = 1800;
const RESULT_DELAY_MS = 2000;

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

function createInitialCards() {
  return Array.from({ length: ENVELOPE_COUNT }, () => ({
    isIn: false,
    isOpened: false,
    isMissed: false,
    prize: null,
  })) as CardState[];
}

function ticketRarityClass(rarity: Rarity | null) {
  if (!rarity) {
    return "";
  }
  if (rarity === "legend") {
    return styles.ticketLegend;
  }
  if (rarity === "rare") {
    return styles.ticketRare;
  }
  return styles.ticketCommon;
}

function rollFromPool(pool: RewardPoolItem[]): Prize {
  const available = pool.filter((item) => item.remainingQuantity > 0);
  if (available.length === 0) {
    return { amount: 100000, rarity: "common" };
  }

  const totalWeight = available.reduce((sum, item) => sum + item.remainingQuantity, 0);
  let threshold = Math.floor(Math.random() * totalWeight);
  for (const item of available) {
    threshold -= item.remainingQuantity;
    if (threshold < 0) {
      return { amount: item.amount, rarity: item.rarity };
    }
  }

  const fallback = available[available.length - 1];
  return { amount: fallback.amount, rarity: fallback.rarity };
}

function revealTilt(wrapper: HTMLElement, clientX: number, clientY: number) {
  const card = wrapper.querySelector<HTMLElement>(`.${styles.card}`);
  if (!card) {
    return;
  }

  const rect = wrapper.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const rotateX = (y / rect.height - 0.5) * -20;
  const rotateY = (x / rect.width - 0.5) * 20;
  card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;

  const px = (1 - x / rect.width) * 100;
  const py = (1 - y / rect.height) * 100;
  wrapper.querySelectorAll<HTMLElement>(`.${styles.foilLayer}`).forEach((node) => {
    node.style.backgroundPosition = `${px}% ${py}%`;
  });
}

function EnvelopeFlap() {
  return (
    <div className={styles.layerFlapWrapper}>
      <div className={styles.flapFaceFront}>
        <div className={styles.foilLayer} />
      </div>
      <div className={styles.flapFaceBack} />
      <div className={styles.seal}>福</div>
    </div>
  );
}

function EnvelopeCard({
  card,
  index,
  onClick,
  onPointerMove,
  onPointerLeave,
}: {
  card: CardState;
  index: number;
  onClick: () => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={[
        styles.cardWrapper,
        card.isIn ? styles.cardIn : "",
        card.isOpened ? styles.cardOpened : "",
        card.isMissed ? styles.cardMissed : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.card}>
        <div className={styles.layerLining} />
        <div className={`${styles.layerTicket} ${ticketRarityClass(card.prize?.rarity ?? null)}`}>
          <div className={styles.ticketPattern} />
          <span className={styles.ticketLabel}>LUCKY MONEY</span>
          <span className={styles.ticketVal}>
            {card.isOpened && card.prize ? formatCurrency(card.prize.amount) : "???"}
          </span>
        </div>
        <div className={styles.layerPocket}>
          <div className={styles.foilLayer} />
        </div>
        <EnvelopeFlap />
      </div>
      <span className={styles.cardNumber}>{index + 1}</span>
    </div>
  );
}

export default function FortuneStage({
  sessionId,
  canStart,
  disabled,
  statusMessage,
  rewardPool,
  onRedeem,
  onRevealStateChange,
  onCollect,
  onExit,
}: FortuneStageProps) {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [cards, setCards] = useState<CardState[]>(() => createInitialCards());
  const [showHero, setShowHero] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [modalPrize, setModalPrize] = useState<Prize | null>(null);
  const [isLegendary, setIsLegendary] = useState(false);
  const timeoutRef = useRef<number[]>([]);

  const canBegin = canStart && !disabled && phase === "IDLE";

  const schedule = (callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(callback, delayMs);
    timeoutRef.current.push(timer);
  };

  const clearTimers = () => {
    timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
    timeoutRef.current = [];
  };

  const resetStage = () => {
    clearTimers();
    setPhase("IDLE");
    setCards(createInitialCards());
    setShowHero(true);
    setShowGrid(false);
    setModalPrize(null);
    setIsLegendary(false);
    onRevealStateChange(false);
  };

  useEffect(() => {
    resetStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const handleStart = () => {
    if (!canBegin) {
      return;
    }

    setPhase("INTRO");
    setShowHero(false);
    setCards(createInitialCards());

    schedule(() => {
      setShowGrid(true);
      for (let index = 0; index < ENVELOPE_COUNT; index += 1) {
        schedule(() => {
          setCards((previous) =>
            previous.map((card, cardIndex) =>
              cardIndex === index
                ? {
                    ...card,
                    isIn: true,
                  }
                : card
            )
          );
        }, index * ENTRY_STAGGER_MS);
      }
      schedule(() => setPhase("READY"), READY_DELAY_MS);
    }, HERO_HIDE_MS);
  };

  const revealOtherCards = (chosenIndex: number, chosenPrize: Prize) => {
    const remaining = Array.from({ length: ENVELOPE_COUNT - 1 }, () => rollFromPool(rewardPool));
    setCards((previous) =>
      previous.map((card, index) => {
        if (index === chosenIndex) {
          return card;
        }
        const prize = remaining.pop() ?? chosenPrize;
        return {
          ...card,
          isOpened: true,
          isMissed: true,
          prize,
        };
      })
    );
  };

  const handleCardClick = async (cardIndex: number) => {
    if (phase !== "READY" || disabled) {
      return;
    }

    setPhase("REVEAL");
    onRevealStateChange(true);

    try {
      const selectedPrize = await onRedeem(cardIndex);
      setCards((previous) =>
        previous.map((card, index) =>
          index === cardIndex
            ? {
                ...card,
                isOpened: true,
                prize: selectedPrize,
              }
            : card
        )
      );

      const revealDelay = selectedPrize.rarity === "legend" ? LEGEND_REVEAL_MS : NORMAL_REVEAL_MS;
      setIsLegendary(selectedPrize.rarity === "legend");

      schedule(() => revealOtherCards(cardIndex, selectedPrize), revealDelay);
      schedule(() => setModalPrize(selectedPrize), revealDelay + RESULT_DELAY_MS);
    } catch {
      setPhase("READY");
      onRevealStateChange(false);
    }
  };

  const displayedCards = useMemo(() => cards, [cards]);

  return (
    <section className={`${styles.stage} ${isLegendary ? styles.legendary : ""}`} aria-live="polite">
      <svg className={styles.textureDefs} aria-hidden="true">
        <filter id="paperRoughness">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
          <feDiffuseLighting in="noise" lightingColor="#fff" surfaceScale="2">
            <feDistantLight azimuth="45" elevation="60" />
          </feDiffuseLighting>
          <feComposite operator="in" in2="SourceGraphic" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </svg>
      <div className={styles.noiseOverlay} />
      <div className={`${styles.ambientLight} ${styles.lightOne}`} />
      <div className={`${styles.ambientLight} ${styles.lightTwo}`} />
      <div className={`${styles.ambientLight} ${styles.lightThree}`} />

      <header className={styles.topBar}>
        <span className={styles.brand}>Lì Xì Station</span>
        {onExit ? (
          <button type="button" className={styles.exitButton} onClick={onExit}>
            Về host
          </button>
        ) : null}
      </header>

      <div className={styles.mainContainer}>
        <div className={`${styles.heroText} ${showHero ? "" : styles.heroHidden}`}>
          <h1 className={styles.heroTitle}>Lunar Fortune</h1>
          <p className={styles.heroSubtitle}>Premium Gacha Experience</p>
          <button type="button" className={styles.magBtn} disabled={!canBegin} onClick={handleStart}>
            Summon Luck
          </button>
          {statusMessage ? <p className={styles.heroStatus}>{statusMessage}</p> : null}
        </div>

        <div className={`${styles.gridContainer} ${showGrid ? styles.gridActive : ""}`}>
          {displayedCards.map((card, index) => (
            <EnvelopeCard
              key={`envelope-${index}`}
              card={card}
              index={index}
              onClick={() => handleCardClick(index)}
              onPointerMove={(event) => {
                if (phase !== "READY") {
                  return;
                }
                revealTilt(event.currentTarget, event.clientX, event.clientY);
              }}
              onPointerLeave={(event) => {
                const cardNode = event.currentTarget.querySelector<HTMLElement>(`.${styles.card}`);
                if (cardNode) {
                  cardNode.style.transform = "none";
                }
              }}
            />
          ))}
        </div>
      </div>

      <div className={`${styles.resultModal} ${modalPrize ? styles.resultActive : ""}`}>
        <p className={styles.heroSubtitle}>You Received</p>
        <h2 className={styles.winAmount}>{modalPrize ? formatCurrency(modalPrize.amount) : "0đ"}</h2>
        <button
          type="button"
          className={styles.magBtn}
          onClick={() => {
            resetStage();
            onCollect();
          }}
        >
          Collect
        </button>
      </div>
    </section>
  );
}
