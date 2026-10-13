import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  ArrowRight, ArrowUp, BookMarked, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clipboard, GraduationCap, History, Loader2, LockKeyhole, LogOut,
  Menu, MessageCircle, Plus, Settings2, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import { request } from './api';

const grades = Array.from({ length: 12 }, (_, i) => i + 1);
const boards = ['CBSE', 'ICSE', 'State Board', 'Other'];
const suggestions = [
  { subject: 'Science', question: 'Why is the sky blue?', symbol: '01', subtitle: 'Discover the world' },
  { subject: 'Mathematics', question: 'Explain fractions with examples.', symbol: '02', subtitle: 'Think step by step' },
  { subject: 'Biology', question: 'How do plants make their food?', symbol: '03', subtitle: 'Nature made simple' },
  { subject: 'English', question: 'Help me write a short story.', symbol: '04', subtitle: 'Build your words' },
];

function Brand() {
  return (
    <div className="brand flex items-center gap-3">
      <span className="brand-mark" aria-hidden="true"><BookOpen size={20} strokeWidth={2.35}/></span>
      <span className="font-display text-[19px] font-extrabold tracking-[-.045em] text-[#0f172a]">ClassWise<span className="text-[#2563eb]">.</span></span>
    </div>
  );
}
function Field({ label, children, hint }) {
  return <label className="block"><span className="mb-2 block text-[13px] font-semibold text-[#334155]">{label}</span>{children}{hint && <span className="mt-1.5 block text-xs text-[#64748b]">{hint}</span>}</label>;
}
function InlineError({ error }) {
  return error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700">{error}</p> : null;
}

function AuthScreen({ onAuth }) {
  // Returning students always see sign in first. Registration is an intentional next step.
  const [tab, setTab] = useState('login');
  const [signupStep, setSignupStep] = useState(1);
  const [form, setForm] = useState({ full_name: '', username: '', email: '', whatsapp_number: '+91',
    password: '', grade: 3, board: 'CBSE', language: 'English', guardian_permission: false });
  const [verification, setVerification] = useState({ step: 'idle', code: '', ticket: '' });
  const [otpEnabled, setOtpEnabled] = useState(null); // Fail closed if registration config is unavailable.
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    request('/config').then(result => {
      if (active) setOtpEnabled(result.whatsapp_otp_enabled === false ? false : true);
    }).catch(() => {
      // The sign-in screen must remain usable even if signup configuration cannot load.
      if (active) setOtpEnabled(null);
    });
    return () => { active = false; };
  }, []);

  function switchScreen(next) {
    if (busy) return;
    setTab(next);
    setSignupStep(1);
    setError('');
  }
  function change(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
    if (field === 'whatsapp_number') setVerification({ step: 'idle', code: '', ticket: '' });
    setError('');
  }
  async function startVerification() {
    if (busy) return;
    if (!form.guardian_permission) {
      setError('Please confirm parent or guardian permission first.');
      return;
    }
    setBusy('send'); setError('');
    try {
      await request('/auth/whatsapp/start', {
        method: 'POST', body: { whatsapp_number: form.whatsapp_number.trim() },
      });
      setVerification({ step: 'sent', code: '', ticket: '' });
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function checkVerification() {
    if (busy) return;
    setBusy('verify'); setError('');
    try {
      const result = await request('/auth/whatsapp/check', {
        method: 'POST', body: { whatsapp_number: form.whatsapp_number.trim(), code: verification.code },
      });
      setVerification(previous => ({ ...previous, step: 'verified', ticket: result.verification_ticket }));
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (tab === 'register' && signupStep === 1) {
      // Native required/email/tel/select validation runs before onSubmit.
      setSignupStep(2);
      setError('');
      window.scrollTo(0, 0);
      return;
    }
    if (tab === 'register' && otpEnabled === null) {
      setError('Cannot load registration settings. Check your connection and refresh.');
      return;
    }
    if (tab === 'register' && otpEnabled && verification.step !== 'verified') {
      setError('Verify your mobile number before creating an account.');
      return;
    }
    setBusy('account'); setError('');
    try {
      const data = await request(tab === 'register' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: tab === 'register'
          ? { ...form, whatsapp_number: form.whatsapp_number.trim(), grade: Number(form.grade),
              ...(otpEnabled ? { verification_ticket: verification.ticket } : {}) }
          : { username: form.username, password: form.password },
      });
      onAuth(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  const isRegister = tab === 'register';
  return (
    <div className="auth-shell min-h-[100dvh] bg-[#f8fafc] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,1fr)]">
      <section className="auth-editorial relative hidden min-h-screen flex-col justify-between overflow-hidden border-r border-[#dfe8f4] px-[clamp(35px,6vw,100px)] py-12 lg:flex">
        <Brand />
        <div className="relative z-10 max-w-[500px] py-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-[#cbdcf8] bg-white px-3 py-2 text-xs font-semibold text-[#1d4ed8]"><BookMarked size={15}/> THE EVERYDAY STUDY DESK</div>
          <h1 className="font-display text-[clamp(43px,4.2vw,68px)] font-extrabold leading-[1.1] tracking-[-.065em] text-[#0f172a]">
            Better questions.<br/><span className="text-[#2563eb]">Clearer answers.</span>
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-8 text-[#64748b]">
            A thoughtful learning companion that explains concepts at the level you study — from your first science lesson to senior school.
          </p>
          <div className="learning-note mt-11 max-w-[440px] bg-white p-6">
            <div className="mb-5 flex items-center justify-between border-b border-[#edf2f7] pb-4"><span className="font-display text-[13px] font-bold text-[#334155]">Inside a study session</span><span className="rounded-md bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold text-[#2563eb]">CLASS 03</span></div>
            <p className="mb-3 text-[13px] font-semibold text-[#64748b]">Student asks</p>
            <p className="rounded-lg bg-[#f1f5f9] px-4 py-3 text-sm font-semibold text-[#0f172a]">Why does a ball fall to the ground?</p>
            <div className="mt-5 flex items-center gap-2 text-[13px] font-bold text-[#1d4ed8]"><BookOpen size={16}/> Explained for your class</div>
            <p className="mt-2 text-[14px] leading-7 text-[#475569]">Earth pulls things toward itself. This pulling force is called <strong className="text-[#0f172a]">gravity</strong>. That's why a ball comes back down when you throw it up.</p>
          </div>
        </div>
        <p className="relative z-10 flex items-center gap-2 text-xs font-medium text-[#64748b]"><ShieldCheck size={16}/> Designed for focused, age-appropriate learning.</p>
      </section>
      <section className="auth-right flex min-h-[100dvh] min-w-0 flex-col px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] sm:items-center sm:justify-center sm:px-12 sm:py-10 lg:px-14">
        <div className="mx-auto w-full max-w-[440px]">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Brand/>
            <span className="rounded-md bg-[#eff6ff] px-2.5 py-1.5 text-[10px] font-bold tracking-[.08em] text-[#1d4ed8]">STUDY SMARTER</span>
          </div>
          <div className="mb-6 sm:mb-7">
            {isRegister ? <div className="mb-4 flex items-center gap-3" aria-label={`Registration step ${signupStep} of 2`}>
              {[1, 2].map(step => <div key={step} className="flex flex-1 items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${step <= signupStep ? 'bg-[#2563eb] text-white' : 'bg-[#e2e8f0] text-[#64748b]'}`}>{step < signupStep ? <Check size={15}/> : step}</span>
                <span className={`text-[11px] font-semibold ${step === signupStep ? 'text-[#1d4ed8]' : 'text-[#64748b]'}`}>{step === 1 ? 'Your details' : 'Account setup'}</span>
              </div>)}
            </div> : <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#2563eb]">Your learning space</p>}
            <h2 className="font-display mt-2 text-[clamp(27px,7vw,34px)] font-extrabold leading-tight tracking-[-.055em] text-[#0f172a]">
              {!isRegister ? 'Welcome back' : signupStep === 1 ? 'Let’s get to know you' : 'Set up your account'}
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#64748b]">
              {!isRegister ? 'Sign in to pick up where you left off.' : signupStep === 1
                ? 'A few details to make learning feel personal.' : 'One last step, then your study desk is ready.'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            {!isRegister && <>
              <Field label="Username"><input required minLength={3} maxLength={32} className="form-input" autoComplete="username" placeholder="Your username" value={form.username} onChange={e => change('username', e.target.value)}/></Field>
              <Field label="Password"><input required type="password" className="form-input" autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={e => change('password', e.target.value)}/></Field>
            </>}

            {isRegister && signupStep === 1 && <>
              <Field label="Full name"><input required minLength={2} maxLength={80} className="form-input" autoComplete="name" placeholder="Enter your full name" value={form.full_name} onChange={e => change('full_name', e.target.value)}/></Field>
              <Field label="Mobile number" hint="Include your country code (e.g. +919876543210).">
                <input required type="tel" inputMode="tel" autoComplete="tel" maxLength={16} pattern="\+[1-9][0-9]{7,14}" title="Enter a number with country code, for example +919876543210" className="form-input" placeholder="+919876543210" value={form.whatsapp_number} onChange={e => change('whatsapp_number', e.target.value)}/>
              </Field>
              <Field label="Email address"><input required type="email" maxLength={254} className="form-input" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={e => change('email', e.target.value)}/></Field>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="Class"><select required className="form-input" value={form.grade} onChange={e => change('grade', Number(e.target.value))}>{grades.map(g => <option value={g} key={g}>Class {g}</option>)}</select></Field>
                <Field label="School board"><select required className="form-input" value={form.board} onChange={e => change('board', e.target.value)}>{boards.map(b => <option key={b}>{b}</option>)}</select></Field>
              </div>
              <p className="flex items-start gap-2 text-[11.5px] leading-5 text-[#64748b]"><LockKeyhole size={14} className="mt-0.5 shrink-0"/> Class and school board can't be changed after registration.</p>
            </>}

            {isRegister && signupStep === 2 && <>
              <Field label="Username" hint="3–32 characters. Letters, numbers and underscores only.">
                <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores only" className="form-input" autoComplete="username" placeholder="Choose a username" value={form.username} onChange={e => change('username', e.target.value)}/>
              </Field>
              <Field label="Password" hint="Use at least 8 characters.">
                <input required type="password" minLength={8} maxLength={128} className="form-input" autoComplete="new-password" placeholder="Create a strong password" value={form.password} onChange={e => change('password', e.target.value)}/>
              </Field>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e2e8f0] bg-white px-3 py-3 text-[12px] leading-5 text-[#475569]">
                <input required type="checkbox" checked={form.guardian_permission} onChange={e => change('guardian_permission', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#2563eb]"/>
                <span>I am an adult or have permission from my parent or guardian to create this account.</span>
              </label>
              {otpEnabled === true && <div className="space-y-3 rounded-xl border border-[#d8e4f3] bg-[#f8fbff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-bold text-[#0f172a]">Verify mobile number</h3>{verification.step === 'verified' && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={15}/> Verified</span>}</div>
                <p className="text-[12px] leading-5 text-[#64748b]">We’ll send a one-time code to your mobile number via WhatsApp.</p>
                {verification.step === 'sent' && <div className="flex gap-2">
                  <input aria-label="Six-digit verification code" className="form-input min-w-0 flex-1" maxLength={6} inputMode="numeric" pattern="[0-9]{6}" placeholder="6-digit code" value={verification.code} onChange={e => setVerification(old => ({ ...old, code: e.target.value.replace(/\D/g, '') }))}/>
                  <button type="button" disabled={busy !== '' || verification.code.length !== 6} onClick={checkVerification} className="secondary-button shrink-0">{busy === 'verify' ? <Loader2 size={16} className="animate-spin"/> : 'Verify'}</button>
                </div>}
                {verification.step !== 'verified' && <button type="button" disabled={busy !== '' || !form.guardian_permission} onClick={startVerification} className="secondary-button w-full justify-center">
                  {busy === 'send' ? <Loader2 size={16} className="animate-spin"/> : verification.step === 'sent' ? 'Resend code' : 'Send verification code'}
                </button>}
              </div>}
            </>}

            <InlineError error={error}/>
            {isRegister && signupStep === 2 ? <div className="flex gap-3 pt-1">
              <button type="button" disabled={busy !== ''} onClick={() => { setSignupStep(1); setError(''); }} className="secondary-button min-h-[48px] justify-center px-5">Back</button>
              <button type="submit" disabled={busy !== '' || otpEnabled === null} className="primary-button min-h-[48px] flex-1 justify-center">
                {busy === 'account' ? <Loader2 size={18} className="animate-spin"/> : <>Create account <ArrowRight size={17}/></>}
              </button>
            </div> : <button type="submit" disabled={busy !== ''} className="primary-button mt-2 flex min-h-[48px] w-full justify-center">
              {busy === 'account' ? <Loader2 size={18} className="animate-spin"/> : <>{isRegister ? 'Continue' : 'Sign in'}<ArrowRight size={17}/></>}
            </button>}
          </form>
          <div className="mt-6 border-t border-[#e2e8f0] pt-5 text-center text-[13px] text-[#64748b]">
            {isRegister ? <>Already have an account? <button type="button" onClick={() => switchScreen('login')} className="font-bold text-[#1d4ed8] underline-offset-4 hover:underline">Sign in</button></>
              : <>New to ClassWise? <button type="button" onClick={() => switchScreen('register')} className="font-bold text-[#1d4ed8] underline-offset-4 hover:underline">Create an account</button></>}
          </div>
          <p className="mt-5 text-center text-[11px] leading-5 text-[#94a3b8]">AI can make mistakes. Check important answers with your teacher or textbook.</p>
        </div>
      </section>
    </div>
  );
}

function ProfileModal({ user, token, onClose, onUpdate }) {
  const [form, setForm] = useState({ full_name: user.full_name, language: user.language });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await request('/me', { method:'PATCH', token, body:form }); onUpdate(result); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" onMouseDown={e => {if(e.target===e.currentTarget)onClose();}}>
    <div role="dialog" aria-modal="true" aria-label="Learning profile" className="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-xl sm:p-8">
      <div className="mb-6 flex justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold text-[#0f172a]">Learning profile</h2><p className="mt-1 text-sm text-[#64748b]">The details that shape your study space.</p></div><button type="button" aria-label="Close" onClick={onClose}><X size={20}/></button></div>
      <form onSubmit={save} className="space-y-4"><Field label="Full name"><input className="form-input" required minLength={2} maxLength={80} value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})}/></Field>
        <Field label="Answer language"><select className="form-input" value={form.language} onChange={e=>setForm({...form,language:e.target.value})}><option>English</option><option>Hindi</option></select></Field>
        <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-4 text-[13px] leading-6 text-[#64748b]">
          <div className="mb-2 flex items-center gap-1.5 font-bold text-[#334155]"><LockKeyhole size={15}/> Fixed academic details</div>
          <p><strong className="text-[#0f172a]">Class {user.grade}</strong> · {user.board}</p>
          <p className="mt-1">Registered email: {user.email}</p><p>{user.whatsapp_verified ? 'Verified WhatsApp' : 'WhatsApp (not verified)'}: {user.whatsapp_number}</p>
          <p className="mt-2 text-[12px]">Class and board cannot be changed after registration.</p>
        </div>
        <InlineError error={error}/><button type="submit" disabled={busy} className="primary-button w-full justify-center py-3">{busy ? <Loader2 size={17} className="animate-spin"/> : <><Check size={17}/> Save profile</>}</button>
      </form>
    </div>
  </div>;
}

function Answer({ content }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  }
  return <div className="min-w-0 flex-1">
    <div className="ai-markdown break-words text-[14.5px] leading-[1.85] text-[#334155]">
      <ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>
    </div>
    <button type="button" onClick={copy} title="Copy answer" className="mt-3 inline-flex items-center gap-1.5 rounded-md p-1.5 text-xs font-semibold text-[#94a3b8] transition hover:bg-[#eff6ff] hover:text-[#2563eb]">{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Copied' : 'Copy answer'}</button>
  </div>;
}
function MessageBubble({ message }) {
  const mine = message.role === 'user';
  if (mine) return <div className="flex justify-end"><div className="max-w-[min(92%,730px)] whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-[#eff6ff] px-4 py-3.5 text-[14px] leading-6 text-[#1e3a8a]">{message.content}</div></div>;
  return <div className="flex gap-3.5"><span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]"><BookOpen size={17}/></span><Answer content={message.content}/></div>;
}
function Sidebar({ user, conversations, activeId, onNew, onOpen, onDelete, onSettings, onLogout, visible, close }) {
  return <>
    {visible && <button aria-label="Close navigation" onClick={close} className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"/>}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[278px] max-w-[88vw] shrink-0 flex-col border-r border-[#e2e8f0] bg-white transition-transform md:static md:translate-x-0 ${visible ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-6 py-7"><Brand/><button className="md:hidden" onClick={close} aria-label="Close menu"><X size={20}/></button></div>
      <div className="px-4"><button onClick={onNew} className="primary-button w-full justify-center py-3"><Plus size={18}/> New question</button></div>
      <div className="mt-9 px-6"><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#94a3b8]">Study workspace</p></div>
      <div className="mt-3 space-y-1 px-3"><div className="flex items-center gap-3 rounded-lg bg-[#eff6ff] px-4 py-3 text-[13px] font-bold text-[#1d4ed8]"><MessageCircle size={17}/> Ask ClassWise</div></div>
      <div className="mt-9 flex items-center justify-between px-6"><span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#94a3b8]">Recent questions</span><History size={15} className="text-[#94a3b8]"/></div>
      <nav aria-label="Chat history" className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {!conversations.length && <p className="px-3 py-3 text-[13px] leading-6 text-[#94a3b8]">Your questions will appear here once you start studying.</p>}
        {conversations.map(c => <div key={c.id} className={`group flex items-center rounded-lg pr-1 ${activeId === c.id ? 'bg-[#f1f5f9]' : 'hover:bg-[#f8fafc]'}`}>
          <button onClick={() => onOpen(c.id)} className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left text-[13px] font-medium ${activeId === c.id ? 'text-[#1d4ed8]' : 'text-[#64748b]'}`}><MessageCircle size={15} className="shrink-0"/><span className="truncate">{c.title}</span></button>
          <button onClick={() => onDelete(c.id)} aria-label={`Delete ${c.title}`} title="Delete conversation" className="rounded-md p-2 text-[#94a3b8] hover:bg-white hover:text-red-600 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"><Trash2 size={15}/></button>
        </div>)}
      </nav>
      <div className="border-t border-[#e2e8f0] p-4">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#64748b] hover:bg-[#f1f5f9]" onClick={onSettings}><Settings2 size={17}/> Your profile</button>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#64748b] hover:bg-[#f1f5f9]" onClick={onLogout}><LogOut size={17}/> Sign out</button>
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#dbeafe] text-sm font-bold text-[#1d4ed8]">{user.full_name[0]?.toUpperCase()}</span><div className="min-w-0"><p className="truncate text-[13px] font-bold text-[#0f172a]">{user.full_name}</p><p className="truncate text-[11px] text-[#64748b]">Class {user.grade} · {user.board}</p></div></div>
      </div>
    </aside>
  </>;
}

function ChatScreen({ user, token, onUpdateUser, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeRef = useRef(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { request('/conversations', {token}).then(setConversations).catch(err => setError(err.message)); }, [token]);
  useEffect(() => {scrollRef.current?.scrollIntoView({behavior:'smooth'});}, [messages,sending]);
  async function refresh() { setConversations(await request('/conversations', {token})); }
  function newChat() { if (busyRef.current) return; requestRef.current += 1; activeRef.current = null; setActiveId(null); setMessages([]); setQuestion(''); setError(''); setSidebarOpen(false); inputRef.current?.focus(); }
  async function openChat(id) { if (busyRef.current) return; const ticket=++requestRef.current; activeRef.current=id; setActiveId(id); setSidebarOpen(false); setMessages([]); setError(''); setLoadingChat(true); try {const chat=await request(`/conversations/${id}`,{token}); if(ticket===requestRef.current)setMessages(chat.messages);} catch(err){if(ticket===requestRef.current)setError(err.message);} finally{if(ticket===requestRef.current)setLoadingChat(false);} }
  async function deleteChat(id) { if(busyRef.current || !window.confirm('Delete this conversation?'))return; try{await request(`/conversations/${id}`,{token,method:'DELETE'});if(activeRef.current===id)newChat();await refresh();}catch(err){setError(err.message);} }
  async function send(text=question) {
    const clean=text.trim(); if(!clean || busyRef.current || loadingChat)return;
    busyRef.current=true;setSending(true);setError('');setQuestion('');
    const optimistic={id:`temp_${Date.now()}`,role:'user',content:clean};setMessages(old=>[...old,optimistic]);
    try{
      let id=activeRef.current;
      if(id===null){const chat=await request('/conversations',{method:'POST',token});id=chat.id;activeRef.current=id;setActiveId(id);}
      const result=await request(`/conversations/${id}/messages`,{method:'POST',token,body:{question:clean}});
      setMessages(old=>[...old.filter(m=>m.id!==optimistic.id),result.user_message,result.assistant_message]);
      refresh().catch(()=>{});
    }catch(err){setMessages(old=>old.filter(m=>m.id!==optimistic.id));setQuestion(clean);setError(err.message);}
    finally{busyRef.current=false;setSending(false);inputRef.current?.focus();}
  }
  const subjects=['Mathematics','Science','Social Science','English'];
  return <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#f8fafc]">
    <Sidebar user={user} conversations={conversations} activeId={activeId} visible={sidebarOpen} close={()=>setSidebarOpen(false)} onNew={newChat} onOpen={openChat} onDelete={deleteChat} onSettings={()=>{setSidebarOpen(false);setSettingsOpen(true);}} onLogout={onLogout}/>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><button className="rounded-md p-2 text-[#334155] hover:bg-slate-100 md:hidden" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu size={22}/></button><div><h1 className="font-display text-[15px] font-extrabold tracking-[-.02em] text-[#0f172a] sm:text-[17px]">Study desk</h1><p className="hidden text-[12px] text-[#94a3b8] sm:block">A quiet place to understand something new.</p></div></div>
        <button onClick={()=>setSettingsOpen(true)} className="flex shrink-0 items-center gap-2 rounded-lg border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-[12px] font-bold text-[#1d4ed8] hover:bg-[#dbeafe]"><GraduationCap size={16}/> Class {user.grade}<span className="hidden text-[#93c5fd] sm:inline">/</span><span className="hidden sm:inline">{user.board}</span></button>
      </header>
      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto" aria-live="polite">
          <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col px-4 pb-6 pt-6 sm:px-8 sm:pt-10">
            {loadingChat ? <div className="flex flex-1 items-center justify-center text-[#2563eb]"><Loader2 className="animate-spin" size={27}/></div> : messages.length===0 && !sending ?
            <div className="my-auto py-8 sm:py-12">
              <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-xl border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]"><BookOpen size={27}/></div>
              <div className="mb-3 inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.14em] text-[#2563eb]"><span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]"/> Your Class {user.grade} study companion</div>
              <h2 className="font-display max-w-[700px] text-[clamp(30px,3.8vw,47px)] font-extrabold leading-[1.14] tracking-[-.055em] text-[#0f172a]">What would you like to <span className="text-[#2563eb]">understand today?</span></h2>
              <p className="mt-4 max-w-[590px] text-[15px] leading-7 text-[#64748b]">Hello, {user.full_name.split(' ')[0]}. Ask a question and explore it with examples, clear explanations, and steps that match your level.</p>
              <div className="mt-9 flex gap-2 overflow-x-auto pb-2">{subjects.map(item=><span key={item} className="shrink-0 rounded-md border border-[#e2e8f0] bg-white px-3 py-2 text-xs font-semibold text-[#475569]">{item}</span>)}</div>
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">{suggestions.map(item=><button type="button" key={item.subject} onClick={()=>send(item.question)} className="study-card group flex min-h-[144px] min-w-0 flex-col items-start justify-between p-3.5 text-left sm:min-h-[126px] sm:p-5">
                <div className="flex w-full items-center justify-between"><span className="font-mono text-[9px] font-bold text-[#94a3b8] sm:text-[11px]">{item.symbol} / {item.subject.toUpperCase()}</span><ArrowRight size={17} className="text-[#94a3b8] transition group-hover:translate-x-0.5 group-hover:text-[#2563eb]"/></div><div><h3 className="mt-4 font-display text-[13px] font-bold leading-5 text-[#0f172a] sm:text-[15px]">{item.question}</h3><p className="mt-1 text-[11px] text-[#94a3b8] sm:text-xs">{item.subtitle}</p></div></button>)}</div>
              <p className="mt-7 flex items-center gap-2 text-xs text-[#94a3b8]"><CircleHelp size={15}/> You can ask as many follow-up questions as you need.</p>
            </div> : <div className="flex flex-col gap-8 pb-10">{messages.map(m=><MessageBubble key={m.id} message={m}/>)}{sending && <div className="flex items-center gap-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]"><BookOpen size={17}/></span><span className="inline-flex items-center gap-2 text-sm text-[#64748b]"><Loader2 size={15} className="animate-spin"/> Preparing an explanation for Class {user.grade}...</span></div>}<div ref={scrollRef}/></div>}
          </div>
        </div>
        <div className="shrink-0 border-t border-[#e2e8f0] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pb-6">
          <div className="mx-auto max-w-[900px]">{error && <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}
            <form onSubmit={e=>{e.preventDefault();send();}} className="flex items-end gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] p-2 focus-within:border-[#2563eb] focus-within:ring-[3px] focus-within:ring-[#dbeafe]">
              <textarea ref={inputRef} rows={1} maxLength={2000} className="max-h-[140px] min-h-[42px] w-full resize-none bg-transparent px-3 py-2.5 text-[16px] sm:text-[14px] leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8]" value={question} onChange={e=>setQuestion(e.target.value)} placeholder={`Ask something from Class ${user.grade}...`} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
              <button aria-label="Send question" type="submit" disabled={!question.trim()||sending||loadingChat} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-[#cbd5e1]"><ArrowUp size={20}/></button>
            </form>
            <p className="mt-2.5 text-center text-[11px] leading-5 text-[#94a3b8]">ClassWise can be mistaken. For important topics, confirm with your textbook or teacher.</p>
          </div>
        </div>
      </main>
    </div>
    {settingsOpen && <ProfileModal user={user} token={token} onClose={()=>setSettingsOpen(false)} onUpdate={onUpdateUser}/>}
  </div>;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('classwise_token')||'');
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(Boolean(token));
  useEffect(()=>{if(!token){setUser(null);setInitializing(false);return;}let active=true;request('/me',{token}).then(student=>{if(active)setUser(student);}).catch(()=>{if(active){localStorage.removeItem('classwise_token');setToken('');setUser(null);}}).finally(()=>{if(active)setInitializing(false);});return ()=>{active=false;};},[token]);
  function authenticated(data){localStorage.setItem('classwise_token',data.access_token);setUser(data.student);setToken(data.access_token);setInitializing(false);}
  function logout(){localStorage.removeItem('classwise_token');setUser(null);setToken('');setInitializing(false);}
  if(initializing)return <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-[#2563eb]"><Loader2 size={30} className="animate-spin"/></div>;
  if(!token||!user)return <AuthScreen onAuth={authenticated}/>;
  return <ChatScreen token={token} user={user} onUpdateUser={setUser} onLogout={logout}/>;
}
