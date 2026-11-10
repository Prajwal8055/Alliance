'use client';
import { useActionState, useState } from 'react';
import {
  saveAdvisor, uploadPhoto, createInvite, setStaffRole,
  type FormState, type InviteState,
} from './actions';

type Advisor = {
  id: string; full_name: string; designation: string; whatsapp: string; deals_closed: number; leads_handled: number;
};

function Status({ state }: { state: FormState }) {
  if (state.error) return <p className="error" role="alert">{state.error}</p>;
  if (state.message) return <p className="success" role="status">{state.message}</p>;
  return null;
}

export function AdvisorForm({ advisor }: { advisor?: Advisor }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAdvisor.bind(null, advisor?.id ?? null), {});
  return (
    <form action={action} className="stack">
      <div>
        <label htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" required minLength={2} maxLength={80} defaultValue={advisor?.full_name} />
      </div>
      {!advisor && (
        <div>
          <label htmlFor="slug">Card web address (optional)</label>
          <input id="slug" name="slug" maxLength={60} placeholder="vasanth-kumar" pattern="[a-zA-Z0-9 \-]*" />
          <p className="hint">Leave blank to use the name. This can&apos;t be changed later, because printed QR codes point to it.</p>
        </div>
      )}
      <div>
        <label htmlFor="designation">Designation</label>
        <input id="designation" name="designation" required maxLength={80} defaultValue={advisor?.designation ?? 'Sales Advisor'} />
      </div>
      <div>
        <label htmlFor="whatsapp">WhatsApp number</label>
        <input id="whatsapp" name="whatsapp" type="tel" required maxLength={20} defaultValue={advisor?.whatsapp} placeholder="96060 25056" />
        <p className="hint">Shown publicly on the card for &quot;Chat on WhatsApp&quot; and &quot;Call&quot;.</p>
      </div>
      <div className="grid-2">
        <div>
          <label htmlFor="deals_closed">Deals closed (public)</label>
          <input id="deals_closed" name="deals_closed" type="number" min={0} max={100000} required defaultValue={advisor?.deals_closed ?? 0} />
        </div>
        <div>
          <label htmlFor="leads_handled">Leads handled (internal only)</label>
          <input id="leads_handled" name="leads_handled" type="number" min={0} max={100000} required defaultValue={advisor?.leads_handled ?? 0} />
        </div>
      </div>
      <Status state={state} />
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : advisor ? 'Save changes' : 'Create card'}</button>
    </form>
  );
}

export function PhotoForm({ advisorId }: { advisorId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadPhoto.bind(null, advisorId), {});
  return (
    <form action={action} className="stack">
      <div>
        <label htmlFor="photo">Profile photo</label>
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
        <p className="hint">A clear, smiling, front-facing photo in office attire. JPG, PNG or WebP, under 2 MB.</p>
      </div>
      <Status state={state} />
      <button className="btn btn-ghost" type="submit" disabled={pending}>{pending ? 'Uploading…' : 'Upload photo'}</button>
    </form>
  );
}

export function InviteForm({ advisorId }: { advisorId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite.bind(null, advisorId), {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <form action={action} className="stack">
        <div>
          <label htmlFor="customer_name">Customer name</label>
          <input id="customer_name" name="customer_name" required minLength={2} maxLength={80} />
        </div>
        <div>
          <label htmlFor="customer_phone">Customer WhatsApp (optional)</label>
          <input id="customer_phone" name="customer_phone" type="tel" maxLength={20} />
          <p className="hint">Only used to open the WhatsApp chat. Not saved.</p>
        </div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create one-time review link'}</button>
      </form>
      {state.link && (
        <div className="card stack" role="status">
          <p className="success" style={{ margin: 0 }}>Link created. It works once and expires in 30 days.</p>
          <input readOnly value={state.link} aria-label="Review link" onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <a className="btn" href={state.shareUrl} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
            <button type="button" className="btn btn-ghost" onClick={async () => {
              await navigator.clipboard.writeText(state.link!); setCopied(true);
            }}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <p className="hint">This link won&apos;t be shown again. Create a new one if it gets lost.</p>
        </div>
      )}
    </div>
  );
}

export function TeamForm({ advisors }: { advisors: { id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setStaffRole, {});
  const [role, setRole] = useState('sales');
  return (
    <form action={action} className="stack">
      <div>
        <label htmlFor="email">Staff email</label>
        <input id="email" name="email" type="email" required maxLength={254} />
      </div>
      <div>
        <label htmlFor="role">Access</label>
        <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="sales">Salesperson: sees own card and stats</option>
          <option value="manager">Manager: edits cards, sends review links</option>
          <option value="admin">Admin: everything, including team access</option>
          <option value="none">Remove access</option>
        </select>
      </div>
      {role === 'sales' && (
        <div>
          <label htmlFor="advisor_id">Their advisor card</label>
          <select id="advisor_id" name="advisor_id" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {advisors.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
      )}
      <Status state={state} />
      <button className={role === 'none' ? 'btn btn-danger' : 'btn'} type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save access'}</button>
    </form>
  );
}
