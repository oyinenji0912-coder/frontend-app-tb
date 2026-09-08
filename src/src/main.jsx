import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";

const chartColors = ["#175cd3", "#067647", "#b42318", "#6941c6", "#b54708", "#475467"];
const viewOptions = [
  ["attention", "Prioritas tindak lanjut"], ["overdue", "Perlu Follow Up Pasien"],
  ["week", "Kontrol ≤ 7 hari"], ["active", "Dalam pengobatan"],
  ["lost", "Putus berobat"], ["completed", "Selesai / hasil akhir"],
  ["today", "Kontrol hari ini"], ["late_control", "Terlambat kontrol"],
  ["pending_follow_up", "Follow-up belum selesai"], ["missing_data", "Data belum lengkap"],
  ["missing_phone", "No. handphone belum terisi"], ["missing_dm", "Status DM belum terisi"],
  ["missing_hiv", "Status HIV belum terisi"], ["missing_start", "Tanggal mulai belum terisi"],
  ["duplicates", "Kemungkinan NIK ganda"], ["all", "Semua pasien"],
];

async function api(path, options) {
  const response = await fetch(path, options);
  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    location.replace("/login");
    throw new Error("Sesi login berakhir");
  }
  return response;
}

function formatDate(iso) {
  return iso ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`)) : "—";
}

function localTodayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function statusClass(status) {
  if (status === "Dalam pengobatan") return "active";
  if (status === "Perlu Follow Up Pasien!") return "followup";
  if (status === "Putus berobat") return "lost";
  if (status === "Meninggal") return "dead";
  return "done";
}

function statusLabel(status) {
  const icons = { Meninggal: "💀", Selesai: "✅", "Dalam pengobatan": "💊", "Perlu Follow Up Pasien!": "😠" };
  return `${icons[status] || ""} ${status}`.trim();
}

function useToast() {
  const [message, setMessage] = useState("");
  const timer = useRef();
  const show = useCallback((text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), 2400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, show];
}

function Modal({ open, onClose, className = "", children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={className} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>{children}</dialog>;
}

function LoginApp() {
  const [setupMode, setSetupMode] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/auth/status").then((response) => response.json()).then((status) => {
      if (status.authenticated) return location.replace("/");
      setSetupMode(status.setup_required);
      setReady(true);
    }).catch(() => setError("Halaman login tidak dapat dimuat."));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (setupMode && password !== form.get("confirm_password")) return setError("Ulangan kata sandi tidak sama.");
    setBusy(true);
    try {
      const response = await api(setupMode ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Login gagal");
      location.replace("/");
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  }

  return <div className="login-page">
    <main className="login-shell">
      <section className="login-card">
        <div className="login-logo-wrap"><img className="login-logo" src="/dennise-afianto-logo-transparent-final.png" alt="Logo Dennise Afianto" /></div>
        <div className="eyebrow">PUSKESMAS KEBON JERUK</div>
        <h1>{setupMode ? "Buat Akun Admin" : "Masuk ke Portal Puskesmas"}</h1>
        <p>{setupMode ? "Atur akun pertama untuk melindungi database lokal." : "Gunakan akun lokal untuk membuka modul pelayanan dan data TB."}</p>
        <form onSubmit={submit}>
          <label>Username<input name="username" autoComplete="username" required minLength="3" maxLength="50" disabled={!ready || busy} /></label>
          <label>Kata sandi<input name="password" type="password" autoComplete={setupMode ? "new-password" : "current-password"} required minLength="8" disabled={!ready || busy} /></label>
          {setupMode && <label>Ulangi kata sandi<input name="confirm_password" type="password" autoComplete="new-password" required minLength="8" disabled={busy} /></label>}
          <div id="login-error" role="alert">{error}</div>
          <button className="login-submit" type="submit" disabled={!ready || busy}>{busy ? (setupMode ? "Membuat akun…" : "Memeriksa…") : (setupMode ? "Buat akun dan masuk" : "Masuk")}</button>
        </form>
        <p className="login-local">Data dan akun tersimpan hanya di komputer ini.</p>
        <p className="login-owner">Oleh Dennise Afianto</p>
      </section>
    </main>
  </div>;
}

function PortalApp() {
  useEffect(() => { document.title = "Portal Utama — Puskesmas Kebon Jeruk"; }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.replace("/login");
  }
  return <div className="portal-page">
    <header className="portal-header">
      <div><div className="eyebrow">PUSKESMAS KECAMATAN KEBON JERUK</div><h1>Portal Utama</h1><p>Pilih layanan yang ingin dibuka.</p></div>
      <div className="portal-header-actions"><span>Data Tersimpan Lokal</span><button type="button" onClick={logout}>Keluar</button></div>
    </header>
    <main className="portal-main">
      <section className="portal-intro"><div className="eyebrow">PORTAL DATA</div><h2>Layanan Puskesmas Kebon Jeruk</h2><p>Pilih modul untuk pemantauan pengobatan, tracing TB, antrean Poli TB, atau rekap pemeriksaan dahak.</p></section>
      <section className="portal-grid" aria-label="Daftar layanan">
        <a className="portal-card portal-card-active" href="/tb"><img className="portal-card-image" src="/portal-pengobatan.webp" alt="" aria-hidden="true" loading="lazy" /><span className="portal-card-content"><span className="portal-card-number">01</span><span className="portal-card-title">Dalam Pengobatan</span><span className="portal-card-action">Buka database <span aria-hidden="true">→</span></span></span></a>
        <a className="portal-card portal-card-active portal-card-tracing" href="/tracing"><img className="portal-card-image" src="/portal-tracing.webp" alt="" aria-hidden="true" loading="lazy" /><span className="portal-card-content"><span className="portal-card-number">02</span><span className="portal-card-title">Jadwal dan Rekap Tracing TB</span><span className="portal-card-action">Buka database <span aria-hidden="true">→</span></span></span></a>
        <a className="portal-card portal-card-active portal-card-queue" href="/poli-tb"><img className="portal-card-image" src="/portal-pendaftaran.webp" alt="" aria-hidden="true" loading="lazy" /><span className="portal-card-content"><span className="portal-card-number">03</span><span className="portal-card-title">Pendaftaran Poli TB</span><span className="portal-card-action">Kelola antrean <span aria-hidden="true">→</span></span></span></a>
        <a className="portal-card portal-card-active portal-card-sputum" href="/dahak"><img className="portal-card-image" src="/portal-dahak.webp" alt="" aria-hidden="true" loading="lazy" /><span className="portal-card-content"><span className="portal-card-number">04</span><span className="portal-card-title">Rekapitulasi Pemeriksaan Dahak</span><span className="portal-card-action">Buka rekap dan grafik <span aria-hidden="true">→</span></span></span></a>
      </section>
      <footer className="portal-footer"><strong>Tim TB Puskesmas Kebon Jeruk</strong><span>“Kerja Jangan Asal Kerja”</span><span className="portal-owner">Oleh Dennise Afianto</span></footer>
    </main>
  </div>;
}

function SummaryCards({ summary, setView }) {
  const cards = [
    ["overdue", "critical", summary.overdue, "Perlu follow up"],
    ["week", "warning", summary.due_week, "Kontrol ≤ 7 hari"],
    ["lost", "violet", summary.lost, "Putus berobat"],
    ["active", "blue", summary.active, "Dalam pengobatan"],
    ["completed", "green", summary.completed, "Selesai / sembuh"],
    ["all", "neutral", summary.total, "Total pasien"],
  ];
  return <section className="summary" aria-label="Ringkasan">{cards.map(([view, className, value, label]) =>
    <button key={view} className={`stat ${className}`} onClick={() => setView(view)}><span>{value ?? "—"}</span><small>{label}</small></button>
  )}</section>;
}

function WorkCenter({ summary, backupLabel, setView, onBackup, backingUp }) {
  const cards = [
    ["pending_follow_up", "urgent", summary.pending_follow_up, "Follow-up belum selesai", "Telepon, WhatsApp, atau kunjungan rumah"],
    ["today", "today", summary.today_controls, "Kontrol hari ini", "Janji aktual pasien hari ini"],
    ["late_control", "late", summary.late_controls, "Terlambat kontrol", "Jadwal sudah melewati hari ini"],
    ["missing_data", "quality", summary.incomplete, "Data perlu dilengkapi", "HP, DM/HIV, atau tanggal mulai kosong"],
  ];
  return <section className="work-center" aria-labelledby="work-title">
    <div className="work-head"><div><div className="eyebrow">PUSAT KERJA</div><h2 id="work-title">Yang perlu dikerjakan hari ini</h2><p>Gunakan kartu berikut sebagai antrean kerja petugas.</p></div><button className="button secondary" onClick={onBackup} disabled={backingUp}>{backingUp ? "Membuat backup…" : "Backup Sekarang"}</button></div>
    <div className="work-grid">{cards.map(([view, className, value, title, subtitle]) => <button key={view} className={`work-card ${className}`} onClick={() => setView(view)}><strong>{value ?? "—"}</strong><span>{title}</span><small>{subtitle}</small></button>)}</div>
    <div className="backup-status">{backupLabel}</div>
  </section>;
}

function PatientRows({ patients, onOpen, onFollowUp }) {
  if (!patients.length) return <tr><td colSpan="8" className="empty">Tidak ada pasien untuk filter ini.</td></tr>;
  return patients.map((patient) => <tr key={patient.id}>
    <td><div><div className="patient-name">{patient.full_name}</div><div className="sub">RM {patient.medical_record_no} • NIK {patient.nik_masked}</div></div></td>
    <td>{patient.origin_facility}</td>
    <td><span className={`badge ${statusClass(patient.operational_status)}`}>{statusLabel(patient.operational_status)}</span></td>
    <td>{formatDate(patient.treatment_start)}</td>
    <td>{formatDate(patient.estimated_treatment_end)}</td>
    <td><div className="follow-check-wrap">{patient.operational_status === "Perlu Follow Up Pasien!" ? <input className="follow-check" type="checkbox" checked={Boolean(patient.follow_up_checked)} aria-label={`Follow up ${patient.full_name}`} onChange={(event) => onFollowUp(patient, event.target.checked)} /> : <span>—</span>}</div></td>
    <td><div className="clinical-status"><span>DM: {patient.dm_status || "—"}</span><span>HIV: {patient.hiv_status || "—"}</span></div></td>
    <td><button className="row-button" type="button" onClick={() => onOpen(patient)}>Buka</button></td>
  </tr>);
}

function Detail({ label, value, wide }) {
  return <dl className={`detail${wide ? " wide" : ""}`}><dt>{label}</dt><dd>{value}</dd></dl>;
}

function PatientDialog({ patient, open, onClose, onSaved, toast }) {
  const [form, setForm] = useState({});
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!patient || !open) return;
    setForm({ next_control: patient.next_control || "", follow_up_ltfu: patient.follow_up_ltfu || "", follow_up_stage: patient.follow_up_stage || "Belum ditindaklanjuti", follow_up_date: patient.follow_up_date || "", follow_up_officer: patient.follow_up_officer || "", follow_up_notes: patient.follow_up_notes || "" });
    setHistory([]);
    api(`/api/patients/${patient.id}/history`).then((response) => response.json()).then((data) => setHistory(data.events || [])).catch(() => setHistory(null));
  }, [patient, open]);
  if (!patient) return null;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await api(`/api/patients/${patient.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, next_control: form.next_control || null, follow_up_date: form.follow_up_date || null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Perubahan gagal disimpan.");
      toast("Data pasien dan follow-up tersimpan."); onClose(); onSaved();
    } catch (caught) { toast(caught.message); } finally { setSaving(false); }
  }
  const ltfuEnabled = ["Putus berobat", "Perlu Follow Up Pasien!"].includes(patient.operational_status);
  return <Modal open={open} onClose={onClose}>
    <form className="dialog-card" onSubmit={submit}>
      <div className="dialog-head"><div><div className="eyebrow">DETAIL PASIEN</div><h2>{patient.full_name}</h2><p>No. RM {patient.medical_record_no} • SITB {patient.sitb_register_no}</p></div><button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>×</button></div>
      <div className="detail-grid">
        <Detail label="Status operasional" value={patient.operational_status} /><Detail label="Asal Puskesmas" value={patient.origin_facility} /><Detail label="No Handphone" value={patient.phone_number || "—"} />
        <Detail label="Status DM" value={patient.dm_status || "—"} /><Detail label="Status HIV" value={patient.hiv_status || "—"} /><Detail label="Status sumber" value={patient.source_treatment_status} />
        <Detail label="Mulai pengobatan" value={formatDate(patient.treatment_start)} /><Detail label="Kategori OAT" value={patient.oat_category} /><Detail label="Perkiraan akhir" value={formatDate(patient.estimated_treatment_end)} />
        <Detail label="Hasil akhir" value={patient.outcome === "—" ? "Belum tercatat" : patient.outcome} /><Detail label="Paduan pengobatan" value={patient.regimen} wide /><Detail label="Alamat" value={patient.address} wide />
      </div>
      <div className="edit-block">
        <label>Tanggal kontrol berikutnya<input type="date" value={form.next_control || ""} onChange={set("next_control")} /></label>
        <label>Tahapan follow-up<select value={form.follow_up_stage || "Belum ditindaklanjuti"} onChange={set("follow_up_stage")}>{["Belum ditindaklanjuti", "Sudah ditelepon", "Sudah dihubungi via WhatsApp", "Perlu kunjungan rumah", "Berhasil dihubungi", "Pasien kembali berobat", "Selesai"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Tanggal follow-up<input type="date" value={form.follow_up_date || ""} onChange={set("follow_up_date")} /></label>
        <label>Petugas<input type="text" maxLength="100" placeholder="Nama petugas" value={form.follow_up_officer || ""} onChange={set("follow_up_officer")} /></label>
        <label className="edit-wide">Catatan follow-up<textarea rows="3" maxLength="2000" placeholder="Hasil telepon, WhatsApp, atau kunjungan rumah" value={form.follow_up_notes || ""} onChange={set("follow_up_notes")} /></label>
        <label className="edit-wide">Catatan khusus pasien putus berobat<textarea rows="2" maxLength="1000" disabled={!ltfuEnabled} value={form.follow_up_ltfu || ""} onChange={set("follow_up_ltfu")} /></label>
        <p className="hint">Mengubah tanggal akan mengganti jadwal perkiraan dengan jadwal aktual/manual.</p>
      </div>
      <section className="history-block"><h3>Riwayat pasien</h3><div className="timeline">{history === null ? <p className="empty-small">Riwayat tidak dapat dimuat.</p> : !history.length ? <p className="empty-small">Memuat riwayat…</p> : history.map((event, index) => <div className="timeline-item" key={`${event.at}-${index}`}><time>{event.at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.at)) : "—"}</time><div><strong>{event.label}</strong>{(event.old || event.new) && <p>{event.old || "—"} → {event.new || "—"}</p>}</div></div>)}</div></section>
      <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan jadwal"}</button></div>
    </form>
  </Modal>;
}

function StatusChart({ items = [] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 62, circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = items.map((item, index) => {
    const length = total ? item.value / total * circumference : 0;
    const circle = <circle key={item.label} cx="90" cy="90" r={radius} fill="none" stroke={chartColors[index % chartColors.length]} strokeWidth="24" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" />;
    offset += length; return circle;
  });
  return <div className="donut-layout"><svg viewBox="0 0 180 180" role="img" aria-label={`Distribusi status ${total} pasien`}>{circles}<text x="90" y="87" textAnchor="middle" className="donut-total">{total}</text><text x="90" y="106" textAnchor="middle" className="donut-sub">pasien</text></svg><div className="chart-legend">{items.map((item, index) => <div className="legend-row" key={item.label}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></div>;
}

function FacilityChart({ items = [] }) {
  const [expanded, setExpanded] = useState({});
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="horizontal-chart">{items.map((item, index) => { const open = Boolean(expanded[item.label]); return <div className="hbar-group" key={item.label}><button type="button" className="hbar-row hbar-button" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [item.label]: !open }))}><span className="hbar-label">{item.label}</span><div className="hbar-track"><div className="hbar-fill" style={{ width: `${item.value / max * 100}%`, background: chartColors[index % chartColors.length] }} /></div><strong>{item.value}</strong><span className="hbar-arrow">{open ? "⌃" : "⌄"}</span></button>{open && <div className="facility-statuses">{(item.statuses || []).map((status, statusIndex) => <div className="facility-status-row" key={status.label}><i style={{ background: chartColors[statusIndex % chartColors.length] }} /><span>{status.label}</span><strong>{status.value}</strong></div>)}</div>}</div>; })}</div>;
}

function ChartsDialog({ open, onClose, data }) {
  const follow = data?.follow_up || { total: 0, completed: 0 };
  const percentage = follow.total ? Math.round(follow.completed / follow.total * 100) : 0;
  const months = data?.treatment_starts || [];
  const maxMonth = Math.max(...months.map((item) => item.value), 1);
  return <Modal open={open} onClose={onClose} className="charts-dialog">
    <div className="charts-shell"><div className="charts-head"><div><div className="eyebrow">RINGKASAN DATABASE</div><h2>Grafik Representatif</h2><p>Data seluruh Puskesmas Kebon Jeruk</p></div><button className="icon-button" type="button" aria-label="Tutup grafik" onClick={onClose}>×</button></div>
      <div className="charts-grid">
        <section className="chart-panel"><h3>Status pasien</h3><StatusChart items={data?.statuses} /></section>
        <section className="chart-panel"><h3>Progres follow up</h3><div><div className="follow-percent">{percentage}%</div><div className="follow-label">{follow.completed} dari {follow.total} pasien sudah ditandai follow up</div><div className="follow-track"><div className="follow-fill" style={{ width: `${percentage}%` }} /></div></div></section>
        <section className="chart-panel chart-wide"><h3>Pasien per puskesmas</h3><FacilityChart items={data?.facilities} /></section>
        <section className="chart-panel chart-wide"><h3>Mulai pengobatan per bulan</h3><div className="vertical-chart">{months.map((item) => <div className="month-col" key={item.month}><strong>{item.value}</strong><div className="month-bar" style={{ height: `${Math.max(8, item.value / maxMonth * 150)}px` }} /><span>{new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(new Date(`${item.month}-01T00:00:00`))}</span></div>)}</div></section>
      </div>
    </div>
  </Modal>;
}

function QualityDialog({ open, onClose, items, selectView }) {
  return <Modal open={open} onClose={onClose} className="charts-dialog"><div className="charts-shell"><div className="charts-head"><div><div className="eyebrow">PEMERIKSAAN OTOMATIS</div><h2>Kualitas Data</h2><p>Klik kategori untuk menampilkan pasien terkait.</p></div><button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>×</button></div><div className="quality-list">{items === null ? <p className="empty-small">Memeriksa data…</p> : items.map((item) => <button type="button" key={item.key} className={`quality-item${item.count === 0 ? " quality-ok" : ""}`} onClick={() => item.count && selectView(item.key)}><span>{item.label}</span><strong>{item.count}</strong></button>)}</div></div></Modal>;
}

function DashboardApp() {
  const [summary, setSummary] = useState({});
  const [meta, setMeta] = useState({});
  const [facilities, setFacilities] = useState([]);
  const [patients, setPatients] = useState([]);
  const [count, setCount] = useState(null);
  const [view, setViewState] = useState("attention");
  const [facility, setFacility] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState({ key: null, direction: "asc" });
  const [selected, setSelected] = useState(null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [charts, setCharts] = useState(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [quality, setQuality] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toastMessage, toast] = useToast();
  const uploadRef = useRef(null);
  const panelRef = useRef(null);

  const loadSummary = useCallback(async () => {
    const [summaryData, metaData] = await Promise.all([api("/api/summary").then((r) => r.json()), api("/api/meta").then((r) => r.json())]);
    setSummary(summaryData); setMeta(metaData);
  }, []);
  const loadWorklist = useCallback(async () => {
    const data = await api("/api/worklist").then((r) => r.json()); setFacilities(data.facilities || []);
  }, []);
  const loadPatients = useCallback(async () => {
    const params = new URLSearchParams({ view, facility, q: debouncedQuery });
    const data = await api(`/api/patients?${params}`).then((r) => r.json()); setPatients(data.patients || []); setCount(data.count);
  }, [view, facility, debouncedQuery]);
  const loadCharts = useCallback(async () => setCharts(await api("/api/charts").then((r) => r.json())), []);

  useEffect(() => { document.title = "Dalam Pengobatan"; document.body.className = ""; Promise.all([loadSummary(), loadWorklist()]).catch(() => toast("Database tidak dapat dimuat.")); }, [loadSummary, loadWorklist, toast]);
  useEffect(() => { const timer = setTimeout(() => setDebouncedQuery(query.trim()), 220); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { loadPatients().catch(() => toast("Daftar pasien tidak dapat dimuat.")); }, [loadPatients, toast]);
  useEffect(() => { if (!chartsOpen) return; loadCharts().catch(() => toast("Grafik tidak dapat dimuat.")); const timer = setInterval(() => loadCharts().catch(() => { }), 15000); return () => clearInterval(timer); }, [chartsOpen, loadCharts, toast]);

  const sortedPatients = useMemo(() => {
    if (!sort.key) return patients;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...patients].sort((a, b) => String(a[sort.key] || "").localeCompare(String(b[sort.key] || ""), "id", { numeric: true, sensitivity: "base" }) * factor);
  }, [patients, sort]);

  function chooseView(nextView, scroll = false) {
    setViewState(nextView);
    if (scroll) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function changeSort(key) { setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }); }
  function sortIcon(key) { return sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"; }
  async function saveFollowUp(patient, checked) {
    setPatients((items) => items.map((item) => item.id === patient.id ? { ...item, follow_up_checked: checked } : item));
    try {
      const response = await api(`/api/patients/${patient.id}/follow-up`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checked }) });
      if (!response.ok) throw new Error("Checklist gagal disimpan");
      toast(checked ? "Follow up ditandai selesai." : "Tanda follow up dibatalkan.");
    } catch (caught) { setPatients((items) => items.map((item) => item.id === patient.id ? { ...item, follow_up_checked: !checked } : item)); toast(caught.message); }
  }
  async function backupNow() {
    setBackingUp(true);
    try { const response = await api("/api/backup", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Backup gagal"); toast("Backup database berhasil dibuat."); await loadSummary(); }
    catch (caught) { toast(caught.message || "Backup gagal dibuat."); } finally { setBackingUp(false); }
  }
  async function openQuality() {
    setQualityOpen(true); setQuality(null);
    try { const data = await api("/api/quality").then((r) => r.json()); setQuality(data.items || []); } catch { toast("Pemeriksaan data tidak dapat dimuat."); }
  }
  function downloadExport(format) {
    const params = new URLSearchParams({ format, view, facility, q: query.trim() });
    const anchor = document.createElement("a"); anchor.href = `/api/export?${params}`; anchor.download = ""; document.body.append(anchor); anchor.click(); anchor.remove();
    toast(format === "pptx" ? "Menyiapkan rekap PowerPoint…" : `Menyiapkan rekap ${format.toUpperCase()}…`);
  }
  async function uploadFiles(event) {
    const files = [...event.target.files]; if (!files.length) return;
    if (files.some((file) => !file.name.toLowerCase().endsWith(".xls"))) { toast("Semua file harus berformat Excel .xls."); event.target.value = ""; return; }
    setUploading(true);
    try {
      let imported = 0;
      for (const file of files) {
        const response = await api("/api/import", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Filename": file.name }, body: file });
        const result = await response.json(); if (!response.ok) throw new Error(`${file.name}: ${result.error || "Impor gagal"}`); imported += result.imported;
      }
      await Promise.all([loadSummary(), loadWorklist(), loadPatients()]); if (chartsOpen) await loadCharts(); toast(`${imported} pasien dari ${files.length} file berhasil diperbarui.`);
    } catch (caught) { toast(caught.message || "Impor data gagal."); } finally { setUploading(false); event.target.value = ""; }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.replace("/login"); }

  const backupLabel = meta.last_backup_at ? `Backup terakhir: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(meta.last_backup_at))}` : "Belum ada backup database.";
  const currentLabel = viewOptions.find(([key]) => key === view)?.[1] || "Daftar pasien";
  return <>
    <header className="topbar"><div><div className="eyebrow">PUSKESMAS KECAMATAN KEBON JERUK</div><h1>Dalam Pengobatan</h1><p>{meta.period ? `${meta.period} • Data per ${formatDate(summary.today)}` : "Memuat periode data…"}</p></div><div className="header-actions"><div className="privacy">Data Tersimpan Lokal</div><a className="chart-button portal-back" href="/">Portal Utama</a><button className="chart-button" onClick={() => setChartsOpen(true)}>Grafik Representatif</button><button className="chart-button" onClick={openQuality}>Kualitas Data</button><details className="export-dropdown"><summary>Download Rekap</summary><div className="export-menu"><button onClick={() => downloadExport("xlsx")}><strong>Excel (.xlsx)</strong><small>Ringkasan, rekap puskesmas, dan data pasien</small></button><button onClick={() => downloadExport("pptx")}><strong>PowerPoint (.pptx)</strong><small>Lima slide rekap untuk rapat</small></button><button onClick={() => downloadExport("csv")}><strong>CSV (.csv)</strong><small>Data pasien untuk pengolahan lanjutan</small></button></div></details><button className="upload-button" onClick={() => uploadRef.current?.click()} disabled={uploading}>{uploading ? "Mengimpor…" : "Upload Data Terbaru"}</button><button className="logout-button" onClick={logout}>Keluar</button><input ref={uploadRef} type="file" accept=".xls,application/vnd.ms-excel" multiple hidden onChange={uploadFiles} /></div></header>
    <main><SummaryCards summary={summary} setView={(next) => chooseView(next, true)} /><WorkCenter summary={summary} backupLabel={backupLabel} setView={(next) => chooseView(next, true)} onBackup={backupNow} backingUp={backingUp} />
      <section className="panel" ref={panelRef}><div className="toolbar"><div><h2>Daftar pasien</h2><p>{currentLabel}</p></div><div className="controls"><label className="search"><span className="sr-only">Cari pasien</span><input type="search" placeholder="Cari nama, puskesmas, no. HP, RM, SITB, atau NIK…" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span className="sr-only">Filter daftar</span><select value={view} onChange={(event) => setViewState(event.target.value)}>{viewOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="sr-only">Filter puskesmas</span><select value={facility} onChange={(event) => setFacility(event.target.value)}><option value="">Semua Puskesmas</option>{facilities.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
        <div className="table-wrap"><table><thead><tr>{[["full_name", "Pasien"], ["origin_facility", "Asal Puskesmas"], ["operational_status", "Status"], ["treatment_start", "Mulai"], ["estimated_treatment_end", "Taksiran selesai pengobatan"]].map(([key, label]) => <th key={key}><button className={`sort-button${sort.key === key ? " active" : ""}`} type="button" onClick={() => changeSort(key)} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>{label} <span aria-hidden="true">{sortIcon(key)}</span></button></th>)}<th>Follow Up</th><th>Status DM/HIV</th><th /></tr></thead><tbody><PatientRows patients={sortedPatients} onOpen={(patient) => setSelected(patient)} onFollowUp={saveFollowUp} /></tbody></table></div><div className="panel-footer"><span>{count === null ? "—" : `${count} pasien ditampilkan`}</span><span>Identitas NIK disamarkan pada layar.</span></div>
      </section><footer className="team-footer"><div><strong>Tim TB Puskesmas Kebon Jeruk</strong></div><div className="team-tagline">“Kerja Jangan Asal Kerja”</div></footer>
    </main>
    <PatientDialog patient={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onSaved={() => Promise.all([loadSummary(), loadPatients()])} toast={toast} />
    <ChartsDialog open={chartsOpen} onClose={() => setChartsOpen(false)} data={charts} />
    <QualityDialog open={qualityOpen} onClose={() => setQualityOpen(false)} items={quality} selectView={(next) => { chooseView(next, true); setQualityOpen(false); }} />
    <div id="toast" className={toastMessage ? "show" : ""} role="status" aria-live="polite">{toastMessage}</div>
  </>;
}

const tracingFields = {
  schedule: [
    ["sequence", "No.", "number"], ["scheduled_date", "Tanggal", "date"],
    ["month", "Bulan", "text"], ["district", "Kecamatan", "text"],
    ["village", "Kelurahan", "text"], ["facility", "Fasyankes", "text"],
    ["location", "Lokasi/Lokus", "text"], ["coordinator", "Korwil", "text"],
    ["monitoring_staff", "Petugas Monitoring", "text"], ["notes", "Keterangan", "textarea"],
  ],
  results: [
    ["sequence", "No.", "number"], ["activity_date", "Tanggal Pelaksanaan", "date"],
    ["district", "Puskesmas/Kecamatan", "text"], ["village", "Kelurahan", "text"],
    ["location", "Lokus", "text"], ["examined", "Jumlah Diperiksa", "number"],
    ["index_cases", "Jumlah Indeks Kasus", "number"], ["mobile_xray", "Mobile X-Ray", "text"],
    ["household_contacts", "Kontak Serumah", "number"], ["close_contacts", "Kontak Erat", "number"],
    ["at_risk_population", "Populasi Berisiko", "number"], ["no_tb_symptoms", "Tidak Ada Gejala TBC", "number"],
    ["tb_symptoms", "Ada Gejala TBC", "number"], ["not_presumptive", "Bukan Terduga", "number"],
    ["eligible_tpt", "Eligible TPT", "number"], ["sputum_collected", "Pengambilan Dahak", "number"],
    ["received_tpt", "Mendapat TPT", "number"], ["can_collect_sputum", "Bisa Ambil Dahak", "number"],
  ],
};

function TracingEditDialog({ record, type, open, onClose, onSaved, toast }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  useEffect(() => {
    setForm(record || {});
    if (!record) return setHistory([]);
    api(`/api/tracing/${type}/${record.id}/history`).then((response) => response.json()).then((data) => setHistory(data.events || [])).catch(() => setHistory([]));
  }, [record, type]);
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = Object.fromEntries(tracingFields[type].map(([key]) => [key, form[key] ?? ""]));
      const response = await api(`/api/tracing/${type}/${record.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Data tidak dapat disimpan");
      toast("Perubahan data tracing tersimpan.");
      await onSaved();
      onClose();
    } catch (caught) { toast(caught.message); }
    finally { setSaving(false); }
  }
  if (!record) return null;
  return <Modal open={open} onClose={onClose} className="tracing-dialog">
    <form onSubmit={save} className="dialog-card">
      <div className="dialog-head"><div><div className="eyebrow">EDIT DATA</div><h2>{type === "schedule" ? "Jadwal Tracing" : "Hasil Tracing"}</h2><p>Perubahan disimpan lokal dan dicatat dalam riwayat.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Tutup">×</button></div>
      <div className="tracing-form-grid">{tracingFields[type].map(([key, label, inputType]) => <label key={key} className={inputType === "textarea" ? "tracing-field-wide" : ""}>{label}{inputType === "textarea" ? <textarea rows="4" value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /> : <input type={inputType} min={inputType === "number" ? "0" : undefined} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />}</label>)}</div>
      <section className="history-block"><h3>Riwayat perubahan</h3><div className="timeline">{history.length ? history.map((event, index) => <div className="timeline-item" key={`${event.changed_at}-${index}`}><time>{new Date(event.changed_at).toLocaleString("id-ID")}</time><div><strong>{tracingFields[type].find(([key]) => key === event.field_name)?.[1] || event.field_name}</strong><p>{event.old_value || "—"} → {event.new_value || "—"}{event.changed_by ? ` • ${event.changed_by}` : ""}</p></div></div>) : <p className="empty-small">Belum ada perubahan manual.</p>}</div></section>
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</button></div>
    </form>
  </Modal>;
}

function TracingAchievement({ data }) {
  const items = data.items || [];
  const totals = data.totals || {};
  return <section className="achievement-panel" aria-labelledby="achievement-title">
    <div className="achievement-head"><div><div className="eyebrow">TARGET DAN CAPAIAN</div><h2 id="achievement-title">Capaian Tracing per Kecamatan</h2><p>Capaian dihitung dari jumlah kegiatan yang sudah memiliki baris Rekap Harian.</p></div><div className="achievement-total"><strong>{totals.completed ?? "—"} / {totals.total_target ?? "—"}</strong><span>{totals.achievement_percent ?? 0}% tercapai</span></div></div>
    <div className="achievement-table-wrap"><table className="achievement-table"><thead><tr><th>Kecamatan</th><th>Termin I<br /><small>60%</small></th><th>Termin II<br /><small>35%</small></th><th>Termin III<br /><small>5%</small></th><th>Total Target</th><th>Sudah Direkap</th><th>Jadwal s.d. Hari Ini</th><th>Capaian</th></tr></thead><tbody>{items.map((item) => <tr key={item.district}><td><strong>{item.district}</strong></td><td className="numeric">{item.term_1}</td><td className="numeric">{item.term_2}</td><td className="numeric">{item.term_3}</td><td className="numeric"><strong>{item.total_target}</strong></td><td className="numeric"><strong>{item.completed}</strong></td><td className="numeric">{item.scheduled_to_date}{item.unreported > 0 ? <small className="unreported">{item.unreported} belum direkap</small> : null}</td><td><div className="achievement-cell"><div className="achievement-track"><span style={{ width: `${Math.min(100, item.achievement_percent)}%` }} /></div><strong>{item.achievement_percent}%</strong></div></td></tr>)}</tbody><tfoot><tr><td>Total</td><td className="numeric">{totals.term_1}</td><td className="numeric">{totals.term_2}</td><td className="numeric">{totals.term_3}</td><td className="numeric">{totals.total_target}</td><td className="numeric">{totals.completed}</td><td className="numeric">{totals.scheduled_to_date}</td><td>{totals.achievement_percent}%</td></tr></tfoot></table></div>
    <div className="achievement-note"><span><i className="legend-dot achieved" /> Sudah direkap = capaian saat ini</span><span><i className="legend-dot pending" /> Selisih jadwal = kegiatan yang perlu dipastikan rekapan hasilnya</span></div>
  </section>;
}

function TracingApp() {
  const [type, setType] = useState("schedule");
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [achievement, setAchievement] = useState({ items: [], totals: {} });
  const [meta, setMeta] = useState({ districts: [] });
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState({ key: "date", direction: "asc" });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const uploadRef = useRef(null);
  const [toastMessage, toast] = useToast();
  useEffect(() => { document.title = "Jadwal dan Rekap Tracing TB"; }, []);
  const loadSummary = useCallback(async () => {
    const [summaryResponse, metaResponse, achievementResponse] = await Promise.all([api("/api/tracing/summary"), api("/api/tracing/meta"), api("/api/tracing/achievement")]);
    setSummary(await summaryResponse.json()); setMeta(await metaResponse.json()); setAchievement(await achievementResponse.json());
  }, []);
  const loadRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type });
    if (query.trim()) params.set("q", query.trim());
    if (district) params.set("district", district);
    const response = await api(`/api/tracing?${params}`);
    const result = await response.json();
    setRecords(result.records || []); setLoading(false);
  }, [type, query, district]);
  useEffect(() => { loadSummary().catch(() => toast("Ringkasan tracing tidak dapat dimuat.")); }, [loadSummary]);
  useEffect(() => { const timer = setTimeout(() => loadRecords().catch(() => { setLoading(false); toast("Data tracing tidak dapat dimuat."); }), 180); return () => clearTimeout(timer); }, [loadRecords]);
  useEffect(() => { setSort({ key: "date", direction: "asc" }); }, [type]);
  const sorted = useMemo(() => [...records].sort((left, right) => {
    const key = sort.key === "date" ? (type === "schedule" ? "scheduled_date" : "activity_date") : sort.key;
    const a = left[key] ?? ""; const b = right[key] ?? "";
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "id", { numeric: true });
    return sort.direction === "asc" ? comparison : -comparison;
  }), [records, sort, type]);
  function changeSort(key) { setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" })); }
  function sortHeader(key, label) { return <th><button className={`sort-button${sort.key === key ? " active" : ""}`} type="button" onClick={() => changeSort(key)}>{label} <span>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>; }
  async function syncSpreadsheet(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { toast("Pilih spreadsheet Excel berformat .xlsx."); return; }
    setSyncing(true);
    try {
      const response = await api("/api/tracing/import", { method: "POST", headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "X-Filename": file.name }, body: file });
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); } catch { throw new Error("Server tidak mengirim hasil sinkronisasi yang valid."); }
      if (!response.ok) throw new Error(result.error || "Sinkronisasi spreadsheet gagal.");
      await Promise.all([loadRecords(), loadSummary()]);
      const inserted = (result.schedule?.inserted || 0) + (result.results?.inserted || 0);
      const updated = (result.schedule?.updated || 0) + (result.results?.updated || 0);
      const preserved = (result.schedule?.manual_fields_preserved || 0) + (result.results?.manual_fields_preserved || 0);
      toast(`Sinkronisasi selesai: ${inserted} baris baru, ${updated} baris diperbarui${preserved ? `, ${preserved} perubahan manual dipertahankan` : ""}.`);
    } catch (error) {
      toast(error.message || "Sinkronisasi spreadsheet gagal.");
    } finally {
      setSyncing(false);
    }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.replace("/login"); }
  const cards = type === "schedule" ? [
    [summary.schedule_total, "Total jadwal"], [summary.upcoming, "Jadwal mendatang"], [summary.realized, "Ditandai terlaksana"], [summary.result_rows, "Rekap tersedia"],
  ] : [[summary.examined, "Peserta diperiksa"], [summary.index_cases, "Indeks kasus"], [summary.tb_symptoms, "Ada gejala TBC"], [summary.eligible_tpt, "Eligible TPT"]];
  return <>
    <header className="topbar tracing-topbar"><div><a className="portal-back" href="/">← Portal Utama</a><div className="eyebrow">TRACING TB</div><h1>Jadwal dan Rekap Tracing TB</h1><p>Jadwal kegiatan dan hasil skrining tersimpan dalam satu modul yang mudah diperbarui.</p></div><div className="header-actions"><span className="privacy">Data Tersimpan Lokal</span><button className="upload-button" type="button" onClick={() => uploadRef.current?.click()} disabled={syncing}>{syncing ? "Menyinkronkan…" : "Sinkronkan Spreadsheet"}</button><input ref={uploadRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={syncSpreadsheet} /><button className="logout-button" type="button" onClick={logout}>Keluar</button></div></header>
    <main className="tracing-main">
      <section className="tracing-summary">{cards.map(([value, label]) => <article className="tracing-stat" key={label}><strong>{value ?? "—"}</strong><span>{label}</span></article>)}</section>
      <TracingAchievement data={achievement} />
      <section className="panel tracing-panel">
        <div className="tracing-tabs" role="tablist"><button type="button" className={type === "schedule" ? "active" : ""} onClick={() => setType("schedule")}>Jadwal Harian</button><button type="button" className={type === "results" ? "active" : ""} onClick={() => setType("results")}>Rekap Harian</button></div>
        <div className="toolbar tracing-toolbar"><div><h2>{type === "schedule" ? "Daftar Jadwal Tracing" : "Hasil Kegiatan Tracing"}</h2><p>{type === "schedule" ? "Buka baris untuk mengubah lokasi, petugas, atau keterangan." : "Buka baris untuk memperbarui seluruh angka hasil skrining."}</p></div><div className="controls"><label><span className="sr-only">Cari</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kecamatan, kelurahan, lokasi…" /></label><label><span className="sr-only">Kecamatan</span><select value={district} onChange={(event) => setDistrict(event.target.value)}><option value="">Semua kecamatan</option>{meta.districts.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
        <div className="table-wrap tracing-table-wrap"><table className={`tracing-table tracing-table-${type}`}><thead><tr>{sortHeader("date", "Tanggal")}{sortHeader("district", type === "schedule" ? "Kecamatan" : "Puskesmas")}{sortHeader("village", "Kelurahan")}{type === "schedule" ? <><th>Fasyankes</th><th>Lokasi/Lokus</th><th>Petugas Monitoring</th><th>Keterangan</th></> : <><th>Lokus</th>{sortHeader("examined", "Diperiksa")}<th>Indeks Kasus</th><th>Ada Gejala</th><th>Eligible TPT</th><th>Ambil Dahak</th></>}<th /></tr></thead><tbody>{loading ? <tr><td className="empty" colSpan="10">Memuat data…</td></tr> : sorted.length ? sorted.map((record) => <tr key={record.id}><td><strong>{formatDate(type === "schedule" ? record.scheduled_date : record.activity_date)}</strong></td><td>{record.district || "—"}</td><td>{record.village || "—"}</td>{type === "schedule" ? <><td>{record.facility || "—"}</td><td>{record.location || "—"}</td><td>{record.monitoring_staff || "—"}</td><td><span className={record.notes.toLowerCase().includes("terlaksana") ? "trace-status done" : "trace-status"}>{record.notes || "Belum ada keterangan"}</span></td></> : <><td>{record.location || "—"}</td><td className="numeric">{record.examined ?? "—"}</td><td className="numeric">{record.index_cases ?? "—"}</td><td className="numeric">{record.tb_symptoms ?? "—"}</td><td className="numeric">{record.eligible_tpt ?? "—"}</td><td className="numeric">{record.sputum_collected ?? "—"}</td></>}<td><button className="row-button" type="button" onClick={() => setSelected(record)}>Edit</button></td></tr>) : <tr><td className="empty" colSpan="10">Tidak ada data untuk filter ini.</td></tr>}</tbody></table></div>
        <div className="panel-footer"><span>{sorted.length} baris ditampilkan</span><span>Sumber: {meta.tracing_source_file || "workbook tracing TB"}{meta.tracing_imported_at ? ` • Sinkron ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(meta.tracing_imported_at))}` : ""}</span></div>
      </section>
      <footer className="team-footer"><strong>Tim TB Puskesmas Kebon Jeruk</strong><div className="team-tagline">“Kerja Jangan Asal Kerja”</div></footer>
    </main>
    <TracingEditDialog record={selected} type={type} open={Boolean(selected)} onClose={() => setSelected(null)} onSaved={() => Promise.all([loadRecords(), loadSummary()])} toast={toast} />
    <div id="toast" className={toastMessage ? "show" : ""} role="status" aria-live="polite">{toastMessage}</div>
  </>;
}

const queueStatusLabels = {
  Menunggu: ["Menunggu", "waiting"], Dipanggil: ["Silakan masuk ke Poli TB", "called"],
  Selesai: ["Pelayanan selesai", "completed"], Batal: ["Antrean dibatalkan", "cancelled"],
};

function QueueTicket({ ticket, onReset, notificationEnabled, onEnableNotifications }) {
  const [label, className] = queueStatusLabels[ticket.status] || [ticket.status, "waiting"];
  return <section className={`queue-ticket ${className}`}>
    <div className="queue-ticket-label">NOMOR ANTREAN ANDA</div>
    <strong className="queue-ticket-number">{ticket.queue_code}</strong>
    <div className="queue-ticket-status">{label}</div>
    {ticket.status === "Menunggu" ? <><p><strong>{ticket.people_ahead}</strong> antrean aktif sebelum Anda</p><div className="queue-current">Sedang dipanggil: <strong>{ticket.current_queue || "Belum ada"}</strong></div></> : null}
    {ticket.status === "Dipanggil" ? <p className="queue-call-notice">Silakan menuju Poli TB dan tunjukkan nomor ini kepada petugas.</p> : null}
    <button type="button" className={`queue-notification-button${notificationEnabled ? " enabled" : ""}`} onClick={onEnableNotifications}>{notificationEnabled ? "🔔 Notifikasi bunyi & getar aktif" : "🔔 Aktifkan Notifikasi"}</button>
    <p className="queue-notification-hint">Biarkan halaman ini tetap terbuka agar pemberitahuan dapat diterima.</p>
    <p className="queue-ticket-date">Tanggal kunjungan {formatDate(ticket.visit_date)}</p>
    <button type="button" className="button secondary" onClick={onReset}>Daftar pasien lain</button>
  </section>;
}

function QueueRegistrationApp() {
  const initialToken = new URLSearchParams(location.search).get("token") || "";
  const [config, setConfig] = useState({});
  const [ticket, setTicket] = useState(null);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [callAlert, setCallAlert] = useState(false);
  const audioContextRef = useRef(null);
  const previousStatusRef = useRef(null);
  useEffect(() => { document.title = "Pendaftaran Poli TB"; document.body.className = "queue-public-body"; return () => { document.body.className = ""; }; }, []);
  useEffect(() => () => { audioContextRef.current?.close?.(); }, []);
  useEffect(() => { fetch("/api/public/clinic-queue/config").then((response) => response.json()).then(setConfig).catch(() => setError("Layanan pendaftaran tidak dapat dihubungi.")); }, []);
  const loadTicket = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/public/clinic-queue/status?token=${encodeURIComponent(token)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Tiket tidak ditemukan");
    setTicket(result);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    loadTicket().catch((caught) => setError(caught.message));
    const timer = setInterval(() => loadTicket().catch(() => { }), 4000);
    return () => clearInterval(timer);
  }, [token, loadTicket]);
  function playNotificationTone() {
    const context = audioContextRef.current;
    if (!context) return;
    context.resume?.();
    [0, 0.42, 0.84].forEach((delay) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.32, context.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.28);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(context.currentTime + delay); oscillator.stop(context.currentTime + delay + 0.3);
    });
  }
  function announceCall() {
    setCallAlert(true); document.title = `🔔 Giliran Anda — ${ticket?.queue_code || "Poli TB"}`;
    navigator.vibrate?.([500, 180, 500, 180, 900]); playNotificationTone();
    if (window.isSecureContext && "Notification" in window && Notification.permission === "granted") {
      new Notification("Giliran Anda di Poli TB", { body: `Nomor ${ticket?.queue_code || "antrean Anda"} sedang dipanggil.` });
    }
  }
  useEffect(() => {
    const status = ticket?.status;
    if (status === "Dipanggil" && previousStatusRef.current !== "Dipanggil") {
      setCallAlert(true);
      if (notificationEnabled) announceCall();
    }
    previousStatusRef.current = status || null;
  }, [ticket?.status, notificationEnabled]);
  async function enableNotifications() {
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioContextRef.current = new AudioContextClass();
      }
      await audioContextRef.current?.resume?.();
      if (window.isSecureContext && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
      setNotificationEnabled(true); navigator.vibrate?.(180); playNotificationTone();
      if (ticket?.status === "Dipanggil") announceCall();
    } catch { setError("Notifikasi sistem tidak tersedia. Biarkan halaman tetap terbuka untuk melihat perubahan status."); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/public/clinic-queue/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.get("full_name"), phone_number: form.get("phone_number"),
          patient_type: form.get("patient_type"), medical_record_no: form.get("medical_record_no"),
          consent: form.get("consent") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pendaftaran gagal");
      setTicket(result); setToken(result.token);
      history.replaceState({}, "", `/daftar-poli-tb?token=${encodeURIComponent(result.token)}`);
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  }
  function reset() { setTicket(null); setToken(""); setError(""); setCallAlert(false); previousStatusRef.current = null; document.title = "Pendaftaran Poli TB"; history.replaceState({}, "", "/daftar-poli-tb"); }
  return <><div className="queue-public-page"><header className="queue-public-header"><div className="queue-public-mark">TB</div><div><div className="eyebrow">PUSKESMAS KEBON JERUK</div><h1>Pendaftaran Poli TB</h1><p>Ambil nomor antrean sebelum menuju meja pendaftaran.</p></div></header><main className="queue-public-main">
    {ticket ? <QueueTicket ticket={ticket} onReset={reset} notificationEnabled={notificationEnabled} onEnableNotifications={enableNotifications} /> : <section className="queue-register-card"><div className="queue-register-head"><span>Pendaftaran hari ini</span><strong>{config.date ? formatDate(config.date) : "Memuat…"}</strong></div><form onSubmit={submit}><label>Nama lengkap pasien<input name="full_name" required minLength="3" maxLength="120" autoComplete="name" /></label><label>Nomor handphone<input name="phone_number" required inputMode="tel" autoComplete="tel" placeholder="Contoh: 081234567890" /></label><fieldset><legend>Jenis pasien</legend><label className="radio-option"><input type="radio" name="patient_type" value="Lama" required /> Pasien lama</label><label className="radio-option"><input type="radio" name="patient_type" value="Baru" required /> Pasien baru</label></fieldset><label>Nomor rekam medis <small>(opsional)</small><input name="medical_record_no" maxLength="50" /></label><label className="consent-option"><input type="checkbox" name="consent" required /> Saya menyetujui data ini disimpan untuk pendaftaran dan pelayanan Poli TB.</label><div className="queue-form-error" role="alert">{error}</div><button className="queue-submit" type="submit" disabled={busy}>{busy ? "Membuat antrean…" : "Ambil Nomor Antrean"}</button></form><p className="queue-privacy">Data dikirim hanya ke komputer lokal Puskesmas pada jaringan ini.</p></section>}
  </main></div>
    {callAlert ? <div className="queue-call-overlay" role="alertdialog" aria-modal="true" aria-labelledby="queue-call-title"><div className="queue-call-card"><div className="queue-call-bell">🔔</div><div className="eyebrow">NOMOR {ticket?.queue_code}</div><h2 id="queue-call-title">Giliran Anda Dipanggil</h2><p>Silakan segera menuju Poli TB dan tunjukkan nomor antrean kepada petugas.</p><button type="button" onClick={() => setCallAlert(false)}>Saya Menuju Poli TB</button></div></div> : null}
  </>;
}

function ClinicQueueApp() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [config, setConfig] = useState({});
  const [qrData, setQrData] = useState("");
  const [visitDate, setVisitDate] = useState(localTodayIso());
  const [busy, setBusy] = useState(false);
  const [toastMessage, toast] = useToast();
  useEffect(() => { document.title = "Pendaftaran Poli TB"; }, []);
  const loadQueue = useCallback(async () => {
    const params = new URLSearchParams({ date: visitDate });
    const [recordsResponse, summaryResponse] = await Promise.all([api(`/api/clinic-queue?${params}`), api(`/api/clinic-queue/summary?${params}`)]);
    const recordsData = await recordsResponse.json(); setRecords(recordsData.records || []); setSummary(await summaryResponse.json());
  }, [visitDate]);
  useEffect(() => {
    api("/api/clinic-queue/config").then((response) => response.json()).then(async (data) => {
      setConfig(data); setQrData(await QRCode.toDataURL(data.public_url, { width: 320, margin: 2, color: { dark: "#123D64", light: "#FFFFFF" } }));
    }).catch(() => toast("Alamat pendaftaran tidak dapat dibuat."));
  }, [toast]);
  useEffect(() => { loadQueue().catch(() => toast("Antrean tidak dapat dimuat.")); const timer = setInterval(() => loadQueue().catch(() => { }), 7000); return () => clearInterval(timer); }, [loadQueue, toast]);
  async function setStatus(record, status) {
    setBusy(true);
    try {
      const response = await api(`/api/clinic-queue/${record.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Status gagal diperbarui");
      toast(`${record.queue_code} diperbarui menjadi ${status}.`); await loadQueue();
    } catch (caught) { toast(caught.message); } finally { setBusy(false); }
  }
  async function callNext() {
    setBusy(true);
    try {
      const response = await api("/api/clinic-queue/call-next", { method: "POST" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Antrean tidak dapat dipanggil");
      toast(`Memanggil nomor ${result.queue_code}.`); await loadQueue();
    } catch (caught) { toast(caught.message); } finally { setBusy(false); }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.replace("/login"); }
  function copyLink() { navigator.clipboard?.writeText(config.public_url).then(() => toast("Tautan pendaftaran disalin.")).catch(() => toast("Salin tautan secara manual.")); }
  const statusBadge = (status) => <span className={`queue-badge ${status.toLowerCase()}`}>{status}</span>;
  return <><header className="topbar queue-admin-topbar"><div><a className="portal-back" href="/">← Portal Utama</a><div className="eyebrow">PELAYANAN POLI TB</div><h1>Pendaftaran Poli TB</h1><p>Antrean online harian dan pencatatan pasien yang datang ke Poli TB.</p></div><div className="header-actions"><span className="privacy">Data Tersimpan Lokal</span><button className="logout-button" onClick={logout}>Keluar</button></div></header><main className="queue-admin-main">
    <section className="queue-admin-summary"><article><strong>{summary.waiting ?? "—"}</strong><span>Menunggu</span></article><article className="current"><strong>{summary.current_queue || "—"}</strong><span>Sedang dipanggil</span></article><article><strong>{summary.completed ?? "—"}</strong><span>Selesai</span></article><article><strong>{summary.total ?? "—"}</strong><span>Total pendaftaran</span></article></section>
    <section className="queue-admin-layout"><article className="queue-qr-card"><div className="eyebrow">QR PENDAFTARAN</div><h2>Scan untuk ambil antrean</h2>{qrData ? <img src={qrData} alt="QR code halaman pendaftaran Poli TB" /> : <div className="qr-placeholder">Membuat QR…</div>}<code>{config.public_url || "Memuat alamat…"}</code><button type="button" className="button secondary" onClick={copyLink}>Salin Tautan</button><p>HP dan komputer harus terhubung ke Wi‑Fi/LAN yang sama. Pasang QR ini di area pendaftaran.</p></article><section className="panel queue-list-panel"><div className="queue-list-head"><div><div className="eyebrow">ANTREAN HARIAN</div><h2>Daftar Pendaftaran</h2></div><div className="queue-list-actions"><input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} /><button className="button primary" type="button" onClick={callNext} disabled={busy || visitDate !== localTodayIso()}>Panggil Berikutnya</button></div></div><div className="table-wrap queue-table-wrap"><table className="queue-table"><thead><tr><th>Antrean</th><th>Pasien</th><th>Jenis</th><th>No. Handphone</th><th>Waktu Daftar</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{records.length ? records.map((record) => <tr key={record.id}><td><strong className="queue-code">{record.queue_code}</strong></td><td><strong>{record.full_name}</strong><div className="sub">RM {record.medical_record_no || "—"}</div></td><td>{record.patient_type}</td><td>{record.phone_number}</td><td>{new Date(record.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</td><td>{statusBadge(record.status)}</td><td><div className="queue-row-actions">{record.status === "Menunggu" ? <><button onClick={() => setStatus(record, "Dipanggil")} disabled={busy}>Panggil</button><button className="danger" onClick={() => setStatus(record, "Batal")} disabled={busy}>Batal</button></> : null}{record.status === "Dipanggil" ? <><button className="finish" onClick={() => setStatus(record, "Selesai")} disabled={busy}>Selesai</button><button onClick={() => setStatus(record, "Menunggu")} disabled={busy}>Kembalikan</button></> : null}</div></td></tr>) : <tr><td colSpan="7" className="empty">Belum ada pendaftaran pada tanggal ini.</td></tr>}</tbody></table></div></section></section>
    <footer className="team-footer"><strong>Tim TB Puskesmas Kebon Jeruk</strong><div className="team-tagline">“Kerja Jangan Asal Kerja”</div></footer>
  </main><div id="toast" className={toastMessage ? "show" : ""} role="status" aria-live="polite">{toastMessage}</div></>;
}

function sputumMonthLabel(key) {
  const [year, month] = key.split("-");
  return new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(Number(year), Number(month) - 1, 1));
}

function SputumApp() {
  const [data, setData] = useState({ months: [], clinics: [], matrix: [], available_clinics: [], matrix_months: [] });
  const [clinic, setClinic] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { document.title = "Rekapitulasi Pemeriksaan Dahak"; }, []);
  const load = useCallback(async (refresh = false) => {
    refresh ? setSyncing(true) : setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (clinic) params.set("clinic", clinic); if (refresh) params.set("refresh", "1");
      const response = await api(`/api/sputum/summary?${params}`); const raw = await response.text();
      let result; try { result = JSON.parse(raw); } catch { throw new Error("Server tidak mengirim data JSON yang valid. Muat ulang aplikasi PHP lalu coba lagi."); }
      if (!response.ok) throw new Error(result.error || "Rekap tidak dapat dimuat"); setData(result);
    } catch (caught) { setError(caught.message); }
    finally { setLoading(false); setSyncing(false); }
  }, [clinic]);
  useEffect(() => { load(); }, [load]);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.replace("/login"); }
  const maxMonth = Math.max(...data.months.map((item) => item.value), 1);
  const maxClinic = Math.max(...data.clinics.map((item) => item.value), 1);
  const syncLabel = data.synced_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.synced_at)) : "—";
  return <>
    <header className="topbar sputum-topbar"><div><a className="portal-back" href="/">← Portal Utama</a><div className="eyebrow">LABORATORIUM TB</div><h1>Rekapitulasi Pemeriksaan Dahak</h1><p>Jumlah pemeriksaan berdasarkan asal poli dan bulan pendaftaran.</p></div><div className="header-actions"><span className="privacy">Data Agregat</span><button className="upload-button" type="button" onClick={() => load(true)} disabled={syncing}>{syncing ? "Menyinkronkan…" : "Sinkronkan Spreadsheet"}</button><button className="logout-button" type="button" onClick={logout}>Keluar</button></div></header>
    <main className="sputum-main">
      {error ? <div className="notice"><span className="notice-icon">!</span><span>{error}</span></div> : null}
      {data.stale ? <div className="notice"><span className="notice-icon">!</span><span>Google Spreadsheet sedang tidak dapat dihubungi. Rekap terakhir yang tersimpan tetap ditampilkan.</span></div> : null}
      <section className="sputum-summary"><article><strong>{loading ? "—" : data.total}</strong><span>Total pemeriksaan 2026</span></article><article className="positive"><strong>{data.positive ?? "—"}</strong><span>Positif (Rif Sen/Rif Res)</span></article><article><strong>{data.negative ?? "—"}</strong><span>Negatif (Neg)</span></article><article className="rate"><strong>{Number(data.positivity_rate || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</strong><span>Positivity rate</span></article></section>
      {data.unclassified ? <div className="notice"><span className="notice-icon">i</span><span>{data.unclassified} pemeriksaan memiliki hasil kosong atau kode selain Neg, Rif Sen, dan Rif Res sehingga tidak masuk penyebut positivity rate.</span></div> : null}
      <section className="panel sputum-filter"><div><div className="eyebrow">FILTER REKAP 2026</div><h2>Januari–Desember</h2><p>Terakhir sinkron: {syncLabel}</p></div><div className="sputum-filter-controls"><label>Asal poli<select value={clinic} onChange={(event) => setClinic(event.target.value)}><option value="">Semua asal poli</option>{data.available_clinics.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" className="button secondary" onClick={() => setClinic("")}>Reset</button></div></section>
      <section className="sputum-charts"><article className="panel sputum-chart"><div className="sputum-panel-head"><div><div className="eyebrow">GRAFIK BULANAN</div><h2>Januari–Desember 2026</h2></div></div><div className="sputum-month-chart">{data.months.map((item) => <div className="sputum-month-column" key={item.key}><strong>{item.value}</strong><div><span style={{ height: `${item.value ? Math.max(8, item.value / maxMonth * 100) : 0}%` }} /></div><small><span>{sputumMonthLabel(item.key)}</span><em>{Number(item.positivity_rate || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% positif</em></small></div>)}</div></article>
        <article className="panel sputum-chart"><div className="sputum-panel-head"><div><div className="eyebrow">GRAFIK ASAL POLI</div><h2>Pemeriksaan dan positivity rate</h2></div></div><div className="sputum-clinic-chart">{data.clinics.length ? data.clinics.map((item) => <div className="sputum-clinic-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${item.value / maxClinic * 100}%` }} /></div><strong>{item.value} • {Number(item.positivity_rate || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</strong></div>) : <p className="empty-small">Tidak ada data untuk filter ini.</p>}</div></article></section>
      <section className="panel sputum-table-panel"><div className="sputum-panel-head"><div><div className="eyebrow">REKAP SILANG 2026</div><h2>Asal poli • Januari–Desember</h2></div><a href={data.source_url} target="_blank" rel="noreferrer">Buka spreadsheet sumber ↗</a></div><div className="table-wrap sputum-table-wrap"><table className="sputum-table"><thead><tr><th>Asal poli</th>{data.matrix_months.map((item) => <th key={item}>{sputumMonthLabel(item)}</th>)}<th>Total</th><th>Positif</th><th>Negatif</th><th>Positivity Rate</th></tr></thead><tbody>{data.matrix.length ? data.matrix.map((row) => <tr key={row.clinic}><td><strong>{row.clinic}</strong></td>{data.matrix_months.map((item) => <td className="numeric" key={item}>{row.months[item] || 0}</td>)}<td className="numeric"><strong>{row.total}</strong></td><td className="numeric positive-number">{row.positive}</td><td className="numeric">{row.negative}</td><td className="numeric rate-number">{Number(row.positivity_rate || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</td></tr>) : <tr><td className="empty" colSpan={data.matrix_months.length + 5}>Tidak ada data untuk filter ini.</td></tr>}</tbody><tfoot><tr><td>Total</td>{data.matrix_months.map((item) => <td className="numeric" key={item}>{data.months.find((monthItem) => monthItem.key === item)?.value || 0}</td>)}<td className="numeric">{data.total || 0}</td><td className="numeric">{data.positive || 0}</td><td className="numeric">{data.negative || 0}</td><td className="numeric">{Number(data.positivity_rate || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</td></tr></tfoot></table></div><div className="panel-footer"><span>Positivity rate = Rif Sen/Rif Res ÷ (Rif Sen/Rif Res + Neg).</span><span>{data.source_total || 0} pemeriksaan pada 12 sheet sumber</span></div></section>
      <footer className="team-footer"><strong>Tim TB Puskesmas Kebon Jeruk</strong><div className="team-tagline">“Kerja Jangan Asal Kerja”</div></footer>
    </main>
  </>;
}

const isLogin = location.pathname === "/login" || location.pathname.endsWith("login.html");
const isTbDatabase = location.pathname === "/tb";
const isTracingDatabase = location.pathname === "/tracing";
const isClinicQueue = location.pathname === "/poli-tb";
const isSputum = location.pathname === "/dahak";
const isPublicQueue = location.pathname === "/daftar-poli-tb";
createRoot(document.getElementById("root")).render(isLogin ? <LoginApp /> : isPublicQueue ? <QueueRegistrationApp /> : isTbDatabase ? <DashboardApp /> : isTracingDatabase ? <TracingApp /> : isClinicQueue ? <ClinicQueueApp /> : isSputum ? <SputumApp /> : <PortalApp />);
