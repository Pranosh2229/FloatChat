import Link from "next/link";

import { FloatAnatomy } from "@/components/home/FloatAnatomy";
import { FloatCycleStrip, FloatHero } from "@/components/home/FloatCartoon";
import { QuestionToWorld } from "@/components/home/QuestionToWorld";
import { Reveal } from "@/components/home/Reveal";

const STEPS = [
  {
    n: "01",
    title: "Ask in plain English",
    body: "“What’s unusual in the Tasman Sea?” is a valid question. So is “what is a thermocline?” or “how do you know?”",
    art: (
      <svg viewBox="0 0 200 110" className="w-full">
        <rect x="10" y="30" width="180" height="44" rx="22" fill="var(--color-bg-elevated)" stroke="var(--graphite)" strokeWidth="2.5" />
        <circle cx="34" cy="52" r="5" fill="var(--cobalt)" />
        <path d="M52 52 h90" stroke="var(--graphite)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 8" />
        <rect x="150" y="38" width="32" height="28" rx="14" fill="var(--cobalt)" />
        <path d="M160 52 h12 M168 47 l5 5 l-5 5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: "02",
    title: "Watch the water answer",
    body: "The camera flies to the place, the floats involved light up, the timeline jumps. The map is the answer, not a chat bubble.",
    art: (
      <svg viewBox="0 0 200 110" className="w-full">
        <rect x="10" y="10" width="180" height="90" rx="10" fill="var(--ink-2)" />
        <path d="M20 60 q30 -25 60 -10 t60 -10 t50 5 v45 h-170z" fill="var(--sand)" opacity="0.9" />
        {[[60, 40], [110, 30], [140, 48], [85, 22]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="9" fill="none" stroke="var(--coral)" strokeWidth="2" />
            <rect x={x - 3} y={y - 9} width="6" height="14" rx="2" fill="var(--gold)" stroke="var(--graphite)" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
    ),
  },
  {
    n: "03",
    title: "Open the case file",
    body: "Every conclusion traces back to real dives, real readings and a real long-term baseline. If we don’t know why, we say so.",
    art: (
      <svg viewBox="0 0 200 110" className="w-full">
        <rect x="30" y="14" width="140" height="84" rx="8" fill="var(--color-bg-elevated)" stroke="var(--graphite)" strokeWidth="2.5" />
        <rect x="30" y="14" width="60" height="16" rx="4" fill="var(--coral)" />
        <path d="M44 48 h80 M44 60 h60" stroke="var(--graphite)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <rect x="44" y="72" width="70" height="8" rx="4" fill="var(--coral)" />
        <rect x="44" y="84" width="40" height="8" rx="4" fill="var(--graphite-2)" />
        <circle cx="150" cy="78" r="12" fill="var(--gold)" stroke="var(--graphite)" strokeWidth="2.5" />
        <path d="M144 78 l4 4 l8 -9" stroke="var(--graphite)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
];

const FACTS = [
  { big: "~4,000", small: "floats drifting right now, in every ocean", icon: "⚲" },
  { big: "2 km", small: "down and back, every ten days, for years", icon: "↧" },
  { big: "90%", small: "of the extra heat from climate change is stored in the sea — floats are how we measure it", icon: "◐" },
];

/**
 * Home: the hook, then a plain-language story of what an ARGO float is (cartoon strip), how
 * one is built (labelled dissection), what this site does with the data, and why any of it
 * matters — all in the Field Notebook system, illustrations first, numbers as captions.
 */
export default function HomePage() {
  return (
    <main className="paper-grid min-h-dvh px-6 pb-24 pt-32 sm:px-12">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="eyebrow">Real ARGO floats · real satellite readings · no invented data</p>
          <h1 className="mt-4 font-display text-[clamp(56px,9vw,124px)] leading-[0.92] tracking-tight">
            Ask the <span className="italic text-[var(--cobalt)]">ocean.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--graphite-2)]">
            Thousands of robotic floats are drifting through the world&apos;s oceans right now, diving
            two kilometres down and reporting back. FloatChat lets you put a question to them in plain
            English — and shows you the answer on the water, with the evidence attached.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/explore" className="btn btn-primary !px-5 !py-3 !text-[14px]">
              Enter the ocean <span aria-hidden>→</span>
            </Link>
            <Link href="/dashboard" className="btn !px-5 !py-3 !text-[14px]">
              See the whole picture
            </Link>
            <span className="annotation ml-2 text-[15px]">← start here</span>
          </div>
        </div>
        <Reveal>
          <FloatHero />
        </Reveal>
      </section>

      {/* What is an ARGO float */}
      <section className="mx-auto mt-28 max-w-6xl">
        <Reveal>
          <p className="eyebrow">First, the robot</p>
          <h2 className="mt-2 font-display text-[clamp(36px,5vw,64px)] leading-none">
            Meet Bob. Bob is an ARGO float.
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-[var(--graphite-2)]">
            An ARGO float is a robot about the size of a person that nobody steers. It drifts with
            the currents and repeats one simple routine for years: sink, rise, measure, phone home.
            Put four thousand of them together and you get the first real-time picture of what the
            ocean is doing beneath the surface.
          </p>
        </Reveal>
        <Reveal className="mt-8" delayMs={120}>
          <FloatCycleStrip />
        </Reveal>
      </section>

      {/* Anatomy */}
      <section className="mx-auto mt-28 grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="eyebrow">Taken apart</p>
          <h2 className="mt-2 font-display text-[clamp(36px,5vw,64px)] leading-none">What&apos;s inside.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[var(--graphite-2)]">
            No propeller, no rudder. A float moves up and down by changing its own volume — the
            same trick a scuba diver uses with a buoyancy vest — and everything else on board exists
            to measure the water and report it. Scroll the drawing to see each part light up.
          </p>
          <p className="annotation mt-4 text-[15px]">six parts, one job →</p>
        </Reveal>
        <Reveal delayMs={100}>
          <FloatAnatomy />
        </Reveal>
      </section>

      {/* What the site does */}
      <section className="mx-auto mt-28 max-w-6xl">
        <Reveal>
          <p className="eyebrow">Then, this site</p>
          <h2 className="mt-2 font-display text-[clamp(36px,5vw,64px)] leading-none">
            All that data. Now you can just ask it.
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-[var(--graphite-2)]">
            Ocean data normally lives in files only specialists can read. FloatChat turns real
            float and satellite measurements from eleven ocean regions into a world you can roam,
            question, and interrogate — and every answer explains itself.
          </p>
        </Reveal>
        <Reveal className="mt-8" delayMs={100}>
          <QuestionToWorld />
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((card, i) => (
            <Reveal key={card.n} delayMs={i * 120}>
              <Link href="/explore" className="card card-hover block h-full p-5">
                <span className="rounded-full bg-[var(--graphite)] px-2 py-0.5 font-mono text-[10px] tracking-[0.15em] text-[var(--paper)]">
                  {card.n}
                </span>
                <div className="mt-4">{card.art}</div>
                <p className="mt-4 font-display text-[24px] leading-tight">{card.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--graphite-2)]">{card.body}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why it matters */}
      <section className="mx-auto mt-28 max-w-6xl">
        <Reveal>
          <p className="eyebrow">Why bother</p>
          <h2 className="mt-2 font-display text-[clamp(36px,5vw,64px)] leading-none">
            The ocean is where the heat goes.
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {FACTS.map((fact, i) => (
            <Reveal key={fact.big} delayMs={i * 120}>
              <div className="card p-5">
                <span className="font-display text-[28px] text-[var(--cobalt)]">{fact.icon}</span>
                <p className="mt-2 font-display text-[44px] leading-none">{fact.big}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--graphite-2)]">{fact.small}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8">
          <p className="max-w-2xl text-[16px] leading-relaxed text-[var(--graphite-2)]">
            Marine heatwaves bleach reefs and empty fisheries; slow deep-ocean warming raises sea
            levels for centuries. None of it is visible from a beach. Floats make it visible — and
            this site makes the floats readable.
          </p>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto mt-28 max-w-6xl">
        <Reveal>
          <div className="card flex flex-wrap items-center justify-between gap-6 p-8">
            <div>
              <p className="font-display text-[clamp(28px,4vw,44px)] leading-tight">
                AI helps you investigate. <span className="italic text-[var(--graphite-3)]">It never invents the data.</span>
              </p>
            </div>
            <Link href="/explore" className="btn btn-primary !px-6 !py-3.5 !text-[15px]">
              Explore the ocean <span aria-hidden>→</span>
            </Link>
          </div>
        </Reveal>
        <p className="mt-8 font-mono text-[10px] tracking-[0.12em] text-[var(--graphite-3)] uppercase">
          Data: ARGO (GDAC via Argovis) · NOAA OISST v2.1 · World Ocean Atlas 2023 · Coastlines: Natural Earth (public domain)
        </p>
      </section>
    </main>
  );
}
