import { useState } from "react";
import "./App.css";
import StepProgress from "./components/StepProgress";
import Step1Cpf from "./pages/Step1Cpf";
import StepPlaceholder from "./pages/StepPlaceholder";

const TOTAL_STEPS = 4;

export default function App() {
  const [step, setStep] = useState(1);
  const [cpf, setCpf] = useState("");

  function goNext() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  return (
    <div className="page">
      <div className="page__inner">
        <StepProgress current={step} total={TOTAL_STEPS} />

        {step === 1 && (
          <Step1Cpf
            onContinue={(value) => {
              setCpf(value);
              goNext();
            }}
          />
        )}

        {step === 2 && (
          <StepPlaceholder
            step={2}
            title="Confirme seus dados"
            subtitle={`CPF informado: ${cpf}`}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {step === 3 && (
          <StepPlaceholder
            step={3}
            title="Envie um documento"
            subtitle="Próxima etapa da validação"
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {step === 4 && (
          <StepPlaceholder
            step={4}
            title="Tudo pronto"
            subtitle="Sua validação foi concluída"
            onContinue={() => {}}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}
