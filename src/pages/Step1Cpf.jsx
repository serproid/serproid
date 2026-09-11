import { useState } from "react";
import { formatCpf, isValidCpf } from "../utils/cpf";

export default function Step1Cpf({ onContinue }) {
  const [cpf, setCpf] = useState("");
  const [touched, setTouched] = useState(false);

  const digitsComplete = cpf.replace(/\D/g, "").length === 11;
  const valid = digitsComplete && isValidCpf(cpf);
  const showError = touched && digitsComplete && !valid;

  function handleChange(e) {
    setCpf(formatCpf(e.target.value));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (valid) onContinue(cpf);
  }

  return (
    <form className="step-panel" onSubmit={handleSubmit} noValidate>
      <h1 className="step-panel__title">Seja bem-vindo(a)</h1>
      <p className="step-panel__subtitle">
        Para iniciar sua validação de identidade, digite seu CPF abaixo
      </p>

      <label className="sr-only" htmlFor="cpf">
        CPF
      </label>
      <input
        id="cpf"
        name="cpf"
        className={`step-panel__input${showError ? " step-panel__input--error" : ""}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="000.000.000-00"
        value={cpf}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        maxLength={14}
      />
      {showError && <p className="step-panel__error">CPF inválido. Confira os números digitados.</p>}

      <button type="submit" className="step-panel__button" disabled={!digitsComplete}>
        Continuar
      </button>

      <p className="step-panel__footnote">
        Seus dados são protegidos e utilizados apenas para validação de identidade
      </p>
    </form>
  );
}
