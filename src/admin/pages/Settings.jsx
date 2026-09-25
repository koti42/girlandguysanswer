import React, { useEffect, useMemo, useState } from 'react';
import { FaSave, FaUndo } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton, Switch, Tabs } from '../../panel/ui';

/**
 * Site ayarları. Backend registry'den gruplar ve tipler gelir; burada yalnızca
 * çizilir. Değişenler işaretlenir, tek seferde kaydedilir; hatalı alan varsa
 * hiçbiri yazılmaz (sunucu böyle davranır).
 */
export default function Settings() {
    const toast = useToast();
    const q = useQuery(() => adminApi.settings(), []);
    const groups = q.data?.groups || [];
    const [tab, setTab] = useState('general');
    const [values, setValues] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);

    const original = useMemo(() => Object.fromEntries(groups.flatMap((g) => g.settings.map((s) => [s.key, s.value]))), [groups]);
    useEffect(() => { setValues(original); }, [original]);

    const changed = Object.keys(values).filter((k) => JSON.stringify(values[k]) !== JSON.stringify(original[k]));

    const save = async () => {
        if (!changed.length) return;
        setBusy(true); setErrors({});
        try {
            const payload = Object.fromEntries(changed.map((k) => [k, values[k]]));
            const r = await adminApi.updateSettings(payload);
            toast.success(r.data?.message);
            q.refetch();
        } catch (e) {
            if (e.response?.data?.errors) setErrors(e.response.data.errors);
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    const group = groups.find((g) => g.key === tab);

    return (
        <div>
            <PageHeader title="Ayarlar" description="Değişiklikler anında uygulanır ve denetim kaydına yazılır." actions={(
                <>
                    {changed.length > 0 && <Button size="sm" variant="ghost" icon={FaUndo} onClick={() => setValues(original)}>Geri al</Button>}
                    <Button size="sm" variant="primary" icon={FaSave} disabled={!changed.length} loading={busy} onClick={save}>{changed.length ? `${changed.length} değişikliği kaydet` : 'Değişiklik yok'}</Button>
                </>
            )}>
                <Tabs items={groups.map((g) => ({ key: g.key, label: g.label, count: g.settings.filter((s) => changed.includes(s.key)).length || undefined }))} value={tab} onChange={setTab} />
            </PageHeader>

            {q.loading && <Skeleton className="h-64" />}
            {group && (
                <Card>
                    <div className="grid gap-5 md:grid-cols-2">
                        {group.settings.map((s) => {
                            const v = values[s.key];
                            const dirty = changed.includes(s.key);
                            const err = errors[s.key];
                            const label = <span className="inline-flex items-center gap-2">{s.label}{dirty && <Badge tone="warning" size="xs">değişti</Badge>}{s.public && <Badge size="xs" tone="neutral">herkese açık</Badge>}</span>;
                            if (s.type === 'bool') {
                                return <div key={s.key} className={`rounded-xl border p-4 ${dirty ? 'border-amber-500/40' : 'border-[var(--p-border)]'} ${s.key === 'maintenance_mode' && v ? 'bg-rose-500/10' : ''}`}><Switch checked={!!v} onChange={(nv) => setValues({ ...values, [s.key]: nv })} label={label} description={s.help} />{err && <p className="text-xs text-rose-400 mt-1">{err}</p>}</div>;
                            }
                            return (
                                <Field key={s.key} label={label} hint={s.help || (s.type === 'int' && s.min != null ? `${s.min}–${s.max}` : undefined)} error={err} className={`rounded-xl border p-4 ${dirty ? 'border-amber-500/40' : 'border-[var(--p-border)]'}`}>
                                    {s.type === 'enum' ? <Select value={v ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}>{s.options.map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                                        : s.type === 'int' ? <Input type="number" min={s.min} max={s.max} value={v ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value === '' ? '' : Number(e.target.value) })} />
                                            : <Input value={v ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />}
                                </Field>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}
