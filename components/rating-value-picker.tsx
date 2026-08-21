"use client";

type RatingValuePickerProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

const ratingOptions = Array.from({ length: 51 }, (_, index) => index / 10);

export function RatingValuePicker({
  value,
  onChange,
  disabled = false,
}: RatingValuePickerProps) {
  const valueString = value.toFixed(1);

  return (
    <>
      <select
        aria-label="Rating"
        className="h-12 min-w-28 rounded-xl border border-border/70 bg-background px-3 text-center text-lg font-semibold tabular-nums text-foreground sm:hidden"
        value={valueString}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {ratingOptions.map((option) => (
          <option key={option} value={option.toFixed(1)}>
            {option.toFixed(1)}
          </option>
        ))}
      </select>
      <input
        aria-label="Rating"
        className="hidden h-12 w-28 rounded-xl border border-border/70 bg-background px-3 text-center text-lg font-semibold tabular-nums text-foreground sm:block"
        type="number"
        inputMode="decimal"
        min="0"
        max="5"
        step="0.1"
        value={valueString}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue) && nextValue >= 0 && nextValue <= 5) {
            onChange(Math.round(nextValue * 10) / 10);
          }
        }}
      />
    </>
  );
}
