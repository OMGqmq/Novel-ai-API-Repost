/**
 * Advanced Toolbox Controller Module
 * Handles UI interactions, modal states, and scrambling workflow.
 */
import { processImageScrambler } from './image-scrambler.js?v=20260620';
import { extractMetadata } from './png-metadata.js';

let store = null;
let scrambleSourceImageBase64 = null;
let isScrambleDecryptMode = false;
let isHistoryListOpen = false;
let parsedMetadata = null;
let isMetadataHistoryListOpen = false;

// Helpers for modal management to avoid tight coupling
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    setTimeout(() => {
        el.classList.add('modal-active');
    }, 10);
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal-active');
    setTimeout(() => {
        el.style.display = 'none';
    }, 300);
}

/**
 * Initialize the toolbox controller with required store instance
 */
export function initToolbox(storeInstance) {
    store = storeInstance;
}

export function openToolboxModal() {
    openModal('toolboxModal');
    switchToolboxTab('scrambler');
}

export function closeToolboxModal() {
    closeModal('toolboxModal');
}

export function switchToolboxTab(tabId) {
    document.querySelectorAll('.toolbox-tab-btn').forEach(btn => {
        if (btn.id === `toolboxTab-${tabId}`) {
            btn.classList.add('bg-gray-100', 'dark:bg-slate-800', 'text-gray-900', 'dark:text-white', 'shadow-sm', 'active-tab');
            btn.classList.remove('text-gray-500', 'dark:text-gray-400');
        } else {
            btn.classList.remove('bg-gray-100', 'dark:bg-slate-800', 'text-gray-900', 'dark:text-white', 'shadow-sm', 'active-tab');
            btn.classList.add('text-gray-500', 'dark:text-gray-400');
        }
    });

    document.querySelectorAll('.toolbox-panel').forEach(panel => {
        if (panel.id === `toolboxPanel-${tabId}`) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

export async function toggleScrambleHistoryList() {
    const wrapper = document.getElementById('scrambleHistoryListWrapper');
    if (!wrapper) return;
    
    isHistoryListOpen = !isHistoryListOpen;
    if (isHistoryListOpen) {
        wrapper.classList.remove('hidden');
        const container = document.getElementById('scrambleHistoryThumbnails');
        if (!container) return;
        
        container.innerHTML = '<div class="text-[10px] text-gray-400 text-center w-full py-4">正在载入生图历史...</div>';
        
        try {
            if (!store) {
                container.innerHTML = '<div class="text-[10px] text-rose-500 text-center w-full py-4">存储未初始化</div>';
                return;
            }
            const images = await store.getImagesPage(0, 50);
            if (!images || images.length === 0) {
                container.innerHTML = '<div class="text-[10px] text-gray-400 text-center w-full py-4">无历史生成图片</div>';
                return;
            }
            
            container.innerHTML = '';
            images.forEach(item => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'relative w-12 h-12 rounded-lg overflow-hidden cursor-pointer border border-transparent hover:border-indigo-500 transition-all shrink-0 bg-slate-900/10 dark:bg-slate-900/50';
                imgContainer.onclick = () => selectScrambleHistoryImage(item.image);
                
                const img = document.createElement('img');
                img.src = item.image;
                img.className = 'w-full h-full object-cover';
                imgContainer.appendChild(img);
                container.appendChild(imgContainer);
            });
        } catch (e) {
            console.error('加载生图历史失败:', e);
            container.innerHTML = '<div class="text-[10px] text-rose-500 text-center w-full py-4">加载失败</div>';
        }
    } else {
        wrapper.classList.add('hidden');
    }
}

export function selectScrambleHistoryImage(imageSrc) {
    if (!imageSrc) return;
    loadScrambleCanvas(imageSrc);
    if (window.showToast) window.showToast('成功导入生图历史图片', 'success');
}

export function handleScrambleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        loadScrambleCanvas(e.target.result);
        if (window.showToast) window.showToast('成功导入本地图片', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

export function loadScrambleCanvas(imgSrc) {
    if (!imgSrc) return;
    scrambleSourceImageBase64 = imgSrc;
    
    const canvas = document.getElementById('scrambleCanvas');
    const placeholder = document.getElementById('scramblePlaceholder');
    const downloadBtn = document.getElementById('downloadScrambleBtn');
    if (!canvas || !placeholder) return;
    
    const img = new Image();
    img.onload = function() {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
        }
        
        canvas.classList.remove('hidden');
        placeholder.classList.add('hidden');
        
        if (downloadBtn) {
            downloadBtn.classList.add('hidden');
        }
    };
    img.src = imgSrc;
}

export function setScrambleMode(isDecryptMode) {
    isScrambleDecryptMode = isDecryptMode;
    
    const encryptBtn = document.getElementById('scrambleModeEncrypt');
    const decryptBtn = document.getElementById('scrambleModeDecrypt');
    const actionBtn = document.getElementById('scrambleActionBtn');
    
    if (!encryptBtn || !decryptBtn || !actionBtn) return;
    
    if (isScrambleDecryptMode) {
        decryptBtn.className = "flex-1 text-center py-1.5 text-xs font-bold rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm transition-all";
        encryptBtn.className = "flex-1 text-center py-1.5 text-xs font-semibold rounded text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-all";
        actionBtn.innerText = "开始解密还原";
    } else {
        encryptBtn.className = "flex-1 text-center py-1.5 text-xs font-bold rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm transition-all";
        decryptBtn.className = "flex-1 text-center py-1.5 text-xs font-semibold rounded text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-all";
        actionBtn.innerText = "开始混淆加密";
    }
}

export function onScrambleAlgorithmChange() {
    const select = document.getElementById('scrambleAlgorithmSelect');
    const wrapper = document.getElementById('scrambleTileSizeWrapper');
    if (!select || !wrapper) return;
    
    if (select.value === 'tile') {
        wrapper.classList.remove('hidden');
    } else {
        wrapper.classList.add('hidden');
    }
}

export function toggleScramblePasswordInput() {
    const usePwCheckbox = document.getElementById('scrambleUsePassword');
    const wrapper = document.getElementById('scramblePasswordWrapper');
    if (!usePwCheckbox || !wrapper) return;
    
    if (usePwCheckbox.checked) {
        wrapper.classList.remove('hidden');
    } else {
        wrapper.classList.add('hidden');
    }
}

export function executeScrambleProcess() {
    if (!scrambleSourceImageBase64) {
        if (window.showToast) window.showToast('请先选择或上传一张图片', 'warning');
        return;
    }
    
    const canvas = document.getElementById('scrambleCanvas');
    if (!canvas) return;
    
    const algoSelect = document.getElementById('scrambleAlgorithmSelect');
    const algo = algoSelect ? algoSelect.value : 'tile';
    
    const usePwCheckbox = document.getElementById('scrambleUsePassword');
    const usePw = usePwCheckbox ? usePwCheckbox.checked : false;
    
    let key = "default_free_scramble_key_2026";
    if (usePw) {
        const pwInput = document.getElementById('scramblePasswordInput');
        key = pwInput ? pwInput.value.trim() : "";
        if (!key) {
            if (window.showToast) window.showToast('启用了密码保护，请输入密码', 'warning');
            return;
        }
    }
    
    let tileSize = 32;
    if (algo === 'tile') {
        const sizeSelect = document.getElementById('scrambleTileSizeSelect');
        tileSize = sizeSelect ? parseInt(sizeSelect.value, 10) : 32;
    }
    
    const actionBtn = document.getElementById('scrambleActionBtn');
    const origText = actionBtn ? actionBtn.innerText : '';
    if (actionBtn) {
        actionBtn.innerText = isScrambleDecryptMode ? "正在还原..." : "正在加密...";
        actionBtn.disabled = true;
    }
    
    const img = new Image();
    img.onload = function() {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            if (actionBtn) {
                actionBtn.innerText = origText;
                actionBtn.disabled = false;
            }
            return;
        }
        ctx.drawImage(img, 0, 0);
        
        try {
            processImageScrambler(canvas, algo, key, isScrambleDecryptMode, { tileSize });
            
            if (window.showToast) {
                window.showToast(isScrambleDecryptMode ? '解密还原处理完成' : '加密混淆处理完成', 'success');
            }
            
            const downloadBtn = document.getElementById('downloadScrambleBtn');
            if (downloadBtn) {
                downloadBtn.classList.remove('hidden');
            }
        } catch (e) {
            console.error('处理图像失败:', e);
            if (window.showToast) window.showToast('图像处理失败: ' + e.message, 'error');
        } finally {
            if (actionBtn) {
                actionBtn.innerText = origText;
                actionBtn.disabled = false;
            }
        }
    };
    img.onerror = function() {
        if (window.showToast) window.showToast('加载原始图片失败', 'error');
        if (actionBtn) {
            actionBtn.innerText = origText;
            actionBtn.disabled = false;
        }
    };
    img.src = scrambleSourceImageBase64;
}

export function downloadScrambleResult() {
    const canvas = document.getElementById('scrambleCanvas');
    if (!canvas) return;
    
    try {
        const dataUrl = canvas.toDataURL('image/png');
        const filename = `scrambled_${isScrambleDecryptMode ? 'decrypted' : 'encrypted'}_${Date.now()}.png`;
        if (window.triggerDownload) {
            window.triggerDownload(dataUrl, filename);
            if (window.showToast) window.showToast('图片下载已触发', 'success');
        } else {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = filename;
            a.click();
        }
    } catch (e) {
        console.error('图片下载失败:', e);
        if (window.showToast) window.showToast('图片下载失败: ' + e.message, 'error');
    }
}

export function loadMetadataImage(imgSrc) {
    if (!imgSrc) return;
    
    const placeholder = document.getElementById('metadataPlaceholder');
    const resultSection = document.getElementById('metadataResultSection');
    const resultContent = document.getElementById('metadataResultContent');
    const applyBtn = document.getElementById('applyMetadataBtn');
    
    if (!placeholder || !resultSection || !resultContent) return;
    
    try {
        let arrayBuffer;
        if (imgSrc.startsWith('data:')) {
            const parts = imgSrc.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const binary = atob(parts[1]);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            arrayBuffer = array.buffer;
        } else {
            throw new Error("只能解析本地上传或生图历史的图片数据");
        }
        
        const metadata = extractMetadata(arrayBuffer);
        
        if (!metadata || Object.keys(metadata).length === 0) {
            if (window.showToast) window.showToast('该图片中没有找到任何元数据', 'warning');
            parsedMetadata = null;
            resultSection.classList.add('hidden');
            placeholder.classList.remove('hidden');
            return;
        }
        
        parsedMetadata = metadata;
        placeholder.classList.add('hidden');
        resultSection.classList.remove('hidden');
        
        resultContent.innerHTML = '';
        
        let hasNaiParams = false;
        let prompt = "";
        let negative = "";
        let steps = "";
        let scale = "";
        let seed = "";
        let sampler = "";
        
        if (metadata.Description) {
            prompt = metadata.Description;
            hasNaiParams = true;
        }
        
        if (metadata.Comment) {
            try {
                const commentObj = JSON.parse(metadata.Comment);
                if (commentObj.steps) steps = commentObj.steps;
                if (commentObj.scale) scale = commentObj.scale;
                if (commentObj.seed) seed = commentObj.seed;
                if (commentObj.sampler) sampler = commentObj.sampler;
                if (commentObj.uc) negative = commentObj.uc;
                hasNaiParams = true;
            } catch (e) {
                console.warn('解析 Comment 失败:', e);
            }
        }
        
        const renderItem = (label, value) => {
            const div = document.createElement('div');
            div.className = 'space-y-1 bg-white/50 dark:bg-slate-900/30 p-3 rounded-xl border border-gray-100 dark:border-slate-800/60';
            
            const lbl = document.createElement('div');
            lbl.className = 'text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest';
            lbl.textContent = label;
            
            const val = document.createElement('pre');
            val.className = 'text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all';
            val.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
            
            div.appendChild(lbl);
            div.appendChild(val);
            resultContent.appendChild(div);
        };
        
        if (prompt) renderItem('提示词 (Prompt)', prompt);
        if (negative) renderItem('负面提示词 (Negative Prompt / UC)', negative);
        
        const paramsGrid = [];
        if (steps) paramsGrid.push({ label: '步数 (Steps)', value: steps });
        if (scale) paramsGrid.push({ label: 'CFG Scale', value: scale });
        if (seed) paramsGrid.push({ label: '随机种子 (Seed)', value: seed });
        if (sampler) paramsGrid.push({ label: '采样器 (Sampler)', value: sampler });
        
        if (paramsGrid.length > 0) {
            const gridDiv = document.createElement('div');
            gridDiv.className = 'grid grid-cols-2 gap-3';
            paramsGrid.forEach(param => {
                const div = document.createElement('div');
                div.className = 'bg-white/50 dark:bg-slate-900/30 p-3 rounded-xl border border-gray-100 dark:border-slate-800/60';
                
                const lbl = document.createElement('div');
                lbl.className = 'text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest';
                lbl.textContent = param.label;
                
                const val = document.createElement('div');
                val.className = 'text-xs font-bold text-gray-700 dark:text-gray-250';
                val.textContent = param.value;
                
                div.appendChild(lbl);
                div.appendChild(val);
                gridDiv.appendChild(div);
            });
            resultContent.appendChild(gridDiv);
        }
        
        Object.keys(metadata).forEach(key => {
            if (key !== 'Description' && key !== 'Comment') {
                renderItem(key, metadata[key]);
            }
        });
        
        if (applyBtn) {
            if (hasNaiParams) {
                applyBtn.classList.remove('hidden');
            } else {
                applyBtn.classList.add('hidden');
            }
        }
        
    } catch (e) {
        console.error('分析图片元数据失败:', e);
        if (window.showToast) window.showToast('元数据分析失败: ' + e.message, 'error');
        parsedMetadata = null;
        resultSection.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

export function applyMetadataParameters() {
    if (!parsedMetadata) {
        if (window.showToast) window.showToast('无可用参数可应用', 'warning');
        return;
    }
    
    try {
        let appliedCount = 0;
        
        if (parsedMetadata.Description) {
            const promptInput = document.getElementById('prompt');
            if (promptInput) {
                promptInput.value = parsedMetadata.Description;
                promptInput.dispatchEvent(new Event('input', { bubbles: true }));
                appliedCount++;
            }
        }
        
        if (parsedMetadata.Comment) {
            const commentObj = JSON.parse(parsedMetadata.Comment);
            
            if (commentObj.uc) {
                const negInput = document.getElementById('negativePrompt');
                if (negInput) {
                    negInput.value = commentObj.uc;
                    negInput.dispatchEvent(new Event('input', { bubbles: true }));
                    appliedCount++;
                }
            }
            
            if (commentObj.steps) {
                const stepsInput = document.getElementById('steps');
                if (stepsInput) {
                    stepsInput.value = commentObj.steps;
                    stepsInput.dispatchEvent(new Event('input', { bubbles: true }));
                    appliedCount++;
                }
            }
            
            if (commentObj.scale) {
                const scaleInput = document.getElementById('scale');
                if (scaleInput) {
                    scaleInput.value = commentObj.scale;
                    scaleInput.dispatchEvent(new Event('input', { bubbles: true }));
                    appliedCount++;
                }
            }
            
            if (commentObj.seed) {
                const seedInput = document.getElementById('seed');
                if (seedInput) {
                    seedInput.value = commentObj.seed;
                    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
                    appliedCount++;
                }
            }
            
            if (commentObj.sampler) {
                const samplerInput = document.getElementById('sampler');
                if (samplerInput) {
                    samplerInput.value = commentObj.sampler;
                    samplerInput.dispatchEvent(new Event('input', { bubbles: true }));
                    samplerInput.dispatchEvent(new Event('change', { bubbles: true }));
                    appliedCount++;
                }
            }
        }
        
        if (appliedCount > 0) {
            if (window.showToast) window.showToast(`成功应用了 ${appliedCount} 个生成参数！`, 'success');
            closeToolboxModal();
        } else {
            if (window.showToast) window.showToast('未找到支持的参数以应用', 'warning');
        }
    } catch (e) {
        console.error('应用参数失败:', e);
        if (window.showToast) window.showToast('应用参数失败: ' + e.message, 'error');
    }
}

export async function toggleMetadataHistoryList() {
    const wrapper = document.getElementById('metadataHistoryListWrapper');
    if (!wrapper) return;
    
    isMetadataHistoryListOpen = !isMetadataHistoryListOpen;
    if (isMetadataHistoryListOpen) {
        wrapper.classList.remove('hidden');
        const container = document.getElementById('metadataHistoryThumbnails');
        if (!container) return;
        
        container.innerHTML = '<div class="text-[10px] text-gray-400 text-center w-full py-4">正在载入生图历史...</div>';
        
        try {
            if (!store) {
                container.innerHTML = '<div class="text-[10px] text-rose-500 text-center w-full py-4">存储未初始化</div>';
                return;
            }
            const images = await store.getImagesPage(0, 50);
            if (!images || images.length === 0) {
                container.innerHTML = '<div class="text-[10px] text-gray-400 text-center w-full py-4">无历史生成图片</div>';
                return;
            }
            
            container.innerHTML = '';
            images.forEach(item => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'relative w-12 h-12 rounded-lg overflow-hidden cursor-pointer border border-transparent hover:border-indigo-500 transition-all shrink-0 bg-slate-900/10 dark:bg-slate-900/50';
                imgContainer.onclick = () => selectMetadataHistoryImage(item.image);
                
                const img = document.createElement('img');
                img.src = item.image;
                img.className = 'w-full h-full object-cover';
                imgContainer.appendChild(img);
                container.appendChild(imgContainer);
            });
        } catch (e) {
            console.error('加载生图历史失败:', e);
            container.innerHTML = '<div class="text-[10px] text-rose-500 text-center w-full py-4">加载失败</div>';
        }
    } else {
        wrapper.classList.add('hidden');
    }
}

export function selectMetadataHistoryImage(imageSrc) {
    if (!imageSrc) return;
    loadMetadataImage(imageSrc);
    if (window.showToast) window.showToast('成功导入生图历史图片', 'success');
}

export function handleMetadataFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        loadMetadataImage(e.target.result);
        if (window.showToast) window.showToast('成功导入本地图片', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}
