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
        this.onShowToast(`已保存到 ${model === 'v4.5' ? 'V4.5' : 'V3'} 笔记本`, 'success');

        this.render(model);
    }

    switchModel(model) {
        this.currentModel = model;
        const active = "px-4 py-1.5 rounded-full text-[10px] font-bold border transition-all bg-gray-900 text-white dark:bg-slate-100 dark:text-gray-900 border-transparent shadow-md";
        const inactive = "px-4 py-1.5 rounded-full text-[10px] font-bold border transition-all bg-white text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-gray-700";
        
        const btnV3 = document.getElementById('btn-nb-v3');
        const btnV4 = document.getElementById('btn-nb-v4');
        if (btnV3) btnV3.className = model === 'v3' ? active : inactive;
        if (btnV4) btnV4.className = model !== 'v3' ? active : inactive;

        this.render(model);
    }

    render(model) {
        model = model || this.currentModel;
        if (!this.listContainerEl) return;

        const notes = this.getNotebookNotes(model);

        if (notes.length === 0) {
            this.listContainerEl.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-300 dark:text-slate-600">
                    <i data-lucide="notebook-pen" class="w-8 h-8 mb-2 opacity-50"></i>
                    <span class="text-xs font-medium">还没有笔记</span>
                    <span class="text-[10px] text-gray-400 dark:text-slate-600 mt-1">点击上方按钮收藏当前提示词</span>
                </div>
            `;
            if (window.safeCreateIcons) window.safeCreateIcons();
            return;
        }

        this.listContainerEl.innerHTML = notes.map((note) => `
            <div class="group bg-gray-50/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl border border-gray-100/80 dark:border-slate-700/50 p-3 hover:border-indigo-200 dark:hover:border-indigo-800/50 transition-all" data-note-id="${note.id}">
                <div class="flex items-start justify-between gap-2 mb-1.5">
                    <span class="text-[9px] text-gray-400 dark:text-slate-500 font-mono">${formatNoteDate(note.createdAt)}</span>
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="bindCurrentCanvasToNote('${model}','${note.id}')" class="p-1 hover:bg-gray-200/80 dark:hover:bg-slate-700 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all" title="绑定当前画布图片">
                            <i data-lucide="image" class="w-3 h-3"></i>
                        </button>
                        <button onclick="editNotebookNote('${model}','${note.id}')" class="p-1 hover:bg-gray-200/80 dark:hover:bg-slate-700 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all" title="编辑">
                            <i data-lucide="pencil" class="w-3 h-3"></i>
                        </button>
                        <button onclick="deleteNotebookNote('${model}','${note.id}')" class="p-1 hover:bg-red-100 dark:hover:bg-red-950/30 rounded-md text-gray-400 hover:text-red-500 transition-all" title="删除">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
                <div class="flex gap-2.5 mb-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs text-gray-700 dark:text-gray-200 leading-relaxed line-clamp-3 break-all">${escapeHtml(note.prompt)}</div>
                        ${note.negative ? `<div class="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed line-clamp-1 break-all mt-1"><span class="text-gray-300 dark:text-slate-600">neg:</span> ${escapeHtml(note.negative)}</div>` : ''}
                    </div>
                    ${note.preview ? `
                    <div class="shrink-0 relative group/preview">
                        <img src="${note.preview}" class="w-14 h-20 object-cover rounded-lg shadow-sm border border-gray-200/50 dark:border-slate-700 cursor-zoom-in" onclick="event.stopPropagation(); viewNotebookNotePreview('${model}', '${note.id}')">
                        <button onclick="event.stopPropagation(); removeNotePreview('${model}', '${note.id}')" 
                            class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] hover:bg-red-600 shadow-md transition-all opacity-0 group-hover/preview:opacity-100" title="移除预览图">
                            ✕
                        </button>
                    </div>
                    ` : ''}
                </div>
                <button onclick="applyNotebookNote('${model}','${note.id}')"
                    class="w-full py-2 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 text-[10px] font-bold rounded-lg hover:shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                    <i data-lucide="send" class="w-3 h-3"></i> 一键使用
                </button>
            </div>
        `).join('');

        if (window.safeCreateIcons) window.safeCreateIcons();
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
                <label class="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">正向提示词</label>
                <textarea id="editNotePrompt" rows="4" class="art-input w-full px-3 py-2 rounded-lg text-xs outline-none shadow-sm resize-none text-gray-700 dark:text-gray-200">${escapeHtml(note.prompt)}</textarea>
                <label class="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">负向提示词</label>
                <textarea id="editNoteNeg" rows="2" class="art-input w-full px-3 py-2 rounded-lg text-xs outline-none shadow-sm resize-none text-gray-600 dark:text-gray-300">${escapeHtml(note.negative || '')}</textarea>
                <div class="flex gap-2 pt-1">
                    <button onclick="cancelEditNote('${model}')" class="flex-1 py-2 text-[10px] font-semibold rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all">取消</button>
                    <button onclick="confirmEditNote('${model}','${noteId}')" class="flex-1 py-2 text-[10px] font-bold rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md hover:shadow-lg transition-all active:scale-[0.98]">保存</button>
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
        
        if (v3Notes.length === 0 && v4Notes.length === 0) {
            this.onShowToast('笔记本为空，无需导出', 'warning');
            return;
        }

        const backup = {
            type: 'nai_notebook_backup',
            version: 1,
            v3: v3Notes,
            'v4.5': v4Notes
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `novelai-notebook-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 300);
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

                if (v3Import.length === 0 && v4Import.length === 0) {
                    this.onShowToast('备份文件中没有笔记数据', 'warning');
                    return;
                }

                const confirmMsg = `确定要导入备份吗？将合并导入 ${v3Import.length} 条 V3 笔记和 ${v4Import.length} 条 V4.5 笔记（自动过滤重复项）。`;
                const confirm = await this.onConfirm(confirmMsg, '导入备份', 'upload-cloud');
                if (!confirm) {
                    return;
                }

                let v3Added = 0;
                if (v3Import.length > 0) {
                    const currentV3 = this.getNotebookNotes('v3');
                    const mergedV3 = [...currentV3];
                    v3Import.forEach(imp => {
                        const isDup = mergedV3.some(n => n.prompt === imp.prompt && n.negative === imp.negative);
                        if (!isDup) {
                            mergedV3.push({
                                id: imp.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                                prompt: imp.prompt,
                                negative: imp.negative || '',
                                preview: imp.preview || null,
                                createdAt: imp.createdAt || Date.now()
                            });
                            v3Added++;
                        }
                    });
                    mergedV3.sort((a, b) => b.createdAt - a.createdAt);
                    this.saveNotebookNotes('v3', mergedV3);
                }

                let v4Added = 0;
                if (v4Import.length > 0) {
                    const currentV4 = this.getNotebookNotes('v4.5');
                    const mergedV4 = [...currentV4];
                    v4Import.forEach(imp => {
                        const isDup = mergedV4.some(n => n.prompt === imp.prompt && n.negative === imp.negative);
                        if (!isDup) {
                            mergedV4.push({
                                id: imp.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                                prompt: imp.prompt,
                                negative: imp.negative || '',
                                preview: imp.preview || null,
                                createdAt: imp.createdAt || Date.now()
                            });
                            v4Added++;
                        }
                    });
                    mergedV4.sort((a, b) => b.createdAt - a.createdAt);
                    this.saveNotebookNotes('v4.5', mergedV4);
                }

                this.render(this.currentModel);
                this.onShowToast(`导入成功！新增 V3: ${v3Added}条, V4.5: ${v4Added}条`, 'success');
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
