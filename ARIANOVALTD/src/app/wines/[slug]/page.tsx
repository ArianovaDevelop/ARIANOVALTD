import { PortableText } from "next-sanity";
import Image from "next/image";
import { notFound } from "next/navigation";
import { sanityFetch } from "@/sanity/lib/fetch";
import { SINGLE_WINE_QUERY } from "@/sanity/lib/queries";
import AddToCartButton from "@/components/shared/AddToCartButton";
import { urlFor } from "@/sanity/lib/image";

export const revalidate = 0; // Absolute SSR Precision enforcing backend reads upon reload

export default async function WinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const wine = await sanityFetch<any>({
    query: SINGLE_WINE_QUERY,
    params: { slug },
  });

  if (!wine) {
    notFound();
  }

  const available = (wine.physical_stock || 0) - (wine.committed_stock || 0);
  const isSoldOut = available <= 0;

  const displayImageUrl = wine.imageObj
    ? urlFor(wine.imageObj).width(1200).url()
    : wine.imageUrl;

  return (
    <div className="min-h-screen bg-brand-bg pt-10 pb-24">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 items-start">

          {/* Left Column: Image */}
          <div className="relative aspect-[3/4] w-full bg-[#F8F6F0] rounded-sm overflow-hidden shadow-sm border border-brand-border/5">
            {displayImageUrl ? (
              <Image
                src={displayImageUrl}
                alt={wine.title}
                fill
                className="object-contain p-6"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-brand-surface/40 font-serif text-lg italic">
                Vintage Hidden
              </div>
            )}
            {/* Embedded Visual Scarcity Flagging */}
            <div className="absolute top-6 right-6">
              {isSoldOut ? (
                <div className="bg-brand-surface text-brand-foreground text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm shadow-md">
                  Cellar Empty
                </div>
              ) : available <= 5 ? (
                <div className="bg-brand-accent text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm shadow-md">
                  Rare Vintage: Only {available} left!
                </div>
              ) : (
                <div className="bg-brand-surface/90 text-brand-foreground text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm backdrop-blur-sm">
                  Immediate Dispatch
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Details */}
          <div className="flex flex-col pt-8 md:pt-16 md:sticky md:top-32">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-foreground/60 mb-4">
              {wine.winery && <span className="block mb-1 text-brand-accent">{wine.winery}</span>}
              {wine.vintage ? `Vintage ${wine.vintage}` : "Non-Vintage"}
            </h2>
            <h1 className="font-serif text-4xl md:text-5xl text-brand-foreground mb-4 tracking-wide leading-tight">
              {wine.title}
            </h1>

            <p className="text-xl font-light text-brand-foreground/80 tracking-widest mb-10">
              ${(wine.price / 100).toFixed(2)}
            </p>

            {/* Tasting Notes */}
            <div className="prose prose-stone prose-p:text-brand-foreground/80 prose-p:leading-relaxed prose-p:font-light font-serif mb-12">
              {wine.tastingNotes ? (
                <PortableText value={wine.tastingNotes} />
              ) : (
                <p>Tasting notes for this vintage are currently being curated by our sommeliers.</p>
              )}
            </div>

            {/* Technical Specifications */}
            {(wine.grapeVarieties || wine.alcoholContent) && (
              <div className="mb-12 border-t border-brand-border/10 pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-brand-foreground/60 mb-4">Specifications</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  {wine.grapeVarieties && (
                    <div>
                      <dt className="text-brand-foreground/50 uppercase tracking-widest text-[10px]">Grape Varieties</dt>
                      <dd className="font-serif text-brand-foreground/90 mt-1">{wine.grapeVarieties}</dd>
                    </div>
                  )}
                  {wine.alcoholContent && (
                    <div>
                      <dt className="text-brand-foreground/50 uppercase tracking-widest text-[10px]">Alcohol Content</dt>
                      <dd className="font-serif text-brand-foreground/90 mt-1">{wine.alcoholContent}% Vol.</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}


            {/* Purchase Action intercepting constraints natively */}
            <AddToCartButton wine={wine} available={available} />

            {/* SKU / Metadata */}
            <div className="mt-12 pt-8 border-t border-brand-border/10 flex flex-col gap-2 text-[10px] text-brand-foreground/50 uppercase tracking-widest font-semibold">
              <p>SKU: {wine.sku || "N/A"}</p>
              <p>Authenticity Guaranteed by Arianova Estate</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
