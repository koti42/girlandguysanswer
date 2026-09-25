import React, { useState } from 'react';
import { FaCalendarCheck, FaExternalLinkAlt, FaPen } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Switch, Textarea } from '../../panel/ui';

const fmt = (md) => md ? md.split('-').reverse().join('.') : null;

/**
 * Özel günler: takvime göre kendiliğinden açılır/kapanır, açılış günü sistem
 * hesabı soru paylaşır. Tarihi yıla göre değişen bayramlar (Ramazan, Kurban)
 * için tarihi her yıl girin ya da günü elle açın - soru yine paylaşılır.
 */
export default function SpecialDays() {
    const toast = useToast();
    const list = useQuery(() => adminApi.specialDays(), []);
    const items = list.data?.items || list.data?.special_days || list.data || [];
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const year = new Date().getFullYear();

    const run = async (fn, ok) => {
        setBusy(true);
        try { const r = await fn(); toast.success(ok || r.data?.message); setEditing(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const open = (r) => {
        setForm({ label: r.label, short_label: r.short_label, emoji: r.emoji, badge_emoji: r.badge_emoji, color: r.color, starts_on: r.starts_on || '', ends_on: r.ends_on || '', auto_schedule: !!r.auto_schedule, question_title: r.question_title || '', question_body: r.question_body || '' });
        setEditing(r);
    };
    const save = () => run(() => adminApi.updateSpecialDay(editing.id, { ...form, starts_on: form.starts_on || null, ends_on: form.ends_on || null }), 'Kaydedildi.');

    const columns = [
        { key: 'emoji', label: '', width: 50, render: (r) => <span className="text-xl">{r.emoji}</span> },
        { key: 'label', label: 'Gün', render: (r) => <div><b>{r.label}</b><div className="text-xs p-muted">{r.short_label} · <code>{r.key}</code></div></div> },
        { key: 'window', label: 'Takvim', width: 190, render: (r) => r.starts_on && r.ends_on
            ? <div className="text-xs"><div>{fmt(r.starts_on)}{r.starts_on !== r.ends_on && ` – ${fmt(r.ends_on)}`}</div><Badge tone={r.auto_schedule ? 'success' : 'neutral'} size="xs">{r.auto_schedule ? 'otomatik' : 'elle'}</Badge></div>
            : <span className="text-xs p-muted">tarih yok · elle</span> },
        { key: 'question', label: 'Soru', width: 170, render: (r) => r.last_posted_year === year
            ? <a href={`/question/${r.last_question_id}`} target="_blank" rel="noreferrer" className="text-xs p-accent-text inline-flex items-center gap-1 hover:underline"><FaExternalLinkAlt className="text-[10px]" />{year} paylaşıldı</a>
            : r.question_title ? <span className="text-xs p-muted">hazır, {year}'de paylaşılmadı</span> : <Badge tone="warning" size="xs">şablon yok</Badge> },
        { key: 'is_active', label: 'Açık', width: 90, render: (r) => <Switch checked={!!r.is_active} onChange={() => run(() => adminApi.toggleSpecialDay(r.id))} /> },
        { key: '_', label: '', width: 110, render: (r) => <Button size="xs" variant="secondary" icon={FaPen} onClick={() => open(r)}>Düzenle</Button> },
    ];

    return (
        <div>
            <PageHeader title="Özel günler" description="Takvimi olan günler 00:05'te kendiliğinden açılır/kapanır ve sistem hesabı o güne özel soruyu paylaşır. Soruya ilk cevap/yorum yazan +300 XP alır (Oyunlaştırma › Puan kuralları). Elle açmak otomatik takvimi kapatır." actions={<Button size="sm" icon={FaCalendarCheck} loading={busy} onClick={() => run(() => adminApi.syncSpecialDays(), 'Takvim uygulandı.')}>Takvimi şimdi uygula</Button>} />
            <Card padded={false}><DataTable columns={columns} rows={items} loading={list.loading} error={list.error} onRetry={list.refetch} dense /></Card>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.label} düzenle`} width="max-w-2xl" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save}>Kaydet</Button></>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ad"><Input value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
                    <Field label="Kısa ad"><Input value={form.short_label || ''} onChange={(e) => setForm({ ...form, short_label: e.target.value })} /></Field>
                    <Field label="Emoji"><Input value={form.emoji || ''} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></Field>
                    <Field label="Rozet emoji"><Input value={form.badge_emoji || ''} onChange={(e) => setForm({ ...form, badge_emoji: e.target.value })} /></Field>
                    <Field label="Renk" className="sm:col-span-2"><div className="flex gap-2"><input type="color" value={form.color || '#E30A17'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-12 rounded-lg bg-transparent border border-[var(--p-border)] p-1" aria-label="Renk" /><Input value={form.color || ''} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div></Field>

                    <div className="sm:col-span-2 border-t border-[var(--p-border)] pt-3 text-xs font-semibold p-muted">Takvim</div>
                    <Field label="Başlangıç (AA-GG)" hint="Örn. 04-23"><Input value={form.starts_on || ''} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} placeholder="04-23" maxLength={5} /></Field>
                    <Field label="Bitiş (AA-GG)" hint="Tek gün için başlangıçla aynı. 12-31 → 01-01 yıl sonunu sarar."><Input value={form.ends_on || ''} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} placeholder="04-23" maxLength={5} /></Field>
                    <div className="sm:col-span-2"><Switch checked={!!form.auto_schedule} onChange={(v) => setForm({ ...form, auto_schedule: v })} label="Otomatik aç/kapat" description="Tarih penceresine göre her yıl kendiliğinden. Ramazan/Kurban gibi kayan bayramlarda tarihi her yıl güncelleyin." /></div>

                    <div className="sm:col-span-2 border-t border-[var(--p-border)] pt-3 text-xs font-semibold p-muted">Sistem hesabının paylaşacağı soru</div>
                    <Field label="Soru başlığı" className="sm:col-span-2"><Input value={form.question_title || ''} onChange={(e) => setForm({ ...form, question_title: e.target.value })} maxLength={255} /></Field>
                    <Field label="Soru metni" className="sm:col-span-2" hint="Yılda bir kez, gün açıldığında paylaşılır."><Textarea rows={4} value={form.question_body || ''} onChange={(e) => setForm({ ...form, question_body: e.target.value })} /></Field>
                </div>
            </Modal>
        </div>
    );
}
