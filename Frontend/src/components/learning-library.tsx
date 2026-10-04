"use client";

import { useState } from "react";
import { LuBookOpen, LuSearch } from "react-icons/lu";
import { StudentNavigation } from "@/components/student-navigation";
import { useLearningRequest } from "@/components/learning-hooks";
import { learningCatalog, learningLibrary, learningMembership, safeLearningUrl } from "@/lib/learning-api";

async function loadLibrary(signal: AbortSignal) {
  const [catalog, modules] = await Promise.all([learningCatalog(signal), learningLibrary(signal)]);
  return { ...catalog, modules };
}
export function LearningLibrary() {
  const request = useLearningRequest(loadLibrary, "library");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  if (!request.data) return <main className="supporting-main"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat materi..."}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main>;
  const visible = request.data.modules.filter(item => (!level || item.program.code === level) && (!type || item.module_type === type) && `${item.title} ${item.description ?? ""} ${item.chapter.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="supporting-shell student-shell"><StudentNavigation membership={learningMembership(request.data.access)} /><main className="supporting-main library-page"><header className="supporting-page-head"><h1>Perpustakaan Materi</h1></header><div className="library-filter-bar"><label className="library-search"><LuSearch aria-hidden="true" /><input type="search" aria-label="Cari materi" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="library-dropdowns"><label className="library-select-item">Level<select value={level} onChange={event => setLevel(event.target.value)}><option value="">Semua</option>{request.data.programs.map(item => <option key={item.id} value={item.code}>{item.name}</option>)}</select></label><label className="library-select-item">Kategori<select value={type} onChange={event => setType(event.target.value)}><option value="">Semua</option><option value="grammar">Tata Bahasa</option><option value="kanji">Huruf/Kanji</option><option value="general">Umum</option></select></label></div></div><section className="library-material-grid">{visible.map(item => <article className="library-material-card" key={item.id}><div className="library-material-visual"><small className="library-material-label"><LuBookOpen aria-hidden="true" />Modul</small><strong>{item.program.name}</strong></div><div className="library-material-content"><h2>{item.title}</h2><p>{item.description}</p><small>{item.chapter.title}</small>{safeLearningUrl(item.file_url) && <a className="button button-primary" href={safeLearningUrl(item.file_url)} target="_blank" rel="noopener noreferrer">Buka Materi</a>}</div></article>)}</section>{!visible.length && <section className="library-empty"><h2>Belum tersedia</h2></section>}</main></div>;
}
