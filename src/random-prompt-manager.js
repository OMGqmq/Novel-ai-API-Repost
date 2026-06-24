/**
 * Random Prompt Manager Module
 * Manages the custom category lists, enables/disables, loading/saving to cache,
 * and random tag group selections for image generations.
 */
export class RandomPromptManager {
    constructor() {
        this.enabled = false;
        this.categories = [];
        this.defaultCategories = [
            {
                name: '服装',
                enabled: true,
                content: 'jk uniform, white shirt; maid outfit, apron; white summer dress',
                custom: false
            },
            {
                name: '动作',
                enabled: true,
                content: 'sitting, crossed legs; standing, hands on hips; running, motion blur',
                custom: false
            },
            {
                name: 'nsfw',
                enabled: false,
                content: 'bikini, cleavage; underwear, collarbone; naked shoulders',
                custom: false
            },
            {
                name: '画风',
                enabled: true,
                content: 'anime screencap; oil painting, textured; watercolor wash; retro pixel art',
                custom: false
            }
        ];
        this.load();
    }

    load() {
        try {
            if (typeof localStorage !== 'undefined') {
                const storedEnabled = localStorage.getItem('nai_random_prompt_enabled');
                this.enabled = storedEnabled === 'true';

                const storedData = localStorage.getItem('nai_random_prompt_library');
                if (storedData) {
                    const parsed = JSON.parse(storedData);
                    if (Array.isArray(parsed)) {
                        this.categories = parsed;
                        return;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load random prompts from localStorage:", e);
        }
        
        // Reset to default categories
        this.categories = JSON.parse(JSON.stringify(this.defaultCategories));
    }

    save() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('nai_random_prompt_enabled', this.enabled.toString());
                localStorage.setItem('nai_random_prompt_library', JSON.stringify(this.categories));
            }
        } catch (e) {
            console.error("Failed to save random prompts to localStorage:", e);
        }
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(val) {
        this.enabled = !!val;
        this.save();
    }

    getCategories() {
        return this.categories;
    }

    addCategory(name, content = '') {
        const trimmedName = (name || '').trim();
        if (!trimmedName) return { error: '类别名称不能为空' };
        
        const exists = this.categories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase());
        if (exists) return { error: `类别 “${trimmedName}” 已存在` };

        const newCat = {
            name: trimmedName,
            enabled: true,
            content: content,
            custom: true
        };
        this.categories.push(newCat);
        this.save();
        return { success: true, category: newCat };
    }

    removeCategory(name) {
        const index = this.categories.findIndex(c => c.name === name);
        if (index === -1) return { error: '类别不存在' };
        
        this.categories.splice(index, 1);
        this.save();
        return { success: true };
    }

    updateCategory(name, updateObj) {
        const cat = this.categories.find(c => c.name === name);
        if (!cat) return { error: '类别不存在' };

        if (updateObj.enabled !== undefined) {
            cat.enabled = !!updateObj.enabled;
        }
        if (updateObj.content !== undefined) {
            cat.content = updateObj.content;
        }
        this.save();
        return { success: true, category: cat };
    }

    getRandomSelection() {
        const selections = {};
        const tagsList = [];

        if (!this.enabled) {
            return { selectedTags: '', individualSelections: selections };
        }

        this.categories.forEach(cat => {
            if (!cat.enabled) return;

            // Split content by semicolon and clean items
            const groups = (cat.content || '')
                .split(';')
                .map(g => g.trim())
                .filter(g => g !== '');

            if (groups.length > 0) {
                const randomIndex = Math.floor(Math.random() * groups.length);
                const chosenGroup = groups[randomIndex];
                selections[cat.name] = chosenGroup;
                tagsList.push(chosenGroup);
            }
        });

        return {
            selectedTags: tagsList.join(', '),
            individualSelections: selections
        };
    }

    exportData() {
        return JSON.stringify({
            enabled: this.enabled,
            categories: this.categories
        }, null, 2);
    }

    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data || typeof data !== 'object') {
                return { error: '无效的 JSON 数据格式' };
            }

            if (data.enabled !== undefined) {
                this.enabled = !!data.enabled;
            }

            const importedCats = data.categories;
            if (Array.isArray(importedCats)) {
                // Validate schema of imported categories
                const validated = importedCats.map(c => {
                    return {
                        name: String(c.name || '').trim(),
                        enabled: c.enabled !== false,
                        content: String(c.content || ''),
                        custom: c.custom !== false
                    };
                }).filter(c => c.name !== '');

                // Overwrite categories
                this.categories = validated;
                this.save();
                return { success: true };
            }

            return { error: '未在 JSON 中找到类别列表' };
        } catch (e) {
            return { error: '解析 JSON 失败: ' + e.message };
        }
    }
}
