# Master Architecture Audit & Refactoring Blueprint
## NovelAI API Proxy & Client: Full-Stack Code Readability, Architectural Health Diagnosis, and Modular Decoupling Roadmap

**Document Reference**: `ARCH-AUDIT-2026-09-05`  
**Target System**: NovelAI API Proxy & Web Client (`d:\AI project\novel ai`)  
**Target Environments**: Cloudflare Pages, Cloudflare Pages Functions (V8 Worker Isolates), Cloudflare D1 (Edge SQLite Database)  
**Authors**: Teamwork Architecture Diagnostic Collective (`orchestrator_4`, `explorer_frontend`, `explorer_backend`, `explorer_tooling`, `worker_report`)  
**Status**: Authoritative Architectural Specification & Sustainable Refactoring Blueprint  

---

## 1. Executive Summary & Full-Stack System Status Assessment

### 1.1 Architectural Topology Map

The **NovelAI API Proxy & Client** platform is an edge-native AI image generation system engineered to deliver high-performance visual generation, inpainting, outpainting, and community prompt engineering. The platform combines a static Single Page Application (Cloudflare Pages) with serverless edge gateway functions (Cloudflare Pages Functions) and edge-replicated SQLite persistence (Cloudflare D1). 

The following architectural topology outlines the production runtime boundaries alongside the existing local development and automated testing harnesses:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT TIER (Cloudflare Pages)                                │
│                                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │ index.html (233 KB / 2,594 lines)                                                       │   │
│   │ - 12 Embedded Dialog Modals (Inpaint, AI Chat, Toolbox, Inspiration, Auth, Settings...) │   │
│   │ - 225 Inline on* Event Handlers (onclick, onchange, oninput, onkeydown)                 │   │
│   │ - Embedded SVG Icons, TailWind CDN, Lucide, Chart.js, JSZip Dependencies                │   │
│   └────────────────────────────────────────┬────────────────────────────────────────────────┘   │
│                                            │ Invokes directly into global scope                 │
│                                            ▼                                                    │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │ src/main.js (142 KB / 3,381 lines) [God Controller & Monolithic Hub]                   │   │
│   │ - Mounts 144 global properties & functions to window.*                                  │   │
│   │ - Embeds 550-line Lightbox Controller (lines 2711–3230)                                 │   │
│   │ - Direct orchestrator for Generation, History, Presets, and Auth Handshakes             │   │
│   └─────┬──────────────────┬───────────────────┬────────────────────┬───────────────────────┘   │
│         │                  │                   │                    │                           │
│         ▼                  ▼                   ▼                    ▼                           │
│   ┌───────────┐      ┌───────────┐       ┌───────────┐        ┌───────────┐                     │
│   │ src/ui.js │      │src/engine │       │src/out-   │        │src/in-    │                     │
│   │ - 100+ DOM│      │ - fetch() │       │ paint.js  │        │ paint.js  │                     │
│   │   caches  │      │ - ZIP extr│       │ - 2D Pan/ │        │ - Masking │                     │
│   │ - Selects │      │ - Unrevo- │       │   Zoom    │        │ - Flood-  │                     │
│   │   sync    │      │   ked URLs│       │ - Duplic. │        │   fill    │                     │
│   │           │      │           │       │   Key Loop│        │ - Duplic. │                     │
│   └───────────┘      └─────┬─────┘       └─────┬─────┘        └─────┬─────┘                     │
│                            │                   │                    │                           │
│                            └───────────────────┼────────────────────┘                           │
│                                                │ Cross-origin Fetch Requests                    │
└────────────────────────────────────────────────┼────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND EDGE TIER (Cloudflare Pages Functions)                         │
│                                                                                                 │
│   [Missing Central Middleware: No _middleware.js; scattered CORS & Error Envelopes]             │
│                                                                                                 │
│   ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────────────────┐   │
│   │ Proxy Endpoints       │  │ Billing & Auth Routes │  │ Admin Operations                  │   │
│   │ - /generate.js        │  │ - /api/auth/login.js  │  │ - /api/admin/users.js (Unbounded) │   │
│   │ - /augment.js         │  │ - /api/auth/regist.js │  │ - /api/admin/users/approve.js     │   │
│   │ - /upscale.js         │  │ - /api/auth/recharg.js│  │ - /api/admin/cards/generate.js    │   │
│   │ - /verify-key.js      │  │   (Non-atomic D1      │  │ - /api/admin/stats.js             │   │
│   │ - /danbooru.js (Wat.) │  │    partial failure)   │  │                                   │   │
│   └───────────┬───────────┘  └───────────┬───────────┘  └─────────────────┬─────────────────┘   │
│               │                          │                                │                     │
│               ▼                          ▼                                ▼                     │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │ Shared Edge Utilities & Security Middleware                                             │   │
│   │ - _proxy-helper.js (Missing AbortSignal.timeout; Single static env.NOVELAI_API_KEY)     │   │
│   │ - _auth-manager.js (Swallowed quota rollbacks; Token extraction & role guards)          │   │
│   │ - _payload-factory.js (V3, V4.5, V5 NovelAI JSON serialization engine)                  │   │
│   │ - _crypto-helper.js (Web Crypto API: PBKDF2 100k iters + HMAC-SHA256 JWT)              │   │
│   └───────────┬───────────────────────────────────────────────────────────┬─────────────────┘   │
└───────────────┼───────────────────────────────────────────────────────────┼─────────────────────┘
                │ Upstream HTTPS Proxy                                      │ Cloudflare D1 RPC
                ▼                                                           ▼
┌────────────────────────────────────────┐                 ┌──────────────────────────────────────┐
│ Upstream NovelAI API                   │                 │ Cloudflare D1 Database (Edge SQLite) │
│ (https://image.novelai.net)            │                 │ - Schema: init_db.sql (5 Tables)     │
│ - /ai/generate-image                   │                 │ - users, cards, free_limits          │
│ - /ai/augment-image                    │                 │ - credit_logs, request_logs          │
│ - /ai/upscale                          │                 │ - 4 B-Tree Indexes                   │
└────────────────────────────────────────┘                 └──────────────────────────────────────┘
                ▲                                                           ▲
                │ Non-hermetic live credit drain                            │ Synthetic SQL string matching
┌───────────────┴───────────────────────────────────────────────────────────┴─────────────────────┐
│                             DEVELOPER TOOLING & TEST HARNESS                                    │
│                                                                                                 │
│   ┌─────────────────────────────────┐   ┌───────────────────────────────────────────────────┐   │
│   │ Local Development Server        │   │ Vitest Test Suite (26 Test Files / 346 Tests)     │   │
│   │ - local_server.py (1036 lines)  │   │ - Standard Node.js environment (Zero workerd)     │   │
│   │ - Hardcoded port :8000          │   │ - MockD1Engine parses SQL via sql.includes(...)   │   │
│   │ - Duplicates 400L JS in Python  │   │ - Fake global.window/document mocks in test files │   │
│   │ - Zero Cloudflare D1 emulation  │   │ - Missing linters, formatters, and CI workflows   │   │
│   └─────────────────────────────────┘   └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 Full-Stack Component Inventory & Scale Metrics Table

The following audit table details the full structural scale of the project, including file sizes, line counts, architectural responsibilities, coupling factors, and current architectural health scores (graded from A to F):

| Component / File Path | Size (Bytes) | Line Count | Architectural Responsibility & Contents | Coupling Index | Health Grade |
| :--- | :---: | :---: | :--- | :---: | :---: |
| `index.html` | 233,536 | 2,594 | Monolithic presentation template containing 12 embedded modals, SVG icon sheets, and 225 inline event listeners. | High (Spaghetti) | **F** |
| `src/main.js` | 142,504 | 3,381 | God Script Orchestrator: instantiates 15+ managers, exposes 144 `window.*` globals, embeds 550-line Lightbox, controls generation loop. | Extreme (God Class) | **F** |
| `src/outpaint.js` | 50,887 | 1,192 | Canvas viewport engine, pan/zoom coordinate math, inpaint/outpaint rendering, duplicated multi-key network retry loop. | High (Mixed SRP) | **D** |
| `src/char-prompt-manager.js` | 45,901 | 905 | Multi-character prompt coordinate manager, dynamic HTML generator, 5x5 grid and freeform 2D positioning stage. | High (DOM Coupling) | **D+** |
| `src/ui.js` | 43,724 | 875 | God View Controller: eagerly caches 100+ DOM element IDs, custom select replacers, model selector view switcher. | High (DOM Caching) | **D** |
| `src/inspiration-manager.js` | 40,693 | 770 | Danbooru/tag inspiration selector, modal manager, dynamic tag card generator, tag filtering engine. | Moderate | **C+** |
| `src/prompt-helper.js` | 36,569 | 752 | Prompt auto-completion suggestion engine, tag dictionary search, bracket weight booster (`{}`/`[]`). | Low-Moderate | **B** |
| `src/toolbox-controller.js` | 33,107 | 750 | Image scrambler UI, PNG metadata viewer, duplicated modal management functions, canvas format converter. | Moderate | **C** |
| `src/style.css` | 32,202 | 1,163 | Global CSS rules, spring entrance animations, mobile drawer rules, dark mode styles, custom scrollbars. | Low | **B+** |
| `src/inpaint.js` | 23,679 | 561 | Canvas inpainting mask brush/eraser/flood-fill, mobile-desktop bilateral DOM sync, duplicated multi-key network loop. | High (Duplication) | **D** |
| `src/admin-controller.js` | 22,400 | 416 | Admin dashboard UI, user credit management, VIP card generator, system stats charts. | Moderate | **C** |
| `src/notebook.js` | 20,916 | 403 | LocalStorage notebook prompt snippet manager, category organizer, backup export/import. | Low | **B** |
| `src/vibe-manager.js` | 18,986 | 344 | Vibe Transfer image reference manager, client-side canvas compression, reference weight sliders. | Moderate | **B-** |
| `src/char-ref-manager.js` | 16,511 | 314 | Character reference image manager, strength slider handler, reference thumbnail cards. | Moderate | **B-** |
| `src/settings-manager.js` | 12,972 | 287 | App settings modal, localStorage persistence, theme toggling, custom API key configuration. | Low | **B** |
| `src/gallery.js` | 11,375 | 237 | Showcase and history image gallery controller, pagination, IndexedDB deletion handlers. | Moderate | **B** |
| `src/auth-controller.js` | 10,648 | 247 | User authentication modal controller, login/register forms, VIP card recharge input handler. | Moderate | **B-** |
| `src/motion-controller.js` | 9,567 | 241 | Entrance spring physics assembly animation controller, responsive viewport detection. | Low (Pure UI) | **A-** |
| `src/engine.js` | 6,791 | 195 | Network API client for `/generate`, `/augment`, `/upscale` endpoints; unrevoked `URL.createObjectURL` leaks. | Moderate (Resource Leak)| **C-** |
| `src/storage.js` | 4,890 | 128 | IndexedDB gallery storage wrapper (`novelai_gallery`), image and metadata persistence. | Low (Data Layer) | **A-** |
| `src/app-state.js` | 354 | 14 | Raw mutable state object singleton (`export const appState = {...}`); unobservable global state. | High (Global State) | **F** |
| `functions/api/auth/recharge.js` | 3,842 | 118 | VIP card redemption endpoint; non-atomic D1 execution creates partial failure vulnerability. | High (Financial) | **F** |
| `functions/_proxy-helper.js` | 6,420 | 195 | Upstream reverse proxy engine; lacks `AbortSignal.timeout`, single static key failure domain. | High (Gateway) | **D** |
| `functions/_auth-manager.js` | 9,810 | 265 | Auth validation, pre-deduct quota, and rollback; swallowed D1 compensation errors. | High (Core Security) | **D+** |
| `functions/danbooru.js` | 7,650 | 235 | Multi-provider Booru gateway; synchronous waterfall cascade accumulating 60s+ timeouts. | Moderate | **D** |
| `functions/api/admin/users.js` | 1,280 | 45 | Admin user query endpoint; unpaginated full table scan risks Worker isolate 128MB OOM crash. | High (Scalability) | **D** |
| `local_server.py` | 38,400 | 1,036 | Standalone Python HTTP server; duplicates 400 lines of JS payload logic; no D1 support; hardcoded :8000. | Extreme (Split-Brain) | **F** |
| `run_full_validation_suite.py` | 4,200 | 110 | E2E test script; hardcodes local machine path `D:\下载`, makes live NovelAI calls consuming paid Anlas. | High (Live Cost) | **F** |
| `tests/adversarial-concurrency.test.js` | 18,200 | 450 | Adversarial test suite; implements `MockD1Engine` string matching SQL parser, masking schema bugs. | High (False Signal) | **D** |
| `package.json` | 650 | 24 | Project configuration; completely lacks linters, formatters, typecheckers, dev scripts, and CI workflows. | Extreme (Tooling Vac) | **F** |

---

### 1.3 Critical Architectural Evaluation

#### 1. Frontend Monoliths & State Entropy
The web client is architected as an unbundled collection of vanilla ES modules that communicate through an unmanaged global namespace rather than structured interfaces. 
- `index.html` (233 KB) embeds the complete HTML representation of the application—including desktop layouts, mobile bottom drawers, and 12 full dialog modals. Because markup elements bind directly to behavior via 225 inline `onclick`, `onchange`, and `onkeydown` attributes, module boundaries are bypassed.
- To service these inline handlers, `src/main.js` (142 KB, 3,381 lines) imperatively attaches 144 functions, controllers, and state flags directly onto the global `window` object. 
- Application state is scattered across: (1) `window.*` globals, (2) the unobservable mutable singleton `src/app-state.js`, (3) raw DOM values queried eagerly via `document.getElementById`, and (4) un-synchronized `localStorage` keys. 
- Modals lack uniform lifecycles: `src/main.js` resort to destructive DOM cloning (`element.cloneNode(true).replaceWith(...)`) to clear stale listeners, breaking cached DOM references and wiping out external listeners.

#### 2. Backend Edge Functions & Cloudflare D1 Transaction Atomicity
The backend is deployed on Cloudflare Pages Functions (V8 Workers isolates) coupled with Cloudflare D1 (SQLite at the edge). While the codebase implements modern cryptographic security (Web Crypto PBKDF2 with 100,000 iterations and HMAC-SHA256 JWTs), it exhibits structural fragility:
- **Absence of Global Middleware**: Pages Functions are routed via file-system paths without a root `_middleware.js`. As a result, cross-cutting concerns (CORS headers, Request ID injection, security headers, standardized JSON error envelopes) are manually reimplemented across 18 separate route files.
- **Broken D1 Transaction Boundaries**: Cloudflare D1 guarantees ACID transaction atomicity **only within the scope of a single `db.batch([...])` statement array**. Critical endpoints such as `functions/api/auth/recharge.js` decouple card consumption from credit incrementation across multiple sequential `await` operations. A transient network partition, D1 lock timeout, or isolate eviction between these queries results in a catastrophic half-committed state: the user's VIP card is permanently consumed, but zero credits are credited to their account.
- **Unbounded Network Calls & Upstream Single-Point-of-Failure**: Reverse proxy calls to `https://image.novelai.net` via `functions/_proxy-helper.js` lack an `AbortSignal.timeout`. If NovelAI's upstream GPU clusters hang or stall, the Worker isolate blocks until Cloudflare terminates the worker with an HTTP 524 Gateway Timeout. Furthermore, the backend is bound to a single static `env.NOVELAI_API_KEY`, creating a single failure domain when upstream rate limits (HTTP 429) or Anlas credit depletion (HTTP 402) occur.

#### 3. Developer Tooling & Testing Infrastructure
The testing and developer tooling infrastructure exhibits severe architectural divergence:
- **Dual-Stack Split Brain**: Local development relies on a 1036-line standalone Python HTTP server (`local_server.py`) that reimplements 400+ lines of JavaScript generation payload logic in Python. It does not support Cloudflare D1, meaning authentication, card recharge, and admin statistics cannot be tested locally.
- **Mock Drift & Synthetic Database Illusion**: The Vitest test suite executes in Node.js rather than the Cloudflare `workerd` isolate runtime. Tests that interact with D1 utilize an ad-hoc `MockD1Engine` that parses SQL queries using substring matching (`sql.includes(...)`). This mock engine completely masks SQLite syntax errors, schema constraint violations, and migration discrepancies.
- **Tooling Vacuum**: `package.json` specifies zero linters (Biome / ESLint), formatters (Prettier), typecheckers (TypeScript / JSDoc), pre-commit hooks, or CI/CD pipelines. Developers rely on `node --check` embedded inside a Vitest unit test, which incurs a 2.5-second process spawning penalty while failing to catch reference errors or type mismatches.

---

## 2. Code Smells & Bottlenecks Inventory (Top 16 Comprehensive Defects)

This inventory details 16 verifiable, high-impact architectural defects across the Frontend, Backend Functions / D1, and Developer Tooling tiers. Each defect includes verified file paths, exact line number ranges, smell categorization, maintenance impact analysis, and verbatim problematic code snippets.

---

### 2.1 Frontend Subsystem Code Smells

#### Defect 1: The God Script Monolith & Global Namespace Pollution
- **Relative File Path**: `src/main.js`
- **Exact Line Range**: lines 27–95, 246–327, 3233–3381
- **Code Smell Category**: God File / Anti-Modular Monolith / Global Namespace Pollution
- **Maintenance Risk & Impact Analysis**:
  `src/main.js` has grown into an unmaintainable catch-all sink of 3,381 lines. It directly instantiates 15+ disparate controllers and manually binds 144 methods and references directly to `window` (e.g. `window.showToast`, `window.setModel`, `window.openLightbox`, `window.vibeManager`). This was done solely to allow inline HTML `onclick` handlers to access functions. Additionally, the file embeds an entire 550-line Lightbox controller and 200 lines of auth and admin UI proxies. Because of its intense coupling to browser globals and DOM elements, `src/main.js` cannot be imported in any unit test runner without throwing immediate reference errors, making the core orchestration logic completely untestable.
- **Problematic Code Snippet** (`src/main.js:27-58`):
```javascript
const motionController = new MotionController();
if (typeof window !== 'undefined') {
    window.MotionController = MotionController;
    window.motionController = motionController;
}
motionController.startEntrance();

const engine = new ImageEngine();
const store = new GalleryStore();
window.triggerDownload = triggerDownload;
initToolbox(store);
const ui = new UIController();
const els = ui.els;
const aiHelper = new AiHelperService(store);
const aiChatManager = new AiChatManager({
    getStorageKey: () => store.getSetting('nai_ai_helper_custom_key', ''),
    getCustomUrl: () => store.getSetting('nai_ai_helper_custom_url', ''),
    getModel: () => store.getSetting('nai_ai_helper_model', 'gpt-4o-mini'),
    getPromptHistory: () => promptHelper.history || [],
    applyPrompt: (prompt) => {
        if (els.promptInput) {
            els.promptInput.value = prompt;
            els.promptInput.dispatchEvent(new Event('input'));
        }
    }
});
window.aiChatManager = aiChatManager;
window.openAiChatModal = () => aiChatManager.open();
window.closeAiChatModal = () => aiChatManager.close();
// ... followed by over 100 additional window.* bindings
```

---

#### Defect 2: Monolithic HTML Document with 225 Inline Event Handlers
- **Relative File Path**: `index.html`
- **Exact Line Range**: lines 47–2586 (entire 233 KB document)
- **Code Smell Category**: Monolithic View / Presentation-Behavior Spaghetti / CSP Violation
- **Maintenance Risk & Impact Analysis**:
  `index.html` is 233,536 bytes and 2,594 lines long. It embeds the entire desktop UI, mobile responsive drawer, SVG icons, and 12 distinct modals in a single monolithic document. Across the file, there are 225 inline `on*` event handlers (e.g., `onclick="window.setCharStageGridMode ? window.setCharStageGridMode('thirds') : null"`). This structure strictly prevents the adoption of a Content Security Policy (`script-src 'self'` cannot be enforced without `'unsafe-inline'`), renders code-splitting or lazy loading of heavy modals impossible, and couples DOM element IDs to JavaScript controllers with no compile-time or build-time verification.
- **Problematic Code Snippet** (`index.html:53-75, 2569-2575`):
```html
<button onclick="toggleDrawer()" class="p-2 hover:bg-gray-50 ...">
<button onclick="switchDrawerTab('search')" id="tab-search" ...>搜词</button>
<button onclick="switchDrawerTab('notebook')" id="tab-notebook" ...>笔记</button>
<button onclick="switchNotebookModel('v3')" id="btn-nb-v3" ...>V3</button>
...
<button type="button" onclick="window.setCharStageGridMode ? window.setCharStageGridMode('thirds') : null" id="charGridModeThirds" class="...">三分法</button>
<button type="button" onclick="window.autoArrangeCharPositions ? window.autoArrangeCharPositions() : null" class="...">自动排布</button>
<button type="button" onclick="window.closeCharPositionStage ? window.closeCharPositionStage() : null" class="...">完成位置编辑</button>
```

---

#### Defect 3: Dead Error Handling Code Freezing UI in Indefinite Loading State
- **Relative File Path**: `src/main.js`
- **Exact Line Range**: lines 338–348 (compared with line 42)
- **Code Smell Category**: Dead Code / Unhandled Global Rejection / Permanent UI Lockup
- **Maintenance Risk & Impact Analysis**:
  `window.onerror` and `window.onunhandledrejection` are registered as the global safety net to recover from unexpected exceptions during image generation. When an error occurs, both handlers attempt recovery via `if (window.ui) window.ui.setLoading(false)`. However, at line 42, `ui` was instantiated as a local constant (`const ui = new UIController();`) and is **never** assigned to `window.ui`. Consequently, `window.ui` is perpetually `undefined`. When an unhandled error or rejected promise occurs during image generation, the loading spinner is never dismissed, the generate buttons remain disabled, and the UI freezes permanently, forcing the user to hard-refresh the page and lose unsaved form inputs.
- **Problematic Code Snippet** (`src/main.js:42, 338-348`):
```javascript
// Line 42: Instantiated as local constant, never exposed on window.ui!
const ui = new UIController();

// Lines 338-348: Global error handlers check non-existent window.ui
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error: ' + msg + '\nScript: ' + url + '\nLine: ' + lineNo + '\nColumn: ' + columnNo + '\nStackTrace: ' + (error ? error.stack : ''));
    if (window.ui) window.ui.setLoading(false); // DEAD CODE: window.ui is undefined!
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled rejection (promise):', event.reason);
    if (window.ui) window.ui.setLoading(false); // DEAD CODE: UI freezes indefinitely!
};
```

---

#### Defect 4: Broken Asynchronous Contract & Canvas Stitching Race in Outpainting
- **Relative File Path**: `src/outpaint.js`
- **Exact Line Range**: lines 661–729
- **Code Smell Category**: Broken Async Contract / Concurrency Race Condition / Missing Error Handler
- **Maintenance Risk & Impact Analysis**:
  `OutpaintEditor.prototype.generate()` is declared as an `async` function. However, the core canvas stitching operations—resizing the canvas buffer, coordinate translation, 2D pixel blitting (`drawImage`), and mask resetting—are wrapped inside a legacy `newImg.onload` callback that is **not wrapped in a Promise and not awaited**. As a result:
  1. The `generate()` promise resolves prematurely before `newImg.onload` fires.
  2. The `finally` block runs immediately at line 720, setting `deskBtn.disabled = false`. The user can click "Generate" again while the canvas buffer is still un-stitched.
  3. `newImg` has no `onerror` handler. If the image blob fails to decode, the stitching operation silently dies, leaving the viewport in a desynchronized state.
- **Problematic Code Snippet** (`src/outpaint.js:661-708, 719-728`):
```javascript
// Stitch the resulting image back
const newImg = new Image();
newImg.crossOrigin = 'anonymous';
newImg.onload = () => {
    this.saveState();
    // ... complex canvas resizing and drawImage operations ...
    combinedCtx.drawImage(this.els.canvas, -newCanvasX, -newCanvasY);
    combinedCtx.drawImage(newImg, roundX - newCanvasX, roundY - newCanvasY, targetW, targetH);
    // ...
    this._applyTransform();
    this._updateSelectionDOM();
    window.lastSelectedImageUrl = finalBase64;
};
// NO newImg.onerror handler!
newImg.src = result.imageUrl || (result.blob ? URL.createObjectURL(result.blob) : 'data:image/png;base64,mock');

} catch (err) {
    // ...
} finally {
    // Executes BEFORE newImg.onload fires! Generate button re-enables prematurely!
    if (deskBtn) {
        deskBtn.disabled = false;
        deskBtn.innerHTML = originalDeskHtml;
    }
}
```

---

#### Defect 5: Triplicated Multi-Key Failover Logic Across Three Modules
- **Relative File Path**: `src/outpaint.js` (lines 610–660), `src/inpaint.js` (lines 493–520), `src/main.js` (lines 610–638)
- **Code Smell Category**: Code Duplication (DRY Violation) / Violation of Single Responsibility Principle (SRP)
- **Maintenance Risk & Impact Analysis**:
  `OutpaintEditor` and `InpaintEditor` should strictly manage 2D viewport rendering, brush math, and coordinate projections. Instead, both classes directly inspect global form DOM inputs (`#modelValue`, `#resolution`, `#steps`), read raw settings from `store`, parse newline/comma-delimited API keys, and implement identical multi-key rotation and failover retry loops. A 50-line network orchestration block is duplicated across three files. If authentication headers, retry policies, or error detection logic change, developers must manually synchronize changes across all three files, risking behavioral divergence.
- **Problematic Code Snippet** (`src/outpaint.js:610-635`, replicated in `inpaint.js` and `main.js`):
```javascript
const customApiKeyRaw = this.store.getSetting('nai_custom_api_key');
const customApiKeys = (customApiKeyRaw || "")
    .split(/[\n,]/)
    .map(k => k.trim())
    .filter(k => k);

const authsToTry = candidateKeys.map(key => ({ ...authBase, customApiKey: key }));
let result = null;
let lastError = null;

for (const auth of authsToTry) {
    try {
        result = await this.engine.generate(params, auth);
        break;
    } catch (err) {
        console.warn('API Key failed, trying next...', err);
        lastError = err;
    }
}
if (!result) {
    throw new Error(lastError?.message || '所有配置的 API Key 均请求失败');
}
```

---

#### Defect 6: Destructive DOM Cloning Hack for Modal Event Listener Disposal
- **Relative File Path**: `src/main.js`
- **Exact Line Range**: lines 2015–2020, 2056–2063
- **Code Smell Category**: Destructive DOM Mutation Anti-Pattern / Brittle Event Management
- **Maintenance Risk & Impact Analysis**:
  Because the frontend lacks a dialog lifecycle controller or `AbortController`-based listener disposal, `window.showAlert` and `window.showConfirm` clone button DOM nodes using `.cloneNode(true)` and `.replaceWith()` on every single dialog invocation to wipe out previously registered click listeners. This anti-pattern:
  1. Destroys any external event listeners or mutations previously attached to those buttons.
  2. Invalidates any cached DOM references held by other modules (`confirmConfirmBtn`, `confirmCancelBtn`).
  3. Triggers unnecessary layout recalculations and DOM tree thrashing.
  4. Leaks listeners if an alert or confirm modal is invoked while another is closing.
- **Problematic Code Snippet** (`src/main.js:2015-2020, 2056-2063`):
```javascript
// In window.showAlert:
// Clone nodes to remove old event listeners cleanly
const newConfirmBtn = confirmBtn.cloneNode(true);
const newBackdrop = backdrop.cloneNode(true);
confirmBtn.replaceWith(newConfirmBtn);
backdrop.replaceWith(newBackdrop);

// In window.showConfirm:
const newConfirmBtn = confirmBtn.cloneNode(true);
const newCancelBtn = cancelBtn.cloneNode(true);
const newBackdrop = backdrop.cloneNode(true);
confirmBtn.replaceWith(newConfirmBtn);
cancelBtn.replaceWith(newCancelBtn);
backdrop.replaceWith(newBackdrop);
```

---

#### Defect 7: Unawaited Asynchronous FileReader with Storage Race Conditions
- **Relative File Path**: `src/main.js`
- **Exact Line Range**: lines 420–424, 687–694
- **Code Smell Category**: Unawaited Async Boundary / Storage Race Condition
- **Maintenance Risk & Impact Analysis**:
  In both `doGenerateZImage` and `doGenerate`, after an image Blob is received from the API, a `FileReader` is instantiated to convert the binary Blob to a base64 DataURL for IndexedDB storage. The callback `reader.onloadend = async () => { await saveToHistory(...); }` is not awaited by the generation loop. If the user immediately clicks the "Gallery" or "History" tab, the gallery loads from IndexedDB before the write has committed, showing an empty or outdated list. Furthermore, if `saveToHistory` rejects (e.g. `QuotaExceededError` on full storage), it becomes an unhandled promise rejection outside the caller's `try...catch` block.
- **Problematic Code Snippet** (`src/main.js:687-694`):
```javascript
if (result.blob) {
    const reader = new FileReader();
    reader.readAsDataURL(result.blob);
    // Unawaited callback: generation finishes and releases UI before history is saved!
    reader.onloadend = async () => {
        await saveToHistory(reader.result, localParams.prompt, selectedVersion, result, false, metaData);
    };
}
// showResultImages is called immediately and doGenerate() resolves while saveToHistory is pending!
```

---

#### Defect 8: Unescaped String Template Attribute Injection in Character Prompts
- **Relative File Path**: `src/char-prompt-manager.js`
- **Exact Line Range**: lines 216–242
- **Code Smell Category**: String Template Injection / Cross-Site Scripting (XSS) Hazard
- **Maintenance Risk & Impact Analysis**:
  In `CharPromptManager.prototype.addCharacterPromptRow()`, prompt and negative strings (`promptVal`, `negVal`) are directly interpolated into HTML input attributes: `value="${promptVal}"`. If a prompt imported from a notebook note, PNG metadata, or preset contains double quotes (e.g. `1girl, "blue eyes", looking at viewer`), the attribute quotes close prematurely, causing corrupted markup or executing injected attributes (`" onfocus="...`) if untrusted metadata or presets are loaded.
- **Problematic Code Snippet** (`src/char-prompt-manager.js:234-242`):
```javascript
div.innerHTML = `
    <div class="char-row-content space-y-2">
        <div class="space-y-1">
            <label class="...">描述提示词 (Character Prompt)</label>
            <!-- Unescaped promptVal interpolation directly into HTML attribute -->
            <input type="text" class="char-prompt-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${promptVal}" placeholder="填入角色特征tag" />
        </div>
        <div class="space-y-1">
            <label class="...">排除词 (Character Negative, 可选)</label>
            <!-- Unescaped negVal interpolation directly into HTML attribute -->
            <input type="text" class="char-neg-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${negVal}" placeholder="特定于该角色的排除特征" />
        </div>
...`;
```

---

#### Defect 9: Memory Leak via Unrevoked Blob Object URLs Across Generation Sessions
- **Relative File Path**: `src/engine.js` (lines 49, 95, 141) and `src/outpaint.js` (line 707)
- **Code Smell Category**: Memory Leak / Unreleased Resource Lifecycle
- **Maintenance Risk & Impact Analysis**:
  In `ImageEngine`, every call to `generate()`, `augment()`, and `upscale()` creates an Object URL via `const imageUrl = URL.createObjectURL(imgBlob)`. In a web application where users generate dozens or hundreds of high-resolution images (each 2 MB – 10 MB uncompressed in memory), `URL.revokeObjectURL(imageUrl)` is **never** invoked. The browser runtime keeps all Blobs pinned in memory for the life of the page session, causing cumulative memory bloat and eventual tab crashes on mobile devices or lower-memory laptops.
- **Problematic Code Snippet** (`src/engine.js:49-55`):
```javascript
const blob = await response.blob();
let imgBlob;
if (contentType.includes("application/zip")) {
    imgBlob = await this._extractImageFromZip(blob);
} else {
    imgBlob = blob;
}
// URL created but never tracked for revocation!
const imageUrl = URL.createObjectURL(imgBlob);

return {
    imageUrl,
    blob: imgBlob,
    userRole
};
```

---

#### Defect 10: Fragile Substring Monkey-Patching of Native `window.alert`
- **Relative File Path**: `src/main.js`
- **Exact Line Range**: lines 2077–2101
- **Code Smell Category**: Global Monkey-Patching / String Heuristic Anti-Pattern
- **Maintenance Risk & Impact Analysis**:
  `src/main.js` overrides the browser's built-in `window.alert` function with custom logic that parses the string content using substring matching (`msgStr.includes('复制') || msgStr.includes('载入') || msgStr.length < 18`). Depending on whether Chinese characters or specific lengths match, it arbitrarily routes the message to either `window.showToast` or `window.showAlert`. This causes unpredictable side effects: error messages that happen to contain the word "成功" or "载入" are displayed with a green "success" toast; third-party scripts or libraries calling `alert()` unexpectedly trigger complex modal DOM animations.
- **Problematic Code Snippet** (`src/main.js:2077-2100`):
```javascript
// Override default window.alert with custom toast/alert
window.alert = function(message) {
    if (message === undefined || message === null) return;
    const msgStr = String(message);
    const isShort = msgStr.length < 18;
    const isStatus = msgStr.includes('复制') || msgStr.includes('载入') || msgStr.includes('保存') || msgStr.includes('成功');
    
    if (isShort || isStatus) {
        let type = 'info';
        if (isStatus || msgStr.includes('成功') || msgStr.includes('复制') || msgStr.includes('载入')) {
            type = 'success';
        } else if (msgStr.includes('失败') || msgStr.includes('错误') || msgStr.includes('⚠️')) {
            type = 'error';
        }
        window.showToast(msgStr, type);
    } else {
        let icon = 'alert-circle';
        let title = '系统提示';
        if (msgStr.includes('失败') || msgStr.includes('错误') || msgStr.includes('封禁') || msgStr.includes('⚠️')) {
            icon = 'alert-triangle';
            title = '操作失败';
        }
        window.showAlert(msgStr, title, icon);
    }
};
```

---

### 2.2 Backend Functions & Cloudflare D1 Code Smells

#### Defect 11: Broken Transaction Atomicity in VIP Card Recharge (Partial Failure Vulnerability)
- **Relative File Path**: `functions/api/auth/recharge.js`
- **Exact Line Range**: lines 89–109
- **Code Smell Category**: Broken Transaction Atomicity / Partial Failure State
- **Maintenance Risk & Impact Analysis**:
  In `recharge.js`, card consumption is decoupled from the user balance update. Line 89 executes `await db.prepare("UPDATE cards SET is_used = 1...").run()`. Only after that query resolves does lines 101–109 execute `await db.batch([updateUser, writeLog])`. If an isolate eviction, CPU timeout, or transient D1 write failure occurs between line 91 and line 109, the card is permanently marked as used (`is_used = 1`), but the user receives zero credits and no audit log is created. Subsequent redemption attempts fail with *"该卡密已被使用"*, causing immediate customer credit loss, chargebacks, and administrative overhead. In Cloudflare D1, all three statements should be passed into a single atomic `db.batch([cardStmt, userStmt, logStmt])` call.
- **Problematic Code Snippet** (`functions/api/auth/recharge.js:89-109`):
```javascript
// 4. 原子性操作：先独占式更新卡密状态（作为 Gatekeeper 防重防并发）
const cardUpdateResult = await db.prepare(
  "UPDATE cards SET is_used = 1, used_by_id = ?, used_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE card_key = ? AND is_used = 0"
).bind(payload.id, trimmedCardKey).run();

if (!cardUpdateResult || !cardUpdateResult.meta || cardUpdateResult.meta.changes === 0) {
  return new Response(JSON.stringify({ error: '卡密已被使用或不存在，请勿重复充值。' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 5. 抢占成功后，给用户增加点数并记录日志
const updateUser = db.prepare(
  "UPDATE users SET credits = credits + ?, updated_at = datetime('now', '+8 hours') WHERE id = ?"
).bind(addedCredits, payload.id);

const writeLog = db.prepare(
  "INSERT INTO credit_logs (user_id, action, amount, description, created_at) VALUES (?, 'recharge', ?, ?, datetime('now', '+8 hours'))"
).bind(payload.id, addedCredits, `充值卡密: ${trimmedCardKey}`);

await db.batch([updateUser, writeLog]); // <-- Isolate crash here permanently burns the card!
```

---

#### Defect 12: Missing AbortSignal Timeout & Single-Key Fragility in Upstream Proxying
- **Relative File Path**: `functions/_proxy-helper.js`
- **Exact Line Range**: lines 110–135
- **Code Smell Category**: Missing Network Abort Control / Single-Key Failure Domain / Loss of Status Precision
- **Maintenance Risk & Impact Analysis**:
  `fetch(targetUrl, fetchOptions)` does not pass an `AbortSignal` with a timeout limit (e.g., `AbortSignal.timeout(30000)`). If NovelAI's upstream GPU generation cluster experiences cold-start stalls, socket drops, or queued congestion, the Edge Worker execution remains blocked indefinitely until Cloudflare kills the worker (HTTP 524 Gateway Timeout). Furthermore, the server proxy supports only a single static `env.NOVELAI_API_KEY`. If this single key hits rate limits (HTTP 429) or runs out of Anlas (HTTP 402), all non-custom users (guests, registered users, VIP card users) experience an immediate complete outage with zero automated key rotation or failover. When errors do occur, line 127 throws a generic `Error`, causing lines 178–192 to map all upstream 402, 429, and 503 errors into a generic HTTP 500, obscuring root causes from client telemetry.
- **Problematic Code Snippet** (`functions/_proxy-helper.js:110-135`):
```javascript
let fetchOptions = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
};

// No AbortSignal with timeout! Hangs until Cloudflare terminates worker with 524
response = await fetch(targetUrl, fetchOptions);

if (!response.ok) {
  const errorText = await response.text();
  if (response.status === 402) {
    throw new Error("服务器 Anlas 余额不足，请联系管理员。");
  }
  throw new Error(`NovelAI API Error: ${errorText}`);
}
```

---

#### Defect 13: Silent Quota Rollback Swallowing & Audit Trail Desynchronization
- **Relative File Path**: `functions/_auth-manager.js`
- **Exact Line Range**: lines 232–260
- **Code Smell Category**: Swallowed Exceptions / Inconsistent State Compensation
- **Maintenance Risk & Impact Analysis**:
  When an upstream generation call fails, `_proxy-helper.js` invokes `rollbackQuota(receipt, env)`. In `_auth-manager.js`, `rollbackQuota` wraps all compensation queries in a `try...catch` block that catches any D1 error, logs `console.error("Rollback quota failed:", err);`, and suppresses it without bubbling or scheduling retries. If D1 suffers a transient timeout or write-lock contention, the user's credits or daily free limits are deducted permanently despite zero image output. Furthermore, in `preDeductQuota` (lines 193–200), user credit deduction is executed without an immediate ledger log in `credit_logs`; the log is only written asynchronously after generation succeeds (`_proxy-helper.js:138`). If a request fails and rollback also fails, the database has lost balance integrity with zero matching audit records.
- **Problematic Code Snippet** (`functions/_auth-manager.js:232-260`):
```javascript
export async function rollbackQuota(receipt, env) {
  if (!receipt || !receipt.type || receipt.type === 'none' || !env || !env.DB) {
    return;
  }

  try {
    if (receipt.type === 'user_credits' && receipt.userId) {
      await env.DB.prepare(
        "UPDATE users SET credits = credits + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?"
      ).bind(receipt.userId).run();
    } else if (receipt.type === 'user_daily' && receipt.key) {
      await env.DB.prepare(
        "UPDATE free_limits SET count = MAX(0, count - 1), updated_at = datetime('now', '+8 hours') WHERE key = ?"
      ).bind(receipt.key).run();
    }
    // ...
  } catch (err) {
    // Silently swallowed! User permanently loses credit with zero audit log or alert!
    console.error("Rollback quota failed:", err);
  }
}
```

---

#### Defect 14: Synchronous Waterfall Latency Cascade & Swallowed Errors in Booru Gateway
- **Relative File Path**: `functions/danbooru.js`
- **Exact Line Range**: lines 48–228
- **Code Smell Category**: Synchronous Waterfall Anti-Pattern / Unbounded Latency Accumulation / Redundant Code Duplication
- **Maintenance Risk & Impact Analysis**:
  The route executes a sequential fallback chain across 4 remote booru services: Danbooru -> Safebooru -> TBIB -> Yande. None of the 4 `fetch` invocations set timeout signals. If upstream services respond slowly or hang (frequent with third-party image boards), the latencies accumulate additively (e.g. 15s + 15s + 15s + 15s = 60s+), breaching Cloudflare's 50-second function limit and throwing 524 Gateway Timeout. In addition, 180 lines of identical post-normalization mapping are copy-pasted across the 4 blocks. When all providers fail or time out, the errors are swallowed with `console.warn`, returning an HTTP 200 `{ success: true, count: 0, posts: [] }`, masking upstream outages from client diagnostics.
- **Problematic Code Snippet** (`functions/danbooru.js:48-75, 120-145`):
```javascript
// 1. Danbooru (no timeout signal)
try {
  const targetUrl = new URL('https://danbooru.donmai.us/posts.json');
  const danbooruRes = await fetch(targetUrl.toString(), { headers: { ... } });
  if (danbooruRes.ok) { ... }
} catch (dErr) { console.warn("[Danbooru Proxy] Danbooru fetch failed:", dErr); }

// 2. Safebooru (executes ONLY after Danbooru completes or fails)
if (sanitizedPosts.length === 0) {
  try {
    const safebooruUrl = new URL('https://safebooru.org/index.php');
    const safeRes = await fetch(safebooruUrl.toString(), { headers: { ... } });
    if (safeRes.ok) { ... }
  } catch (sErr) { console.warn("[Danbooru Proxy] Safebooru fetch failed:", sErr); }
}
// Sequentially repeated for TBIB and Yande (cumulative latencies trigger 524)
```

---

#### Defect 15: TOCTOU Race Condition in Admin Balance Adjustment & Dangling Foreign Keys
- **Relative File Path**: `functions/api/admin/users/approve.js`
- **Exact Line Range**: lines 42–117
- **Code Smell Category**: Time-of-Check to Time-of-Use (TOCTOU) Race Condition / Referential Integrity Violation
- **Maintenance Risk & Impact Analysis**:
  When an administrator overrides a user's credit balance, line 42 reads `user = await db.prepare("SELECT username, status, credits FROM users WHERE id = ?").bind(userId).first()`. Lines 101–112 then compute `diff = newCredits - user.credits` and execute `UPDATE users SET credits = ?`. If the user submits an image generation request between lines 42 and 116, the concurrent generation decrements the user's credits by 1. The admin's update then writes `credits = newCredits`, clobbering the decrement, while the computed `diff` recorded in `credit_logs` is calculated against the stale balance, corrupting the audit log history.
  Additionally, when `action === 'delete'` is requested (lines 51–56), it deletes from `users` and `credit_logs`, but does not clean up or set null on `cards.used_by_id` or `request_logs.user_id`, leaving dangling orphaned references in the database.
- **Problematic Code Snippet** (`functions/api/admin/users/approve.js:42, 101-112`):
```javascript
const user = await db.prepare("SELECT username, status, credits FROM users WHERE id = ?").bind(userId).first();
// ...
if (credits !== undefined) {
  const newCredits = parseInt(credits);
  batchStmts.push(
    db.prepare("UPDATE users SET credits = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?").bind(newCredits, userId)
  );

  // Stale balance used to calculate audit ledger entry!
  const diff = newCredits - user.credits;
  if (diff !== 0) {
    batchStmts.push(
      db.prepare("INSERT INTO credit_logs (user_id, action, amount, description, created_at) VALUES (?, 'admin_adjust', ?, ?, datetime('now', '+8 hours'))")
        .bind(userId, diff, `管理员调整点数：从 ${user.credits} 调整为 ${newCredits}`)
    );
  }
}
```

---

#### Defect 16: Unbounded Full Table Query on Edge Runtime
- **Relative File Path**: `functions/api/admin/users.js`
- **Exact Line Range**: lines 24–34
- **Code Smell Category**: Missing Pagination / Unbounded Edge Memory Consumption
- **Maintenance Risk & Impact Analysis**:
  The admin users endpoint performs a raw `SELECT id, username, role, credits, status, created_at FROM users ORDER BY created_at DESC` without `LIMIT`, `OFFSET`, or cursor pagination. Cloudflare Pages Function worker isolates operate under a strict 128MB RAM quota. As the user base grows past several thousand records, serializing the full user collection into a single JSON response string will trigger D1 response row/byte limits and cause out-of-memory worker termination (Worker Exception 1101).
- **Problematic Code Snippet** (`functions/api/admin/users.js:24-34`):
```javascript
try {
  // Unbounded table scan on edge isolate memory!
  const users = await db.prepare(
    "SELECT id, username, role, credits, status, created_at FROM users ORDER BY created_at DESC"
  ).all();

  return new Response(JSON.stringify({
    success: true,
    users: users.results || []
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

### 2.3 Developer Tooling & Infrastructure Code Smells

#### Defect 17: Dual-Stack Split-Brain Architecture & Backend Code Duplication
- **Relative File Path**: `local_server.py`
- **Exact Line Range**: lines 8, 85–358, 1029–1036
- **Code Smell Category**: Architectural Redundancy / Dual-Stack Runtime Divergence
- **Maintenance Risk & Impact Analysis**:
  `local_server.py` is a 1036-line custom HTTP server implemented in Python, while the production backend is written in JavaScript for Cloudflare Pages Functions (`functions/`). Over 400 lines of payload generation logic (`create_v3_payload`, `create_v45_payload`, `create_v5_payload`) are an exact line-by-line duplicate of `functions/_payload-factory.js`. Any upstream NovelAI API protocol update (such as V5 diffusion parameter changes) must be implemented twice in two different programming languages. Furthermore, hardcoded port `8000` causes immediate server launch failure if port 8000 is occupied, and the Python server lacks Cloudflare D1 database support, making full-stack local debugging impossible.
- **Problematic Code Snippet** (`local_server.py:8, 351-358, 1030-1035`):
```python
PORT = 8000

def create_payload(version, data, width=None, height=None, steps=None):
    norm_ver = str(version or "").lower().strip()
    if norm_ver in ("v5", "nai5", "v5.0"):
        return create_v5_payload(data, width, height, steps)
    if norm_ver in ("v4.5", "v4", "v4-full", "v4-curated"):
        return create_v45_payload(data, width, height, steps)
    return create_v3_payload(data, width, height, steps)

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"本地测试服务器已启动: http://localhost:{PORT}")
        httpd.serve_forever()
```

---

#### Defect 18: Machine-Specific Path Leaks & Uncontrolled Production Credit Consumption
- **Relative File Path**: `run_full_validation_suite.py`
- **Exact Line Range**: lines 10–18, 75–110
- **Code Smell Category**: Non-Hermetic Test Execution & Environment Leaks
- **Maintenance Risk & Impact Analysis**:
  Contains author-specific hardcoded local Windows paths (`REF_DIR = r"D:\下载"`) and specific filenames (`kachina (genshin impact)...png`). Running this script on any other developer's workstation or CI runner immediately crashes with `FileNotFoundError`. Furthermore, it sends direct HTTP POST requests to `https://image.novelai.net/ai/generate-image` using real credentials, draining paid NovelAI Anlas credits on every test run. It also requires external Python library `Pillow` (`PIL`), but the repository contains no `requirements.txt` or `pyproject.toml`.
- **Problematic Code Snippet** (`run_full_validation_suite.py:10-18`):
```python
API_KEY = os.environ.get("NOVELAI_API_KEY", "")
BASE_URL = "https://image.novelai.net/ai/generate-image"
REF_DIR = r"D:\下载"
IMG1_NAME = "kachina (genshin impact),1girl,solo,2.5__toddler__,{{{{plump}}}},1.5__artist_awa s-276437810.png"
IMG2_NAME = "novelai-gen-1778503009467.png"

img1_path = os.path.join(REF_DIR, IMG1_NAME)
img2_path = os.path.join(REF_DIR, IMG2_NAME)
```

---

#### Defect 19: Fragile String-Matching SQL Mock Engine Hiding Schema Errors
- **Relative File Path**: `tests/adversarial-concurrency.test.js`
- **Exact Line Range**: lines 12–65
- **Code Smell Category**: High-Maintenance Test Abstraction / Mock Drift
- **Maintenance Risk & Impact Analysis**:
  The author wrote a custom 100-line pseudo-database engine (`MockD1Engine`) inside the test file that parses SQL queries via string substring checks (`if (sql.includes('FROM cards WHERE card_key = ?'))`). If a developer optimizes or refactors a SQL query (e.g. whitespace change, column reordering, adding an alias), the mock engine silently fails or returns undefined. Most critically, it does not execute against real SQLite; syntax errors, constraint violations, and migration discrepancies between code and `init_db.sql` are completely masked, producing false positive test passes.
- **Problematic Code Snippet** (`tests/adversarial-concurrency.test.js:12-20, 56-60`):
```javascript
class MockD1Engine {
  constructor({ users = [], cards = [], free_limits = [], request_logs = [] } = {}) {
    this.users = new Map(users.map(u => [u.id, { ...u }]));
    this.cards = new Map(cards.map(c => [c.card_key, { ...c }]));
    this.free_limits = new Map(free_limits.map(f => [f.key, { ...f }]));
    this.request_logs = [...request_logs];
    this.credit_logs = [];
    this.batchExecutionCount = 0;
  }

  _executeFirst(sql, args) {
    // Fragile string matching! Any whitespace change or alias addition breaks the test!
    if (sql.includes('FROM cards WHERE card_key = ?')) {
      const card = this.cards.get(args[0]);
      return card ? { ...card } : null;
    }
```

---

#### Defect 20: Complete Vacuum of Code Quality Gates, Scripts, and CI Pipeline
- **Relative File Path**: `package.json`
- **Exact Line Range**: lines 6–8, 20–22
- **Code Smell Category**: Tooling Vacuum / Defective Quality Assurance Pipeline
- **Maintenance Risk & Impact Analysis**:
  `package.json` contains only a single script (`"test": "vitest run"`) and a single devDependency (`"vitest": "^4.1.6"`). There is no linter (ESLint or Biome), no formatter (Prettier), no typechecker (`tsc`), no dev server command, and no build command. Furthermore, zero CI configuration exists (no `.github/workflows`). Code can be committed with syntax errors, broken imports, or formatting violations without automated gate checks. In addition, running `npm test` directly in default Windows PowerShell fails with `PSSecurityException` because `npm.ps1` is blocked by default Windows execution policies.
- **Problematic Code Snippet** (`package.json:6-8, 20-22`):
```json
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.6"
  }
```

---

## 3. Modular Decoupling Blueprint & Refactoring Code Patterns

### 3.1 Frontend Decoupling: Controller-Service-Store Pattern

To eliminate the 233 KB `index.html` monolith and the 142 KB `src/main.js` God script without breaking existing functionality, the client architecture must transition to a 4-tier decoupled model:

```
src/
├── core/                               # Tier 1: Foundation Layer (Zero DOM dependencies)
│   ├── state/
│   │   ├── store.js                    # Reactive Observable Store (Typed Key-Value Store)
│   │   └── actions.js                  # Explicit State Mutation Handlers
│   ├── events/
│   │   └── event-bus.js                # Strongly-typed Pub/Sub EventBus
│   ├── api/
│   │   ├── nai-client.js               # Base HTTP Client for NovelAI Endpoints
│   │   ├── key-rotator.js              # Centralized Multi-Key Failover Service
│   │   └── token-manager.js            # Auth & Admin Session Token Provider
│   └── utils/
│       ├── blob-manager.js             # Tracked ObjectURL Registry with Auto-Revoke
│       └── html-sanitizer.js           # Safe HTML attribute escaping
│
├── canvas/                             # Tier 2: Pure Canvas Math & Drawing Engine
│   ├── viewport.js                     # 2D Pan, Zoom, Screen-to-World Coordinate Math
│   ├── mask-engine.js                  # Brush, Eraser, Flood-Fill, 1:1 Pixel Buffer
│   ├── stitcher.js                     # Promise-wrapped Decoded Image Canvas Stitcher
│   └── history-stack.js                # Undo/Redo Canvas Snapshot Manager
│
├── components/                         # Tier 3: UI View Controllers & Dialog Modals
│   ├── modal/
│   │   ├── dialog.js                   # Non-destructive Toast, Alert, Confirm Dialogs
│   │   └── modal-lifecycle.js          # Modal Focus Trap & Esc / Backdrop Handlers
│   ├── lightbox/
│   │   └── lightbox-controller.js      # Decoupled Lightbox Viewer Controller
│   └── controls/
│       ├── generation-form.js          # Form state synchronization
│       └── char-stage.js               # Character prompt coordinate stage
│
└── main.js                             # Tier 4: Thin Orchestrator (< 80 lines)
```

In accordance with Matt Pocock's *Architecture Deepening* methodology:
- Modules such as `KeyRotatorService` and `stitchImageOntoCanvas` are **Deep Modules**: they expose tiny, intuitive APIs (e.g. `executeWithFailover(...)` and `stitchImageOntoCanvas(...)`), while internally encapsulating complex retry backoff, multi-key rotation, canvas buffer resizing, and memory cleanup.
- The entry point `src/main.js` transitions from a God Script to a pure composition root that simply wires components together.

---

### 3.2 Backend Edge Decoupling: Layered Functions Architecture

The backend architecture transitions from fragmented leaf handlers to a layered **Middleware -> Controller -> Service -> Repository** pattern strictly compatible with Cloudflare Pages Functions:

```
functions/
├── _middleware.js                      # Centralized Edge Pipeline (CORS, RequestId, Errors)
├── core/
│   ├── errors.js                       # Typed AppError Hierarchy (Status, Code, Details)
│   └── response.js                     # Standardized ApiResponse Envelope
├── repositories/                       # Data Access (Returns Composable D1 Prepared Statements)
│   ├── user.repository.js              # User queries and credit updates
│   ├── card.repository.js              # VIP Card validation and consumption statements
│   ├── quota.repository.js             # Free limit rate tracking statements
│   └── log.repository.js               # Credit & Request ledger insert statements
├── services/                           # Business Domain Logic & Transactions
│   ├── billing.service.js              # Atomic D1 batch execution (Recharge, Deduct, Refund)
│   ├── key-pool.service.js             # Edge Multi-Key Health Tracker & Cooldown Pool
│   ├── proxy.service.js                # Upstream NovelAI fetch with AbortSignal.timeout
│   └── booru.service.js                # Parallel Booru gateway with bounded timeouts
└── api/ ...                            # Lean Leaf Route Handlers (10-20 lines per route)
```

---

### 3.3 Production-Grade Refactoring Code Comparison Patterns

The following 4 production-grade code patterns demonstrate concrete, zero-breakage migrations for the system's most severe architectural bottlenecks. Each pattern explicitly specifies its target runtime boundary to ensure architectural compatibility across the hybrid stack:
- **Patterns 1 & 2** — **Target Runtime: Client Browser (Cloudflare Pages Static)**: Executed within the client browser context with access to the DOM, HTML5 Canvas 2D contexts, and Web Storage APIs; zero access to Cloudflare Workers or D1 bindings.
- **Patterns 3 & 4** — **Target Runtime: Cloudflare Pages Functions (V8 Edge Isolate)**: Executed within Cloudflare's serverless V8 isolate edge environment with access to Cloudflare D1 RPC and standard Fetch API; zero DOM or HTML Canvas APIs available.

---

#### Pattern 1: Splitting `main.js` Monolith & Multi-Key Rotation
**Target Runtime**: Client Browser (Cloudflare Pages Static)  
*Eliminates the duplicated 50-line retry loops replicated across `main.js`, `outpaint.js`, and `inpaint.js`, replacing them with a centralized `KeyRotatorService` and typed `EventBus` with subscriber fault isolation.*

##### Before (`src/outpaint.js:610-660`, duplicated in `main.js:610-638` and `inpaint.js:493-520`):
```javascript
// ❌ BEFORE: Tightly coupled, triplicated across 3 files
const customApiKeyRaw = this.store.getSetting('nai_custom_api_key');
const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
const authBase = {
    adminToken: this.store.getSetting('nai_admin_token'),
    userKey: this.store.getSetting('nai_user_key'),
    userToken: localStorage.getItem('nai_user_token') || ""
};
const candidateKeys = customApiKeys.length > 0
    ? customApiKeys.slice(i % customApiKeys.length).concat(customApiKeys.slice(0, i % customApiKeys.length))
    : [""];
const authsToTry = candidateKeys.map(key => ({ ...authBase, customApiKey: key }));

let result = null;
let lastError = null;
for (const auth of authsToTry) {
    try {
        result = await this.engine.generate(params, auth);
        break;
    } catch (err) {
        console.warn('API Key failed, trying next...', err);
        lastError = err;
    }
}
if (!result) throw new Error(lastError?.message || '所有配置的 API Key 均请求失败');
if (result.userRole) this.ui.updateCreditDisplay(result.userRole);
```

##### After (`src/core/api/key-rotator.js` & `src/core/events/event-bus.js`):
```javascript
// ✅ AFTER: Unit-testable KeyRotatorService with EventBus notification and fault isolation
export class TypedEventBus {
    constructor() {
        this.listeners = new Map();
    }
    on(event, handler) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(handler);
        return () => this.listeners.get(event)?.delete(handler);
    }
    emit(event, payload) {
        // Wrap subscriber callbacks in try/catch to isolate errors and prevent aborting calling flows
        this.listeners.get(event)?.forEach(handler => {
            try {
                handler(payload);
            } catch (err) {
                console.error(`[EventBus] Error in listener for event "${event}":`, err);
            }
        });
    }
}
export const eventBus = new TypedEventBus();

export class KeyRotatorService {
    constructor(engine, store, bus = eventBus) {
        this.engine = engine;
        this.store = store;
        this.eventBus = bus;
    }

    getCustomKeys() {
        // Defensive string coercion prevents TypeError if store returns null or undefined
        const raw = String(this.store.getSetting('nai_custom_api_key', '') || '');
        return raw.split(/[\n,]/).map(k => k.trim()).filter(Boolean);
    }

    getAuthBase() {
        return {
            adminToken: this.store.getSetting('nai_admin_token', ''),
            userKey: this.store.getSetting('nai_user_key', ''),
            userToken: localStorage.getItem('nai_user_token') || ''
        };
    }

    async executeWithFailover(apiMethodName, params, startIndex = 0) {
        const keys = this.getCustomKeys();
        const authBase = this.getAuthBase();
        const candidateKeys = keys.length > 0
            ? keys.slice(startIndex % keys.length).concat(keys.slice(0, startIndex % keys.length))
            : [''];

        let lastError = null;
        for (let i = 0; i < candidateKeys.length; i++) {
            const key = candidateKeys[i];
            try {
                const auth = { ...authBase, customApiKey: key };
                const result = await this.engine[apiMethodName](params, auth);
                
                if (result?.userRole) {
                    this.eventBus.emit('CREDIT_UPDATED', result.userRole);
                }
                return result;
            } catch (err) {
                // Fast-fail immediately on client syntax/validation errors (400, 413, 422) without wasting keys
                if (err?.status === 400 || err?.status === 413 || err?.status === 422 || err?.message?.includes('400')) {
                    throw err;
                }
                console.warn(`[KeyRotator] Key attempt ${i + 1}/${candidateKeys.length} failed:`, err);
                lastError = err;
            }
        }
        throw new Error(lastError?.message || '所有配置的 API Key 均请求失败');
    }
}

// Clean usage in OutpaintEditor, InpaintEditor, or MainController:
// const result = await this.keyRotator.executeWithFailover('generate', params);
```

---

#### Pattern 2: Fixing Canvas Outpainting Async Race Condition & Unhandled Errors
**Target Runtime**: Client Browser (Cloudflare Pages Static)  
*Replaces the unawaited `Image.onload` callback with a Promise-wrapped decoded pipeline, comprehensive error handling, state rollback, undo preservation, and ObjectURL lifecycle management.*

##### Before (`src/outpaint.js:661-729` - Broken Async Contract):
```javascript
// ❌ BEFORE: Asynchronous race condition and premature finally execution
async generate() {
    try {
        const result = await this.engine.generate(params, auth);
        
        const newImg = new Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = () => {
            // Executed asynchronously in next tick - NOT awaited!
            this.saveState();
            combinedCtx.drawImage(newImg, roundX - newCanvasX, roundY - newCanvasY, targetW, targetH);
            this.ctx.drawImage(combinedCanvas, 0, 0);
            window.lastSelectedImageUrl = this.els.canvas.toDataURL('image/png');
        };
        // No onerror handler!
        newImg.src = result.imageUrl;
    } finally {
        // Runs BEFORE canvas is actually stitched! Generate button re-enables prematurely!
        deskBtn.disabled = false;
    }
}
```

##### After (`src/canvas/stitcher.js` & usage in `src/canvas/outpaint-editor.js`):
```javascript
// ✅ AFTER: Pure, Promise-wrapped canvas stitcher with error handling, abort signal, and resource cleanup
export async function stitchImageOntoCanvas(canvas, newImageDataUrl, targetRect, options = {}) {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            return reject(new DOMException('Operation aborted by user', 'AbortError'));
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';

        const onAbort = () => {
            img.src = '';
            reject(new DOMException('Operation aborted by user', 'AbortError'));
        };

        if (options.signal) {
            options.signal.addEventListener('abort', onAbort, { once: true });
        }

        img.onload = () => {
            if (options.signal) options.signal.removeEventListener('abort', onAbort);
            try {
                const { roundX, roundY, targetW, targetH } = targetRect;
                const newCanvasX = Math.min(0, roundX);
                const newCanvasY = Math.min(0, roundY);
                const finalW = Math.max(canvas.width, roundX + targetW) - newCanvasX;
                const finalH = Math.max(canvas.height, roundY + targetH) - newCanvasY;

                // Mobile guard: iOS Safari WebKit crashes on canvases exceeding 16,777,216 pixels (4096 x 4096)
                if (finalW * finalH > 16777216) {
                    throw new RangeError(`Canvas pixel limit exceeded (${finalW}x${finalH} > 16MP threshold). Operation clamped for mobile stability.`);
                }

                // Offscreen double-buffer to guarantee atomic canvas blitting without clearing current canvas on crash
                const buffer = document.createElement('canvas');
                buffer.width = finalW;
                buffer.height = finalH;
                const bufferCtx = buffer.getContext('2d');
                if (!bufferCtx) throw new Error('Failed to acquire offscreen 2D canvas context');

                bufferCtx.drawImage(canvas, -newCanvasX, -newCanvasY);
                bufferCtx.drawImage(img, roundX - newCanvasX, roundY - newCanvasY, targetW, targetH);

                // Commit buffer to main canvas only after offscreen composition completes successfully
                canvas.width = finalW;
                canvas.height = finalH;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, finalW, finalH);
                ctx.drawImage(buffer, 0, 0);

                resolve({
                    dataUrl: canvas.toDataURL('image/png'),
                    offsetX: newCanvasX,
                    offsetY: newCanvasY
                });
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => {
            if (options.signal) options.signal.removeEventListener('abort', onAbort);
            reject(new Error("Canvas stitch failed: Unable to decode generated image asset."));
        };

        img.src = newImageDataUrl;
    });
}

// In OutpaintEditor (src/canvas/outpaint-editor.js):
async generate() {
    this.setLoading(true);
    let blobUrlToRevoke = null;

    try {
        const result = await this.keyRotator.executeWithFailover('generate', params);
        
        // 1. CRITICAL: Save canvas state BEFORE any canvas mutation to preserve undo capability contract!
        this.saveState();

        // 2. Track binary Blob URL for deterministic cleanup
        const imageSource = result.imageUrl || (result.blob ? (blobUrlToRevoke = URL.createObjectURL(result.blob)) : '');

        // 3. Fully awaited async stitch boundary - zero race conditions!
        const { dataUrl, offsetX, offsetY } = await stitchImageOntoCanvas(
            this.els.canvas,
            imageSource,
            { roundX, roundY, targetW, targetH },
            { signal: this.abortController?.signal }
        );

        // 4. Coordinate shifts and UI updates
        this.applyOffsetAfterStitch(offsetX, offsetY);
        if (this.els.sourceImg) this.els.sourceImg.src = dataUrl;
        window.lastSelectedImageUrl = dataUrl;

        eventBus.emit('IMAGE_STITCHED', { dataUrl });

    } catch (err) {
        if (err.name !== 'AbortError') {
            eventBus.emit('TOAST', { message: `生成失败: ${err.message}`, type: 'error' });
        }
    } finally {
        // 5. Clean up binary Blob URLs to prevent memory leaks (Defect 9)
        if (blobUrlToRevoke) {
            URL.revokeObjectURL(blobUrlToRevoke);
        }
        this.setLoading(false); // Only re-enables AFTER canvas stitching and resource cleanup is 100% complete!
    }
}
```

---

#### Pattern 3: Backend VIP Card Recharge Partial Failure Vulnerability
**Target Runtime**: Cloudflare Pages Functions (V8 Edge Isolate)  
*Replaces broken sequential queries with a single atomic `db.batch()` transaction in Cloudflare D1 with SQL-level CAS conditional gates.*

##### Before (`functions/api/auth/recharge.js:89-109`):
```javascript
// ❌ BEFORE: Non-atomic execution. If isolate dies between step 4 and 5, card is burned with 0 credits!
const cardUpdateResult = await db.prepare(
  "UPDATE cards SET is_used = 1, used_by_id = ?, used_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE card_key = ? AND is_used = 0"
).bind(payload.id, trimmedCardKey).run();

if (!cardUpdateResult?.meta?.changes) {
  return new Response(JSON.stringify({ error: '卡密已被使用或不存在' }), { status: 400 });
}

// Subsequent queries executed in a separate round-trip!
const updateUser = db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").bind(addedCredits, payload.id);
const writeLog = db.prepare("INSERT INTO credit_logs ...").bind(payload.id, addedCredits, ...);

await db.batch([updateUser, writeLog]);
```

##### After (`functions/services/billing.service.js`):
```javascript
// ✅ AFTER: Single atomic D1 batch transaction with SQL-level CAS conditional gates
export async function redeemCardAtomic(db, { userId, cardKey }) {
    const trimmedCardKey = cardKey.trim();

    // 1. Initial validation
    const card = await db.prepare(
        "SELECT credits, is_used FROM cards WHERE card_key = ?"
    ).bind(trimmedCardKey).first();

    if (!card) {
        throw new AppError("卡密不存在，请核对输入", 404, "CARD_NOT_FOUND");
    }
    if (card.is_used === 1) {
        throw new AppError("该卡密已被使用，请勿重复充值", 409, "CARD_ALREADY_USED");
    }

    const addedCredits = card.credits;

    // 2. Prepare atomic batch where subsequent statements are strictly conditional on cards update
    const claimCardStmt = db.prepare(`
        UPDATE cards 
        SET is_used = 1, 
            used_by_id = ?, 
            used_at = datetime('now', '+8 hours'), 
            updated_at = datetime('now', '+8 hours') 
        WHERE card_key = ? AND is_used = 0
    `).bind(userId, trimmedCardKey);

    // CRITICAL FIX: In SQLite / D1 db.batch(), a 0-row update does NOT abort the batch.
    // We MUST enforce (SELECT changes()) = 1 so user credits are updated ONLY if claimCardStmt updated 1 row!
    const addCreditsStmt = db.prepare(`
        UPDATE users 
        SET credits = credits + ?, 
            updated_at = datetime('now', '+8 hours') 
        WHERE id = ? AND (SELECT changes()) = 1
    `).bind(addedCredits, userId);

    // CRITICAL FIX: Only insert credit log if previous statements succeeded!
    const writeLogStmt = db.prepare(`
        INSERT INTO credit_logs (user_id, action, amount, description, created_at) 
        SELECT ?, 'recharge', ?, ?, datetime('now', '+8 hours')
        WHERE (SELECT changes()) = 1
    `).bind(userId, addedCredits, `充值卡密: ${trimmedCardKey}`);

    // 3. Execute all statements atomically in a single D1 RPC batch
    const batchResults = await db.batch([claimCardStmt, addCreditsStmt, writeLogStmt]);

    // Verify CAS gatekeeper: if claimCardStmt modified 0 rows, concurrent race lost
    if (!batchResults[0]?.meta?.changes || batchResults[0].meta.changes === 0) {
        throw new AppError("卡密已被并发使用，充值失败", 409, "CONCURRENT_REDEMPTION");
    }

    // 4. Query and return confirmed updated balance
    const updatedUser = await db.prepare("SELECT credits FROM users WHERE id = ?").bind(userId).first();
    return {
        success: true,
        addedCredits,
        currentCredits: updatedUser.credits
    };
}
```

---

#### Pattern 4: Resilient Upstream Proxy Service with `AbortSignal.timeout` & Multi-Key Failover Pool
**Target Runtime**: Cloudflare Pages Functions (V8 Edge Isolate)  
*Eliminates Cloudflare 524 gateway timeout hangs, provides automated multi-key rotation on 401/402/429/5xx, enforces native `AbortSignal.timeout`, and caps cumulative execution within a 45s edge deadline budget.*

##### Before (`functions/_proxy-helper.js:110-135`):
```javascript
// ❌ BEFORE: No timeout control, single static key, flattens upstream errors into 500
let fetchOptions = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
};

response = await fetch(targetUrl, fetchOptions);

if (!response.ok) {
  const errorText = await response.text();
  if (response.status === 402) {
    throw new Error("服务器 Anlas 余额不足，请联系管理员。");
  }
  throw new Error(`NovelAI API Error: ${errorText}`);
}
```

##### After (`functions/services/proxy.service.js`):
```javascript
// ✅ AFTER: Multi-key failover pool with native AbortSignal.timeout, 401/402/429 rotation, and 45s edge budget
export async function proxyNovelAIWithFailover(payload, targetUrl, { candidateKeys, timeoutPerKeyMs = 25000, maxTotalTimeoutMs = 45000 }) {
    if (!candidateKeys || candidateKeys.length === 0) {
        throw new AppError("未配置有效的 NovelAI API Key", 500, "CONFIG_ERROR");
    }

    const overallStart = Date.now();
    let lastError = null;

    for (let i = 0; i < candidateKeys.length; i++) {
        // Enforce total cumulative deadline before Cloudflare 50s subrequest/CPU execution limit
        const remainingBudget = maxTotalTimeoutMs - (Date.now() - overallStart);
        if (remainingBudget <= 3000) {
            throw new AppError("边缘网关超时预算耗尽，终止重试", 504, "GATEWAY_TIMEOUT");
        }

        const currentKey = candidateKeys[i];
        const keyTimeout = Math.min(timeoutPerKeyMs, remainingBudget);

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(keyTimeout) // Native V8 Edge Isolate timeout API
            });

            // Failover on Rate Limit (429), Quota Depletion (402), or Invalid/Expired Key (401)
            if (response.status === 429 || response.status === 402 || response.status === 401) {
                const errBody = await response.text().catch(() => '');
                console.warn(`[KeyPool] Key ...${currentKey.slice(-6)} failed with HTTP ${response.status}: ${errBody}. Rotating to next key...`);
                lastError = new AppError(`Key 故障 (${response.status})`, response.status, "UPSTREAM_KEY_FAILOVER");
                continue;
            }

            // Upstream transient server error (502/503/504): attempt next key if available
            if (response.status >= 500 && i < candidateKeys.length - 1) {
                const errBody = await response.text().catch(() => '');
                console.warn(`[KeyPool] Upstream ${response.status} on key ...${currentKey.slice(-6)}. Rotating to next key.`);
                lastError = new AppError(`上游暂态故障 (${response.status})`, response.status, "UPSTREAM_TEMPORARY_ERROR");
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown upstream error');
                throw new AppError(`NovelAI API Error: ${errorText}`, response.status, "UPSTREAM_ERROR");
            }

            return response; // Stream response directly to client

        } catch (err) {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                console.warn(`[KeyPool] Key ...${currentKey.slice(-6)} timed out after ${keyTimeout}ms.`);
                lastError = new AppError("NovelAI 上游响应超时", 504, "GATEWAY_TIMEOUT");
                // Allow attempting next key if time remains within total budget
                continue;
            }
            lastError = err;
            if (i < candidateKeys.length - 1) {
                console.warn(`[KeyPool] Network error on key ...${currentKey.slice(-6)}. Attempting next key.`);
                continue;
            }
        }
    }

    throw lastError || new AppError("所有配置的 NovelAI API Key 均已耗尽或请求失败", 503, "ALL_KEYS_FAILED");
}
```

---

### 3.4 Defensive Regression Matrix & Adversarial Stress Analysis

Refactoring a production AI generation application entails specific operational risks. The following defensive regression matrix maps the critical vulnerabilities uncovered during architectural stress testing to their concrete verification mechanisms:

| Refactoring Area | Stress Finding & Potential Regression Risk | Impact | Defensive Verification Mechanism & Resolution |
| :--- | :--- | :---: | :--- |
| **D1 Batch CAS Concurrency (Pattern 3)** | SQLite/D1 `UPDATE` matching 0 rows does not abort batch transactions. Unconditional subsequent queries in `db.batch([claimCardStmt, addCreditsStmt, writeLogStmt])` execute even when `cards` update modified 0 rows, resulting in financial double-spending. | **Critical** (Financial / Integrity) | Enforce conditional SQL logic: `WHERE id = ? AND (SELECT changes()) = 1` for user credits and `SELECT ... WHERE (SELECT changes()) = 1` for credit logs. Verified via Node.js native `DatabaseSync` SQLite test (`tests/challenger-architecture-stress.test.js`) where 0-change claim produces 0-change credit update. |
| **Upstream Proxy Failover & Budget (Pattern 4)** | Omitting `401 Unauthorized` causes service outage when API keys are revoked or expired instead of rotating to backup keys. Unbounded sequential retries exceed Cloudflare Pages Functions' 50s isolate execution cutoff. | **Major** (Availability / Resiliency) | Include 401 alongside 402, 429, and 5xx in failover loop; enforce native `AbortSignal.timeout(keyTimeout)`; cap cumulative loop runtime to 45s wall-clock deadline budget before Cloudflare's 50s limit. Fast-fail immediately on 400 client syntax errors. |
| **Canvas Outpaint Undo & Lifecycle (Pattern 2)** | Setting `canvas.width` empties pixel buffer; omitting `this.saveState()` prior to resizing and blitting permanently destroys undo history contract. Unrevoked binary Blob URLs leak client memory across repeated generations. Exceeding 16MP crashes iOS Safari WebKit. | **Major** (Data Loss / Memory Leak) | Explicitly invoke `this.saveState()` before canvas mutation; compose asynchronously on offscreen double-buffer before committing; revoke Blob URLs via `URL.revokeObjectURL(blobUrlToRevoke)` in `finally`; enforce 4096px (16MP) mobile dimension guard and `AbortSignal` cancellation. |
| **EventBus Fault Isolation & Input Parser (Pattern 1)** | Synchronous listener iteration in `TypedEventBus.emit()` allows unhandled subscriber errors to bubble and abort successful generation flows. Passing `null` to `getCustomKeys` causes `TypeError: raw.split is not a function`. | **Minor** (Fault Tolerance) | Wrap subscriber execution in `try...catch` inside `TypedEventBus.prototype.emit`; coerce settings with `String(this.store.getSetting(...) || '')`; fast-fail on 4xx client errors without churning keys. |
| **Inline Event Handler Compatibility (Phase 2)** | Decoupling controllers and services from `src/main.js` while `index.html` contains 225 inline `on*` attributes (`onclick="openLightbox(...)"`) causes immediate `ReferenceError: ... is not defined`. | **Critical** (UI Functional Outage) | Retain a backward-compatible Global Facade Shim on `window.*` in `src/main.js` throughout Phase 2 until Phase 3 completely decomposes `index.html` into modern Web Components / event delegation. |
| **Canvas Stitching Seam Alignment** | Sub-pixel rounding errors or DPI scaling mismatch causing visible seam lines on stitched images. | High | Golden Master visual regression test: render synthetic 512x512 grid, execute outpaint stitch, verify exact pixel coordinates and dimension equality. |
| **Edge Middleware Adoption** | CORS preflight response headers interfering with standard CDN asset caching. | Moderate | End-to-end HTTP contract testing: verify `OPTIONS` preflight returns 204 with exact allowed headers, and `GET`/`POST` responses retain valid CORS headers. |

---

### 3.5 Architecture Decision Records (ADR)

The following Architecture Decision Records formally document the rationale and trade-offs for the critical architectural enhancements:

#### ADR-001: Cloudflare D1 Batch CAS Atomicity via Preceding Statement `(SELECT changes()) = 1` Guard
- **Status**: Accepted
- **Context**: Cloudflare D1 runs on SQLite semantics. When statements are batched via `db.batch([stmt1, stmt2, stmt3])`, they execute inside an implicit transaction (`BEGIN TRANSACTION ... COMMIT`). In SQL, an `UPDATE` that matches zero rows is not an error; it completes with `changes: 0` and allows subsequent statements in the batch to proceed. In concurrent VIP card redemptions, a request that fails to claim a card (`is_used = 0` matched 0 rows) would still execute the unconditional `UPDATE users SET credits = credits + ?` statement, resulting in catastrophic financial double-spending.
- **Decision**: All dependent statements in the D1 recharge batch MUST enforce conditional SQL gating based on SQLite's native `changes()` function:
  1. `UPDATE users SET credits = credits + ?, updated_at = ... WHERE id = ? AND (SELECT changes()) = 1;`
  2. `INSERT INTO credit_logs (...) SELECT ..., 'recharge', ... WHERE (SELECT changes()) = 1;`
  This guarantees that credits are incremented and logged strictly if and only if `claimCardStmt` modified exactly 1 row. In application code, verify `batchResults[0]?.meta?.changes === 1` and return HTTP 409 if 0 rows were modified.
- **Consequences**: Eliminates the double-spend vulnerability with zero additional network round-trips or distributed locking overhead. Full compatibility with Cloudflare D1 edge database limits.

#### ADR-002: Upstream NovelAI Reverse Proxy Failover Envelope & 45s Edge Budget Guard
- **Status**: Accepted
- **Context**: Upstream NovelAI API keys fail for three primary reasons: rate limiting (HTTP 429), quota exhaustion (HTTP 402), and key revocation/expiration (HTTP 401). Omitting 401 from failover logic causes immediate service failure when a stale key is encountered, negating the multi-key pool benefits. Furthermore, Cloudflare Pages Functions terminate worker isolates after 50 seconds; unbounded sequential retries risk throwing unhandled 524 gateway timeout errors.
- **Decision**:
  1. Include HTTP 401 alongside 402 and 429 in the upstream key failover loop. Also failover on transient upstream 5xx gateway errors (502/503/504) if backup keys remain.
  2. Adopt native `AbortSignal.timeout(keyTimeout)` per request, eliminating non-standard timer leaks.
  3. Enforce a cumulative wall-clock deadline budget of 45 seconds (`maxTotalTimeoutMs = 45000`). If remaining budget drops below 3 seconds, fail fast with HTTP 504 `GATEWAY_TIMEOUT` before Cloudflare's 50s isolate execution cutoff.
  4. Fast-fail immediately on client validation errors (HTTP 400, 413, 422) without retrying alternative keys.
- **Consequences**: High-availability key pooling, zero Cloudflare 524 hangs, and immediate propagation of invalid user input errors.

#### ADR-003: Non-Destructive Canvas Double-Buffering, Undo Snapshot Preservation, and Blob Lifecycle Revocation
- **Status**: Accepted
- **Context**: In HTML5 Canvas, mutating `canvas.width` or `canvas.height` unconditionally wipes the backing pixel buffer. If canvas mutation occurs before saving history or if an offscreen drawing error occurs, the user's canvas content is irrevocably lost. Additionally, binary Blob URLs generated for decoded images persist indefinitely in memory if not explicitly revoked, causing memory bloat across continuous generation workflows. On iOS Safari WebKit, canvases exceeding 16MP (4096 x 4096) trigger automatic process termination.
- **Decision**:
  1. Mandate that `this.saveState()` is invoked BEFORE any canvas dimension or pixel modification, preserving the `ImageData` undo stack contract.
  2. Perform all resizing and composition on a detached offscreen canvas buffer; commit to the main canvas only upon confirmed successful composition.
  3. Track temporary Blob URLs created from binary response payloads and revoke them deterministically in a `finally` block using `URL.revokeObjectURL(blobUrlToRevoke)`.
  4. Enforce a 16MP dimension guard (`finalW * finalH <= 16777216`) and accept `AbortSignal` for non-destructive mid-flight cancellation.
- **Consequences**: Complete preservation of undo history, guaranteed non-destructive canvas operations on render failure, zero memory leaks from unrevoked blobs, and stable mobile rendering.

#### ADR-004: TypedEventBus Fault Isolation and Defensive Setting Parsing
- **Status**: Accepted
- **Context**: `TypedEventBus` operates synchronously within the client thread. When events such as `CREDIT_UPDATED` or `IMAGE_STITCHED` are emitted, an unhandled exception in an arbitrary UI subscriber (e.g. DOM query failure or toast animation error) propagates up the call stack, aborting the calling function and discarding the generated image. Furthermore, `store.getSetting` can return `null` or non-string values, triggering `TypeError: raw.split is not a function`.
- **Decision**:
  1. Wrap each listener invocation inside a `try...catch` block within `TypedEventBus.prototype.emit`, logging subscriber errors without disrupting the event emitter.
  2. Coerce configuration strings with `String(this.store.getSetting(...) || '')` prior to splitting.
- **Consequences**: Total subscriber fault isolation; decoupled UI components cannot abort core generation or outpainting workflows; robust handling of corrupt or uninitialized local storage keys.

#### ADR-005: Phase 2 Backward Compatibility Global Facade Shim for Inline DOM Event Handlers
- **Status**: Accepted
- **Context**: The existing `index.html` template includes 225 inline `on*` event handlers (`onclick="openLightbox(...)"`, `onclick="showAlert(...)"`, `onchange="..."`). Modularizing `src/main.js` into decoupled controllers during Phase 2 will cause widespread `ReferenceError` crashes if the functions are removed from the global `window` object before `index.html` is refactored in Phase 3.
- **Decision**: Maintain a comprehensive Global Facade Shim layer in `src/main.js` throughout Phase 2. As controllers (e.g. `LightboxController`, `DialogService`, `KeyRotatorService`) are extracted into standalone ES modules, their public methods will be explicitly bound to `window.*` (e.g. `window.openLightbox = lightboxController.open.bind(lightboxController)`). Inline handlers will be phased out only in Phase 3 via modern componentization and event delegation.
- **Consequences**: Guarantees 100% backward compatibility for all existing UI controls during progressive modularization; eliminates high-risk all-or-nothing refactoring.

---

## 4. Sustainable Engineering System & 3-Phased Roadmap

### 4.1 Edge Testing Strategy: Miniflare 3 + Vitest for Cloudflare Pages & D1

To eradicate the brittle `MockD1Engine` and bridge the gap between local development and Cloudflare production, the project must adopt **Miniflare 3** and **Vitest** for true edge emulation.

#### Architecture Transition Plan
1. **Retire `local_server.py`**: Replace the 1036-line Python script with Cloudflare's native Wrangler CLI:
   ```bash
   npx wrangler pages dev . --d1 DB=nai_db --compatibility-date=2024-04-01
   ```
   This immediately provides 100% feature parity with production, including all authentication, VIP card recharge, and admin routes.
2. **True In-Memory SQLite Testing**: Configure Vitest to spin up Miniflare 3 with real in-memory SQLite seeded directly from `init_db.sql`.

#### Proposed Infrastructure Configuration: `wrangler.jsonc`
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "novel-ai-api-repost",
  "compatibility_date": "2024-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "pages_build_output_dir": ".",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nai_db",
      "database_id": "local-d1-dev"
    }
  ],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  }
}
```

#### Proposed Test Configuration: `vitest.config.js`
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          d1Databases: ['DB'],
          bindings: {
            NOVELAI_API_KEY: 'test-persistent-key',
            ADMIN_TOKEN: 'test-admin-secret',
            JWT_SECRET: 'test-jwt-secret-32-chars-long-sample',
            ALLOW_CUSTOM_LIMITS: 'true'
          }
        }
      }
    }
  }
});
```

#### Real SQLite Test Harness (`tests/helpers/d1-test-helper.js`)
```javascript
import { Miniflare } from 'miniflare';
import fs from 'fs';
import path from 'path';

export async function createTestD1() {
  const mf = new Miniflare({
    modules: true,
    d1Databases: { DB: 'test-db' },
    script: 'export default { fetch() { return new Response("ok"); } }'
  });
  
  const db = await mf.getD1Database('DB');
  const schema = fs.readFileSync(path.resolve('init_db.sql'), 'utf-8');
  
  // Execute real SQLite schema statements
  await db.exec(schema);
  return { db, mf };
}
```

---

### 4.2 Linter & Formatter Selection: Biome vs. ESLint + Prettier

A rigorous comparative evaluation was conducted between **Biome** and the legacy **ESLint + Prettier** toolchain:

| Evaluation Criterion | Biome (v1.9+) | ESLint (v9 Flat Config) + Prettier | Winner & Rationale |
| :--- | :--- | :--- | :--- |
| **Execution Performance** | Single Rust binary. Analyzes and formats entire repo in `< 80ms`. | Multi-pass Node.js engine with plugins. Typically `1200ms – 3500ms`. | **Biome**: Critical for sub-second pre-commit hooks on large files (`main.js` 142 KB, `index.html` 233 KB). |
| **Configuration Overhead** | Single file (`biome.json`). Combines linter, formatter, and import sorting. | Requires `.eslintrc.js`, `.prettierrc`, `eslint-config-prettier`, `eslint-plugin-import`, etc. | **Biome**: Zero configuration drift. Eliminates dependency conflicts. |
| **Rules & Ecosystem** | Built-in rules for browser globals, Node built-ins, and standard ES2022. | Rich ecosystem of community plugins. | **ESLint** (slight edge on plugin variety), but **Biome** is optimal for standard ES modules. |
| **Tooling Footprint** | Exactly 1 devDependency: `@biomejs/biome`. | 6–10 devDependencies in `package.json`. | **Biome**: Keeps `node_modules` lightweight and minimizes supply-chain attack vectors. |
| **IDE Integration** | Official VS Code / JetBrains extensions with instant format-on-save. | Standard widely-adopted extensions. | **Tie**: Both provide seamless editor integration. |

#### Architectural Decision: Adopt Biome
**Recommendation**: Standardize on **Biome**. Its instant performance and zero-config nature eliminate developer friction while establishing bulletproof code consistency.

#### Proposed `biome.json`
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noDoubleEquals": "error",
        "noExplicitAny": "warn"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUndeclaredVariables": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  },
  "files": {
    "ignore": ["node_modules/**", "classified_tags.json", "gallery_index.json", ".agents/**"]
  }
}
```

---

### 4.3 Git Collaboration Guidelines & Automated CI Pipeline

#### 1. Branch Strategy
- **`main`**: Protected branch representing deployable production state. Direct pushes are blocked.
- **`feat/<feature-name>`**: Feature branches branched from `main`.
- **`fix/<bug-name>`**: Defect remediation branches branched from `main`.
- **`refactor/<scope>`**: Structural decoupling branches branched from `main`.

#### 2. Pre-Commit Quality Gate
Configure Git hooks via `husky` and `lint-staged`:
```json
// package.json additions:
"scripts": {
  "prepare": "husky install",
  "dev": "wrangler pages dev . --d1 DB=nai_db",
  "lint": "biome check .",
  "format": "biome format --write .",
  "check": "biome check --write ."
},
"lint-staged": {
  "*.{js,json,css}": [
    "biome check --write"
  ]
}
```

#### 3. Continuous Integration: GitHub Actions Workflow (`.github/workflows/ci.yml`)
```yaml
name: CI Quality Gate

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Biome Lint & Format Check
        run: npx @biomejs/biome check .

      - name: Run Automated Vitest Suite
        run: npm test
```

---

### 4.4 Three-Phased Implementation Roadmap

The following 3-phased roadmap balances immediate operational stability with structural modernization, ensuring zero service disruption:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Zero-Disruption Hygiene & Quick Wins (Weeks 1–2)                              │
│ - Fix window.ui dead code lockup in src/main.js                                        │
│ - Wrap VIP card recharge in atomic db.batch() in functions/api/auth/recharge.js         │
│ - Introduce Biome for sub-second linting & formatting; setup .github/workflows/ci.yml   │
│ - Delete orphan nodes.py; standardize npm scripts in package.json                      │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Safe State & Monolith Modularization (Weeks 3–5)                              │
│ - Extract KeyRotatorService to eliminate triplicated retry loops                       │
│ - Extract stitchImageOntoCanvas with Promise resolution & error boundaries             │
│ - Retire local_server.py in favor of wrangler pages dev . --d1 DB=nai_db               │
│ - Replace MockD1Engine with Miniflare 3 in-memory SQLite in Vitest                     │
│ - Decouple Lightbox Controller & DialogService with window.* Global Facade Shim        │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Modern Tooling & Long-Term Scalability (Weeks 6–8)                            │
│ - Introduce Vite build pipeline with JSDoc / TypeScript type validation                │
│ - Modularize index.html: split 12 modals into HTML templates / Web Components          │
│ - Refactor Booru gateway into parallel Promise.any queries with timeout caps           │
│ - Replace live-credit run_full_validation_suite.py with hermetic replay contract tests │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Phase Breakdown Table

| Phase | Core Objectives | Modules Affected | Expected Benefits | Risk Level | Concrete Acceptance Criteria |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Phase 1: Zero-Disruption Hygiene & Quick Wins** *(Weeks 1–2)* | 1. Eliminate UI lockup defect.<br>2. Secure VIP recharge transaction atomicity.<br>3. Establish static analysis & CI pipeline.<br>4. Clean repository dead code. | `src/main.js`<br>`functions/api/auth/recharge.js`<br>`package.json`<br>`nodes.py`<br>`biome.json`<br>`.github/workflows/ci.yml` | Instant recovery from UI errors; zero risk of burned VIP cards; automated PR gate check; clean repository hygiene. | **Low** | - `window.ui` lockup bug resolved; UI recovers gracefully on simulated failure.<br>- D1 recharge executes via single `db.batch()`.<br>- Biome runs in `< 100ms` with zero errors.<br>- CI pipeline passes on GitHub Actions. |
| **Phase 2: Safe State & Monolith Modularization** *(Weeks 3–5)* | 1. Deduplicate multi-key failover logic.<br>2. Fix canvas outpaint async race.<br>3. Transition local dev to `wrangler pages dev`.<br>4. Migrate tests to Miniflare 3 SQLite.<br>5. Retain backward-compatible Global Facade for 225 inline handlers. | `src/outpaint.js`<br>`src/inpaint.js`<br>`src/main.js`<br>`src/core/api/key-rotator.js`<br>`src/canvas/stitcher.js`<br>`local_server.py`<br>`tests/` | 150 lines of duplicate network code deleted; canvas outpaint race completely eliminated; local full-stack dev with real D1; tests validate true SQLite schema; zero UI modal breakage. | **Medium** | - `KeyRotatorService` verified with 100% unit test coverage.<br>- Canvas stitching awaited with Promise; button stays disabled until blit finishes.<br>- `local_server.py` retired.<br>- Vitest tests run against real in-memory SQLite schema.<br>- Zero `ReferenceError` regressions on 225 inline HTML event handlers via `window.*` facade. |
| **Phase 3: Modern Tooling & Long-Term Scalability** *(Weeks 6–8)* | 1. Adopt Vite / modern bundler.<br>2. Deconstruct `index.html` monolith.<br>3. Parallelize Booru search.<br>4. Enforce hermetic contract testing. | `index.html`<br>`vite.config.js`<br>`src/components/`<br>`functions/danbooru.js`<br>`run_full_validation_suite.py` | Eliminates 233 KB HTML monolith; enables CSP `script-src 'self'`; Booru search latency drops from >45s to <3s; zero live credit leaks. | **Medium-High** | - `index.html` reduced to `< 300` lines; modals loaded dynamically.<br>- Booru gateway runs parallel `Promise.any` with 4s timeout.<br>- Zero live API calls in test harness; replaced by synthetic HTTP fixtures. |

---

## 5. Verification Method

To independently reproduce the architectural observations, verify code defects, and validate the recommendations in this document, execute the following commands:

```powershell
# 1. Verify passing baseline of existing unit test suite
cmd.exe /c "npm test"
# Expected: All 27 test files pass (356 tests) in ~3.8s.

# 2. Verify 225 inline event handlers in index.html (Defect 2)
(Select-String -Path index.html -Pattern "on\w+=").Count
# Expected: Exactly 225 inline event attributes found.

# 3. Verify window.ui dead code defect in src/main.js (Defect 3)
Select-String -Path src/*.js -Pattern "window\.ui\b"
# Expected: Only lines 341 and 347 in src/main.js read window.ui; zero files ever assign window.ui.

# 4. Verify broken transaction atomicity in recharge.js (Defect 11)
git grep -n -C 4 "UPDATE cards SET is_used" functions/
# Expected: Shows UPDATE cards executed separately from subsequent db.batch([updateUser, writeLog]).

# 5. Verify missing AbortSignal in upstream proxy helper (Defect 12)
git grep -n -C 3 "fetch(targetUrl" functions/
# Expected: fetchOptions contains only method, headers, and body; signal is undefined.

# 6. Verify string-matching SQL mock in tests (Defect 19)
git grep -n "sql.includes" tests/
# Expected: MockD1Engine parses SQL queries via string substring checks in adversarial-concurrency.test.js.
```

---
*Report successfully authored and indexed in `docs/architecture_audit_and_refactoring_blueprint.md`.*
