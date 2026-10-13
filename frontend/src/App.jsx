import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  ArrowRight, ArrowUp, BookMarked, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clipboard, GraduationCap, History, Loader2, LockKeyhole, LogOut,
  Menu, MessageCircle, Plus, Settings2, ShieldCheck, Sparkles, Trash2, X,
  ChevronDown, Eye, EyeOff, Search, UserRound, Mail, Mic, MicOff, Calculator, FlaskConical, BookText, Globe2, MessageSquareMore, Lock, ArrowLeft,
} from 'lucide-react';
import { request, streamQuestion } from './api';
import { countryCodes } from './countryCodes';

const grades = Array.from({ length: 12 }, (_, i) => i + 1);
const boards = ['CBSE', 'ICSE', 'State Board', 'Other'];
// Keep the local-number field to ten digits, while storing E.164 for the existing backend.
// The ten-digit rule applies to every listed country in this version of the signup UI.


const suggestions = [
  { subject: 'Science', question: 'Why is the sky blue?', symbol: '01', subtitle: 'Discover the world' },
  { subject: 'Mathematics', question: 'Explain fractions with examples.', symbol: '02', subtitle: 'Think step by step' },
  { subject: 'Biology', question: 'How do plants make their food?', symbol: '03', subtitle: 'Nature made simple' },
  { subject: 'English', question: 'Help me write a short story.', symbol: '04', subtitle: 'Build your words' },
];

// Keep navigation inside the mobile web app, including Android's system Back button.
// Each forward view creates a history entry; popstate restores the previous view.
const SM_HISTORY_KEY = '__studymate_nav';
function saveNavigation(area, page, extra = {}, replace = false) {
  const data = { [SM_HISTORY_KEY]: true, area, page, ...extra };
  window.history[replace ? 'replaceState' : 'pushState'](data, '');
  return data;
}

// Normalize math from Groq and already-saved chats BEFORE Markdown processing.
// react-markdown understands $...$ and $$...$$, but not the model's \[...\] / \(...\).
export function normalizeStudyMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, body) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body) => `$${body.trim()}$`);
}

function Brand() {
  return (
    <div className="brand flex items-center gap-2.5">
      <img src="/studymate-logo.svg" className="brand-symbol" width="42" height="42" alt="" aria-hidden="true" />
      <span className="font-display text-[20px] font-extrabold tracking-[-.045em] text-[#0f172a]">Study<span className="text-[#2563eb]">Mate</span></span>
    </div>
  );
}

// A small reusable field: same behavior and accessible control on sign-in and sign-up.
function PasswordInput({ id, value, onChange, autoComplete, placeholder, minLength }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <input id={id}
      className="form-input password-input" required
      type={visible ? 'text' : 'password'} minLength={minLength} maxLength={128}
      autoComplete={autoComplete} placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)}
    />
    <button type="button" className="password-visibility" onClick={() => setVisible(old => !old)}
      aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
      title={visible ? 'Hide password' : 'Show password'}>
      {visible ? <EyeOff size={19}/> : <Eye size={19}/>}
    </button>
  </div>;
}

function sanitizePhone(value, countryDial) {
  let digits = value.replace(/\D/g, '');
  const prefix = countryDial.slice(1);
  // Handle an international number pasted with its country code.
  if (digits.length > 10 && digits.startsWith(prefix) && digits.length === prefix.length + 10) {
    digits = digits.slice(prefix.length);
  }
  return digits.slice(0, 10);
}

function PhoneInput({ country, phone, onCountryChange, onPhoneChange, onPhoneBlur, invalid }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapper = useRef(null);
  const searchInput = useRef(null);
  const matches = countryCodes.filter(c =>
    `${c.name} ${c.iso} ${c.dial}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    function onPointerDown(e) { if (!wrapper.current?.contains(e.target)) setOpen(false); }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);
  return <div className="phone-wrapper" ref={wrapper}>
    <div className={`phone-control ${invalid ? 'phone-control-invalid' : ''}`}>
      <button type="button" className="phone-country-trigger" aria-expanded={open}
        aria-label={`Country code: ${country.name} ${country.dial}. Change country`}
        aria-haspopup="listbox" onClick={() => {setSearch('');setOpen(old => !old);}}>
        <span aria-hidden="true" className="phone-flag">{country.flag}</span>
        <span>{country.dial}</span><ChevronDown size={15} className="phone-chevron" aria-hidden="true"/>
      </button>
      <span className="phone-separator" aria-hidden="true"/>
      <input type="tel" inputMode="numeric" pattern="[0-9]{10}" required
        title="Enter exactly 10 digits without the country code"
        maxLength={10} autoComplete="tel-national" aria-label="10-digit mobile number"
        placeholder="10-digit number" className="phone-number-input" value={phone}
        onChange={e => onPhoneChange(sanitizePhone(e.target.value, country.dial))}
        onPaste={e => {
          const pasted = e.clipboardData.getData('text');
          if (pasted.trim().startsWith('+')) {
            e.preventDefault();
            onPhoneChange(sanitizePhone(pasted, country.dial));
          }
        }}
        onBlur={onPhoneBlur} aria-invalid={invalid} id="signup-phone"/>
      {phone.length === 10 && <Check size={17} className="phone-check" aria-label="10 digits entered"/>}
    </div>
    {open && <div className="country-picker" role="group" aria-label="Choose country code">
      <label className="country-search"><Search size={17} aria-hidden="true"/>
        <input ref={searchInput} value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search for countries" aria-label="Search for countries"/>
      </label>
      <div className="country-options" role="listbox" aria-label="Countries">
        {matches.map(c => <button type="button" role="option" aria-selected={c.iso === country.iso}
          key={c.iso} className={`country-option ${c.iso === country.iso ? 'country-option-selected' : ''}`}
          onClick={() => {onCountryChange(c); setOpen(false); setSearch('');}}>
          <span className="phone-flag" aria-hidden="true">{c.flag}</span><span className="country-option-name">{c.name}</span>
          <span className="country-dial">{c.dial}</span>
        </button>)}
        {matches.length === 0 && <p className="country-empty">No matching countries</p>}
      </div>
    </div>}
  </div>;
}

function Field({ label, children, hint, icon }) {
  const id = useId();
  const control = cloneElement(children, { id });
  return <div className="auth-field">
    <label htmlFor={id} className="auth-field-label">{label}</label>
    {icon ? <div className="auth-icon-field"><span className="auth-field-icon" aria-hidden="true">{icon}</span>{control}</div> : control}
    {hint && <p className="auth-field-hint">{hint}</p>}
  </div>;
}
function InlineError({ error }) {
  return error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700">{error}</p> : null;
}

function AuthScreen({ onAuth }) {
  // Returning students always see sign in first. Registration is an intentional next step.
  const [tab, setTab] = useState('login');
  const [signupStep, setSignupStep] = useState(1);
  const [form, setForm] = useState({ full_name: '', username: '', email: '',
    password: '', grade: '', board: '', language: 'English', guardian_permission: false });
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0]);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const fullPhoneNumber = `${selectedCountry.dial}${phoneDigits}`;
  const [verification, setVerification] = useState({ step: 'idle', code: '', ticket: '' });
  const [otpEnabled, setOtpEnabled] = useState(null); // Fail closed if registration config is unavailable.
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [exitWarning, setExitWarning] = useState(false);
  const authRouteRef = useRef({ tab: 'login', step: 1 });
  const authHistoryInitialized = useRef(false);
  const mayExitRef = useRef(false);

  useEffect(() => {
    if (!authHistoryInitialized.current) {
      saveNavigation('auth', 'login');
      authHistoryInitialized.current = true;
    }
    const onBack = (event) => {
      if (mayExitRef.current) return;
      const state = event.state;
      if (state?.[SM_HISTORY_KEY] && state.area === 'auth') {
        const nextTab = state.page === 'register' ? 'register' : 'login';
        const nextStep = nextTab === 'register' ? (state.step || 1) : 1;
        authRouteRef.current = { tab: nextTab, step: nextStep };
        setTab(nextTab); setSignupStep(nextStep); setError('');
      } else {
        const previous = authRouteRef.current;
        saveNavigation('auth', previous.tab, { step: previous.step });
        setExitWarning(true);
      }
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  function confirmExit() { mayExitRef.current = true; window.history.go(-2); }

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
    authRouteRef.current = { tab: next, step: 1 };
    saveNavigation('auth', next, { step: 1 });
    setTab(next);
    setSignupStep(1);
    setForm(previous => ({ ...previous, username: '', password: '' }));
    setConfirmPassword('');
    setError('');
  }
  function change(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
    setError('');
  }
  function onPhoneChange(value) {
    setPhoneDigits(value); // A country code is never entered into this 10-digit field.
    setVerification({ step: 'idle', code: '', ticket: '' });
    setError('');
  }
  function onCountryChange(value) {
    setSelectedCountry(value);
    setVerification({ step: 'idle', code: '', ticket: '' });
    setError('');
  }
  async function startVerification() {
    if (busy) return;
    if (phoneDigits.length !== 10) {
      setError('Please enter exactly 10 digits before requesting verification.');
      return;
    }
    if (!form.guardian_permission) {
      setError('Please confirm parent or guardian permission first.');
      return;
    }
    setBusy('send'); setError('');
    try {
      await request('/auth/whatsapp/start', {
        method: 'POST', body: { whatsapp_number: fullPhoneNumber },
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
        method: 'POST', body: { whatsapp_number: fullPhoneNumber, code: verification.code },
      });
      setVerification(previous => ({ ...previous, step: 'verified', ticket: result.verification_ticket }));
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (tab === 'register' && phoneDigits.length !== 10) {
      setError('Enter exactly 10 digits for your mobile number.');
      return;
    }
    if (tab === 'register' && signupStep === 1) {
      // Native required/email/tel/select validation runs before onSubmit.
      authRouteRef.current = { tab: 'register', step: 2 };
      saveNavigation('auth', 'register', { step: 2 });
      setSignupStep(2);
      setError('');
      window.scrollTo(0, 0);
      return;
    }
    if (tab === 'register' && form.password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter them.');
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
          ? { ...form, username: undefined, whatsapp_number: fullPhoneNumber, grade: Number(form.grade),
              ...(otpEnabled ? { verification_ticket: verification.ticket } : {}) }
          : { username: form.username, password: form.password },
      });
      onAuth(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  const isRegister = tab === 'register';
  function previousStep() {
    if (signupStep === 2 || tab === 'register') window.history.back();
    else setExitWarning(true);
  }
  return (
    <div className={`auth-shell ${isRegister ? 'auth-register' : 'auth-login'}`}>
      <section className="auth-editorial auth-desktop-story" aria-hidden="true">
        <Brand/>
        <div className="auth-desktop-story-content">
          <span className="auth-story-eyebrow">YOUR STUDY COMPANION</span>
          <h1>Learning feels<br/><span>better together.</span></h1>
          <p>Simple, thoughtful explanations made for the class you study in. Ask, discover, and grow at your own pace.</p>
          <div className="auth-story-note"><BookOpen size={19}/> Answers shaped around your learning level</div>
        </div>
        <p className="auth-story-footer">StudyMate · A little help, every day.</p>
      </section>
      <section className="auth-main">
        <div className="auth-main-inner">
          {!isRegister ? (
            <div className="auth-login-hero">
              <img src="/studymate-logo.svg" alt="" className="auth-hero-logo"/>
              <h1 className="font-display">Study<span>Mate</span></h1>
              <p>Your Personal AI Study Companion</p>
            </div>
          ) : <>
            <div className="auth-register-nav">
              <button type="button" aria-label="Go back" onClick={previousStep} className="auth-nav-back"><ArrowLeft size={23}/></button>
              <Brand/>
              <span className="auth-nav-spacer"/>
            </div>
            <div className="auth-step-indicator" aria-label={`Step ${signupStep} of 2`}>
              <span className={`auth-step-circle ${signupStep === 1 ? 'active' : 'done'}`}>1</span>
              <span className={`auth-step-bar ${signupStep === 2 ? 'active' : ''}`}/>
              <span className={`auth-step-circle ${signupStep === 2 ? 'active' : ''}`}>2</span>
            </div>
            <div className="auth-register-intro">
              <h1 className="font-display">Create Your Account</h1>
              <p className="auth-register-step">Step {signupStep} of 2 – {signupStep === 1 ? 'Student Details' : 'Account Setup'}</p>
              <p className="auth-register-description">{signupStep === 1 ? "We'll use this information to give you the best learning experience." : 'Enter your email and create a secure password to access your account.'}</p>
            </div>
          </>}
          <div className="auth-card">
            {!isRegister && <div className="auth-login-intro">
              <h2 className="font-display">Welcome Back</h2>
              <p>Sign in to continue your learning journey</p>
            </div>}
            <form className="auth-form" onSubmit={submit}>
              {!isRegister && <>
                <Field label="Email address" icon={<Mail size={20}/>}>
                  <input required maxLength={254} className="form-input" autoComplete="email" inputMode="email" placeholder="Enter your email address" value={form.username} onChange={e => change('username', e.target.value)}/>
                </Field>
                <Field label="Password" icon={<LockKeyhole size={19}/>}>
                  <PasswordInput key="login-password" autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={value => change('password', value)}/>
                </Field>
              </>}
              {isRegister && signupStep === 1 && <>
                <Field label="Full Name" icon={<UserRound size={19}/>}>
                  <input required minLength={2} maxLength={80} className="form-input" autoComplete="name" placeholder="Enter your full name" value={form.full_name} onChange={e => change('full_name', e.target.value)}/>
                </Field>
                <div className="auth-field">
                  <label htmlFor="signup-phone" className="auth-field-label">Mobile Number</label>
                  <PhoneInput country={selectedCountry} phone={phoneDigits} invalid={phoneTouched && phoneDigits.length !== 10}
                    onPhoneBlur={() => setPhoneTouched(true)} onPhoneChange={onPhoneChange} onCountryChange={onCountryChange}/>
                  {phoneTouched && phoneDigits.length !== 10 && <p role="alert" className="auth-field-hint text-red-600">Enter a valid 10-digit mobile number.</p>}
                </div>
                <Field label="Class" icon={<GraduationCap size={20}/>}>
                  <select required className="form-input" value={form.grade} onChange={e => change('grade', e.target.value)}><option value="" disabled>Select your class</option>{grades.map(g => <option value={g} key={g}>Class {g}</option>)}</select>
                </Field>
                <Field label="School Board" icon={<BookOpen size={20}/>}>
                  <select required className="form-input" value={form.board} onChange={e => change('board', e.target.value)}><option value="" disabled>Select your school board</option>{boards.map(b => <option value={b} key={b}>{b}</option>)}</select>
                </Field>
              </>}
              {isRegister && signupStep === 2 && <>
                <Field label="Email Address" icon={<Mail size={19}/>}>
                  <input required type="email" maxLength={254} className="form-input" autoComplete="email" placeholder="Enter your email address" value={form.email} onChange={e => change('email', e.target.value)}/>
                </Field>
                <Field label="Password" icon={<LockKeyhole size={19}/>} hint="At least 8 characters.">
                  <PasswordInput key="new-password" minLength={8} autoComplete="new-password" placeholder="Create a password" value={form.password} onChange={value => change('password', value)}/>
                </Field>
                <Field label="Confirm Password" icon={<LockKeyhole size={19}/>}>
                  <PasswordInput key="confirm-password" minLength={8} autoComplete="new-password" placeholder="Re-enter your password" value={confirmPassword} onChange={setConfirmPassword}/>
                </Field>
                <label className="auth-consent">
                  <input required type="checkbox" checked={form.guardian_permission} onChange={e => change('guardian_permission', e.target.checked)}/>
                  <span>I am an adult or have my parent or guardian's permission to create an account.</span>
                </label>
                {otpEnabled === true && <div className="space-y-3 rounded-xl border border-[#d8e4f3] bg-[#f8fbff] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-bold text-[#0f172a]">Verify mobile number</h3>{verification.step === 'verified' && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={15}/> Verified</span>}</div>
                  <p className="text-[12px] leading-5 text-[#64748b]">We'll send a one-time code to your mobile number via WhatsApp.</p>
                  {verification.step === 'sent' && <div className="flex gap-2">
                    <input aria-label="Six-digit verification code" className="form-input min-w-0 flex-1" maxLength={6} inputMode="numeric" pattern="[0-9]{6}" placeholder="6-digit code" value={verification.code} onChange={e => setVerification(old => ({...old,code:e.target.value.replace(/\D/g,'').slice(0,6)}))}/>
                    <button type="button" disabled={busy !== '' || verification.code.length !== 6} onClick={checkVerification} className="secondary-button shrink-0">{busy === 'verify' ? <Loader2 size={16} className="animate-spin"/> : 'Verify'}</button>
                  </div>}
                  {verification.step !== 'verified' && <button type="button" disabled={busy !== '' || !form.guardian_permission} onClick={startVerification} className="secondary-button w-full justify-center">
                    {busy === 'send' ? <Loader2 size={16} className="animate-spin"/> : verification.step === 'sent' ? 'Resend code' : 'Send verification code'}
                  </button>}
                </div>}
              </>}
              <InlineError error={error}/>
              <button type="submit" disabled={busy !== '' || (isRegister && signupStep === 2 && otpEnabled === null)} className="auth-primary-button">
                {busy === 'account' ? <Loader2 size={18} className="animate-spin"/> : <>{!isRegister ? 'Sign In' : signupStep === 1 ? 'Next' : 'Create Account'}{isRegister && signupStep === 1 && <ArrowRight size={19}/>}</>}
              </button>
            </form>
            {!isRegister && <p className="auth-switch">Don't have an account? <button type="button" onClick={() => switchScreen('register')}>Create an account</button></p>}
            {isRegister && signupStep === 2 && <button className="auth-back-link" type="button" onClick={previousStep}>Back to student details</button>}
          </div>
          {isRegister && <p className="auth-register-switch">Already have an account? <button type="button" onClick={() => switchScreen('login')}>Sign in</button></p>}
          {exitWarning && <div className="study-exit-overlay" role="dialog" aria-modal="true" aria-label="Exit StudyMate?"><div className="study-exit-panel"><h2>Leave StudyMate?</h2><p>Your learning session will remain saved.</p><div><button type="button" onClick={()=>setExitWarning(false)}>Stay here</button><button type="button" onClick={confirmExit}>Leave</button></div></div></div>}
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
      <ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeStudyMarkdown(content)}</ReactMarkdown>
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
      <div className="mt-9 flex items-center justify-between px-6"><span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#94a3b8]">Recent questions</span><History size={15} className="text-[#94a3b8]"/></div>
      <nav aria-label="Chat history" className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {!conversations.length && <p className="px-3 py-3 text-[13px] leading-6 text-[#94a3b8]">Your questions will appear here once you start studying.</p>}
        {conversations.map(c => <div key={c.id} className={`group flex items-center rounded-lg pr-1 ${activeId === c.id ? 'bg-[#f1f5f9]' : 'hover:bg-[#f8fafc]'}`}>
          <button onClick={() => onOpen(c.id)} className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left text-[13px] font-medium ${activeId === c.id ? 'text-[#1d4ed8]' : 'text-[#64748b]'}`}><MessageCircle size={15} className="shrink-0"/><span className="truncate">{c.title}</span></button>
          <button onClick={() => onDelete(c.id)} aria-label={`Delete ${c.title}`} title="Delete conversation" className="rounded-md p-2 text-[#94a3b8] hover:bg-white hover:text-red-600 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"><Trash2 size={15}/></button>
        </div>)}
      </nav>
      <div className="border-t border-[#e2e8f0] p-4">
        <button type="button" onClick={onSettings} className="flex w-full items-center gap-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-left hover:border-blue-300 hover:bg-[#eff6ff]" aria-label="Open your learning profile"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#dbeafe] text-sm font-bold text-[#1d4ed8]">{user.full_name[0]?.toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold text-[#0f172a]">{user.full_name}</span><span className="block truncate text-[11px] text-[#64748b]">Class {user.grade} · {user.board}</span></span><ChevronRight size={17} className="shrink-0 text-slate-400"/></button>
        <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9]" onClick={onLogout}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>
  </>;
}

// Native window.confirm() is unreliable in embedded/mobile browsers. Use an explicit
// in-app dialog for every destructive account/chat action instead.
function ActionConfirmation({ action, busy, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const isDelete = action.type === 'delete';

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onCancel();
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const buttons = Array.from(dialogRef.current.querySelectorAll('button:not(:disabled)'));
        if (!buttons.length) { event.preventDefault(); return; }
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  return <div className="study-confirm-overlay" onMouseDown={e => {
    if (e.target === e.currentTarget && !busy) onCancel();
  }}>
    <div className="study-confirm-panel" role="alertdialog" aria-modal="true"
      aria-labelledby="study-confirm-title" aria-describedby="study-confirm-description" ref={dialogRef}>
      <div className={`study-confirm-icon ${isDelete ? 'is-danger' : ''}`} aria-hidden="true">
        {isDelete ? <Trash2 size={22}/> : <LogOut size={22}/>}
      </div>
      <h2 id="study-confirm-title" className="font-display">
        {isDelete ? 'Delete this chat?' : 'Sign out of StudyMate?'}
      </h2>
      <p id="study-confirm-description">
        {isDelete ? <>Are you sure you want to delete <strong className="study-confirm-chat-title">{action.title}</strong>? This chat and its messages cannot be recovered.</>
          : 'You will return to the sign-in screen. Your saved chats will be here when you sign in again.'}
      </p>
      {error && <p className="study-confirm-error" role="alert">{error}</p>}
      <div className="study-confirm-actions">
        <button type="button" className="study-confirm-cancel" ref={cancelRef}
          disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className={`study-confirm-accept ${isDelete ? 'is-danger' : ''}`}
          disabled={busy} onClick={onConfirm}>
          {busy ? <><Loader2 size={16} className="animate-spin"/> Please wait…</> : isDelete ? 'Delete chat' : 'Sign out'}
        </button>
      </div>
    </div>
  </div>;
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
  const [exitWarning, setExitWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const pendingActionRef = useRef(null);
  const confirmationBusyRef = useRef(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const speechRef = useRef(null);
  const activeRef = useRef(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const studyScrollRef = useRef(null);
  const navStateRef = useRef({ page: 'home', id: null, sidebar: false, profile: false });
  const allowExitRef = useRef(false);
  const chatHistoryInitialized = useRef(false);
  const inputRef = useRef(null);
  // Browser SpeechRecognition sends recognized words to the input only; the student chooses when to send.
  // This requires HTTPS (or localhost) and microphone permission. Browser support varies.
  useEffect(() => () => {
    if (speechRef.current) {
      const recognition = speechRef.current;
      speechRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
  }, []);
  useEffect(() => {
    // The visual viewport shrinks when the Android keyboard opens.
    // Only the study messages should scroll; the header stays at the top.
    const viewport = window.visualViewport;
    const updateHeight = () => document.documentElement.style.setProperty(
      '--sm-viewport-height', `${Math.round(viewport?.height || window.innerHeight)}px`
    );
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    updateHeight();
    viewport?.addEventListener('resize', updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.documentElement.style.removeProperty('--sm-viewport-height');
      viewport?.removeEventListener('resize', updateHeight);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);
  useEffect(() => {
    if (!chatHistoryInitialized.current) {
      saveNavigation('chat', 'home');
      chatHistoryInitialized.current = true;
    }
    function onBack(event) {
      if (allowExitRef.current) return;
      // Android hardware Back dismisses a destructive confirmation; it never confirms it.
      if (pendingActionRef.current) {
        cancelPendingAction();
        const current = navStateRef.current;
        saveNavigation('chat', current.page, {
          id: current.id, sidebar: current.sidebar, profile: current.profile,
        });
        return;
      }
      const state = event.state;
      if (state?.[SM_HISTORY_KEY] && state.area === 'chat') {
        navStateRef.current = { page: state.page, id: state.id || null, sidebar: !!state.sidebar, profile: !!state.profile };
        setSidebarOpen(!!state.sidebar);
        setSettingsOpen(!!state.profile);
        if (state.page === 'home') {
          activeRef.current = null; setActiveId(null); setMessages([]);
          setLoadingChat(false); setStreamingAnswer(''); setError('');
        } else if (state.id && activeRef.current !== state.id) {
          loadConversation(state.id);
        }
      } else {
        const current = navStateRef.current;
        saveNavigation('chat', current.page, { id: current.id, sidebar: current.sidebar, profile: current.profile });
        setExitWarning(true);
      }
    }
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  function goTo(page, id = null, extra = {}) {
    const next = { page, id, sidebar: false, profile: false, ...extra };
    navStateRef.current = next;
    saveNavigation('chat', page, { id, sidebar: next.sidebar, profile: next.profile });
    setSidebarOpen(next.sidebar); setSettingsOpen(next.profile);
  }
  function showSidebar() { const current = navStateRef.current; goTo(current.page, current.id, { sidebar: true }); }
  function showProfile() { const current = navStateRef.current; goTo(current.page, current.id, { profile: true }); }
  function dismissOverlay() { window.history.back(); }
  function confirmExit() { allowExitRef.current = true; window.history.go(-2); }
  function stopVoice() {
    const recognition = speechRef.current;
    speechRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    }
    setListening(false);
  }
  function toggleVoice() {
    if (speechRef.current) { stopVoice(); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Voice typing is not supported in this browser. Please use Chrome on Android or a compatible browser.');
      return;
    }
    if (!window.isSecureContext) {
      setError('Voice typing requires HTTPS or localhost. Please open the secure version of StudyMate.');
      return;
    }
    setError('');
    const recognition = new Recognition();
    recognition.lang = user.language === 'Hindi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    const existingText = question.trim();
    recognition.onresult = event => {
      if (speechRef.current !== recognition) return;
      let words = '';
      for (let i = 0; i < event.results.length; i += 1) {
        words += `${event.results[i][0].transcript} `;
      }
      const combined = [existingText, words.trim()].filter(Boolean).join(' ').slice(0, 2000);
      setQuestion(combined);
    };
    recognition.onerror = event => {
      if (speechRef.current !== recognition) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed')
        setError('Microphone access was denied. Allow microphone permission in your browser and try again.');
      else if (event.error === 'audio-capture')
        setError('No microphone was detected. Check your device microphone and try again.');
      else if (event.error === 'network')
        setError('Voice recognition needs a network connection. Please try again.');
      else if (event.error !== 'aborted' && event.error !== 'no-speech')
        setError('Voice typing stopped unexpectedly. Please try again.');
      speechRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      if (speechRef.current === recognition) {
        speechRef.current = null;
        setListening(false);
      }
    };
    try {
      speechRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      speechRef.current = null;
      setListening(false);
      setError('Unable to start microphone recognition. Check browser permission and try again.');
    }
  }
  useEffect(() => { request('/conversations', {token}).then(setConversations).catch(err => setError(err.message)); }, [token]);
  useEffect(() => { const box = studyScrollRef.current; if (box) box.scrollTop = box.scrollHeight; }, [messages, sending, streamingAnswer]);
  async function refresh() { setConversations(await request('/conversations', {token})); }
  function newChat() { if (busyRef.current) return; stopVoice(); requestRef.current += 1; activeRef.current = null; setActiveId(null); setMessages([]); setQuestion(''); setError(''); setStreamingAnswer(''); goTo('home'); }
  async function loadConversation(id) { stopVoice(); const ticket=++requestRef.current; activeRef.current=id;setActiveId(id);setMessages([]);setStreamingAnswer('');setError('');setLoadingChat(true);try{const chat=await request(`/conversations/${id}`,{token});if(ticket===requestRef.current)setMessages(chat.messages);}catch(err){if(ticket===requestRef.current)setError(err.message);}finally{if(ticket===requestRef.current)setLoadingChat(false);} }
  async function openChat(id) { if(busyRef.current)return;goTo('conversation',id);await loadConversation(id); }
  function requestDeleteChat(id) {
    if (busyRef.current || confirmationBusyRef.current) return;
    const chat = conversations.find(item => item.id === id);
    if (!chat) return;
    const action = { type: 'delete', id: chat.id, title: chat.title };
    pendingActionRef.current = action;
    setPendingAction(action);
    setConfirmationError('');
  }
  function requestLogout() {
    if (confirmationBusyRef.current) return;
    const action = { type: 'logout' };
    pendingActionRef.current = action;
    setPendingAction(action);
    setConfirmationError('');
  }
  function cancelPendingAction() {
    if (confirmationBusyRef.current) return;
    pendingActionRef.current = null;
    setPendingAction(null);
    setConfirmationError('');
  }
  async function confirmPendingAction() {
    const action = pendingActionRef.current;
    if (!action || confirmationBusyRef.current) return;
    confirmationBusyRef.current = true;
    setConfirmationBusy(true);
    setConfirmationError('');
    try {
      if (action.type === 'logout') {
        // Logout happens ONLY after the student confirms in this modal.
        stopVoice();
        onLogout();
        return;
      }
      if (action.type !== 'delete') return;
      // Never call DELETE when merely opening, dismissing, or navigating the dialog.
      await request(`/conversations/${action.id}`, { token, method: 'DELETE' });
      pendingActionRef.current = null;
      setPendingAction(null);
      setConversations(old => old.filter(item => item.id !== action.id));
      if (activeRef.current === action.id) newChat();
      // The server is authoritative; refresh in the background without undoing success.
      refresh().catch(err => setError(err.message));
    } catch (err) {
      // Leave the dialog open with an error so the user can retry or cancel.
      setConfirmationError(err.message || 'Unable to complete the action. Please try again.');
    } finally {
      confirmationBusyRef.current = false;
      setConfirmationBusy(false);
    }
  }
  async function send(text=question) {
    const clean=text.trim(); if(!clean || busyRef.current || loadingChat)return;
    if (speechRef.current) stopVoice();
    busyRef.current=true;setSending(true);setError('');setQuestion('');setStreamingAnswer('');
    if (window.innerWidth < 768) inputRef.current?.blur();
    const optimistic={id:`temp_${Date.now()}`,role:'user',content:clean};
    setMessages(old=>[...old,optimistic]);
    try {
      let id=activeRef.current;
      if(id===null){
        const chat=await request('/conversations',{method:'POST',token});
        id=chat.id;activeRef.current=id;setActiveId(id);
        goTo('conversation',id);
      }
      const result=await streamQuestion(id,clean,token,partial=>setStreamingAnswer(partial));
      if (navStateRef.current.page === 'conversation' && navStateRef.current.id === id) {
        setMessages(old=>[...old.filter(m=>m.id!==optimistic.id),result.user_message,result.assistant_message]);
      }
      setStreamingAnswer('');
      refresh().catch(()=>{});
    }catch(err){setMessages(old=>old.filter(m=>m.id!==optimistic.id));setStreamingAnswer('');setQuestion(clean);setError(err.message);}
    finally{busyRef.current=false;setSending(false);}
  }
  const subjects = [
    { name: 'Maths', Icon: Calculator, color: 'green', question: 'How do I solve fractions?' },
    { name: 'Science', Icon: FlaskConical, color: 'blue', question: 'Explain photosynthesis' },
    { name: 'English', Icon: BookOpen, color: 'purple', question: 'How can I improve my English writing?' },
    { name: 'Social Studies', Icon: Globe2, color: 'orange', question: 'Why do we study history?' },
  ];
  const firstName = user.full_name?.trim().split(/\s+/)[0] || 'there';
  const emptyChat = messages.length === 0 && !sending;
  return <div className="studymate-app flex h-[100dvh] min-h-0 overflow-hidden bg-[#f8fafc]">
    <Sidebar user={user} conversations={conversations} activeId={activeId} visible={sidebarOpen} close={dismissOverlay} onNew={newChat} onOpen={openChat} onDelete={requestDeleteChat} onSettings={showProfile} onLogout={requestLogout}/>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="study-header">
        <button className="study-header-menu md:hidden" type="button" onClick={showSidebar} aria-label="Open menu"><Menu size={23}/></button>
        <div className="study-header-brand"><Brand/></div>
        <span className="study-header-spacer md:hidden" aria-hidden="true"/>
      </header>
      <main className="study-main relative flex min-h-0 flex-1 flex-col">
        <div ref={studyScrollRef} className="study-scroll flex-1 overflow-y-auto" aria-live="polite">
          <div className={`study-content mx-auto flex min-h-full w-full max-w-[900px] flex-col ${emptyChat ? 'study-content-empty' : ''}`}>
            {loadingChat ? <div className="flex flex-1 items-center justify-center text-[#2563eb]"><Loader2 className="animate-spin" size={27}/></div> : emptyChat ?
            <div className="study-welcome">
              <div className="study-greeting">
                <h1 className="font-display">Hi, {firstName}! <span aria-hidden="true">👋</span></h1>
                <p>What would you like to learn today?</p>
              </div>
              <div className="study-subjects" aria-label="Quick subjects">
                {subjects.map(({name, Icon, color}) => <div key={name} className="study-subject-tile">
                  <span className={`study-subject-icon subject-${color}`}><Icon size={23}/></span>
                  <span>{name}</span>
                </div>)}
              </div>
              <div className="study-empty-card">
                <div className="study-empty-content">
                  <div className="study-empty-icon"><MessageSquareMore size={27}/></div>
                  <h2 className="font-display">Ask anything</h2>
                  <p>Get clear, simple and accurate answers based on your class and syllabus.</p>
                </div>
                <div className="study-prompt-chips">
                  {['What is gravity?', 'Explain photosynthesis', 'How to solve quadratic equations?'].map(item => <button type="button" key={item} onClick={()=>send(item)}>{item}</button>)}
                </div>
              </div>
            </div> : <div className="study-messages flex flex-col gap-8">{messages.map(m=><MessageBubble key={m.id} message={m}/>)}{sending && <div className="flex gap-3.5"><span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]"><BookOpen size={17}/></span>{streamingAnswer ? <div className="min-w-0 flex-1"><div className="ai-markdown break-words text-[14.5px] leading-[1.85]"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeStudyMarkdown(streamingAnswer)}</ReactMarkdown></div><span className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#64748b]"><Loader2 size={13} className="animate-spin"/> Writing answer…</span></div> : <span className="inline-flex items-center gap-2 text-sm text-[#64748b]"><Loader2 size={15} className="animate-spin"/> Preparing an explanation for Class {user.grade}...</span>}</div>}</div>}
          </div>
        </div>
        <div className="study-composer-wrap">
          <div className="study-composer-container">{error && <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}
            <form onSubmit={e=>{e.preventDefault();send();}} className="study-composer">
              <button type="button" onClick={toggleVoice} className={`study-mic ${listening ? 'study-mic-active' : ''}`} aria-label={listening ? 'Stop voice typing' : 'Start voice typing'} title={listening ? 'Stop voice typing' : 'Speak your question'} aria-pressed={listening}>
                {listening ? <MicOff size={21}/> : <Mic size={21}/>}
              </button>
              <span className="study-composer-separator" aria-hidden="true"/>
              <textarea ref={inputRef} rows={1} maxLength={2000} className="study-composer-input" value={question} onChange={e=>setQuestion(e.target.value)} placeholder={listening ? 'Listening… speak now' : 'Type or speak your question...'} aria-label="Your question" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
              <button aria-label="Send question" type="submit" disabled={!question.trim()||sending||loadingChat} className="study-send"><ArrowRight size={23}/></button>
            </form>
            <p className={`study-composer-caption ${listening ? 'is-listening' : ''}`} role="status">{listening ? 'Listening… tap the microphone to stop. Review your words before sending.' : !voiceSupported ? 'Voice typing is unavailable in this browser. You can still type your question.' : 'StudyMate gives answers based on your class and board.'}</p>
          </div>
        </div>
      </main>
    </div>
    {pendingAction && <ActionConfirmation action={pendingAction} busy={confirmationBusy}
      error={confirmationError} onCancel={cancelPendingAction} onConfirm={confirmPendingAction}/>}
    {exitWarning && <div className="study-exit-overlay" role="dialog" aria-modal="true" aria-label="Leave StudyMate?"><div className="study-exit-panel"><h2>Leave StudyMate?</h2><p>Your chats are saved. Would you like to leave the site?</p><div><button type="button" onClick={()=>setExitWarning(false)}>Stay here</button><button type="button" onClick={confirmExit}>Leave</button></div></div></div>}
    {settingsOpen && <ProfileModal user={user} token={token} onClose={dismissOverlay} onUpdate={onUpdateUser}/>}
  </div>;
}
export default function App() {
  // Keep the legacy token key so existing students stay signed in after rebranding.
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
