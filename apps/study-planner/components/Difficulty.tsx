const LABELS = ["", "Easy", "Fairly easy", "Medium", "Hard", "Very hard"];

export default function Difficulty({ level }: { level: number }) {
  const value = Math.min(5, Math.max(1, Math.round(level)));
  return (
    <span className={`difficulty difficulty-${value}`} title={`Difficulty: ${LABELS[value]}`}>
      <span className="visually-hidden">
        Difficulty {value} of 5 ({LABELS[value]})
      </span>
      <span className="difficulty-dots" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= value ? "dot dot-on" : "dot"} />
        ))}
      </span>
    </span>
  );
}
