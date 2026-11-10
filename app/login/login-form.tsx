'use client';
import { useActionState } from 'react';
import { sendLoginLink, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLoginLink, { sent: false });
  if (state.sent) {
    return <p className="success" role="status">If this email has staff access, a login link is on its way. Check your inbox.</p>;
  }
  return (
    <form action={action} className="stack">
      <div>
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <p className="hint">We&apos;ll email you a one-time login link. No password needed.</p>
      </div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn btn-block" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Email me a login link'}</button>
    </form>
  );
}
