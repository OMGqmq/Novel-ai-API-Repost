/**
 * Administrative Dashboard Controller
 * Manages administrative tasks like user state manipulation, points adjustment, VIP card bulk writing, and usage trend charts.
 */
export class AdminController {
    constructor() {
        this.ui = null;
        this.store = null;
        this.authController = null;
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

        const activeClass = 'flex-1 text-center py-2 text-[11px] md:text-xs font-semibold rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 shadow-sm transition-all';
        const inactiveClass = 'flex-1 text-center py-2 text-[11px] md:text-xs font-semibold rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-250 transition-all';

        if (tabUsers) tabUsers.className = (tab === 'users' ? activeClass : inactiveClass);
        if (tabCards) tabCards.className = (tab === 'cards' ? activeClass : inactiveClass);
        if (tabStats) tabStats.className = (tab === 'stats' ? activeClass : inactiveClass);

        if (panelUsers) panelUsers.classList.toggle('hidden', tab !== 'users');
        if (panelCards) panelCards.classList.toggle('hidden', tab !== 'cards');
        if (panelStats) panelStats.classList.toggle('hidden', tab !== 'stats');

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
                <td colspan="5" class="text-center py-8 text-gray-400">
                    <span class="loader inline-block w-4 h-4 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></span> 正在获取用户列表...
                </td>
            </tr>
        `;

        try {
            const res = await fetch('/api/admin/users', {
                headers: {
                    'x-admin-token': adminToken
                }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '获取用户列表失败');

            tbody.innerHTML = '';
            const users = data.users || [];

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">暂无注册用户</td></tr>';
                return;
            }

            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors';

                // 状态徽章样式
                let statusBadge = '';
                if (user.status === 'Approved') {
                    statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">已激活</span>';
                } else if (user.status === 'Banned') {
                    statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">已禁用</span>';
                } else {
                    statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">待审核</span>';
                }

                // 操作按钮
                let actionButtons = '';
                if (user.status === 'Pending') {
                    actionButtons = `
                        <button onclick="window.updateUserStatus(${user.id}, 'Approved')" class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all mr-1 whitespace-nowrap">批准</button>
                        <button onclick="window.updateUserStatus(${user.id}, 'Banned')" class="px-2 py-0.5 text-[10px] font-semibold rounded border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all mr-1 whitespace-nowrap">禁用</button>
                    `;
                } else if (user.status === 'Approved') {
                    actionButtons = `
                        <button onclick="window.updateUserStatus(${user.id}, 'Banned')" class="px-2 py-0.5 text-[10px] font-semibold rounded border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all mr-1 whitespace-nowrap">禁用</button>
                    `;
                } else if (user.status === 'Banned') {
                    actionButtons = `
                        <button onclick="window.updateUserStatus(${user.id}, 'Approved')" class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all mr-1 whitespace-nowrap">激活</button>
                    `;
                }
                actionButtons += `
                    <button onclick="window.deleteUserAccount(${user.id}, '${user.username}')" class="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-500 hover:bg-red-600 text-white transition-all whitespace-nowrap">删除</button>
                `;

                tr.innerHTML = `
                    <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">${user.username}</td>
                    <td class="px-4 py-3 text-gray-500 whitespace-nowrap">${user.role}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <input type="number" value="${user.credits}" id="adjustCreditsInput-${user.id}" class="w-14 px-1.5 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-center font-mono text-xs outline-none">
                            <button onclick="window.saveAdjustedCredits(${user.id})" class="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-emerald-600 dark:text-emerald-400" title="保存额度修改">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            </button>
                        </div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">${actionButtons}</td>
                `;

                tbody.appendChild(tr);
            });

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">✗ 加载失败: ${err.message}</td></tr>`;
        }
    }

    async updateUserStatus(userId, newStatus) {
        const adminToken = localStorage.getItem('nai_admin_token');
        
        try {
            const res = await fetch('/api/admin/users/approve', {
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
            const res = await fetch('/api/admin/users/approve', {
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
            const res = await fetch('/api/admin/users/approve', {
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
        btn.innerHTML = '<span class="loader inline-block w-4 h-4 border-gray-800 dark:border-white border-t-transparent rounded-full animate-spin mr-2"></span> 正在批量写入...';

        try {
            const res = await fetch('/api/admin/cards/generate', {
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
            const res = await fetch(`/api/admin/stats?range=${range}`, {
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
                    tbodyIps.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-gray-400">暂无数据</td></tr>';
                } else {
                    ips.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.className = 'hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors border-b border-gray-100 dark:border-slate-800';
                        tr.innerHTML = `
                            <td class="px-4 py-2 font-mono text-[11px]">${item.ip}</td>
                            <td class="px-4 py-2 text-right font-semibold">${item.count}</td>
                        `;
                        tbodyIps.appendChild(tr);
                    });
                }
            }

            if (errorsList) {
                errorsList.innerHTML = '';
                const errors = data.errors || [];
                if (errors.length === 0) {
                    errorsList.innerHTML = '<div class="text-gray-450 dark:text-gray-500 text-center py-4">无错误记录</div>';
                } else {
                    errors.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'flex justify-between items-center bg-red-50/50 dark:bg-red-950/10 p-2.5 rounded-xl border border-red-100/50 dark:border-red-900/10';
                        div.innerHTML = `
                            <div class="font-mono text-[10px] text-red-600 dark:text-red-400 truncate max-w-[80%]" title="${item.error_message}">${item.error_message}</div>
                            <div class="text-[10px] font-bold text-red-500 bg-red-100/60 dark:bg-red-900/30 px-2 py-0.5 rounded-full shrink-0">${item.count}次</div>
                        `;
                        errorsList.appendChild(div);
                    });
                }
            }

            // Draw trend line chart
            const trendData = data.trend || [];
            const trendLabels = trendData.map(d => d.time_bucket);
            const trendCounts = trendData.map(d => d.request_count);
            const trendDurations = trendData.map(d => Math.round(d.avg_duration));

            const ctxTrend = document.getElementById('statsTrendChart')?.getContext('2d');
            if (ctxTrend) {
                if (window.statsTrendChartInstance) {
                    window.statsTrendChartInstance.destroy();
                }
                const isDark = document.documentElement.classList.contains('dark');
                const gridColor = isDark ? 'rgba(51, 65, 85, 0.2)' : 'rgba(241, 245, 249, 0.8)';
                const textColor = isDark ? '#94a3b8' : '#64748b';

                window.statsTrendChartInstance = new Chart(ctxTrend, {
                    type: 'line',
                    data: {
                        labels: trendLabels,
                        datasets: [
                            {
                                label: '请求次数',
                                data: trendCounts,
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                fill: true,
                                tension: 0.3,
                                yAxisID: 'y'
                            },
                            {
                                label: '平均耗时 (ms)',
                                data: trendDurations,
                                borderColor: '#f59e0b',
                                backgroundColor: 'rgba(245, 158, 11, 0.05)',
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
                                ticks: { color: textColor, font: { size: 9 } }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                grid: { color: gridColor },
                                ticks: { color: textColor, font: { size: 9 } }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                grid: { drawOnChartArea: false },
                                ticks: { color: textColor, font: { size: 9 } }
                            }
                        },
                        plugins: {
                            legend: {
                                labels: { color: textColor, font: { size: 9 } }
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
                const isDark = document.documentElement.classList.contains('dark');
                const textColor = isDark ? '#94a3b8' : '#64748b';

                window.statsModelChartInstance = new Chart(ctxModel, {
                    type: 'doughnut',
                    data: {
                        labels: modelLabels,
                        datasets: [{
                            data: modelCounts,
                            backgroundColor: [
                                '#3b82f6',
                                '#f59e0b',
                                '#10b981',
                                '#8b5cf6',
                                '#ec4899',
                                '#64748b'
                            ],
                            borderWidth: isDark ? 2 : 1,
                            borderColor: isDark ? '#1e293b' : '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: { color: textColor, font: { size: 9 } }
                            }
                        }
                    }
                });
            }

        } catch (err) {
            if (window.showToast) window.showToast('获取统计数据失败: ' + err.message, 'error');
        }
    }
}
