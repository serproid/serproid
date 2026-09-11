export default function StepPlaceholder({ step, title, subtitle, onContinue, onBack }) {
  return (
    <div className="step-panel">
      <h1 className="step-panel__title">{title}</h1>
      <p className="step-panel__subtitle">{subtitle}</p>

      <div className="step-panel__placeholder">Etapa {step} — em construção</div>

      <button type="button" className="step-panel__button" onClick={onContinue}>
        Continuar
      </button>
      <button type="button" className="step-panel__ghost-button" onClick={onBack}>
        Voltar
      </button>
    </div>
  );
}
