import { apiUrl } from './api-config.js';

/**
 * Administrative Dashboard Controller
 * Manages administrative tasks like user state manipulation, points adjustment, VIP card bulk writing, and usage trend charts.
 */
export class AdminController {
    constructor() {
        this.ui = null;
        this.store = null;
        this.authController = null;
        this._chartThemeObserver = null;
    }

    _escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _getChartThemeColors() {
        const isDark = Boolean(document.documentElement?.classList?.contains?.('dark'));
        return {
            isDark,
            gridColor: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.07)',
            textColor: isDark ? '#94a3b8' : '#64748b',
            primaryLine: isDark ? '#f8fafc' : '#0f172a',
            primaryFill: isDark ? 'rgba(248, 250, 252, 0.08)' : 'rgba(15, 23, 42, 0.06)',
            secondaryLine: isDark ? '#64748b' : '#94a3b8',
            surfaceBorder: isDark ? '#0f172a' : '#ffffff',
            doughnutPalette: isDark
                ? ['#f8fafc', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155']
                : ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1']
        };
    }

    _ensureChartThemeObserver() {
        if (this._chartThemeObserver || typeof MutationObserver === 'undefined' || !document.documentElement) {
            return;
        }
        this._chartThemeObserver = new MutationObserver(() => {
            this._syncChartTheme();
        });
        this._chartThemeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    _syncChartTheme() {
        const theme = this._getChartThemeColors();
        const trend = window.statsTrendChartInstance;
        if (trend?.data?.datasets) {
            if (trend.data.datasets[0]) {
                trend.data.datasets[0].borderColor = theme.primaryLine;
                trend.data.datasets[0].backgroundColor = theme.primaryFill;
            }
            if (trend.data.datasets[1]) {
                trend.data.datasets[1].borderColor = theme.secondaryLine;
            }
            const scales = trend.options?.scales;
            if (scales?.x?.ticks) scales.x.ticks.color = theme.textColor;
            if (scales?.y?.ticks) scales.y.ticks.color = theme.textColor;
            if (scales?.y?.grid) scales.y.grid.color = theme.gridColor;
            if (scales?.y1?.ticks) scales.y1.ticks.color = theme.textColor;
            if (trend.options?.plugins?.legend?.labels) {
                trend.options.plugins.legend.labels.color = theme.textColor;
            }
            if (typeof trend.update === 'function') trend.update('none');
        }

        const modelChart = window.statsModelChartInstance;
        if (modelChart?.data?.datasets?.[0]) {
            modelChart.data.datasets[0].backgroundColor = theme.doughnutPalette;
            modelChart.data.datasets[0].borderColor = theme.surfaceBorder;
            modelChart.data.datasets[0].borderWidth = theme.isDark ? 2 : 1;
            if (modelChart.options?.plugins?.legend?.labels) {
                modelChart.options.plugins.legend.labels.color = theme.textColor;
            }
            if (typeof modelChart.update === 'function') modelChart.update('none');
        }
    }

    bind(ui, store, authController) {
        this.ui = ui;
        this.store = store;
        this.authController = authController;
    }

    switchAdminTab(tab) {
        const tabUsers = document.getElementById('adminTabUsers');
        const tabCards = document.getElementById('adminTabCards');
        const tabStats = document.getElementById('adminTabStats');
        
        const panelUsers = document.getElementById('adminUsersPanel');
        const panelCards = document.getElementById('adminCardsPanel');
        const panelStats = document.getElementById('adminStatsPanel');

        const activeClass = 'studio-tab active flex-1 text-center py-2 text-[11px] md:text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm cursor-pointer';
        const inactiveClass = 'studio-tab flex-1 text-center py-2 text-[11px] md:text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer';

        const tabBar = tabUsers?.parentElement || tabCards?.parentElement || tabStats?.parentElement;
        tabBar?.classList?.add?.('studio-tabs');
        tabBar?.setAttribute?.('role', 'tablist');

        const tabs = [
            { el: tabUsers, key: 'users', panel: panelUsers },
            { el: tabCards, key: 'cards', panel: panelCards },
            { el: tabStats, key: 'stats', panel: panelStats }
        ];
        tabs.forEach(({ el, key, panel }) => {
            const isActive = tab === key;
            if (el) {
                el.className = isActive ? activeClass : inactiveClass;
                el.setAttribute?.('role', 'tab');
                el.setAttribute?.('aria-selected', isActive ? 'true' : 'false');
            }
            if (panel) {
                panel.classList.toggle('hidden', !isActive);
                if (isActive) {
                    panel.classList.add('view-fade-enter');
                } else {
                    panel.classList.remove('view-fade-enter');
                }
            }
        });

        if (tab === 'stats') {
            this.fetchAdminStats();
        }
    }

    async fetchAdminUsers() {
        const adminToken = localStorage.getItem('nai_admin_token');
        const tbody = document.getElementById('adminUsersTableBody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-slate-400 dark:text-slate-500">
                    <span class="inline-flex items-center gap-2"><span class="studio-spinner inline-block w-4 h-4 shrink-0" aria-hidden="true"></span> 正在获取用户列表...</span>
                </td>
            </tr>
        `;

        try {
            const res = await fetch(apiUrl('/api/admin/users'), {
                headers: {
                    'x-admin-token': adminToken
                }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '获取用户列表失败');

            tbody.innerHTML = '';
            const users = data.users || [];

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 dark:text-slate-500">暂无注册用户</td></tr>';
                return;
            }

            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors';

                const userId = Number(user.id) || 0;
                const safeUsername = this._escapeHtml(user.username || '');
                const safeRole = this._escapeHtml(user.role || '');
                const safeCredits = Number(user.credits) || 0;

                // 状态徽章样式
                let statusBadge = '';
                if (user.status === 'Approved') {
                    statusBadge = '<span class="studio-badge studio-badge--success px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">已激活</span>';
                } else if (user.status === 'Banned') {
                    statusBadge = '<span class="studio-badge studio-badge--danger px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">已禁用</span>';
                } else {
                    statusBadge = '<span class="studio-badge studio-badge--warning px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">待审核</span>';
                }

                // 操作按钮
                let actionButtons = '';
                if (user.status === 'Pending') {
                    actionButtons = `
                        <button type="button" onclick="window.updateUserStatus(${userId}, 'Approved')" class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-sm transition-colors cursor-pointer mr-1 whitespace-nowrap">批准</button>
                        <button type="button" onclick="window.updateUserStatus(${userId}, 'Banned')" class="px-2 py-1 text-[10px] font-semibold rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer mr-1 whitespace-nowrap">禁用</button>
                    `;
                } else if (user.status === 'Approved') {
                    actionButtons = `
                        <button type="button" onclick="window.updateUserStatus(${userId}, 'Banned')" class="px-2 py-1 text-[10px] font-semibold rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer mr-1 whitespace-nowrap">禁用</button>
                    `;
                } else if (user.status === 'Banned') {
                    actionButtons = `
                        <button type="button" onclick="window.updateUserStatus(${userId}, 'Approved')" class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-sm transition-colors cursor-pointer mr-1 whitespace-nowrap">激活</button>
                    `;
                }
                actionButtons += `
                    <button type="button" data-username="${safeUsername}" onclick="window.deleteUserAccount(${userId}, this.dataset.username)" class="px-2 py-1 text-[10px] font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer whitespace-nowrap">删除</button>
                `;

                tr.innerHTML = `
                    <td class="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">${safeUsername}</td>
                    <td class="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">${safeRole}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <input type="number" value="${safeCredits}" id="adjustCreditsInput-${userId}" name="admin_adjust_credits_${userId}" autocomplete="off" aria-label="${safeUsername} 额度" class="art-input w-16 px-2 py-1 rounded-lg text-center font-mono text-xs tabular-nums outline-none">
                            <button type="button" onclick="window.saveAdjustedCredits(${userId})" class="studio-icon-btn p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer" title="保存额度修改" aria-label="保存 ${safeUsername} 额度修改">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            </button>
                        </div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">${actionButtons}</td>
                `;

                tbody.appendChild(tr);
            });

        } catch (err) {
            const safeErr = this._escapeHtml(err?.message || '未知错误');
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500 dark:text-red-400">✗ 加载失败: ${safeErr}</td></tr>`;
        }
    }

    async updateUserStatus(userId, newStatus) {
        const adminToken = localStorage.getItem('nai_admin_token');
        
        try {
            const res = await fetch(apiUrl('/api/admin/users/approve'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ userId, status: newStatus })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '操作失败');

            if (window.showToast) window.showToast("操作成功！", "success");
            this.fetchAdminUsers();
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    }

    async deleteUserAccount(userId, username) {
        const confirmMsg = `您确定要彻底删除用户 "${username}" 吗？此操作不可逆，将清除该用户的所有额度及记录。`;
        const confirmed = window.showConfirm 
            ? await window.showConfirm(confirmMsg, "删除账号", "trash-2") 
            : window.confirm(confirmMsg);
            
        if (!userId || !confirmed) return;
        
        const adminToken = localStorage.getItem('nai_admin_token');
        
        try {
            const res = await fetch(apiUrl('/api/admin/users/approve'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ userId, action: 'delete' })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '删除用户失败');

            if (window.showToast) window.showToast(`已成功删除用户 ${username}`, "success");
            this.fetchAdminUsers();
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    }

    async saveAdjustedCredits(userId) {
        const input = document.getElementById(`adjustCreditsInput-${userId}`);
        if (!input) return;
        
        const credits = parseInt(input.value);
        if (isNaN(credits) || credits < 0) {
            if (window.showToast) window.showToast("请输入大于或等于 0 的整数", "warning");
            return;
        }

        const adminToken = localStorage.getItem('nai_admin_token');
        
        try {
            const res = await fetch(apiUrl('/api/admin/users/approve'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ userId, credits })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '操作失败');

            if (window.showToast) window.showToast("点数修改成功！", "success");
            this.fetchAdminUsers();
            if (this.authController) {
                this.authController.fetchUserProfile();
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    }

    async generateVipCards() {
        const btn = document.getElementById('genCardsBtn');
        const countInput = document.getElementById('genCardCount');
        const creditsInput = document.getElementById('genCardCredits');
        
        const count = parseInt(countInput.value);
        const credits = parseInt(creditsInput.value);

        if (isNaN(count) || count < 1 || count > 100) {
            if (window.showToast) window.showToast("单次生成数量建议在 1 到 100 之间", "warning");
            return;
        }
        if (isNaN(credits) || credits < 1) {
            if (window.showToast) window.showToast("卡密点数必须大于 0", "warning");
            return;
        }

        const adminToken = localStorage.getItem('nai_admin_token');
        
        btn.disabled = true;
        const oldText = btn.textContent;
        btn.innerHTML = '<span class="inline-flex items-center justify-center gap-2"><span class="studio-spinner inline-block w-3.5 h-3.5 shrink-0" aria-hidden="true"></span><span>正在批量写入...</span></span>';

        try {
            const res = await fetch(apiUrl('/api/admin/cards/generate'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ count, credits })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '生成卡密失败');

            const wrapper = document.getElementById('genCardsResultWrapper');
            const textarea = document.getElementById('genCardsTextarea');
            
            if (wrapper && textarea) {
                textarea.value = (data.cards || []).join('\n');
                wrapper.classList.remove('hidden');
            }

            if (window.showToast) window.showToast(data.message, "success");
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }

    copyGeneratedCards() {
        const textarea = document.getElementById('genCardsTextarea');
        if (!textarea || !textarea.value) return;

        textarea.select();
        try {
            document.execCommand('copy');
            if (window.showToast) window.showToast("已成功复制全部卡密到剪贴板！", "success");
        } catch (err) {
            navigator.clipboard.writeText(textarea.value)
                .then(() => { if (window.showToast) window.showToast("已成功复制全部卡密到剪贴板！", "success"); })
                .catch(() => { if (window.showToast) window.showToast("复制失败，请手动选择复制", "error"); });
        }
    }

    _ensureChartJsLoaded() {
        if (typeof Chart !== 'undefined') return Promise.resolve();
        if (this._chartJsLoadPromise) return this._chartJsLoadPromise;
        if (typeof document === 'undefined' || !document.head) {
            return Promise.reject(new Error('图表组件不可用'));
        }
        this._chartJsLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js';
            script.integrity = 'sha384-Emf5ZVIUiarAdhkgtqK+5/Z5qIvM6QoVrS+qAVtfyZVuD5lIHrac0me485+Antp0';
            script.crossOrigin = 'anonymous';
            script.referrerPolicy = 'no-referrer';
            script.onload = () => resolve();
            script.onerror = () => {
                this._chartJsLoadPromise = null;
                reject(new Error('Chart.js 加载失败'));
            };
            document.head.appendChild(script);
        });
        return this._chartJsLoadPromise;
    }

    async fetchAdminStats() {
        const adminToken = localStorage.getItem('nai_admin_token');
        const rangeSelect = document.getElementById('statsRangeSelect');
        const range = rangeSelect ? rangeSelect.value : '24h';

        const statTotalRequests = document.getElementById('statTotalRequests');
        const statSuccessRate = document.getElementById('statSuccessRate');
        const statAvgDuration = document.getElementById('statAvgDuration');
        const tbodyIps = document.getElementById('statsIpsTableBody');
        const errorsList = document.getElementById('statsErrorsList');

        try {
            const res = await fetch(apiUrl(`/api/admin/stats?range=${range}`), {
                headers: {
                    'x-admin-token': adminToken
                }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '获取统计数据失败');

            if (statTotalRequests) statTotalRequests.textContent = data.summary.total_requests;
            if (statSuccessRate) statSuccessRate.textContent = data.summary.success_rate + '%';
            if (statAvgDuration) statAvgDuration.textContent = data.summary.avg_duration + 'ms';

            if (tbodyIps) {
                tbodyIps.innerHTML = '';
                const ips = data.ips || [];
                if (ips.length === 0) {
                    const emptyRow = document.createElement('tr');
                    const emptyCell = document.createElement('td');
                    emptyCell.colSpan = 2;
                    emptyCell.className = 'text-center py-4 text-gray-400';
                    emptyCell.textContent = '暂无数据';
                    emptyRow.appendChild(emptyCell);
                    tbodyIps.appendChild(emptyRow);
                } else {
                    ips.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.className = 'hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors border-b border-gray-100 dark:border-slate-800';
                        const ipCell = document.createElement('td');
                        ipCell.className = 'px-4 py-2 font-mono text-[11px]';
                        ipCell.textContent = item.ip ?? '';
                        const countCell = document.createElement('td');
                        countCell.className = 'px-4 py-2 text-right font-semibold';
                        countCell.textContent = item.count ?? 0;
                        tr.appendChild(ipCell);
                        tr.appendChild(countCell);
                        tbodyIps.appendChild(tr);
                    });
                }
            }

            if (errorsList) {
                errorsList.innerHTML = '';
                const errors = data.errors || [];
                if (errors.length === 0) {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'text-gray-400 dark:text-gray-500 text-center py-4';
                    emptyDiv.textContent = '无错误记录';
                    errorsList.appendChild(emptyDiv);
                } else {
                    errors.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'studio-card flex justify-between items-center bg-red-500/5 dark:bg-red-950/15 p-2.5 rounded-xl border border-red-500/15';
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'font-mono text-[10px] text-red-600 dark:text-red-400 truncate max-w-[80%]';
                        msgDiv.title = item.error_message || '';
                        msgDiv.textContent = item.error_message || '';
                        const countDiv = document.createElement('div');
                        countDiv.className = 'studio-badge studio-badge--danger text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0';
                        countDiv.textContent = `${item.count ?? 0}次`;
                        div.appendChild(msgDiv);
                        div.appendChild(countDiv);
                        errorsList.appendChild(div);
                    });
                }
            }

            // 按需懒加载 Chart.js，避免普通访客首屏加载约 200KB 图表脚本
            await this._ensureChartJsLoaded();

            // Draw trend line chart
            const trendData = data.trend || [];
            const trendLabels = trendData.map(d => d.time_bucket);
            const trendCounts = trendData.map(d => d.request_count);
            const trendDurations = trendData.map(d => Math.round(d.avg_duration));
            const chartTheme = this._getChartThemeColors();

            const ctxTrend = document.getElementById('statsTrendChart')?.getContext('2d');
            if (ctxTrend) {
                if (window.statsTrendChartInstance) {
                    window.statsTrendChartInstance.destroy();
                }

                window.statsTrendChartInstance = new Chart(ctxTrend, {
                    type: 'line',
                    data: {
                        labels: trendLabels,
                        datasets: [
                            {
                                label: '请求次数',
                                data: trendCounts,
                                borderColor: chartTheme.primaryLine,
                                backgroundColor: chartTheme.primaryFill,
                                borderWidth: 2,
                                pointRadius: 2.5,
                                pointHoverRadius: 4,
                                fill: true,
                                tension: 0.3,
                                yAxisID: 'y'
                            },
                            {
                                label: '平均耗时 (ms)',
                                data: trendDurations,
                                borderColor: chartTheme.secondaryLine,
                                backgroundColor: 'transparent',
                                borderDash: [4, 4],
                                borderWidth: 1.5,
                                pointRadius: 2,
                                fill: false,
                                tension: 0.3,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: chartTheme.textColor, font: { size: 9 } }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                grid: { color: chartTheme.gridColor },
                                ticks: { color: chartTheme.textColor, font: { size: 9 } }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                grid: { drawOnChartArea: false },
                                ticks: { color: chartTheme.textColor, font: { size: 9 } }
                            }
                        },
                        plugins: {
                            legend: {
                                labels: { color: chartTheme.textColor, font: { size: 9 } }
                            }
                        }
                    }
                });
            }

            // Draw model doughnut chart
            const modelData = data.models || [];
            const modelLabels = modelData.map(m => m.model);
            const modelCounts = modelData.map(m => m.count);

            const ctxModel = document.getElementById('statsModelChart')?.getContext('2d');
            if (ctxModel) {
                if (window.statsModelChartInstance) {
                    window.statsModelChartInstance.destroy();
                }

                window.statsModelChartInstance = new Chart(ctxModel, {
                    type: 'doughnut',
                    data: {
                        labels: modelLabels,
                        datasets: [{
                            data: modelCounts,
                            backgroundColor: chartTheme.doughnutPalette,
                            borderWidth: chartTheme.isDark ? 2 : 1,
                            borderColor: chartTheme.surfaceBorder
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: { color: chartTheme.textColor, font: { size: 9 } }
                            }
                        }
                    }
                });
            }

            this._ensureChartThemeObserver();

        } catch (err) {
            if (window.showToast) window.showToast('获取统计数据失败: ' + err.message, 'error');
        }
    }
}
