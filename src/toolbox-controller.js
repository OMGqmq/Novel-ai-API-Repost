/**
 * Advanced Toolbox Controller Module
 * Handles UI interactions, modal states, and scrambling workflow.
 */
import { processImageScrambler } from './image-scrambler.js?v=20260620';

let store = null;
let scrambleSourceImageBase64 = null;
let isScrambleDecryptMode = false;
let isHistoryListOpen = false;

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
            btn.classList.add('bg-gray-100', 'dark:bg-slate-800', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            btn.classList.remove('text-gray-500', 'dark:text-gray-400');
        } else {
            btn.classList.remove('bg-gray-100', 'dark:bg-slate-800', 'text-gray-900', 'dark:text-white', 'shadow-sm');
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
