"use client";

import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./OtpPinInput.module.css";

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

  const focusInput = () => {
    if (disabled) {
      return;
    }
    inputRef.current?.focus();
    const nextPos = value.length;
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextPos, nextPos);
    });
  };

  useEffect(() => {
    if (autoFocus && !disabled) {
      focusInput();
    }
  }, [autoFocus, disabled]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value.replace(/\D/g, "").slice(0, length);
    onChange(nextValue);
  };

  return (
    <div
      className={[styles.root, disabled ? styles.disabled : ""].filter(Boolean).join(" ")}
      style={{ "--otp-length": length } as CSSProperties}
      onClick={focusInput}
      role="group"
      aria-label="PIN input"
    >
      <input
        id={`otp-${uniqueId}`}
        ref={inputRef}
        className={styles.hiddenInput}
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
            styles.slot,
            digit ? styles.slotFilled : "",
            isFocused && index === activeIndex ? styles.slotActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={[styles.dot, digit ? styles.dotVisible : ""].filter(Boolean).join(" ")} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
