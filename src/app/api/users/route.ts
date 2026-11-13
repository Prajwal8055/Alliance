import { NextResponse } from "next/server";
import { requireBoss } from "@/lib/auth/require-boss";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const gate = await requireBoss();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const admin = createAdminClient();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: listed, error: listError } = await admin.auth.admin.listUsers({
      perPage: 200,
    });
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const emailById = new Map(
      (listed.users ?? []).map((u) => [u.id, u.email ?? ""] as const),
    );

    const users = (profiles ?? []).map((p) => ({
      ...p,
      email: emailById.get(p.id) ?? "",
    }));

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list users" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireBoss();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: {
    email?: string;
    password?: string;
    full_name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = (body.password ?? "").trim();
  const fullName = body.full_name?.trim() || "Accounts";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Temporary password must be at least 8 characters" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "accounts",
      },
    });

    if (error) {
      const msg = /already|registered|exists/i.test(error.message)
        ? "A user with this email already exists"
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "User was not created" }, { status: 500 });
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      role: "accounts",
    });
    if (profileError) {
      return NextResponse.json(
        {
          error: `User created in Auth but profile failed: ${profileError.message}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email,
        full_name: fullName,
        role: "accounts",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create user" },
      { status: 500 },
    );
  }
}
