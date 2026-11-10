'use client';
import { Fragment, useActionState } from 'react';
import { submitReview, type ReviewState } from './actions';

export function ReviewForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview.bind(null, token), { ok: false });

  if (state.ok) {
    return <p className="success" role="status">Thank you! Your review has been published.</p>;
  }
  return (
    <form action={action} className="stack">
      <fieldset className="star-input">
        <legend className="sr-only">Rating</legend>
        {[5, 4, 3, 2, 1].map((n) => (
          <Fragment key={n}>
            <input type="radio" id={`star-${n}`} name="rating" value={n} required />
            <label htmlFor={`star-${n}`}><span aria-hidden="true">★</span><span className="sr-only">{n} star{n > 1 ? 's' : ''}</span></label>
          </Fragment>
        ))}
      </fieldset>
      <div>
        <label htmlFor="comment">Tell us more (optional)</label>
        <textarea id="comment" name="comment" maxLength={1000} placeholder="How did they help you find your property?" />
      </div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn btn-block" type="submit" disabled={pending}>{pending ? 'Submitting…' : 'Submit review'}</button>
    </form>
  );
}
