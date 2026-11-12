import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div
        className="w-full max-w-md rounded-2xl border p-8 shadow-[var(--shadow)]"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <p
          className="text-sm tracking-[0.18em] uppercase"
          style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
        >
          Alliance Square
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Cash Book</h1>
        <p className="mt-2 text-base" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
          Sign in with your email and password.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
