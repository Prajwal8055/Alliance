'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { siteUrl } from '@/lib/supabase/server';
import { IMAGE_MIME, detectImageType, normalizeWhatsapp, parseCount, slugify, text, whatsappLink } from '@/lib/format';

export type FormState = { ok?: boolean; error?: string; message?: string };
export type InviteState = FormState & { link?: string; shareUrl?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function assertId(id: string) {
  if (!UUID.test(id)) throw new Error('Invalid id');
}

function refresh(advisorId?: string) {
  revalidatePath('/admin');
  if (advisorId) revalidatePath(`/admin/advisors/${advisorId}`);
}

export async function saveAdvisor(advisorId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireStaff(['admin', 'manager']);
  if (advisorId) assertId(advisorId);

  const fullName = text(form.get('full_name'), 80);
  const designation = text(form.get('designation'), 80) || 'Sales Advisor';
  const whatsapp = normalizeWhatsapp(text(form.get('whatsapp'), 20));
  const deals = parseCount(form.get('deals_closed'));
  const leads = parseCount(form.get('leads_handled'));

  if (fullName.length < 2) return { error: 'Please enter the full name.' };
  if (designation.length < 2) return { error: 'Please enter a designation.' };
  if (!whatsapp) return { error: 'Please enter a valid WhatsApp number, e.g. 96060 25056.' };
  if (deals === null || leads === null) return { error: 'Deals and leads must be whole numbers.' };

  const fields = { full_name: fullName, designation, whatsapp, deals_closed: deals, leads_handled: leads };

  if (advisorId) {
    const { error } = await supabase.from('advisors').update(fields).eq('id', advisorId);
    if (error) return { error: 'Could not save. Please try again.' };
    refresh(advisorId);
    return { ok: true, message: 'Saved.' };
  }

  // The slug is fixed at creation so printed QR codes never break.
  const slug = slugify(text(form.get('slug'), 60) || fullName);
  if (slug.length < 3) return { error: 'Please choose a web address of at least 3 letters.' };
  const { data, error } = await supabase.from('advisors').insert({ ...fields, slug }).select('id').single();
  if (error) {
    return { error: error.code === '23505' ? `The address /advisor/${slug} is already taken. Try adding an initial.` : 'Could not create the card.' };
  }
  refresh();
  redirect(`/admin/advisors/${data.id}`);
}

export async function uploadPhoto(advisorId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireStaff(['admin', 'manager']);
  assertId(advisorId);
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo.' };
  if (file.size > MAX_PHOTO_BYTES) return { error: 'Photo must be under 2 MB.' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = detectImageType(bytes);
  if (!ext) return { error: 'Photo must be a JPG, PNG or WebP image.' };

  const { data: current } = await supabase.from('advisors').select('photo_path').eq('id', advisorId).single();
  const path = `${advisorId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('advisor-photos')
    .upload(path, bytes, { contentType: IMAGE_MIME[ext], upsert: false });
  if (upErr) return { error: 'Upload failed. Please try again.' };

  const { error } = await supabase.from('advisors').update({ photo_path: path }).eq('id', advisorId);
  if (error) {
    await supabase.storage.from('advisor-photos').remove([path]);
    return { error: 'Could not save the photo.' };
  }
  if (current?.photo_path) await supabase.storage.from('advisor-photos').remove([current.photo_path]);
  refresh(advisorId);
  return { ok: true, message: 'Photo updated.' };
}

export async function setActive(advisorId: string, active: boolean) {
  const { supabase } = await requireStaff(['admin', 'manager']);
  assertId(advisorId);
  const { error } = await supabase.from('advisors').update({ is_active: active }).eq('id', advisorId);
  if (error) throw new Error('Could not update status');
  refresh(advisorId);
}

export async function createInvite(advisorId: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const { supabase } = await requireStaff(['admin', 'manager']);
  assertId(advisorId);
  const customerName = text(form.get('customer_name'), 80);
  if (customerName.length < 2) return { error: "Please enter the customer's name." };
  // The customer's number is only used to open WhatsApp; it is not stored.
  const rawPhone = text(form.get('customer_phone'), 20);
  const customerPhone = rawPhone ? normalizeWhatsapp(rawPhone) : null;
  if (rawPhone && !customerPhone) return { error: "That customer number doesn't look right." };

  const { data: token, error } = await supabase.rpc('create_review_invite', { p_advisor_id: advisorId, p_customer_name: customerName });
  if (error || typeof token !== 'string') return { error: 'Could not create the link. Is the advisor active?' };

  const { data: advisor } = await supabase.from('advisors').select('full_name').eq('id', advisorId).single();
  const link = `${siteUrl()}/review/${token}`;
  const message = `Dear ${customerName.split(' ')[0]}, thank you for choosing Alliance Square! `
    + `Could you take a minute to rate your experience with ${advisor?.full_name ?? 'your advisor'}? ${link}`;
  refresh(advisorId);
  return {
    ok: true,
    link,
    shareUrl: customerPhone ? whatsappLink(customerPhone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`,
  };
}

export async function revokeInvite(advisorId: string, inviteId: string) {
  const { supabase } = await requireStaff(['admin', 'manager']);
  assertId(advisorId); assertId(inviteId);
  await supabase.from('review_invites').delete().eq('id', inviteId);
  refresh(advisorId);
}

export async function setReviewHidden(advisorId: string, reviewId: string, hidden: boolean) {
  const { supabase } = await requireStaff(['admin']);
  assertId(advisorId); assertId(reviewId);
  const { error } = await supabase.from('reviews').update({ is_hidden: hidden }).eq('id', reviewId);
  if (error) throw new Error('Could not update review');
  refresh(advisorId);
}

export async function setStaffRole(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireStaff(['admin']);
  const email = text(form.get('email'), 254);
  const roleValue = text(form.get('role'), 10);
  const role = roleValue === 'none' ? null : roleValue;
  if (role !== null && !['admin', 'manager', 'sales'].includes(role)) return { error: 'Choose a role.' };
  const advisorId = text(form.get('advisor_id'), 36) || null;
  if (role === 'sales' && (!advisorId || !UUID.test(advisorId))) return { error: 'Choose which advisor card this salesperson owns.' };

  const { error } = await supabase.rpc('set_staff_role', { p_email: email, p_role: role, p_advisor_id: role === 'sales' ? advisorId : null });
  if (error) return { error: error.code === 'P0001' || error.code === 'P0002' ? error.message : 'Could not update access.' };
  revalidatePath('/admin/team');
  return { ok: true, message: role ? `Access updated for ${email}.` : `Access removed for ${email}.` };
}
