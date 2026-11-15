/**
 * Notebook Manager Module
 * Handles prompt notebook persistence (LocalStorage), rendering, and data export/import.
 */

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatNoteDate(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class NotebookManager {
    constructor(config = {}) {
        this.listContainerEl = config.listContainerEl;
        this.onApplyNote = config.onApplyNote || (() => {});
        this.onShowToast = config.onShowToast || (() => {});
        this.onConfirm = config.onConfirm || (() => Promise.resolve(true));
        this.onOpenLightbox = config.onOpenLightbox || (() => {});
        
        this.currentModel = 'v3';
    }

    getNotebookNotes(model) {
        const key = `nai_notebook_${model}`;
        try {
            const val = localStorage.getItem(key);
            if (!val) return [];
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    saveNotebookNotes(model, notes) {
        localStorage.setItem(`nai_notebook_${model}`, JSON.stringify(notes));
    }

    async getPreviewThumbnail(imgSrc) {
        if (!imgSrc || imgSrc === window.location.href || imgSrc.startsWith('chrome-extension')) {
            return null;
        }
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxDim = 160;
                    let w = img.width;
                    let h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                } catch (e) {
                    console.error('Failed to generate notebook thumbnail:', e);
                    resolve(null);
                }
            };
            img.onerror = (err) => {
                console.error('Failed to load image for thumbnail:', err);
                resolve(null);
            };
            img.src = imgSrc;
        });
    }

    async saveNote({ prompt, negative, imageSrc }) {
        if (!prompt) {
            this.onShowToast('提示词为空，无法保存', 'warning');
            return;
        }

        const model = this.currentModel;
        const notes = this.getNotebookNotes(model);

        // Check for duplicates
        if (notes.some(n => n.prompt === prompt && n.negative === negative)) {
            this.onShowToast('该提示词已存在于笔记本中', 'warning');
            return;
        }

        // Capture preview
        let preview = null;
        if (imageSrc) {
            this.onShowToast('正在生成缩略图...', 'info', 1000);
            preview = await this.getPreviewThumbnail(imageSrc);
        }

        const note = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            prompt,
            negative,
            preview,
            createdAt: Date.now()
        };

        notes.unshift(note);
        this.saveNotebookNotes(model, notes);
        this.onShowToast(`已保存到 ${model === 'v5' ? 'V5' : (model === 'v4.5' ? 'V4.5' : 'V3')} 笔记本`, 'success');

        this.render(model);
    }

    switchModel(model) {
        this.currentModel = model;
        const active = "studio-tab active px-3.5 py-1.5 rounded-full text-[10px] font-bold border transition-[background-color,color,border-color] duration-150 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent shadow-sm cursor-pointer";
        const inactive = "studio-tab px-3.5 py-1.5 rounded-full text-[10px] font-bold border transition-[background-color,color,border-color] duration-150 bg-white text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white cursor-pointer";
        
        const btnV3 = document.getElementById('btn-nb-v3');
        const btnV4 = document.getElementById('btn-nb-v4');
        const btnV5 = document.getElementById('btn-nb-v5');
        btnV3?.parentElement?.classList?.add?.('studio-tabs');
        if (btnV3) {
            btnV3.className = model === 'v3' ? active : inactive;
            btnV3.setAttribute?.('aria-pressed', model === 'v3' ? 'true' : 'false');
        }
        if (btnV4) {
            btnV4.className = model === 'v4.5' ? active : inactive;
            btnV4.setAttribute?.('aria-pressed', model === 'v4.5' ? 'true' : 'false');
        }
        if (btnV5) {
            btnV5.className = model === 'v5' ? active : inactive;
            btnV5.setAttribute?.('aria-pressed', model === 'v5' ? 'true' : 'false');
        }

        this.render(model);
    }

    render(model) {
        model = model || this.currentModel;
        if (!this.listContainerEl) return;

        const notes = this.getNotebookNotes(model);

        if (notes.length === 0) {
            this.listContainerEl.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400" style="color: var(--text-muted)">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 mb-2 opacity-60 pointer-events-none"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>
                    <span class="text-xs font-medium">还没有笔记</span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">点击上方按钮收藏当前提示词</span>
                </div>
            `;
            return;
        }

        this.listContainerEl.innerHTML = notes.map((note, idx) => `
            <div class="group studio-card studio-list-enter bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-200/80 dark:border-slate-700/50 p-3 hover:border-slate-300 dark:hover:border-slate-600 transition-[border-color,background-color] duration-150" style="--sibling-index: ${Math.min(idx, 10)}" data-note-id="${note.id}">
                <div class="flex items-start justify-between gap-2 mb-1.5">
                    <span class="text-[9px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">${formatNoteDate(note.createdAt)}</span>
                    <div class="studio-hover-actions flex items-center gap-1">
                        <button type="button" onclick="bindCurrentCanvasToNote('${model}','${note.id}')" class="studio-icon-btn w-7 h-7 p-1.5 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-150 cursor-pointer" title="绑定当前画布图片" aria-label="绑定当前画布图片">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                        </button>
                        <button type="button" onclick="editNotebookNote('${model}','${note.id}')" class="studio-icon-btn w-7 h-7 p-1.5 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-150 cursor-pointer" title="编辑" aria-label="编辑笔记">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button type="button" onclick="deleteNotebookNote('${model}','${note.id}')" class="studio-icon-btn w-7 h-7 p-1.5 hover:bg-red-100 dark:hover:bg-red-950/30 rounded-md text-slate-500 dark:text-slate-400 hover:text-red-500 transition-colors duration-150 cursor-pointer" title="删除" aria-label="删除笔记">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </div>
                </div>
                <div class="flex gap-2.5 mb-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-3 break-all">${escapeHtml(note.prompt)}</div>
                        ${note.negative ? `<div class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-1 break-all mt-1"><span class="text-slate-400 dark:text-slate-500">neg:</span> ${escapeHtml(note.negative)}</div>` : ''}
                    </div>
                    ${note.preview ? `
                    <div class="shrink-0 relative group/preview">
                        <img src="${note.preview}" class="w-14 h-20 object-cover rounded-lg shadow-sm border border-slate-200/70 dark:border-slate-700 cursor-zoom-in" onclick="event.stopPropagation(); viewNotebookNotePreview('${model}', '${note.id}')">
                        <button type="button" onclick="event.stopPropagation(); removeNotePreview('${model}', '${note.id}')" 
                            class="studio-hover-actions studio-icon-btn absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors duration-150 cursor-pointer" title="移除预览图" aria-label="移除预览图">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 pointer-events-none" aria-hidden="true"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                        </button>
                    </div>
                    ` : ''}
                </div>
                <button type="button" onclick="applyNotebookNote('${model}','${note.id}')"
                    class="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-[10px] font-bold rounded-lg shadow-sm transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 pointer-events-none"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg> 一键使用
                </button>
            </div>
        `).join('');
    }

    applyNote(model, noteId) {
        const notes = this.getNotebookNotes(model);
        const note = notes.find(n => n.id === noteId);
        if (!note) return;

        this.onApplyNote({
            prompt: note.prompt,
            negative: note.negative,
            model: model
        });
    }

    editNote(model, noteId) {
        const notes = this.getNotebookNotes(model);
        const note = notes.find(n => n.id === noteId);
        if (!note) return;

        const container = this.listContainerEl.querySelector(`[data-note-id="${noteId}"]`);
        if (!container) return;

        container.innerHTML = `
            <div class="space-y-2">
                <label class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">正向提示词</label>
                <textarea id="editNotePrompt" name="nai_edit_note_prompt" autocomplete="off" rows="4" class="art-input w-full px-3 py-2 rounded-lg text-xs outline-none shadow-sm resize-none text-slate-700 dark:text-slate-200">${escapeHtml(note.prompt)}</textarea>
                <label class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">负向提示词</label>
                <textarea id="editNoteNeg" name="nai_edit_note_neg" autocomplete="off" rows="2" class="art-input w-full px-3 py-2 rounded-lg text-xs outline-none shadow-sm resize-none text-slate-600 dark:text-slate-300">${escapeHtml(note.negative || '')}</textarea>
                <div class="flex gap-2 pt-1">
                    <button type="button" onclick="cancelEditNote('${model}')" class="flex-1 py-2 text-[10px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 cursor-pointer">取消</button>
                    <button type="button" onclick="confirmEditNote('${model}','${noteId}')" class="flex-1 py-2 text-[10px] font-bold rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 shadow-sm transition-colors duration-150 cursor-pointer">保存</button>
                </div>
            </div>
        `;
    }

    confirmEditNote(model, noteId) {
        const promptEl = document.getElementById('editNotePrompt');
        const negEl = document.getElementById('editNoteNeg');
        if (!promptEl) return;

        const newPrompt = promptEl.value.trim();
        if (!newPrompt) {
            this.onShowToast('提示词不能为空', 'warning');
            return;
        }

        const notes = this.getNotebookNotes(model);
        const noteIdx = notes.findIndex(n => n.id === noteId);
        if (noteIdx === -1) return;

        notes[noteIdx].prompt = newPrompt;
        notes[noteIdx].negative = negEl ? negEl.value.trim() : '';

        this.saveNotebookNotes(model, notes);
        this.render(model);
        this.onShowToast('笔记已更新', 'success', 1500);
    }

    cancelEditNote(model) {
        this.render(model);
    }

    async deleteNote(model, noteId) {
        const confirm = await this.onConfirm('确定要删除这条笔记吗？', '删除笔记', 'trash-2');
        if (!confirm) return;

        const notes = this.getNotebookNotes(model);
        const filtered = notes.filter(n => n.id !== noteId);
        this.saveNotebookNotes(model, filtered);
        this.render(model);
        this.onShowToast('笔记已删除', 'success', 1500);
    }

    async bindCurrentCanvasToNote(model, noteId, imageSrc) {
        if (!imageSrc) {
            this.onShowToast('当前画布无生成图片', 'warning');
            return;
        }

        const notes = this.getNotebookNotes(model);
        const noteIdx = notes.findIndex(n => n.id === noteId);
        if (noteIdx === -1) return;

        this.onShowToast('正在生成缩略图...', 'info', 1000);
        const preview = await this.getPreviewThumbnail(imageSrc);
        if (!preview) {
            this.onShowToast('无法从当前画布生成缩略图', 'error');
            return;
        }

        notes[noteIdx].preview = preview;
        this.saveNotebookNotes(model, notes);
        this.render(model);
        this.onShowToast('已绑定当前画布图片为预览', 'success');
    }

    removeNotePreview(model, noteId) {
        const notes = this.getNotebookNotes(model);
        const noteIdx = notes.findIndex(n => n.id === noteId);
        if (noteIdx === -1) return;

        notes[noteIdx].preview = null;
        this.saveNotebookNotes(model, notes);
        this.render(model);
        this.onShowToast('已移除预览图', 'success');
    }

    viewNotebookNotePreview(model, noteId) {
        const notes = this.getNotebookNotes(model);
        const note = notes.find(n => n.id === noteId);
        if (!note || !note.preview) return;

        this.onOpenLightbox({
            image: note.preview,
            prompt: note.prompt,
            negative: note.negative,
            model: model
        });
    }

    exportNotebook() {
        const v3Notes = this.getNotebookNotes('v3');
        const v4Notes = this.getNotebookNotes('v4.5');
        const v5Notes = this.getNotebookNotes('v5');
        
        if (v3Notes.length === 0 && v4Notes.length === 0 && v5Notes.length === 0) {
            this.onShowToast('笔记本为空，无需导出', 'warning');
            return;
        }

        const backup = {
            type: 'nai_notebook_backup',
            version: 1,
            v3: v3Notes,
            'v4.5': v4Notes,
            'v5': v5Notes
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const filename = `novelai-notebook-backup-${new Date().toISOString().split('T')[0]}.json`;
        if (typeof window !== 'undefined' && typeof window.triggerDownload === 'function') {
            window.triggerDownload(blob, filename);
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 300);
        }
        this.onShowToast('导出备份成功', 'success');
    }

    triggerImportNotebook() {
        const input = document.getElementById('notebookImportInput');
        if (input) {
            input.value = ''; // Reset
            input.click();
        }
    }

    async importNotebook(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.type !== 'nai_notebook_backup' || !data.version) {
                    this.onShowToast('无效的备份文件格式', 'error');
                    return;
                }

                const v3Import = Array.isArray(data.v3) ? data.v3 : [];
                const v4Import = Array.isArray(data['v4.5']) ? data['v4.5'] : [];
                const v5Import = Array.isArray(data['v5']) ? data['v5'] : [];

                if (v3Import.length === 0 && v4Import.length === 0 && v5Import.length === 0) {
                    this.onShowToast('备份文件中没有笔记数据', 'warning');
                    return;
                }

                const confirmMsg = `确定要导入备份吗？将合并导入 ${v3Import.length} 条 V3 笔记、${v4Import.length} 条 V4.5 笔记和 ${v5Import.length} 条 V5 笔记（自动过滤重复项）。`;
                const confirm = await this.onConfirm(confirmMsg, '导入备份', 'upload-cloud');
                if (!confirm) {
                    return;
                }

                let v3Added = 0;
                if (v3Import.length > 0) {
                    const currentV3 = this.getNotebookNotes('v3');
                    const preparedImportV3 = v3Import.map(imp => ({
                        id: imp.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                        prompt: imp.prompt,
                        negative: imp.negative || '',
                        preview: imp.preview || null,
                        createdAt: imp.createdAt || Date.now()
                    }));
                    const mergedV3 = this._mergeNotes(currentV3, preparedImportV3);
                    v3Added = mergedV3.length - currentV3.length;
                    this.saveNotebookNotes('v3', mergedV3);
                }

                let v4Added = 0;
                if (v4Import.length > 0) {
                    const currentV4 = this.getNotebookNotes('v4.5');
                    const preparedImportV4 = v4Import.map(imp => ({
                        id: imp.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                        prompt: imp.prompt,
                        negative: imp.negative || '',
                        preview: imp.preview || null,
                        createdAt: imp.createdAt || Date.now()
                    }));
                    const mergedV4 = this._mergeNotes(currentV4, preparedImportV4);
                    v4Added = mergedV4.length - currentV4.length;
                    this.saveNotebookNotes('v4.5', mergedV4);
                }

                let v5Added = 0;
                if (v5Import.length > 0) {
                    const currentV5 = this.getNotebookNotes('v5');
                    const preparedImportV5 = v5Import.map(imp => ({
                        id: imp.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                        prompt: imp.prompt,
                        negative: imp.negative || '',
                        preview: imp.preview || null,
                        createdAt: imp.createdAt || Date.now()
                    }));
                    const mergedV5 = this._mergeNotes(currentV5, preparedImportV5);
                    v5Added = mergedV5.length - currentV5.length;
                    this.saveNotebookNotes('v5', mergedV5);
                }

                this.render(this.currentModel);
                this.onShowToast(`导入成功！新增 V3: ${v3Added}条, V4.5: ${v4Added}条, V5: ${v5Added}条`, 'success');
            } catch (err) {
                console.error('Failed to import notebook:', err);
                this.onShowToast('解析备份文件失败: ' + err.message, 'error');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    _mergeNotes(current, imported) {
        const map = new Map();
        current.forEach(n => map.set(`${n.prompt}||${n.negative}`, n));
        imported.forEach(n => {
            const key = `${n.prompt}||${n.negative}`;
            if (!map.has(key)) {
                map.set(key, n);
            }
        });
        // Sort by createdAt descending
        return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    }
}
