import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { formatCpf, isValidCpf } from "./utils/cpf";

const TOTAL_STEPS = 4;

function Header({ step }) {
  return (
    <header className="brand-area">
      <div className="brand-mark" aria-label="SerproID">SerproID</div>
      <div className="progress" role="progressbar" aria-valuenow={step} aria-valuemin="1" aria-valuemax={TOTAL_STEPS}>
        <div className="progress__track">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <span key={index} className={index < step ? "progress__segment is-active" : "progress__segment"} />
          ))}
        </div>
        <p>Etapa <strong>{step}</strong> de {TOTAL_STEPS}</p>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer-brand" aria-label="Governo Federal">
      <span className="gov-blue">gov</span><span className="gov-green">.</span><span className="gov-yellow">br</span>
    </footer>
  );
}

function Step1({ cpf, setCpf, onContinue }) {
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const digits = cpf.replace(/\D/g, "");
  const valid = digits.length === 11 && isValidCpf(cpf);
  const error = touched && digits.length === 11 && !valid;

  function submit(event) {
    event.preventDefault();
    setTouched(true);
    if (!valid || loading) return;
    setLoading(true);
    window.setTimeout(() => onContinue(), 900);
  }

  return (
    <form className="step-panel" onSubmit={submit} noValidate>
      <div className="eyebrow">IDENTIDADE DIGITAL</div>
      <h1>Seja bem-vindo(a)</h1>
      <p className="subtitle">Para iniciar sua validação de identidade, digite seu CPF abaixo</p>
      <label className="sr-only" htmlFor="cpf">CPF</label>
      <input
        id="cpf" name="cpf" autoFocus inputMode="numeric" autoComplete="off"
        className={error ? "input input--error" : "input"}
        placeholder="000.000.000-00" value={cpf} maxLength={14}
        onChange={(event) => setCpf(formatCpf(event.target.value))}
        onBlur={() => setTouched(true)}
      />
      {error && <p className="error-message">CPF inválido. Confira os números digitados.</p>}
      <button className="primary-button" type="submit" disabled={digits.length !== 11 || loading}>
        {loading ? <><span className="spinner" /> Consultando...</> : "Continuar"}
      </button>
      <p className="privacy"><span className="lock">⌕</span> Seus dados são protegidos e utilizados apenas para validação de identidade</p>
    </form>
  );
}

function Step2({ cpf, onContinue, onBack }) {
  const masked = useMemo(() => `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`, [cpf]);
  return (
    <section className="step-panel">
      <div className="illustration illustration--person"><span>✓</span></div>
      <h1>Confirme seus dados</h1>
      <p className="subtitle">Encontramos um cadastro para o CPF informado. Confira antes de continuar.</p>
      <div className="summary-card"><span>CPF</span><strong>{masked}</strong><span className="verified">✓ verificado</span></div>
      <button className="primary-button" type="button" onClick={onContinue}>Confirmar e continuar</button>
      <button className="secondary-button" type="button" onClick={onBack}>Voltar</button>
      <p className="privacy">Você está no ambiente seguro SerproID</p>
    </section>
  );
}

function Step3({ onContinue, onBack }) {
  const [selected, setSelected] = useState("");
  return (
    <section className="step-panel">
      <div className="illustration illustration--document"><span>▤</span></div>
      <h1>Envie um documento</h1>
      <p className="subtitle">Escolha um documento oficial com foto para confirmar sua identidade.</p>
      <div className="document-options" role="radiogroup" aria-label="Tipo de documento">
        {["Carteira de identidade (RG)", "Carteira de motorista (CNH)"].map((item) => (
          <button key={item} type="button" className={selected === item ? "document-option is-selected" : "document-option"} onClick={() => setSelected(item)}>
            <span className="radio">{selected === item ? "✓" : ""}</span>{item}
          </button>
        ))}
      </div>
      <div className="upload-note"><span>↥</span><div><strong>Foto nítida e bem iluminada</strong><small>Você poderá enviar a imagem na próxima tela</small></div></div>
      <button className="primary-button" type="button" disabled={!selected} onClick={onContinue}>Continuar</button>
      <button className="secondary-button" type="button" onClick={onBack}>Voltar</button>
    </section>
  );
}

function Step4({ onRestart }) {
  return (
    <section className="step-panel complete-panel">
      <div className="success-icon">✓</div>
      <h1>Validação iniciada!</h1>
      <p className="subtitle">Recebemos suas informações. Em breve você receberá o resultado da sua validação de identidade.</p>
      <div className="status-card"><span className="status-dot" /> Processo em análise</div>
      <button className="primary-button" type="button" onClick={onRestart}>Voltar ao início</button>
      <p className="privacy">Não feche esta página até concluir o processo.</p>
    </section>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [cpf, setCpf] = useState("");
  useEffect(() => { document.title = "SerproID — Identidade digital segura"; }, []);
  return (
    <main className="page">
      <div className="page__inner">
        <Header step={step} />
        <div className="content" key={step}>
          {step === 1 && <Step1 cpf={cpf} setCpf={setCpf} onContinue={() => setStep(2)} />}
          {step === 2 && <Step2 cpf={cpf} onContinue={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <Step3 onContinue={() => setStep(4)} onBack={() => setStep(2)} />}
          {step === 4 && <Step4 onRestart={() => { setStep(1); setCpf(""); }} />}
        </div>
        <Footer />
      </div>
    </main>
  );
}
