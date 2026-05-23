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
  const [isError, setIsError] = useState(false);
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
    setIsError(false);
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && value.length === 0) {
      setIsError(true);
      setTimeout(() => setIsError(false), 500);
    }
  }, [value.length]);

  return (
    <fieldset
      className={[
        "relative grid w-full max-w-[440px] grid-cols-[repeat(var(--otp-length),minmax(0,1fr))] gap-2.5 border-0 p-0 m-0",
        disabled ? "opacity-55 pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--otp-length": length } as CSSProperties}
      onClick={focusInput}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focusInput(); } }}
      disabled={disabled}
    >
      <legend className="sr-only">Nhập mã PIN {length} chữ số</legend>
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
        onKeyDown={handleKeyDown}
      />
      {digits.map((digit, index) => (
        <div
          key={`digit-${uniqueId}-${index}-${digit}`}
          className={[
            "relative flex h-[56px] items-center justify-center rounded-[14px] border",
            "bg-linear-to-b from-black-ink via-red-deep/40 to-black-ink",
            "shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),_0_10px_18px_rgba(0,0,0,0.25)]",
            "transition-all duration-300",
            isError && index === activeIndex && !digit
              ? "border-red-vivid/70 bg-red-vivid/10 animate-shake"
              : digit
                ? "border-gold-shine/80"
                : "border-gold-base/30",
            isFocused && index === activeIndex && !digit
              ? "border-gold-base shadow-[0_0_0_3px_rgba(212,175,55,0.2),_0_12px_20px_rgba(0,0,0,0.3)] -translate-y-[2px]"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span
            className={[
              "h-3 w-3 rounded-full bg-gold-shine shadow-[0_0_12px_rgba(212,175,55,0.6)] opacity-0 transition-all duration-300",
              digit ? "opacity-100 scale-100" : "opacity-0 scale-50",
              isError && index === activeIndex && !digit
                ? "!bg-red-vivid !shadow-[0_0_12px_rgba(179,20,20,0.8)] animate-pulse"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          />
        </div>
      ))}
    </fieldset>
  );
}
