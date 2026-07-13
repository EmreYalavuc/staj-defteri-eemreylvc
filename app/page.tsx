"use client";

import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import type { DiaryEntry } from "./types";

const ADMIN_KEY = "staj-admin";
const TOKEN_KEY = "staj-token";

/* ── Yardımcı ── */
function pad(n: number) { return String(n).padStart(2, "0"); }

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayStr() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function lines(t: string) { return t.split("\n").map((s) => s.trim()).filter(Boolean); }
function commas(t: string) { return t.split(",").map((s) => s.trim()).filter(Boolean); }

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/* ── PDF üretme ── */
async function generatePDF(entry: DiaryEntry) {
  const sec = (title: string, items: string[]) =>
    items.length
      ? `<div style="margin-bottom:18px">
           <div style="font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:#7a1a22;margin-bottom:7px;font-weight:600">${title}</div>
           <ul style="margin:0;padding:0;list-style:none">
             ${items.map((i) => `<li style="font-size:12px;color:#222;line-height:1.65;padding:2px 0 2px 14px;position:relative"><span style="position:absolute;left:0;color:#7a1a22">›</span>${i}</li>`).join("")}
           </ul>
         </div>`
      : "";

  const imagesHtml = entry.imageUrls?.length
    ? `<div style="margin-top:22px;border-top:1px solid #e0e0e0;padding-top:18px">
         <div style="font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:#7a1a22;margin-bottom:10px;font-weight:600">Görseller</div>
         <div style="display:flex;flex-wrap:wrap;gap:8px">
           ${entry.imageUrls.map((u) => `<img src="${u}" style="width:200px;height:150px;object-fit:cover;border-radius:4px;border:1px solid #ddd">`).join("")}
         </div>
       </div>`
    : "";

  const htmlContent = `
    <div style="width:760px;padding:52px;background:#fff;font-family:Georgia,serif;color:#1a1a1a">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #7a1a22;padding-bottom:14px;margin-bottom:22px">
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.18em;color:#7a1a22;margin-bottom:5px">Staj Defteri</div>
          <h1 style="font-size:24px;margin:0;color:#1a1a1a">${entry.gun}. Gün — ${entry.tarih}</h1>
        </div>
        <div style="font-size:10px;color:#999;text-align:right">Eklendi: ${formatDateTime(entry.createdAt)}</div>
      </div>
      <div style="background:#fdf6f0;border-left:3px solid #7a1a22;padding:11px 15px;margin-bottom:22px;border-radius:0 4px 4px 0">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#7a1a22;margin-bottom:4px;font-weight:600">Günün Amacı</div>
        <div style="font-size:13px;color:#333;font-style:italic">${entry.amac}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px">
        ${sec("Yapılan Çalışmalar", entry.yapilan)}
        ${sec("Edinilen Bilgiler / Kazanımlar", entry.kazanimlar)}
        ${entry.problemler?.length ? sec("Karşılaşılan Problemler", entry.problemler) : ""}
        ${entry.cozumler?.length ? sec("Uygulanan Çözümler", entry.cozumler) : ""}
      </div>
      <div style="margin-top:18px;border-top:1px solid #e0e0e0;padding-top:16px">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:#7a1a22;margin-bottom:8px;font-weight:600">Kullanılan Teknolojiler</div>
        <div>${entry.teknolojiler.map((t) => `<span style="display:inline-block;padding:3px 10px;border:1px solid #7a1a22;border-radius:20px;font-size:11px;color:#7a1a22;margin:2px 4px 2px 0;font-family:sans-serif">${t}</span>`).join("")}</div>
      </div>
      ${imagesHtml}
    </div>`;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:-9999px;top:0;";
  wrapper.innerHTML = htmlContent;
  document.body.appendChild(wrapper);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(wrapper.firstChild as HTMLElement, {
      scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff",
    });
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = 210, pageH = 297;
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const dataUrl = canvas.toDataURL("image/png");
    pdf.addImage(dataUrl, "PNG", 0, 0, imgW, imgH);
    let remaining = imgH - pageH, offset = -pageH;
    while (remaining > 0) {
      pdf.addPage();
      pdf.addImage(dataUrl, "PNG", 0, offset, imgW, imgH);
      remaining -= pageH; offset -= pageH;
    }
    pdf.save(`staj-defteri-${entry.gun}-gun.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
}

/* ── Görsel yükleme (form içi önizleme) ── */
interface PendingImage { file: File; previewUrl: string; }

function ImageUpload({ pending, onChange }: { pending: PendingImage[]; onChange: (items: PendingImage[]) => void; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => f.type.startsWith("image/"));
    onChange([...pending, ...valid.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }, [pending, onChange]);

  function remove(i: number) {
    URL.revokeObjectURL(pending[i].previewUrl);
    onChange(pending.filter((_, idx) => idx !== i));
  }

  return (
    <div className="mb-4">
      <label style={{ display: "block", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.13em", color: "var(--gold)", marginBottom: 8, fontWeight: 500 }}>
        Görseller
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className="rounded-lg text-center py-6 cursor-pointer transition-colors"
        style={{
          border: `1px dashed ${dragging ? "var(--gold)" : "rgba(212,168,85,0.3)"}`,
          background: dragging ? "rgba(212,168,85,0.06)" : "rgba(255,255,255,0.02)",
          color: "rgba(249,243,232,0.4)", fontSize: "0.8rem",
        }}
      >
        <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>📎</div>
        Tıkla veya sürükle bırak
        <p style={{ fontSize: "0.68rem", marginTop: 2, color: "rgba(249,243,232,0.25)" }}>JPG · PNG · WEBP</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {pending.map((item, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden" style={{ width: 72, height: 72, border: "1px solid rgba(212,168,85,0.2)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => remove(i)}
                className="absolute top-0.5 right-0.5 rounded-full flex items-center justify-center text-xs leading-none"
                style={{ width: 18, height: 18, background: "rgba(10,2,4,0.85)", color: "var(--cream)", border: "1px solid rgba(212,168,85,0.3)" }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Görsel galerisi ── */
function ImageGallery({ imageUrls }: { imageUrls: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!imageUrls.length) return null;
  return (
    <>
      <div className="gold-divider mt-5 mb-4" />
      <div>
        <h4 className="text-xs uppercase tracking-widest mb-3 font-medium" style={{ color: "var(--gold)", letterSpacing: "0.12em" }}>
          Görseller
        </h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
          {imageUrls.map((url, i) => (
            <button key={i} onClick={() => setLightbox(url)} className="overflow-hidden rounded-lg"
              style={{ aspectRatio: "1", border: "1px solid rgba(212,168,85,0.2)", background: "rgba(0,0,0,0.3)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Görsel ${i + 1}`} className="w-full h-full object-cover transition-opacity hover:opacity-80" />
            </button>
          ))}
        </div>
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,2,4,0.93)", backdropFilter: "blur(6px)" }}
          onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Tam ekran" className="max-w-full max-h-full rounded-lg"
            style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.8)" }} onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)}
            className="absolute top-5 right-6 text-3xl leading-none hover:opacity-60 transition-opacity"
            style={{ color: "var(--cream)" }}>×</button>
        </div>
      )}
    </>
  );
}

/* ── Section ── */
function Section({ title, items, variant = "default" }: { title: string; items: string[]; variant?: "default" | "tech"; }) {
  if (!items.length) return null;
  return (
    <div className="mb-5">
      <h4 className="text-xs uppercase tracking-widest mb-3 font-medium" style={{ color: "var(--gold)", letterSpacing: "0.12em" }}>{title}</h4>
      {variant === "tech" ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => <span key={item} className="tech-tag">{item}</span>)}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: "var(--cream-muted)" }}>
              <span style={{ color: "var(--gold)", marginTop: 4, flexShrink: 0 }}>›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Gün kartı ── */
function DayCard({ entry, index, onDelete, isAdmin, authToken }: {
  entry: DiaryEntry; index: number; onDelete: (id: string) => void; isAdmin: boolean; authToken: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handlePDF() {
    setPdfLoading(true);
    try { await generatePDF(entry); } finally { setPdfLoading(false); }
  }

  return (
    <article className="card-glass rounded-xl p-6 md:p-8 fade-up" style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--gold)" }}>{entry.gun}.</span>
            <span className="text-xl" style={{ fontFamily: "'Playfair Display', serif", color: "var(--cream)" }}>Gün</span>
            <span className="text-xs ml-1 px-2 py-0.5 rounded"
              style={{ background: "rgba(212,168,85,0.1)", border: "1px solid rgba(212,168,85,0.25)", color: "rgba(249,243,232,0.5)" }}>
              {entry.tarih}
            </span>
          </div>
          <p className="text-xs" style={{ color: "rgba(249,243,232,0.35)", letterSpacing: "0.04em" }}>
            Eklendi: {formatDateTime(entry.createdAt)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <p className="text-sm italic leading-snug text-right max-w-xs"
            style={{ color: "rgba(249,243,232,0.6)", fontFamily: "'Playfair Display', serif" }}>
            {entry.amac}
          </p>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={handlePDF} disabled={pdfLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: "rgba(212,168,85,0.12)", border: "1px solid rgba(212,168,85,0.35)", color: "var(--gold-light)" }}>
                {pdfLoading ? <span style={{ fontSize: "0.65rem" }}>⏳ Hazırlanıyor...</span> : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    PDF İndir
                  </>
                )}
              </button>
              {confirm ? (
                <div className="flex gap-2">
                  <button onClick={() => onDelete(entry.id)} className="text-xs px-2 py-1 rounded"
                    style={{ background: "#7a1a22", color: "var(--cream)" }}>Sil</button>
                  <button onClick={() => setConfirm(false)} className="text-xs px-2 py-1 rounded"
                    style={{ background: "rgba(255,255,255,0.08)", color: "var(--cream-muted)" }}>İptal</button>
                </div>
              ) : (
                <button onClick={() => setConfirm(true)} title="Sil"
                  className="opacity-30 hover:opacity-70 transition-opacity text-lg leading-none"
                  style={{ color: "var(--cream)" }}>×</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="gold-divider mb-5" />
      <div className="grid md:grid-cols-2 gap-x-10">
        <Section title="Yapılan Çalışmalar" items={entry.yapilan} />
        <Section title="Edinilen Bilgiler / Kazanımlar" items={entry.kazanimlar} />
        <Section title="Karşılaşılan Problemler" items={entry.problemler?.length ? entry.problemler : ["—"]} />
        <Section title="Uygulanan Çözümler" items={entry.cozumler?.length ? entry.cozumler : ["—"]} />
      </div>
      <div className="gold-divider mt-5 mb-4" />
      <Section title="Kullanılan Teknolojiler" items={entry.teknolojiler} variant="tech" />
      <ImageGallery imageUrls={entry.imageUrls ?? []} />
    </article>
  );
}

/* ── Form state ── */
interface FormState { tarih: string; amac: string; yapilan: string; teknolojiler: string; kazanimlar: string; problemler: string; cozumler: string; }
const emptyForm: FormState = { tarih: "", amac: "", yapilan: "", teknolojiler: "", kazanimlar: "", problemler: "", cozumler: "" };

/* ── Form alanı — Modal dışında tanımlı olmalı, aksi hâlde her render'da
   React bunu farklı bir bileşen sanır, unmount/mount yapar ve odak kaybolur ── */
const fieldLabelStyle: React.CSSProperties = { display: "block", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.13em", color: "var(--gold)", marginBottom: 6, fontWeight: 500 };
const fieldInputStyle: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,168,85,0.25)", borderRadius: 6, padding: "8px 12px", color: "var(--cream)", fontSize: "0.875rem", outline: "none" };

function Field({ label, value, onChange, textarea = false, rows = 3, placeholder, hint, error }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="mb-4">
      <label style={fieldLabelStyle}>{label}</label>
      {textarea
        ? <textarea rows={rows} value={value} onChange={onChange} placeholder={placeholder} style={{ ...fieldInputStyle, resize: "vertical" }} />
        : <input type="text" value={value} onChange={onChange} placeholder={placeholder} style={fieldInputStyle} />}
      {hint && <p style={{ fontSize: "0.7rem", color: "rgba(249,243,232,0.35)", marginTop: 4 }}>{hint}</p>}
      {error && <p style={{ fontSize: "0.7rem", color: "#e57373", marginTop: 4 }}>{error}</p>}
    </div>
  );
}

/* ── Modal ── */
function Modal({ nextGun, onClose, onSave, authToken }: {
  nextGun: number; onClose: () => void; onSave: (entry: DiaryEntry) => void; authToken: string;
}) {
  const [form, setForm] = useState<FormState>({ ...emptyForm, tarih: todayStr() });
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const set = useCallback((key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value })), []);

  function validate() {
    const e: Partial<FormState> = {};
    if (!form.tarih.trim()) e.tarih = "Tarih gerekli";
    if (!form.amac.trim()) e.amac = "Amaç gerekli";
    if (!form.yapilan.trim()) e.yapilan = "En az bir çalışma ekle";
    if (!form.teknolojiler.trim()) e.teknolojiler = "En az bir teknoloji ekle";
    if (!form.kazanimlar.trim()) e.kazanimlar = "En az bir kazanım ekle";
    return e;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setSaveError("");

    try {
      const imageUrls: string[] = [];
      for (const item of pending) {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("id", crypto.randomUUID());
        const res = await fetch("/api/images", { method: "POST", headers: authHeaders(authToken), body: fd });
        if (!res.ok) throw new Error("Görsel yüklenemedi");
        const { url } = await res.json();
        imageUrls.push(url);
        URL.revokeObjectURL(item.previewUrl);
      }

      const entry: DiaryEntry = {
        id: crypto.randomUUID(),
        gun: nextGun,
        tarih: form.tarih.trim(),
        createdAt: new Date().toISOString(),
        amac: form.amac.trim(),
        yapilan: lines(form.yapilan),
        teknolojiler: commas(form.teknolojiler),
        kazanimlar: lines(form.kazanimlar),
        ...(form.problemler.trim() ? { problemler: lines(form.problemler) } : {}),
        ...(form.cozumler.trim() ? { cozumler: lines(form.cozumler) } : {}),
        ...(imageUrls.length ? { imageUrls } : {}),
      };

      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(authToken) },
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Kayıt başarısız (${res.status})`);
      }

      onSave(entry);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,4,0.85)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-xl overflow-y-auto"
        style={{ maxHeight: "90vh", background: "rgba(26,5,8,0.97)", border: "1px solid rgba(212,168,85,0.3)" }}>
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <p style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--gold)" }}>{nextGun}. Gün</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", color: "var(--cream)", fontSize: "1.4rem" }}>Yeni Giriş</h2>
          </div>
          <button onClick={onClose} style={{ color: "rgba(249,243,232,0.4)", fontSize: "1.5rem", lineHeight: 1 }}>×</button>
        </div>
        <div className="gold-divider mx-6" />
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div><Field label="Tarih" value={form.tarih} onChange={set("tarih")} placeholder="13.07.2026" error={errors.tarih} /></div>
          </div>
          <Field label="Günün Amacı" value={form.amac} onChange={set("amac")} placeholder="Bugünkü hedef..." error={errors.amac} />
          <Field label="Yapılan Çalışmalar" value={form.yapilan} onChange={set("yapilan")} textarea rows={4}
            placeholder={"Her satıra bir madde\nÖrnek madde 1"} hint="Her satır ayrı bir madde olur" error={errors.yapilan} />
          <Field label="Kullanılan Teknolojiler" value={form.teknolojiler} onChange={set("teknolojiler")} placeholder="React, TypeScript, Git" hint="Virgülle ayır" error={errors.teknolojiler} />
          <Field label="Edinilen Bilgiler / Kazanımlar" value={form.kazanimlar} onChange={set("kazanimlar")} textarea rows={3}
            placeholder="Her satıra bir kazanım" hint="Her satır ayrı bir madde olur" error={errors.kazanimlar} />
          <div className="gold-divider mb-4" />
          <p style={{ fontSize: "0.65rem", color: "rgba(249,243,232,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>İsteğe bağlı</p>
          <Field label="Karşılaşılan Problemler" value={form.problemler} onChange={set("problemler")} textarea rows={2}
            placeholder="Her satıra bir problem" hint="Her satır ayrı bir madde olur" />
          <Field label="Uygulanan Çözümler" value={form.cozumler} onChange={set("cozumler")} textarea rows={2}
            placeholder="Her satıra bir çözüm" hint="Her satır ayrı bir madde olur" />
          <ImageUpload pending={pending} onChange={setPending} />
          {saveError && <p style={{ fontSize: "0.75rem", color: "#e57373", marginBottom: 8 }}>{saveError}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--gold)", color: "#1a0508" }}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm transition-opacity hover:opacity-70"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(212,168,85,0.2)", color: "var(--cream-muted)" }}>
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Giriş modalı ── */
function LoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (token: string) => void; }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        sessionStorage.setItem(ADMIN_KEY, "1");
        sessionStorage.setItem(TOKEN_KEY, pw);
        onSuccess(pw);
        onClose();
      } else {
        setError(true);
        setPw("");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-6"
      style={{ background: "rgba(10,2,4,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl p-6 w-72"
        style={{ background: "rgba(26,5,8,0.98)", border: "1px solid rgba(212,168,85,0.3)", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
        <h3 className="mb-1" style={{ fontFamily: "'Playfair Display', serif", color: "var(--cream)", fontSize: "1.1rem" }}>Giriş</h3>
        <p className="text-xs mb-4" style={{ color: "rgba(249,243,232,0.35)" }}>Düzenleme yetkisi için şifre girin</p>
        <form onSubmit={handleSubmit}>
          <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setError(false); }}
            placeholder="••••••" autoFocus className="w-full rounded-lg px-3 py-2 text-sm mb-1 outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${error ? "#e57373" : "rgba(212,168,85,0.25)"}`, color: "var(--cream)" }} />
          {error && <p className="text-xs mb-3" style={{ color: "#e57373" }}>Şifre hatalı</p>}
          <div className="flex gap-2 mt-3">
            <button type="submit" disabled={checking}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--gold)", color: "#1a0508" }}>
              {checking ? "..." : "Giriş Yap"}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(212,168,85,0.2)", color: "var(--cream-muted)" }}>
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Ana sayfa ── */
export default function Home() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY) ?? "";
    if (token) { setIsAdmin(true); setAuthToken(token); }

    fetch("/api/entries")
      .then((r) => r.json())
      .then(setEntries)
      .finally(() => setLoaded(true));
  }, []);

  function handleSave(entry: DiaryEntry) {
    setEntries((prev) => [...prev, entry]);
  }

  async function handleDelete(id: string) {
    const target = entries.find((e) => e.id === id);
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE", headers: authHeaders(authToken) });
    if (!res.ok) return;
    if (target?.imageUrls?.length) {
      await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders(authToken) },
        body: JSON.stringify({ urls: target.imageUrls }),
      });
    }
    setEntries((prev) => prev.filter((e) => e.id !== id).map((e, i) => ({ ...e, gun: i + 1 })));
  }

  function handleLoginSuccess(token: string) {
    setIsAdmin(true);
    setAuthToken(token);
  }

  function handleLogout() {
    sessionStorage.removeItem(ADMIN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setIsAdmin(false);
    setAuthToken("");
  }

  return (
    <>
      <main className="leather-bg min-h-screen">
        <div className="min-h-screen" style={{ background: "rgba(20,4,8,0.72)" }}>
          <header className="text-center py-16 px-4">
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--gold)", letterSpacing: "0.22em" }}>Staj Dönemi</p>
            <h1 className="text-5xl md:text-6xl font-bold mb-3"
              style={{ fontFamily: "'Playfair Display', serif", color: "var(--cream)", textShadow: "0 2px 24px rgba(0,0,0,0.7)" }}>
              Staj Defteri
            </h1>
            <p className="text-sm mt-3 italic" style={{ color: "rgba(249,243,232,0.5)", fontFamily: "'Playfair Display', serif" }}>
              Günlük çalışma ve kazanım kayıtları
            </p>
            <div className="gold-divider max-w-xs mx-auto mt-8" />
          </header>

          <section className="max-w-4xl mx-auto px-4 pb-6 space-y-6">
            {loaded && entries.length === 0 && (
              <div className="text-center py-16 rounded-xl card-glass" style={{ color: "rgba(249,243,232,0.35)" }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", marginBottom: 6 }}>Henüz kayıt yok</p>
                <p className="text-sm">İlk günü eklemek için giriş yapın.</p>
              </div>
            )}
            {entries.map((entry, i) => (
              <DayCard key={entry.id} entry={entry} index={i} onDelete={handleDelete} isAdmin={isAdmin} authToken={authToken} />
            ))}
          </section>

          {isAdmin && (
            <div className="flex justify-center pb-16 pt-4">
              <button onClick={() => setModalOpen(true)}
                className="flex items-center gap-2.5 px-7 py-3 rounded-full text-sm font-medium transition-all hover:opacity-85 active:scale-95"
                style={{ background: "var(--gold)", color: "#1a0508", boxShadow: "0 4px 24px rgba(212,168,85,0.25)" }}>
                <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span>
                Yeni Gün Ekle
              </button>
            </div>
          )}

          <footer className="text-center pb-10">
            <div className="gold-divider max-w-xs mx-auto mb-6" />
            <p className="text-xs" style={{ color: "rgba(249,243,232,0.3)", letterSpacing: "0.08em" }}>
              Emre Yalavuc &mdash; Staj Defteri {new Date().getFullYear()}
            </p>
          </footer>
        </div>
      </main>

      {modalOpen && (
        <Modal nextGun={entries.length + 1} onClose={() => setModalOpen(false)} onSave={handleSave} authToken={authToken} />
      )}

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onSuccess={handleLoginSuccess} />}

      {/* Sabit giriş / çıkış butonu */}
      <div className="fixed bottom-5 right-5 z-40">
        {isAdmin ? (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: "rgba(212,168,85,0.12)", border: "1px solid rgba(212,168,85,0.3)", color: "var(--gold)" }}>
              ✓ Admin
            </span>
            <button onClick={handleLogout} className="text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
              style={{ background: "rgba(20,4,8,0.9)", border: "1px solid rgba(212,168,85,0.2)", color: "rgba(249,243,232,0.5)", backdropFilter: "blur(6px)" }}>
              Çıkış
            </button>
          </div>
        ) : (
          <button onClick={() => setLoginOpen(true)} className="text-xs px-4 py-2 rounded-full transition-opacity hover:opacity-80"
            style={{ background: "rgba(20,4,8,0.85)", border: "1px solid rgba(212,168,85,0.25)", color: "rgba(249,243,232,0.45)", backdropFilter: "blur(6px)", boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
            Giriş
          </button>
        )}
      </div>
    </>
  );
}
