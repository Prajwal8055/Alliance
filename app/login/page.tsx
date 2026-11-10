import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Staff login', robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <main className="wrap">
      <img className="brand" src="/logo.png" alt="Alliance Square" />
      <section className="card stack">
        <h1>Staff login</h1>
        {error === 'no-access' && <p className="error" role="alert">Your login doesn&apos;t have staff access yet. Please ask an admin.</p>}
        {error === 'link' && <p className="error" role="alert">That login link is invalid or has expired. Please request a new one.</p>}
        <LoginForm />
      </section>
    </main>
  );
}
