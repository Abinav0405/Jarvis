import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import {
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  ICON_PICKER_NAMES,
  PRESET_CATEGORIES,
  createEmptyPresetForm,
  domainFromUrl,
  emptySystemActions,
  exeLabel,
} from '@/utils/presets.js';
import { getJarvis } from '@/jarvis-bridge.js';

function DynIcon({ name, className, strokeWidth = 2 }) {
  const Cmp = Icons[name] || Icons.Box;
  return <Cmp className={className} strokeWidth={strokeWidth} />;
}

export function Presets({ data, persist, pushToast, isActive, onPresetLaunched }) {
  const presets = Array.isArray(data.presets) ? data.presets : [];
  const [menuId, setMenuId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => createEmptyPresetForm());
  const [tabInput, setTabInput] = useState('');
  const [focusedCard, setFocusedCard] = useState(0);
  const menuRef = useRef(null);

  const closeMenu = useCallback(() => setMenuId(null), []);

  useEffect(() => {
    if (!menuId) return undefined;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) closeMenu();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuId, closeMenu]);

  const openCreate = () => {
    setEditingId(null);
    setForm(createEmptyPresetForm());
    setTabInput('');
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    const mergedSa = { ...emptySystemActions(), ...(p.systemActions || {}) };
    if (!mergedSa.setVolume || typeof mergedSa.setVolume.percent !== 'number') {
      mergedSa.setVolume = { enabled: !!mergedSa.setVolume?.enabled, percent: mergedSa.setVolume?.percent ?? 50 };
    }
    setForm({
      name: p.name || '',
      icon: p.icon || 'Box',
      category: p.category || 'Work',
      apps: [...(p.apps || [])],
      tabs: [...(p.tabs || [])],
      systemActions: mergedSa,
    });
    setTabInput('');
    setModalOpen(true);
    closeMenu();
  };

  const savePreset = async () => {
    const name = form.name.trim();
    if (!name) {
      pushToast('Give the preset a name, Boss.', 'error');
      return;
    }
    await persist((d) => {
      const list = [...(d.presets || [])];
      const payload = {
        id: editingId || crypto.randomUUID(),
        name,
        icon: form.icon,
        category: form.category,
        apps: [...form.apps],
        tabs: [...form.tabs],
        systemActions: JSON.parse(JSON.stringify(form.systemActions || {})),
      };
      if (editingId) {
        const i = list.findIndex((x) => x.id === editingId);
        if (i >= 0) list[i] = payload;
      } else {
        list.push(payload);
      }
      return { ...d, presets: list };
    });
    setModalOpen(false);
    pushToast(editingId ? 'Preset updated.' : 'Preset saved.', 'success');
  };

  const deletePreset = async (id) => {
    closeMenu();
    await persist((d) => ({
      ...d,
      presets: (d.presets || []).filter((p) => p.id !== id),
      activePresetId: d.activePresetId === id ? null : d.activePresetId,
    }));
    pushToast('Preset deleted.', 'info');
  };

  const launchPreset = async (preset) => {
    setFlashId(preset.id);
    setTimeout(() => setFlashId(null), 320);
    try {
      await getJarvis().restorePresetSystem();
      await getJarvis().launchPreset(preset);
      await persist((d) => {
        const next = { ...d, activePresetId: preset.id };
        if (next.settings?.logActivity !== false) {
          next.activityLog = [...(next.activityLog || [])];
          next.activityLog.unshift({
            id: crypto.randomUUID(),
            message: `Launched "${preset.name}" preset`,
            timestamp: Date.now(),
          });
        }
        return next;
      });
      pushToast(`${preset.name} preset launched`, 'success');
      onPresetLaunched?.(preset);
    } catch (e) {
      pushToast('Launch hit a snag, Boss.', 'error');
    }
  };

  const cardCount = useMemo(() => presets.length + 1, [presets.length]);

  useEffect(() => {
    if (!isActive || modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown')
        return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setFocusedCard((i) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return Math.min(cardCount - 1, i + 1);
        return Math.max(0, i - 1);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, modalOpen, cardCount]);

  if (presets.length === 0 && !modalOpen) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-10">
        <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden>
          <rect x="6" y="8" width="50" height="34" rx="8" stroke="rgba(0,212,255,0.35)" strokeWidth="1.5" />
          <rect x="64" y="8" width="50" height="34" rx="8" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <rect x="6" y="48" width="50" height="34" rx="8" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <rect x="64" y="48" width="50" height="34" rx="8" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
        </svg>
        <div className="text-center">
          <p className="text-lg font-medium text-[#F0F0F0]">No presets yet, Boss.</p>
          <p className="mt-1 text-sm text-[rgba(240,240,240,0.45)]">Create workspaces that open apps, tabs, and system tweaks in one shot.</p>
        </div>
        <motion.button
          type="button"
          onClick={openCreate}
          className="jarvis-interactive rounded-pill bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-black shadow-[0_0_16px_rgba(0,212,255,0.45)]"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          Create your first preset
        </motion.button>
        <PresetModal
          open={modalOpen}
          form={form}
          setForm={setForm}
          tabInput={tabInput}
          setTabInput={setTabInput}
          editingId={editingId}
          onClose={() => setModalOpen(false)}
          onSave={savePreset}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto jarvis-scrollbar px-8 py-7">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--accent)]">Presets</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#F0F0F0]">Workspaces</h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pb-4">
        {presets.map((p, idx) => {
          const running = data.activePresetId === p.id;
          const appsCount = (p.apps || []).length;
          const tabsCount = (p.tabs || []).length;
          const isFocused = isActive && !modalOpen && focusedCard === idx;
          return (
            <motion.article
              key={p.id}
              tabIndex={0}
              data-preset-card
              onFocus={() => setFocusedCard(idx)}
              className={`relative rounded-card border bg-[rgba(255,255,255,0.04)] p-4 backdrop-blur-glass outline-none transition-shadow ${
                running
                  ? 'border-[rgba(0,212,255,0.55)] shadow-[0_0_24px_rgba(0,212,255,0.2)]'
                  : 'border-[rgba(255,255,255,0.08)]'
              } ${isFocused ? 'ring-1 ring-[rgba(0,212,255,0.35)]' : ''}`}
              animate={
                flashId === p.id
                  ? { scale: [1, 1.02, 1], boxShadow: ['0 0 0 rgba(0,212,255,0)', '0 0 28px rgba(0,212,255,0.45)', '0 0 0 rgba(0,212,255,0)'] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.3 }}
            >
              {running && (
                <span className="absolute right-3 top-3 rounded-pill bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/40">
                  Running
                </span>
              )}
              <div className="flex items-start justify-between gap-2 pr-10">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] text-[var(--accent)]">
                    <DynIcon name={p.icon} className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#F0F0F0]">{p.name}</h3>
                    <p className="mt-0.5 text-xs text-[rgba(240,240,240,0.45)]">
                      {appsCount} apps · {tabsCount} tabs
                    </p>
                  </div>
                </div>
                <div className="relative" ref={menuId === p.id ? menuRef : undefined}>
                  <motion.button
                    type="button"
                    aria-label="Preset menu"
                    className="jarvis-interactive rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-1.5 text-[rgba(240,240,240,0.75)]"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setMenuId((m) => (m === p.id ? null : p.id))}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </motion.button>
                  <AnimatePresence>
                    {menuId === p.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(12,12,12,0.95)] py-1 shadow-glow backdrop-blur-glass"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.06)]"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-3.5 w-3.5 text-[var(--accent)]" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-200 hover:bg-[rgba(255,255,255,0.06)]"
                          onClick={() => deletePreset(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-3 inline-flex rounded-pill border border-[rgba(0,212,255,0.35)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                {p.category || 'Custom'}
              </div>

              <motion.button
                type="button"
                className="jarvis-interactive mt-4 flex w-full items-center justify-center rounded-btn bg-[var(--accent)] py-2.5 text-sm font-bold text-black"
                whileHover={{ scale: 1.02, boxShadow: '0 0 16px rgba(0,212,255,0.4)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => launchPreset(p)}
              >
                Launch
              </motion.button>
            </motion.article>
          );
        })}

        <motion.button
          type="button"
          tabIndex={0}
          onFocus={() => setFocusedCard(presets.length)}
          data-preset-card
          onClick={openCreate}
          className={`flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-[rgba(0,212,255,0.55)] bg-[rgba(255,255,255,0.02)] text-[var(--accent)] backdrop-blur-glass outline-none transition-shadow hover:shadow-glow ${
            isActive && !modalOpen && focusedCard === presets.length ? 'ring-1 ring-[rgba(0,212,255,0.35)]' : ''
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <Plus className="h-7 w-7" strokeWidth={2} />
          <span className="text-sm font-semibold">New Preset</span>
        </motion.button>
      </div>

      <PresetModal
        open={modalOpen}
        form={form}
        setForm={setForm}
        tabInput={tabInput}
        setTabInput={setTabInput}
        editingId={editingId}
        onClose={() => setModalOpen(false)}
        onSave={savePreset}
      />
    </div>
  );
}

function PresetModal({ open, form, setForm, tabInput, setTabInput, editingId, onClose, onSave }) {
  const addExe = async () => {
    const p = await getJarvis().pickExe();
    if (!p) return;
    setForm((f) => ({ ...f, apps: [...f.apps, p] }));
  };

  const pickWall = async () => {
    const p = await getJarvis().pickImage();
    if (!p) return;
    setForm((f) => ({
      ...f,
      systemActions: {
        ...f.systemActions,
        changeWallpaper: { enabled: true, imagePath: p },
      },
    }));
  };

  const toggle = (key, patch) => {
    setForm((f) => {
      const base = { ...emptySystemActions(), ...(f.systemActions || {}) };
      const cur = { ...(base[key] || {}) };
      return { ...f, systemActions: { ...base, [key]: { ...cur, ...patch } } };
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(0,0,0,0.7)] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="max-h-[90vh] w-full max-w-[500px] overflow-y-auto rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,12,0.92)] p-6 shadow-glow backdrop-blur-glass jarvis-scrollbar"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#F0F0F0]">{editingId ? 'Edit preset' : 'New preset'}</h3>
              <button type="button" className="jarvis-interactive rounded-btn p-1 text-[rgba(240,240,240,0.55)]" onClick={onClose}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[rgba(240,240,240,0.45)]">
              Preset name
              <input
                className="jarvis-input mt-1.5"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Developer"
              />
            </label>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[rgba(240,240,240,0.45)]">Icon</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {ICON_PICKER_NAMES.map((nm) => {
                const active = form.icon === nm;
                return (
                  <motion.button
                    key={nm}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon: nm }))}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border ${
                      active
                        ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)] shadow-glow'
                        : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[rgba(240,240,240,0.75)]'
                    }`}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <DynIcon name={nm} className="h-5 w-5" />
                  </motion.button>
                );
              })}
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[rgba(240,240,240,0.45)]">Category</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_CATEGORIES.map((c) => (
                <motion.button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: c }))}
                  className={`rounded-pill border px-3 py-1.5 text-xs font-semibold ${
                    form.category === c
                      ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)]'
                      : 'border-[rgba(255,255,255,0.08)] text-[rgba(240,240,240,0.75)]'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {c}
                </motion.button>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgba(240,240,240,0.45)]">Apps</p>
                <motion.button
                  type="button"
                  onClick={addExe}
                  className="jarvis-interactive rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs font-semibold text-[#F0F0F0]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Add App
                </motion.button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.apps.map((ap) => (
                  <span
                    key={ap}
                    className="inline-flex items-center gap-2 rounded-pill border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-3 py-1 font-mono text-[11px] text-[rgba(240,240,240,0.85)]"
                  >
                    {exeLabel(ap)}
                    <button
                      type="button"
                      className="text-[rgba(240,240,240,0.45)] hover:text-white"
                      onClick={() => setForm((f) => ({ ...f, apps: f.apps.filter((x) => x !== ap) }))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgba(240,240,240,0.45)]">Browser tabs</p>
              <div className="mt-2 flex gap-2">
                <input
                  className="jarvis-input"
                  value={tabInput}
                  onChange={(e) => setTabInput(e.target.value)}
                  placeholder="https://example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = tabInput.trim();
                      if (!v) return;
                      setForm((f) => ({ ...f, tabs: [...f.tabs, v] }));
                      setTabInput('');
                    }
                  }}
                />
                <motion.button
                  type="button"
                  className="jarvis-interactive shrink-0 rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs font-semibold"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const v = tabInput.trim();
                    if (!v) return;
                    setForm((f) => ({ ...f, tabs: [...f.tabs, v] }));
                    setTabInput('');
                  }}
                >
                  Add
                </motion.button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.tabs.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-2 rounded-pill border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-3 py-1 text-xs text-[rgba(240,240,240,0.85)]"
                  >
                    {domainFromUrl(u)}
                    <button
                      type="button"
                      className="text-[rgba(240,240,240,0.45)] hover:text-white"
                      onClick={() => setForm((f) => ({ ...f, tabs: f.tabs.filter((x) => x !== u) }))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgba(240,240,240,0.45)]">System actions</p>
              <label className="flex items-center justify-between gap-3 text-sm text-[#F0F0F0]">
                <span>Set volume</span>
                <input
                  type="checkbox"
                  checked={!!form.systemActions.setVolume?.enabled}
                  onChange={(e) => toggle('setVolume', { enabled: e.target.checked, percent: form.systemActions.setVolume?.percent ?? 50 })}
                />
              </label>
              {form.systemActions.setVolume?.enabled && (
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="jarvis-input font-mono text-sm"
                  value={form.systemActions.setVolume.percent}
                  onChange={(e) =>
                    toggle('setVolume', { enabled: true, percent: Math.min(100, Math.max(0, Number(e.target.value))) })
                  }
                />
              )}
              <label className="flex items-center justify-between gap-3 text-sm text-[#F0F0F0]">
                <span>Enable Do Not Disturb</span>
                <input
                  type="checkbox"
                  checked={!!form.systemActions.doNotDisturb?.enabled}
                  onChange={(e) => toggle('doNotDisturb', { enabled: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[#F0F0F0]">
                <span>Change wallpaper</span>
                <input
                  type="checkbox"
                  checked={!!form.systemActions.changeWallpaper?.enabled}
                  onChange={(e) =>
                    toggle('changeWallpaper', {
                      enabled: e.target.checked,
                      imagePath: form.systemActions.changeWallpaper?.imagePath || '',
                    })
                  }
                />
              </label>
              {form.systemActions.changeWallpaper?.enabled && (
                <div className="flex flex-wrap items-center gap-2">
                  <motion.button
                    type="button"
                    onClick={pickWall}
                    className="jarvis-interactive rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs font-semibold"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Choose image
                  </motion.button>
                  {form.systemActions.changeWallpaper.imagePath && (
                    <span className="font-mono text-[11px] text-[rgba(240,240,240,0.55)]">
                      {exeLabel(form.systemActions.changeWallpaper.imagePath)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <motion.button
                type="button"
                onClick={onClose}
                className="jarvis-interactive rounded-btn border border-[rgba(255,255,255,0.1)] bg-transparent px-4 py-2 text-sm font-semibold text-[rgba(240,240,240,0.75)]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                onClick={onSave}
                className="jarvis-interactive rounded-btn bg-[var(--accent)] px-5 py-2 text-sm font-bold text-black shadow-[0_0_16px_rgba(0,212,255,0.45)]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                Save
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
