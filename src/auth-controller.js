/**
 * User Authentication & Account Profile Controller
 * Manages user sessions, login/registration API requests, credits sync, and recharge cards.
 */
export class AuthController {
    constructor() {
        this.ui = null;
        this.store = null;
    }

    bind(ui, store) {
        this.ui = ui;
        this.store = store;
    }

    async fetchUserProfile() {
        const token = localStorage.getItem('nai_user_token');
        if (!token) return;

        try {
            const res = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) {
                if (res.status === 401) {
                    this.logoutUser();
                }
                throw new Error('获取用户信息失败');
            }
            const data = await res.json();
            if (data.success && data.user) {
                this.updateUserCreditsUI(data.user);
            }
        } catch (err) {
            console.error('Fetch profile error:', err);
        }
    }

    updateUserCreditsUI(user) {
        const desktopDisplay = document.getElementById('userCreditsDisplay');
        const mobileDisplay = document.getElementById('userCreditsDisplayMobile');
        
        let text;
        if (user.daily_limit !== undefined && user.daily_count !== undefined) {
            const remainingDaily = Math.max(0, user.daily_limit - user.daily_count);
            if (remainingDaily > 0) {
                text = `${user.username} (日免:${remainingDaily})`;
            } else {
                text = `${user.username} (余:${user.credits})`;
            }
        } else {
            text = `${user.username} (余:${user.credits})`;
        }
        
        if (desktopDisplay) {
            desktopDisplay.textContent = text;
            desktopDisplay.classList.remove('hidden');
        }
        if (mobileDisplay) {
            mobileDisplay.textContent = text;
            mobileDisplay.classList.remove('hidden');
        }
        
        const oldDesktop = document.getElementById('creditDisplayDesktop');
        const oldMobile = document.getElementById('creditDisplayMobile');
        if (oldDesktop) oldDesktop.classList.add('hidden');
        if (oldMobile) oldMobile.classList.add('hidden');
        
        const profileUsername = document.getElementById('profileUsername');
        const profileCredits = document.getElementById('profileCredits');
        if (profileUsername) profileUsername.textContent = user.username;
        if (profileCredits) profileCredits.textContent = `${user.credits} 点`;
        
        const authPanel = document.getElementById('userAuthPanel');
        const profilePanel = document.getElementById('userProfilePanel');
        if (authPanel) authPanel.classList.add('hidden');
        if (profilePanel) profilePanel.classList.remove('hidden');
        
        if (window.updateSettingsUserCard) {
            window.updateSettingsUserCard();
        }
    }

    switchAuthTab(tab) {
        const tabLogin = document.getElementById('authTabLogin');
        const tabRegister = document.getElementById('authTabRegister');
        const submitBtn = document.getElementById('authSubmitBtn');
        const authPanel = document.getElementById('userAuthPanel');
        
        const activeClass = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 shadow-sm transition-all';
        const inactiveClass = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-250 transition-all';
        
        if (tab === 'login') {
            if (tabLogin) tabLogin.className = activeClass;
            if (tabRegister) tabRegister.className = inactiveClass;
            if (submitBtn) submitBtn.textContent = '登录';
            if (authPanel) authPanel.dataset.tab = 'login';
        } else {
            if (tabLogin) tabLogin.className = inactiveClass;
            if (tabRegister) tabRegister.className = activeClass;
            if (submitBtn) submitBtn.textContent = '注册 (赠送10点)';
            if (authPanel) authPanel.dataset.tab = 'register';
        }
    }

    async submitAuth() {
        const authPanel = document.getElementById('userAuthPanel');
        const statusEl = document.getElementById('authStatus');
        const submitBtn = document.getElementById('authSubmitBtn');
        
        const usernameEl = document.getElementById('authUsername');
        const passwordEl = document.getElementById('authPassword');
        
        const username = usernameEl.value.trim();
        const password = passwordEl.value.trim();
        
        if (!username || !password) {
            statusEl.innerHTML = '<span class="text-red-500">✗ 用户名和密码不能为空</span>';
            statusEl.classList.remove('hidden');
            return;
        }
        
        const isLogin = authPanel.dataset.tab !== 'register';
        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        
        statusEl.innerHTML = '<span class="text-gray-500"><span class="loader inline-block w-3 h-3 border-gray-500 border-t-transparent rounded-full animate-spin"></span> 处理中...</span>';
        statusEl.classList.remove('hidden');
        submitBtn.disabled = true;
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || '请求失败');
            }
            
            if (isLogin) {
                localStorage.setItem('nai_user_token', data.token);
                statusEl.innerHTML = '<span class="text-green-500">✔ 登录成功！</span>';
                this.updateUserCreditsUI(data.user);
                setTimeout(() => {
                    statusEl.classList.add('hidden');
                    usernameEl.value = '';
                    passwordEl.value = '';
                }, 800);
            } else {
                statusEl.innerHTML = '<span class="text-green-500">✔ 注册成功，正在切换到登录...</span>';
                setTimeout(() => {
                    passwordEl.value = '';
                    this.switchAuthTab('login');
                    statusEl.classList.add('hidden');
                }, 1200);
            }
        } catch (err) {
            statusEl.innerHTML = `<span class="text-red-500">✗ ${err.message}</span>`;
        } finally {
            submitBtn.disabled = false;
        }
    }

    async submitRecharge() {
        const statusEl = document.getElementById('rechargeStatus');
        const submitBtn = document.getElementById('rechargeSubmitBtn');
        const cardKeyEl = document.getElementById('rechargeCardKey');
        const token = localStorage.getItem('nai_user_token');
        
        if (!token) {
            statusEl.innerHTML = '<span class="text-red-500">✗ 登录已失效，请重新登录</span>';
            statusEl.classList.remove('hidden');
            return;
        }
        
        const cardKey = cardKeyEl.value.trim();
        if (!cardKey) {
            statusEl.innerHTML = '<span class="text-red-500">✗ 请输入卡密</span>';
            statusEl.classList.remove('hidden');
            return;
        }
        
        statusEl.innerHTML = '<span class="text-gray-500"><span class="loader inline-block w-3 h-3 border-gray-500 border-t-transparent rounded-full animate-spin"></span> 充值中...</span>';
        statusEl.classList.remove('hidden');
        submitBtn.disabled = true;
        
        try {
            const res = await fetch('/api/auth/recharge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ cardKey })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || '充值失败');
            }
            
            statusEl.innerHTML = `<span class="text-green-500">✔ ${data.message}</span>`;
            cardKeyEl.value = '';
            this.fetchUserProfile();
        } catch (err) {
            statusEl.innerHTML = `<span class="text-red-500">✗ ${err.message}</span>`;
        } finally {
            submitBtn.disabled = false;
        }
    }

    logoutUser() {
        localStorage.removeItem('nai_user_token');
        
        const desktopDisplay = document.getElementById('userCreditsDisplay');
        const mobileDisplay = document.getElementById('userCreditsDisplayMobile');
        if (desktopDisplay) desktopDisplay.classList.add('hidden');
        if (mobileDisplay) mobileDisplay.classList.add('hidden');
        
        const authPanel = document.getElementById('userAuthPanel');
        const profilePanel = document.getElementById('userProfilePanel');
        if (authPanel) authPanel.classList.remove('hidden');
        if (profilePanel) profilePanel.classList.add('hidden');
        this.switchAuthTab('login');
        
        if (window.closeUserModal) {
            window.closeUserModal();
        }
        if (window.showToast) {
            window.showToast("已退出登录", "info");
        }
        
        if (window.updateSettingsUserCard) {
            window.updateSettingsUserCard();
        }
    }
}
