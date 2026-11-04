import { desc, eq } from "drizzle-orm";
import { FileVideo } from "lucide-react";
import { db, schema } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Uploader } from "@/components/portal/uploader";
import { PortalShell, portalClient } from "../shell";
import { brandAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photos & brand", robots: { index: false, follow: false } };

export default async function AssetsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const client = await portalClient(token);
  const assets = await db.select().from(schema.assets).where(eq(schema.assets.clientId, client.id)).orderBy(desc(schema.assets.createdAt)).limit(60);
  const colours = [...client.brandColours, ...["#2e6bff", "#ffffff", "#000000"].slice(client.brandColours.length)].slice(0, 3);

  return (
    <PortalShell token={token} kicker="Step 3" title="Photos, videos & brand" error={sp.error} notice={sp.notice}>
      <section className="glass space-y-3 rounded-[22px] p-5">
        <p className="font-display font-semibold">Photos and videos</p>
        <p className="text-sm text-muted-foreground">Your best units or listings, the lot or office, your team. Phone photos are perfect.</p>
        <Uploader portalToken={token} />
      </section>
      <section className="glass space-y-3 rounded-[22px] p-5">
        <p className="font-display font-semibold">Your logo</p>
        <Uploader portalToken={token} type="logo" accept="image/*,application/pdf" tagsField={false} label="Choose your logo" />
      </section>
      {assets.length ? (
        <section>
          <p className="kicker mb-2">Uploaded ({assets.length})</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {assets.map((a) => (
              <li key={a.id} className="aspect-square overflow-hidden rounded-2xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)]">
                {a.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${a.filePath}?t=${token}`} alt={a.tags.join(", ") || a.type} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-muted-foreground"><FileVideo className="h-6 w-6" />{a.type}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form action={brandAction} className="glass-strong space-y-4 rounded-[22px] p-5">
        <input type="hidden" name="token" value={token} />
        <p className="font-display font-semibold">Brand colours</p>
        <div className="flex gap-3">
          {colours.map((c, i) => (
            <label key={i} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
              <input type="color" name="colour" defaultValue={c} className="h-12 w-12 cursor-pointer rounded-xl border border-[var(--line-strong)] bg-transparent" />
              Colour {i + 1}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="finish" value="1" size="lg" className="flex-1">I&apos;m done uploading</Button>
          <Button type="submit" name="finish" value="0" variant="outline" size="lg">Save colours</Button>
        </div>
      </form>
    </PortalShell>
  );
}
