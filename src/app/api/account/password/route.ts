import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { currentPassword?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPassword = (body.currentPassword ?? "").trim();
  const password = (body.password ?? "").trim();

  if (!currentPassword) {
    return NextResponse.json(
      { error: "Current password is required" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 },
    );
  }
  if (password === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current password" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify current password before changing
    const { error: verifyError } = await admin.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      { password },
    );
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update password" },
      { status: 500 },
    );
  }
}
