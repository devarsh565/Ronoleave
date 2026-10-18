import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ClerkProvider, Show, SignIn, SignUp, useClerk,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDownRight, ArrowRight, BookOpen, Check,
  ChevronRight, CircleAlert, ClipboardList, Clock3, FileCheck2, FileText,
  Headset, LockKeyhole, LogOut, MessageCircle, Plus, RefreshCw, Send,
  ShieldCheck, Trash2, X,
} from 'lucide-react';
import {
  getGetMyServiceRequestQueryKey, getHealthCheckQueryKey,
  getListApprovedPoliciesQueryKey, getListHrEscalationsQueryKey,
  getListMyServiceRequestsQueryKey, useAskHrAssistant,
  useCreateApprovedPolicy, useCreateServiceRequest, useDeleteApprovedPolicy,
  useGetMyServiceRequest, useHealthCheck, useListApprovedPolicies,
  useListHrEscalations, useListMyServiceRequests, useUpdateHrEscalation,
} from '@workspace/api-client-react';
import type {
  ChatResult, Escalation, ServiceRequest, ServiceRequestInput,
} from '@workspace/api-client-react';
import {
  Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams,
} from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const stripBase = (path: string) => basePath && path.startsWith(basePath)
  ? path.slice(basePath.length) || '/' : path;

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#285b56',
    colorForeground: '#243c3a',
    colorMutedForeground: '#697d79',
    colorDanger: '#a84940',
    colorBackground: '#fbfaf6',
    colorInput: '#fffefa',
    colorInputForeground: '#243c3a',
    colorNeutral: '#d8d3c8',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-bold tracking-tight text-[#243c3a]',
    headerSubtitle: 'text-[#697d79]',
    formFieldLabel: 'text-[#243c3a] font-semibold',
    footerActionLink: 'text-[#285b56] font-semibold',
    footerActionText: 'text-[#697d79]',
    formButtonPrimary: 'bg-[#285b56] hover:bg-[#214b47]',
    formFieldInput: 'border-[#d8d3c8] bg-[#fffefa]',
    socialButtonsBlockButton: 'border-[#d8d3c8]',
  },
};

function useNotice() {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return { notice, setNotice };
}

function Toast({ children }: { children: string }) {
  return children ? <div className="toast-message" role="status" aria-live="polite">{children}</div> : null;
}

function Brand() {
  return <Link href="/" className="brand" aria-label="People Desk home">
    <span className="brand-mark"><Headset size={19} strokeWidth={2.3} /></span>
    <span>people desk</span>
  </Link>;
}

function LoadingBlock({ label = 'Loading information' }: { label?: string }) {
  return <div className="panel" role="status" aria-label={label}>
    <div className="skeleton skeleton-line" style={{ width: '35%' }} />
    <div className="skeleton skeleton-line" style={{ width: '82%', height: 19, marginTop: 20 }} />
    <div className="skeleton skeleton-line" style={{ width: '68%' }} />
    <div className="skeleton skeleton-line" style={{ width: '92%' }} />
  </div>;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return 0;
  const candidate = error as { status?: number; response?: { status?: number } };
  return candidate.status ?? candidate.response?.status ?? 0;
}

function ErrorMessage({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-box" role="alert">
    <span>{message}</span>
    <button className="button button-outline small-button" onClick={retry} type="button" data-testid="button-retry">
      <RefreshCw size={13} /> Try again
    </button>
  </div>;
}

function Landing() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 30000 } });
  return <main className="landing">
    <div className="page-width">
      <header className="topbar">
        <Brand />
        <div className="top-links">
          <Link href="/sign-in" className="link-button" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="button button-primary" data-testid="link-sign-up">Get started <ArrowRight size={15} /></Link>
        </div>
      </header>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">Your people support, in one place</div>
            <h1>Good answers.<br /><em>Human when it matters.</em></h1>
            <p className="hero-copy">A private, practical place to ask about work policies, submit a request, and keep track of what happens next.</p>
            <div className="hero-actions">
              <Link href="/sign-up" className="button button-primary" data-testid="link-create-account">Create your account <ArrowRight size={15} /></Link>
              <Link href="/sign-in" className="button button-quiet" data-testid="link-existing-account">I already have an account</Link>
            </div>
          </div>
          <div className="hero-art" aria-label="Illustration of a private HR support workspace">
            <div className="orbit" />
            <div className="hero-card">
              <div className="hero-card-top">
                <div className="hero-card-title">Policy source status</div>
                <div className="signal"><span className="signal-dot" /> Awaiting HR</div>
              </div>
              <div className="hero-message">Approved policy documents will appear here when HR adds them. Until then, answers need a human source.</div>
              <div className="source-pill"><BookOpen size={14} /> Approved sources only</div>
              <div className="hero-card-foot">Private to your account · Human review is available</div>
            </div>
            <div className="hero-note">No policy guesswork.</div>
          </div>
        </div>
      </section>
    </div>
    <div className="landing-band">
      <div className="page-width trust-line">
        <span className="trust-item"><LockKeyhole size={15} /> Your requests stay tied to your account</span>
        <span className="trust-item"><FileCheck2 size={15} /> Answers use approved policy sources</span>
        <span className="trust-item"><Headset size={15} /> Sensitive issues can go to HR</span>
      </div>
    </div>
    <section className="landing-section page-width">
      <div className="section-head">
        <div><div className="eyebrow">One clear path forward</div><h2>Support that respects your time.</h2></div>
        <p>Find a grounded answer when one is available. When it is not, ask for human help and follow your own requests in one discreet place.</p>
      </div>
      <div className="service-list">
        <div className="service-row"><span className="service-icon"><MessageCircle size={18} /></span><div><h3>Ask a policy question</h3><p>Responses show their approved sources. No source, no made-up policy answer.</p></div><ArrowDownRight className="service-arrow" size={17} /></div>
        <div className="service-row"><span className="service-icon"><ClipboardList size={18} /></span><div><h3>Submit and track a request</h3><p>Send a service request and see its status in your own account.</p></div><ArrowDownRight className="service-arrow" size={17} /></div>
        <div className="service-row"><span className="service-icon"><ShieldCheck size={18} /></span><div><h3>Bring in a person</h3><p>Escalate a sensitive or unresolved concern for HR follow-up.</p></div><ArrowDownRight className="service-arrow" size={17} /></div>
        <div className="service-row"><span className="service-icon"><Activity size={18} /></span><div><h3>Know what happens next</h3><p>See the current status without exposing another employee's details.</p></div><ArrowDownRight className="service-arrow" size={17} /></div>
      </div>
    </section>
    <section className="principles">
      <div className="page-width">
        <div className="eyebrow">Built around trust</div>
        <h2>Clear boundaries make better support.</h2>
        <div className="principle-grid">
          <article className="principle"><div className="principle-num">01 / GROUNDED</div><h3>Only approved sources</h3><p>Policy answers are grounded in documents HR has approved. The source is visible alongside the response.</p></article>
          <article className="principle"><div className="principle-num">02 / DISCREET</div><h3>Your account, your requests</h3><p>Request tracking is employee-scoped. Sensitive context belongs in a private support channel.</p></article>
          <article className="principle"><div className="principle-num">03 / HUMAN</div><h3>People make decisions</h3><p>Submitting a request is not approval. Leave and policy exceptions need human approval from HR.</p></article>
        </div>
      </div>
    </section>
    <div className="page-width">
      <section className="landing-cta">
        <div><h2>Start with what you need.</h2><p>Sign in to ask, submit, and follow up securely.</p></div>
        <Link href="/sign-up" className="button button-primary" data-testid="link-join-now">Continue to People Desk <ArrowRight size={15} /></Link>
      </section>
      <footer className="footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
        <span>People Desk · Employee support</span>
        <span>{health.isLoading ? 'Checking service status' : health.isError ? 'Service status unavailable' : `Service status: ${health.data?.status ?? 'available'}`}</span>
      </footer>
    </div>
  </main>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (previous.current !== undefined && previous.current !== id) client.clear();
      previous.current = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function SignInPage() {
  return <div className="auth-frame"><div className="auth-side">
    <Brand /><div><div className="eyebrow">Private employee support</div><h1>A calmer way to get the right help.</h1><p>Sign in to see your requests, ask about approved policies, or reach HR.</p></div>
    <div className="auth-privacy"><LockKeyhole size={16} /> Secure access for your employee account</div>
  </div><div className="auth-form-wrap"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}

function SignUpPage() {
  return <div className="auth-frame"><div className="auth-side">
    <Brand /><div><div className="eyebrow">A more considered help desk</div><h1>Your questions deserve a clear next step.</h1><p>Create an account to contact HR and follow your own service requests.</p></div>
    <div className="auth-privacy"><ShieldCheck size={16} /> Private by design. Human-reviewed where needed.</div>
  </div><div className="auth-form-wrap"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}

function LogoutButton() {
  const { signOut } = useClerk();
  return <button className="side-link" type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={16} /> Sign out</button>;
}

function PortalLayout({ active, children }: { active: string; children: ReactNode }) {
  const [location] = useLocation();
  const current = active || location;
  return <div className="portal-layout">
    <aside className="sidebar">
      <Brand />
      <div className="nav-label">Workspace</div>
      <nav className="nav-stack" aria-label="Main navigation">
        <Link href="/" className={`side-link ${current === '/' ? 'active' : ''}`} data-testid="link-nav-home"><Activity size={16} /> Overview</Link>
        <Link href="/requests" className={`side-link ${current.startsWith('/requests') ? 'active' : ''}`} data-testid="link-nav-requests"><ClipboardList size={16} /> My requests</Link>
        <Link href="/policies" className={`side-link ${current === '/policies' ? 'active' : ''}`} data-testid="link-nav-policies"><BookOpen size={16} /> Policy sources</Link>
        <Link href="/hr-queue" className={`side-link ${current === '/hr-queue' ? 'active' : ''}`} data-testid="link-nav-queue"><Headset size={16} /> HR review</Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-small"><LockKeyhole size={14} /> Your requests are private to your employee account.</div>
        <LogoutButton />
      </div>
    </aside>
    <div className="portal-main">
      <header className="portal-topbar"><div className="crumb">Employee support <ChevronRight size={13} style={{ verticalAlign: 'middle', margin: '0 5px' }} /> {pageName(current)}</div><div className="portal-user"><div className="user-avatar" aria-hidden="true"><LockKeyhole size={14} /></div><span>Private workspace</span></div></header>
      <main className="portal-content">{children}</main>
    </div>
  </div>;
}

function pageName(path: string) {
  if (path.startsWith('/requests')) return 'My requests';
  if (path === '/policies') return 'Policy sources';
  if (path === '/hr-queue') return 'HR review';
  return 'Overview';
}

function ProtectedPage({ active, children }: { active: string; children: ReactNode }) {
  return <>
    <Show when="signed-in"><PortalLayout active={active}>{children}</PortalLayout></Show>
    <Show when="signed-out"><Redirect to="/" /></Show>
  </>;
}

function HomeRedirect() {
  return <>
    <Show when="signed-in"><PortalLayout active="/"><EmployeeHome /></PortalLayout></Show>
    <Show when="signed-out"><Landing /></Show>
  </>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function EmployeeHome() {
  const policies = useListApprovedPolicies({ query: { queryKey: getListApprovedPoliciesQueryKey() } });
  const requests = useListMyServiceRequests({ query: { queryKey: getListMyServiceRequestsQueryKey() } });
  const [question, setQuestion] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [result, setResult] = useState<ChatResult | null>(null);
  const ask = useAskHrAssistant();
  const { notice, setNotice } = useNotice();
  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || ask.isPending) return;
    try {
      const answer = await ask.mutateAsync({ data: { message: question.trim(), conversationId } });
      setResult(answer);
      setConversationId(answer.conversationId);
      setQuestion('');
    } catch {
      setNotice('Your question could not be sent. Please try again.');
    }
  };
  const requestCount = requests.data?.requests?.length;
  return <div>
    <PageHeading eyebrow="Your support desk" title="How can we help?" subtitle="Ask about an approved policy or send a request to HR. Your workspace is private to your account." />
    <div className="portal-grid">
      <section className="panel chat-panel" aria-labelledby="ask-heading">
        <div className="chat-heading"><div className="panel-header" style={{ margin: 0 }}><div><h2 id="ask-heading">Ask an HR question</h2><div className="panel-subtitle">Policy answers include their source when available.</div></div><div className="secure-line"><LockKeyhole size={13} /> Private</div></div></div>
        <div className="chat-body" aria-live="polite">
          {ask.isError && <ErrorMessage message="Your question did not go through. No answer was generated." retry={() => ask.reset()} />}
          {!result && <div className="chat-placeholder"><span className="empty-icon"><MessageCircle size={19} /></span><strong>Ask what you need to know</strong><p>{policies.isLoading ? 'Checking approved policy sources…' : policies.isError ? 'Policy source status is unavailable. Answers should rely only on approved sources.' : policies.data?.policies.length ? 'Ask about an approved policy. Responses include citations when available.' : 'There are currently no approved policy documents. We will not invent a policy answer.'}</p></div>}
          {result && <div className="answer-card">
            <div className="answer-label">HR assistant response</div>{result.answer}
            {result.citations.length > 0
              ? <div className="citation-list" aria-label="Policy citations">{result.citations.map((citation) => <span className="citation" key={citation.policyId}><BookOpen size={12} />{citation.title}</span>)}</div>
              : <div className="notice" style={{ marginTop: 13 }}><CircleAlert size={15} /> No approved policy citation was returned. Treat this as unresolved and ask HR for guidance.</div>}
            {result.escalated && <div className="notice" style={{ marginTop: 13 }}><Headset size={15} /> This conversation was marked for HR follow-up{result.escalation ? ` (reference ${result.escalation.id}, ${result.escalation.status}).` : '.'} The desk cannot confirm when a response will arrive.</div>}
          </div>}
        </div>
        <form className="chat-form" onSubmit={submitQuestion}>
          <label className="sr-only" htmlFor="question-input">Your HR question</label>
          <input id="question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Write a question for HR..." maxLength={4000} required data-testid="input-hr-question" />
          <button className="button button-primary" type="submit" disabled={ask.isPending || !question.trim()} data-testid="button-send-question"><Send size={15} /><span>{ask.isPending ? 'Sending' : 'Ask'}</span></button>
        </form>
        <div className="chat-help">Answers rely only on approved sources. If a policy is missing or unclear, contact HR directly.</div>
      </section>
      <aside className="quick-links">
        <div className="panel">
          <div className="panel-header"><div><h2>Your workspace</h2><div className="panel-subtitle">Account-scoped information</div></div><LockKeyhole size={16} color="hsl(var(--primary))" /></div>
          <Link href="/requests" className="quick-link" data-testid="link-open-requests"><span className="quick-link-icon"><ClipboardList size={17} /></span><span>My requests<small>{requests.isLoading ? 'Loading your requests…' : requestCount === 0 ? 'No requests submitted' : `${requestCount ?? '—'} of your requests`}</small></span><ChevronRight size={15} style={{ marginLeft: 'auto' }} /></Link>
          <Link href="/policies" className="quick-link" data-testid="link-open-policies"><span className="quick-link-icon"><BookOpen size={17} /></span><span>Policy sources<small>{policies.data?.policies.length ? 'Approved materials available' : 'Source status and guidance'}</small></span><ChevronRight size={15} style={{ marginLeft: 'auto' }} /></Link>
        </div>
        <div className="notice"><CircleAlert size={16} /><span>Submitting a request is not approval. Leave requests and policy exceptions require human approval from HR.</span></div>
        {requests.isError && <ErrorMessage message="Your request list is temporarily unavailable." retry={() => requests.refetch()} />}
        {policies.isError && <ErrorMessage message="Policy source status could not be loaded." retry={() => policies.refetch()} />}
      </aside>
    </div>
    <Toast>{notice}</Toast>
  </div>;
}

function RequestsPage() {
  const list = useListMyServiceRequests({ query: { queryKey: getListMyServiceRequestsQueryKey() } });
  const create = useCreateServiceRequest();
  const client = useQueryClient();
  const { notice, setNotice } = useNotice();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ServiceRequestInput['category']>('other');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ data: { category, title: title.trim(), description: description.trim() } });
      await client.invalidateQueries({ queryKey: getListMyServiceRequestsQueryKey() });
      setOpen(false); setTitle(''); setDescription(''); setCategory('other');
      setNotice('Request submitted. This is not an approval; HR will review it.');
    } catch (error) {
      setNotice(errorStatus(error) === 403 ? 'You do not have permission to submit this request.' : 'Could not submit your request. Please try again.');
    }
  };
  const requests = list.data?.requests ?? [];
  return <div>
    <PageHeading eyebrow="Your account only" title="My requests" subtitle="Track requests you submitted. No other employee's request details are shown here." action={<button className="button button-primary" onClick={() => setOpen(true)} type="button" data-testid="button-new-request"><Plus size={16} /> New request</button>} />
    <div className="notice" style={{ marginBottom: 19 }}><CircleAlert size={16} /><span>Submitting a request is not approval. Leave requests and policy exceptions require human approval from HR.</span></div>
    <section className="panel">
      <div className="panel-header"><div><h2>Request history</h2><div className="panel-subtitle">Status updates for requests associated with your account</div></div></div>
      {list.isLoading && <LoadingBlock label="Loading your requests" />}
      {list.isError && <ErrorMessage message="We could not load your requests. Please try again." retry={() => list.refetch()} />}
      {!list.isLoading && !list.isError && requests.length === 0 && <div className="empty-state"><span className="empty-icon"><ClipboardList size={20} /></span><h3>No requests yet</h3><p>When you send a service request, it will appear here with its current status.</p><button className="button button-primary" onClick={() => setOpen(true)} type="button" data-testid="button-empty-new-request"><Plus size={15} /> Start a request</button></div>}
      {!list.isLoading && !list.isError && requests.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>Request</th><th>Category</th><th>Submitted</th><th>Status</th></tr></thead><tbody>
        {requests.map((request) => <RequestRow request={request} key={request.id} />)}
      </tbody></table></div>}
    </section>
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
        <div className="modal-head"><div><h2 id="request-modal-title">Submit a service request</h2><div className="muted" style={{ fontSize: 12 }}>Share only the details HR needs to review your request.</div></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setOpen(false)} data-testid="button-close-request"><X size={17} /></button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field field-full"><label htmlFor="request-category">Request category</label><select id="request-category" value={category} onChange={(event) => setCategory(event.target.value as ServiceRequestInput['category'])} data-testid="select-request-category"><option value="leave">Leave</option><option value="it">IT</option><option value="payroll">Payroll</option><option value="documents">Documents</option><option value="other">Other</option></select></div>
            <div className="field field-full"><label htmlFor="request-title">Title</label><input id="request-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required data-testid="input-request-title" /></div>
            <div className="field field-full"><label htmlFor="request-description">What do you need?</label><textarea id="request-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} required data-testid="input-request-description" /><span className="field-hint">Submitting does not mean your request is approved. Leave and exception decisions are made by HR.</span></div>
          </div>
          {create.isError && <div className="error-box" role="alert" style={{ marginTop: 15 }}>Submission failed. Please review your details and try again.</div>}
          <div className="form-actions"><button className="button button-outline" type="button" onClick={() => setOpen(false)} data-testid="button-cancel-request">Cancel</button><button className="button button-primary" type="submit" disabled={create.isPending} data-testid="button-submit-request">{create.isPending ? 'Submitting…' : 'Submit request'}</button></div>
        </form>
      </section>
    </div>}
    <Toast>{notice}</Toast>
  </div>;
}

function RequestRow({ request }: { request: ServiceRequest }) {
  return <tr data-testid={`row-request-${request.id}`}>
    <td><Link href={`/requests/${encodeURIComponent(request.id)}`} className="request-title-link request-title" data-testid={`link-request-${request.id}`}>{request.title}<ChevronRight size={13} style={{ verticalAlign: 'middle', marginLeft: 5 }} /></Link></td>
    <td className="muted" style={{ textTransform: 'capitalize' }}>{request.category}</td>
    <td className="muted">{formatDate(request.createdAt)}</td>
    <td><StatusChip status={request.status} /></td>
  </tr>;
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return <span className={`status-chip ${normalized === 'resolved' || normalized === 'complete' ? 'status-resolved' : normalized === 'reviewing' || normalized === 'in progress' ? 'status-reviewing' : ''}`} data-testid={`status-${normalized}`}>{status.replaceAll('_', ' ')}</span>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function RequestDetailPage() {
  const params = useParams<{ id?: string }>();
  const id = params.id ?? '';
  const request = useGetMyServiceRequest(id, { query: { enabled: Boolean(id), queryKey: getGetMyServiceRequestQueryKey(id) } });
  return <div>
    <PageHeading eyebrow="Your account only" title="Request details" subtitle="Details are available only for requests associated with your signed-in account." action={<Link href="/requests" className="button button-outline" data-testid="link-back-requests">Back to requests</Link>} />
    {request.isLoading && <LoadingBlock label="Loading request details" />}
    {request.isError && <ErrorMessage message={errorStatus(request.error) === 403 || errorStatus(request.error) === 404 ? 'This request is unavailable in your account.' : 'Request details could not be loaded.'} retry={() => request.refetch()} />}
    {request.data && <section className="panel">
      <div className="panel-header"><div><h2>{request.data.title}</h2><div className="panel-subtitle">Request reference · {request.data.id}</div></div><StatusChip status={request.data.status} /></div>
      <div className="detail-block"><strong>Category</strong><span style={{ textTransform: 'capitalize' }}>{request.data.category}</span></div>
      <div className="detail-block"><strong>Submitted</strong><span>{formatDate(request.data.createdAt)}</span></div>
      <div className="detail-block"><strong>Description</strong><span>{request.data.description}</span></div>
      <div className="notice" style={{ marginTop: 18 }}><CircleAlert size={16} />Submitting a request is not approval. HR makes decisions about leave and policy exceptions.</div>
    </section>}
    {!id && <ErrorMessage message="No request reference was provided." retry={() => { window.history.back(); }} />}
  </div>;
}

function PoliciesPage() {
  const index = useListApprovedPolicies({ query: { queryKey: getListApprovedPoliciesQueryKey() } });
  const create = useCreateApprovedPolicy();
  const remove = useDeleteApprovedPolicy();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [content, setContent] = useState('');
  const { notice, setNotice } = useNotice();
  const canManage = index.data?.canManage === true;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ data: { title: title.trim(), sourceName: sourceName.trim(), content: content.trim() } });
      await client.invalidateQueries({ queryKey: getListApprovedPoliciesQueryKey() });
      setOpen(false); setTitle(''); setSourceName(''); setContent('');
      setNotice('Approved policy source added.');
    } catch (error) {
      setNotice(errorStatus(error) === 403 ? 'Policy management is restricted to authorized HR administrators.' : 'Could not add this source. Please try again.');
    }
  };
  const deletePolicy = async (id: string, label: string) => {
    if (!window.confirm(`Remove “${label}” from approved policy sources?`)) return;
    try {
      await remove.mutateAsync({ id });
      await client.invalidateQueries({ queryKey: getListApprovedPoliciesQueryKey() });
      setNotice('Policy source removed.');
    } catch (error) {
      setNotice(errorStatus(error) === 403 ? 'Policy management is restricted to authorized HR administrators.' : 'Could not remove this source.');
    }
  };
  const policies = index.data?.policies ?? [];
  return <div>
    <PageHeading eyebrow="Grounded answers" title="Approved policy sources" subtitle="HR-approved materials are the only source for assistant policy answers." action={canManage ? <button className="button button-primary" onClick={() => setOpen(true)} type="button" data-testid="button-add-policy"><Plus size={15} /> Add approved source</button> : undefined} />
    <div className="portal-grid">
      <section className="panel">
        <div className="panel-header"><div><h2>Source library</h2><div className="panel-subtitle">Only published, approved sources appear here</div></div><span className="secure-line"><ShieldCheck size={14} /> Verified by HR</span></div>
        {index.isLoading && <LoadingBlock label="Loading approved policy sources" />}
        {index.isError && <ErrorMessage message={errorStatus(index.error) === 403 ? 'Policy source status is not available to this account.' : 'Could not load policy sources.'} retry={() => index.refetch()} />}
        {!index.isLoading && !index.isError && policies.length === 0 && <div className="empty-state"><span className="empty-icon"><BookOpen size={20} /></span><h3>No approved documents yet</h3><p>There are currently no approved policy sources. The assistant must not infer or invent policy guidance.</p>{canManage && <button className="button button-primary" onClick={() => setOpen(true)} type="button" data-testid="button-add-first-policy"><Plus size={15} /> Add the first source</button>}</div>}
        {!index.isLoading && !index.isError && policies.length > 0 && policies.map((policy) => <div className="policy-row" key={policy.id} data-testid={`row-policy-${policy.id}`}><div><div className="policy-title">{policy.title}</div><div className="policy-source">{policy.sourceName}</div><div className="meta-line">Added {formatDate(policy.createdAt)}</div></div>{canManage && <button className="icon-button" type="button" aria-label={`Remove ${policy.title}`} onClick={() => deletePolicy(policy.id, policy.title)} disabled={remove.isPending} data-testid={`button-delete-policy-${policy.id}`}><Trash2 size={15} /></button>}</div>)}
      </section>
      <aside>
        <div className="panel privacy-card"><div className="panel-header"><div><h2>Policy source integrity</h2><div className="panel-subtitle">Clear provenance. Human oversight.</div></div><ShieldCheck size={18} /></div><p className="panel-subtitle">The assistant should answer only from approved sources and show citations when it can. If policy coverage is missing or uncertain, route the question to HR rather than guessing.</p></div>
        <div className="notice" style={{ marginTop: 14 }}><CircleAlert size={16} /><span>A policy answer is not an approval. Leave and policy exceptions require human approval.</span></div>
      </aside>
    </div>
    {open && canManage && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="policy-modal-title">
      <div className="modal-head"><div><h2 id="policy-modal-title">Add an approved policy source</h2><div className="muted" style={{ fontSize: 12 }}>Only upload materials formally approved for employee guidance.</div></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setOpen(false)} data-testid="button-close-policy"><X size={17} /></button></div>
      <form onSubmit={submit}><div className="form-grid">
        <div className="field field-full"><label htmlFor="policy-title">Policy title</label><input id="policy-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} data-testid="input-policy-title" /></div>
        <div className="field field-full"><label htmlFor="policy-source">Source name</label><input id="policy-source" required maxLength={200} value={sourceName} onChange={(event) => setSourceName(event.target.value)} data-testid="input-policy-source" /></div>
        <div className="field field-full"><label htmlFor="policy-content">Approved policy content</label><textarea id="policy-content" required minLength={20} maxLength={50000} value={content} onChange={(event) => setContent(event.target.value)} style={{ minHeight: 180 }} data-testid="input-policy-content" /><span className="field-hint">Use approved source text only. Do not include employee-specific or confidential case details.</span></div>
      </div>
      {create.isError && <div className="error-box" role="alert" style={{ marginTop: 14 }}>{errorStatus(create.error) === 403 ? 'Your account cannot manage policy sources.' : 'Could not save this source. Check the required fields and try again.'}</div>}
      <div className="form-actions"><button className="button button-outline" type="button" onClick={() => setOpen(false)} data-testid="button-cancel-policy">Cancel</button><button className="button button-primary" type="submit" disabled={create.isPending} data-testid="button-submit-policy">{create.isPending ? 'Adding…' : 'Add source'}</button></div>
      </form>
    </section></div>}
    <Toast>{notice}</Toast>
  </div>;
}

function HrQueuePage() {
  const policyIndex = useListApprovedPolicies({ query: { queryKey: getListApprovedPoliciesQueryKey() } });
  const canManage = policyIndex.data?.canManage === true;
  const queue = useListHrEscalations({ query: { enabled: canManage, queryKey: getListHrEscalationsQueryKey() } });
  const update = useUpdateHrEscalation();
  const client = useQueryClient();
  const { notice, setNotice } = useNotice();
  const setStatus = async (item: Escalation, status: 'reviewing' | 'resolved') => {
    try {
      await update.mutateAsync({ id: item.id, data: { status } });
      await client.invalidateQueries({ queryKey: getListHrEscalationsQueryKey() });
      setNotice(status === 'resolved' ? 'Escalation marked resolved.' : 'Escalation moved to review.');
    } catch (error) {
      setNotice(errorStatus(error) === 403 ? 'HR review access is restricted to authorized administrators.' : 'Could not update this escalation.');
    }
  };
  return <div>
    <PageHeading eyebrow="Human oversight" title="HR review queue" subtitle="Administrator-only view of unresolved employee escalations. Handle each case discreetly." />
    {policyIndex.isLoading && <LoadingBlock label="Checking HR permissions" />}
    {policyIndex.isError && <ErrorMessage message={errorStatus(policyIndex.error) === 403 ? 'HR review access could not be confirmed.' : 'Could not verify your HR permissions.'} retry={() => policyIndex.refetch()} />}
    {!policyIndex.isLoading && !policyIndex.isError && !canManage && <div className="panel empty-state"><span className="empty-icon"><LockKeyhole size={20} /></span><h3>Restricted to authorized HR administrators</h3><p>This queue contains sensitive employee escalations. Your account does not have permission to view it.</p></div>}
    {canManage && queue.isLoading && <LoadingBlock label="Loading HR escalation queue" />}
    {canManage && queue.isError && <ErrorMessage message={errorStatus(queue.error) === 403 ? 'The server denied access to the HR review queue.' : 'The HR review queue could not be loaded.'} retry={() => queue.refetch()} />}
    {canManage && queue.data && <section className="panel">
      <div className="panel-header"><div><h2>Open for human follow-up</h2><div className="panel-subtitle">Only unresolved escalations returned by the HR service</div></div><span className="secure-line"><LockKeyhole size={14} /> Restricted</span></div>
      {queue.data.escalations.length === 0 && <div className="empty-state"><span className="empty-icon"><Check size={20} /></span><h3>No unresolved escalations</h3><p>There are no escalation records to display right now.</p></div>}
      {queue.data.escalations.map((item) => <article className="queue-item" key={item.id} data-testid={`queue-item-${item.id}`}>
        <div className="queue-item-top"><StatusChip status={item.status} /><span className="muted" style={{ fontSize: 10 }}>Reference {item.id}</span></div>
        <p className="queue-summary">{item.summary}</p>
        <div className="queue-meta"><span><Clock3 size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />{formatDate(item.createdAt)}</span>{item.employeeEmail && <span>{item.employeeEmail}</span>}</div>
        <div className="queue-actions">{item.status === 'open' && <button className="button button-outline small-button" type="button" disabled={update.isPending} onClick={() => setStatus(item, 'reviewing')} data-testid={`button-review-${item.id}`}>Mark reviewing</button>}{item.status !== 'resolved' && <button className="button button-primary small-button" type="button" disabled={update.isPending} onClick={() => setStatus(item, 'resolved')} data-testid={`button-resolve-${item.id}`}>Mark resolved</button>}</div>
      </article>)}
    </section>}
    <Toast>{notice}</Toast>
  </div>;
}

function RouteSwitch() {
  return <Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/requests/:id" component={() => <ProtectedPage active="/requests"><RequestDetailPage /></ProtectedPage>} />
    <Route path="/requests" component={() => <ProtectedPage active="/requests"><RequestsPage /></ProtectedPage>} />
    <Route path="/policies" component={() => <ProtectedPage active="/policies"><PoliciesPage /></ProtectedPage>} />
    <Route path="/hr-queue" component={() => <ProtectedPage active="/hr-queue"><HrQueuePage /></ProtectedPage>} />
    <Route component={() => <ProtectedPage active="/"><NotFound /></ProtectedPage>} />
  </Switch>;
}

function NotFound() {
  return <div className="empty-state"><span className="empty-icon"><FileText size={20} /></span><h3>That page is not here</h3><p>Return to your support workspace or explore the public People Desk page.</p><Link href="/" className="button button-primary" data-testid="link-not-found-home">Go to home <ArrowRight size={14} /></Link></div>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your support desk' } },
      signUp: { start: { title: 'Create your account', subtitle: 'Get started with private employee support' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkCacheInvalidator />
    <RouteSwitch />
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}>
    <WouterRouter base={basePath}><ClerkRoutes /></WouterRouter>
  </QueryClientProvider>;
}

export default App;
