export default function StepProgress({ current, total }) {
  return (
    <div className="step-progress">
      <div className="step-progress__track" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`step-progress__segment${i < current ? " step-progress__segment--done" : ""}`}
          />
        ))}
      </div>
      <p className="step-progress__label">
        Etapa <strong>{current}</strong> de {total}
      </p>
    </div>
  );
}
