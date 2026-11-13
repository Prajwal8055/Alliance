import { NextResponse } from "next/server";
import { requireBoss } from "@/lib/auth/require-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const gate = await requireBoss();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;

  let body: { full_name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!fullName && !email) {
    return NextResponse.json(
      { error: "Provide a name and/or email to update" },
      { status: 400 },
    );
  }
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (profile.role !== "accounts") {
      return NextResponse.json(
        { error: "Only Accounts users can be edited here" },
        { status: 403 },
      );
    }

    if (email) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, {
        email,
        email_confirm: true,
        ...(fullName
          ? { user_metadata: { full_name: fullName, role: "accounts" } }
          : {}),
      });
      if (authError) {
        const msg = /already|registered|exists/i.test(authError.message)
          ? "A user with this email already exists"
          : authError.message;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } else if (fullName) {
      const { error: metaError } = await admin.auth.admin.updateUserById(id, {
        user_metadata: { full_name: fullName, role: "accounts" },
      });
      if (metaError) {
        return NextResponse.json({ error: metaError.message }, { status: 400 });
      }
    }

    if (fullName) {
      const { error: nameError } = await admin
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", id);
      if (nameError) {
        return NextResponse.json({ error: nameError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      user: {
        id,
        full_name: fullName ?? profile.full_name,
        email: email ?? undefined,
        role: "accounts" as const,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update user" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const gate = await requireBoss();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;

  if (id === gate.profile.id) {
    return NextResponse.json(
      { error: "You cannot remove your own Boss account" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (profile.role !== "accounts") {
      return NextResponse.json(
        { error: "Only Accounts users can be removed" },
        { status: 403 },
      );
    }

    const bossId = gate.profile.id;

    // Reassign ledger rows with the Boss session (is_boss), then hard-delete auth+profile.
    const supabase = await createClient();
    const { error: reassignError } = await supabase.rpc(
      "reassign_accounts_user_entries",
      { p_from: id, p_to: bossId },
    );

    if (reassignError) {
      // Admin fallback if RPC must run without a Boss JWT (e.g. service role).
      const { error: adminReassignError } = await admin.rpc(
        "reassign_accounts_user_entries",
        { p_from: id, p_to: bossId },
      );
      if (adminReassignError) {
        return NextResponse.json(
          { error: adminReassignError.message || reassignError.message },
          { status: 500 },
        );
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    const { error: profileDeleteError } = await admin
      .from("profiles")
      .delete()
      .eq("id", id);
    if (profileDeleteError) {
      return NextResponse.json(
        { error: profileDeleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, mode: "deleted" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove user" },
      { status: 500 },
    );
  }
}
