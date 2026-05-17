import FadeInView from "@/components/shared/FadeInView"

export default function StoryPage() {
  return (
    <div className="w-full bg-brand-bg min-h-screen">
      {/* 1. Title Banner */}
      <section className="pt-40 pb-20 px-6 text-center">
        <FadeInView direction="up">
          <h1 className="font-serif text-5xl md:text-7xl text-brand-foreground tracking-wide mb-6">
            With Love, From Italy
          </h1>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-brand-foreground/60 font-semibold">
            THE ARIANOVA STORY • EMOTION • CONNECTION
          </p>
        </FadeInView>
      </section>

      {/* 2. Editorial Text and Image Grid */}
      <section className="container mx-auto px-6 max-w-6xl pb-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 items-start">
          
          <div className="md:col-span-5 md:sticky top-32">
            <FadeInView direction="left">
               <h2 className="font-serif text-4xl text-brand-foreground leading-tight mb-8">
                 Because wine is never just wine.
               </h2>
               <div className="w-12 h-px bg-brand-surface mb-8" />
               <p className="font-sans text-brand-foreground/80 leading-relaxed font-light mb-6">
                 It’s a celebration, a pairing, a memory in the making. Every drinker is different — every moment is too. That’s why we curate wines that don’t just fit the table, but the feeling behind it.
               </p>
               <p className="font-sans text-brand-foreground/80 leading-relaxed font-light">
                 At Arianova, everything is done with love — not forced, but naturally born. Because love creates love, and what we bring is more than wine… it’s emotion, it’s connection, it’s bottled Italy.
               </p>
            </FadeInView>
          </div>

          <div className="md:col-span-7 flex flex-col gap-12 mt-12 md:mt-0">
            <FadeInView direction="up" delay={0.2}>
              <div 
                className="w-full aspect-[4/5] bg-cover bg-center shadow-xl grayscale-[0.2] contrast-125"
                style={{ backgroundImage: "url('/images/cellar_editorial_1774069426378.png')" }}
              />
              <p className="text-right mt-4 text-[10px] uppercase font-bold tracking-[0.2em] text-brand-foreground/50">
                The Arianova Portfolio Archives
              </p>
            </FadeInView>

            <FadeInView direction="up" delay={0.1}>
              <div className="bg-brand-surface text-brand-foreground p-12 md:p-16 shadow-2xl mt-8">
                <blockquote className="font-serif text-2xl md:text-3xl leading-relaxed italic border-l-2 border-brand-border/30 pl-8">
                  "Love creates love. We aim to spread emotions and fun, in a bottled love from Italy."
                </blockquote>
              </div>
            </FadeInView>
          </div>

        </div>
      </section>

      {/* 3. The Curator / Owner Section */}
      <section className="bg-brand-surface text-brand-foreground py-32">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <FadeInView direction="up">
              <div 
                className="w-full aspect-[3/4] bg-cover bg-top shadow-2xl grayscale-[0.3]"
                style={{ backgroundImage: "url('/images/MikeUpscaled.jpg')" }}
              />
            </FadeInView>
            <FadeInView direction="left" delay={0.2}>
              <h3 className="text-xs uppercase tracking-[0.4em] text-brand-foreground/60 font-semibold mb-4">
                The Curator
              </h3>
              <h2 className="font-serif text-4xl md:text-5xl mb-8 leading-tight">
                Meet Mike.
              </h2>
              <div className="w-12 h-px bg-brand-bg/30 mb-8" />
              <p className="font-sans text-brand-foreground/80 leading-relaxed font-light mb-6">
                Rooted in New Zealand entrepreneurial vision with an inevitable Italian touch, Mike founded Arianova to redefine how wine is experienced. 
              </p>
              <p className="font-sans text-brand-foreground/80 leading-relaxed font-light">
                For Mike, the portfolio is deeply personal. It’s not just about acquiring the most famous labels; it's about hunting down the estates that pour their soul into the barrel. He traverses the terroir of Italy to find the exact emotion, bringing it back to share exclusively with you.
              </p>
            </FadeInView>
          </div>
        </div>
      </section>

    </div>
  )
}
