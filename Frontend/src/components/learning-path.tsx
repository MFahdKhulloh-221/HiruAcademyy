import Link from "next/link";
import { LuCompass, LuLayers, LuTarget, LuCheck } from "react-icons/lu";

interface LearningPathItem {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  step: string;
  label: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}

const learningPathData: LearningPathItem[] = [
  {
    icon: LuCompass,
    step: "01",
    label: "Placement Test",
    title: "Temukan Level yang Tepat",
    description:
      "Ketahui kemampuan awalmu dan dapatkan rekomendasi program yang sesuai dengan target belajarmu.",
    cta: "Cek Level Sekarang →",
    href: "/placement",
  },
  {
    icon: LuLayers,
    step: "02",
    label: "Belajar Terstruktur",
    title: "Belajar Secara Bertahap",
    description:
      "Ikuti materi sesuai urutan melalui video pembelajaran, modul, flashcard, latihan, dan checkpoint.",
    cta: "Mulai Belajar →",
    href: "/dashboard",
  },
  {
    icon: LuTarget,
    step: "03",
    label: "Try Out JLPT",
    title: "Ukur Kesiapanmu",
    description:
      "Kerjakan simulasi JLPT, lihat hasilnya, lalu pelajari pembahasan untuk mengetahui bagian yang perlu ditingkatkan.",
    cta: "Ikuti Try Out →",
    href: "/tryout",
  },
  {
    icon: LuCheck,
    step: "04",
    label: "Sertifikat",
    title: "Dapatkan Bukti Pencapaian",
    description:
      "Selesaikan program dan evaluasi akhir untuk mendapatkan sertifikat sebagai bukti pencapaian belajarmu.",
    cta: "",
    href: "",
  },
];

export function LearningPath() {
  return (
    <section className="section bg-slate-50/60 py-20 md:py-24" id="cara-belajar">
      <div className="container">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
            Belajar Terarah dari Menentukan Level hingga Mencapai Target
          </h2>
          <p className="mt-4 text-base md:text-lg text-slate-500 leading-relaxed">
            Mulai dari mengetahui kemampuan awal, mempelajari materi secara
            bertahap, hingga mengukur kesiapan menghadapi JLPT—semuanya tersedia
            dalam satu alur belajar yang terstruktur.
          </p>
        </div>

        {/* Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {learningPathData.map((item) => {
            const IconComponent = item.icon;
            return (
              <article
                key={item.step}
                className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 border-b-4 border-b-[#f48220] shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full group"
              >
                <div>
                  {/* Header Row: Circular Icon Badge & Step Label */}
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-full bg-[#f48220] flex items-center justify-center text-white shadow-[0_6px_16px_rgba(244,130,32,0.35)] flex-shrink-0">
                      <IconComponent className="w-6 h-6 text-white" strokeWidth={2.4} />
                    </div>
                    <div className="text-xs font-bold tracking-wide">
                      <span className="text-[#f48220]">{item.step}</span>{" "}
                      <span className="text-slate-900">· {item.label}</span>
                    </div>
                  </div>

                  {/* Card Title */}
                  <h3 className="text-xl font-extrabold text-slate-900 mt-6 mb-3 tracking-tight leading-snug">
                    {item.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-slate-500 leading-relaxed text-left">
                    {item.description}
                  </p>
                </div>

                {/* Divider Line & CTA Footer */}
                {item.cta ? (
                  <div className="mt-8 pt-4 border-t border-slate-100">
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[#f48220] hover:text-[#954900] transition-colors"
                    >
                      <span>{item.cta}</span>
                    </Link>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
