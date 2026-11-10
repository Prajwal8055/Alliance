import Link from 'next/link';
import { connection } from 'next/server';
import { publicClient } from '@/lib/supabase/server';
import { normalizeWhatsapp } from '@/lib/format';

type Props = { searchParams: Promise<{ phone?: string }> };

export default async function Home({ searchParams }: Props) {
  await connection();
  const { phone } = await searchParams;
  const digits = phone ? normalizeWhatsapp(phone) : null;
  let match: { slug: string; full_name: string } | null = null;
  if (digits) {
    const { data } = await publicClient()
      .from('public_advisor_cards').select('slug, full_name').eq('whatsapp', digits).eq('is_active', true).limit(1).maybeSingle();
    match = data;
  }

  return (
    <main className="wrap">
      <img className="brand" src="/logo.png" alt="Alliance Square — Property Management & Consultants" />
      <section className="card stack">
        <h1>Verify an Alliance Square advisor</h1>
        <p className="muted">Got a call or WhatsApp message from someone saying they are from Alliance Square? Check their number here.</p>
        <form method="get" className="stack">
          <div>
            <label htmlFor="phone">Their mobile number</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" required
                   defaultValue={phone ?? ''} placeholder="e.g. 96060 25056" maxLength={20} />
          </div>
          <button className="btn btn-block" type="submit">Verify</button>
        </form>
        {phone !== undefined && (
          <div role="status">
            {!digits ? (
              <p className="error">Please enter a valid mobile number.</p>
            ) : match ? (
              <p className="success">✓ This number belongs to <Link href={`/advisor/${match.slug}`}>{match.full_name}</Link>, a verified Alliance Square advisor.</p>
            ) : (
              <p className="error">✕ This number is not registered to any current Alliance Square advisor.
                Please don&apos;t share documents or make payments, and contact us via <a href="https://www.alliancesquare.com">alliancesquare.com</a>.</p>
            )}
          </div>
        )}
      </section>
      <p className="small center"><Link href="/login">Staff login</Link></p>
    </main>
  );
}
