"use client";

import { type CSSProperties, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type OtpPinInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

function toDigits(value: string, length: number) {
  const clean = value.replace(/\D/g, "").slice(0, length);
  return Array.from({ length }, (_, index) => clean[index] ?? "");
}

export default function OtpPinInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
}: OtpPinInputProps) {
  const uniqueId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const digits = useMemo(() => toDigits(value, length), [value, length]);

  const activeIndex = useMemo(() => {
    const nextEmpty = digits.findIndex((digit) => digit === "");
    if (nextEmpty === -1) {
      return length - 1;
    }
    return nextEmpty;
  }, [digits, length]);

  const focusInput = useCallback(() => {
    if (disabled) {
      return;
    }
    inputRef.current?.focus();
    const nextPos = value.length;
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextPos, nextPos);
    });
  }, [disabled, value]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      focusInput();
    }
  }, [autoFocus, disabled, focusInput]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value.replace(/\D/g, "").slice(0, length);
    onChange(nextValue);
  };

  return (
    <div
      className={[
        "relative grid w-full max-w-[440px] grid-cols-[repeat(var(--otp-length),minmax(0,1fr))] gap-2.5",
        disabled ? "opacity-55 pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--otp-length": length } as CSSProperties}
      onClick={focusInput}
      role="group"
      aria-label="PIN input"
    >
      <input
        id={`otp-${uniqueId}`}
        ref={inputRef}
        className="absolute inset-0 h-full w-full cursor-text opacity-0 caret-transparent"
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={handleChange}
      />
      {digits.map((digit, index) => (
        <div
          key={`${uniqueId}-${index}`}
          className={[
            "relative flex h-[56px] items-center justify-center rounded-[14px] border border-[rgba(212,175,55,0.5)]",
            "bg-[linear-gradient(180deg,rgba(10,0,0,0.9),rgba(48,2,2,0.8))]",
            "shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),_0_10px_18px_rgba(0,0,0,0.35)]",
            "transition-all duration-200",
            digit ? "border-[rgba(255,219,150,0.82)]" : "",
            isFocused && index === activeIndex
              ? "border-[rgba(255,224,130,0.96)] shadow-[0_0_0_3px_rgba(255,224,130,0.2),_0_12px_20px_rgba(0,0,0,0.4)] -translate-y-[2px]"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span
            className={[
              "h-3 w-3 rounded-full bg-[#ffe7ae] shadow-[0_0_12px_rgba(212,175,55,0.6)] opacity-0 transition-opacity",
              digit ? "opacity-100" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}
