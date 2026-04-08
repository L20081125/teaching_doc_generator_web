// 配置数据
const CONFIG = {
    models: {
        deepseek: [{ label: "DeepSeek-R1", value: "deepseek-reasoner" }, { label: "DeepSeek-V3", value: "deepseek-chat" }],
        qwen: [{ label: "Qwen-Turbo", value: "qwen-turbo" }, { label: "Qwen-Plus", value: "qwen-plus" }, { label: "Qwen-Max", value: "qwen-max" }],
        kimi: [{ label: "Kimi Chat", value: "moonshot-v1-8k" }],
        glm: [{ label: "ChatGLM4", value: "glm-4" }],
        ollama: [{ label: "Llama3", value: "llama3" }, { label: "Qwen2.5", value: "qwen2.5" }]
    },
    endpoints: {
        deepseek: "https://api.deepseek.com/chat/completions",
        qwen: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        kimi: "https://api.moonshot.cn/v1/chat/completions",
        glm: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        ollama: "http://localhost:11434/api/chat"
    }
};

let generatedContent = "";
let historyData = JSON.parse(localStorage.getItem('docGenHistory')) || [];
let saveTimeout;
let currentWallpaper = 'default';
let currentTheme = 'blue';

// DOM 元素
const els = {
    apiKey: document.getElementById('apiKey'),
    provider: document.getElementById('modelProvider'),
    modelSelect: document.getElementById('modelSelect'),
    customUrl: document.getElementById('customApiUrl'),
    customUrlContainer: document.getElementById('customUrlContainer'),
    courseName: document.getElementById('courseName'),
    major: document.getElementById('major'),
    audience: document.getElementById('audience'),
    hours: document.getElementById('hours'),
    taskDesc: document.getElementById('taskDesc'),
    assessment: document.getElementById('assessment'),
    docType: document.getElementById('docType'),
    rangeSlider: document.getElementById('minWordCount'),
    detailLabel: document.getElementById('detailLabel'),
    generateBtn: document.getElementById('generateBtn'),
    copyBtn: document.getElementById('copyBtn'),
    saveDocBtn: document.getElementById('saveDocBtn'),
    previewArea: document.getElementById('previewArea'),
    statusText: document.getElementById('statusText'),
    progressBar: document.getElementById('progressBar'),
    wordCount: document.getElementById('wordCount'),
    timeStamp: document.getElementById('timeStamp'),
    historyModal: document.getElementById('historyModal'),
    historyList: document.getElementById('historyList'),
    userBgImage: document.getElementById('userBackgroundImage'),
    userBgVideo: document.getElementById('userBackgroundVideo')
};

document.addEventListener('DOMContentLoaded', () => {
    updateModelOptions();
    loadFromStorage();
    loadHistory();
    
    // 事件绑定
    els.generateBtn.addEventListener('click', startGeneration);
    els.copyBtn.addEventListener('click', copyToClipboard);
    els.saveDocBtn.addEventListener('click', saveAsWord);
    els.provider.addEventListener('change', updateModelOptions);
    els.rangeSlider.addEventListener('input', handleRangeChange);
    
    // 自动保存监听
    const inputs = [els.apiKey, els.courseName, els.major, els.audience, els.hours, els.taskDesc, els.assessment, els.docType];
    inputs.forEach(input => input.addEventListener('input', debounce(autoSave, 1000)));
    
    document.getElementById('exportConfigBtn').addEventListener('click', exportConfig);
});

function debounce(func, wait) {
    return function(...args) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// --- 个性化逻辑 ---

function setWallpaper(type) {
    els.userBgImage.classList.add('hidden');
    els.userBgVideo.classList.add('hidden');
    if (type === 'default') {
        currentWallpaper = 'default';
    } else {
        currentWallpaper = type;
    }
    autoSave();
}

function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        els.userBgImage.src = e.target.result;
        els.userBgImage.classList.remove('hidden');
        currentWallpaper = 'image';
        autoSave();
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function handleVideoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    els.userBgVideo.src = url;
    els.userBgVideo.classList.remove('hidden');
    els.userBgVideo.play().catch(e => console.warn("Autoplay blocked"));
    currentWallpaper = 'video';
    autoSave();
}

function setThemeColor(theme) {
    document.body.className = document.body.className.replace(/theme-\w+/g, '');
    if (theme !== 'blue') {
        document.body.classList.add(`theme-${theme}`);
    }
    currentTheme = theme;
    autoSave();
}

// --- 核心功能 ---

function updateModelOptions() {
    const provider = els.provider.value;
    els.modelSelect.innerHTML = '';
    if (provider === 'custom') {
        els.customUrlContainer.classList.remove('hidden');
        els.modelSelect.innerHTML = '<option value="">请输入模型名</option>';
    } else {
        els.customUrlContainer.classList.add('hidden');
        const models = CONFIG.models[provider] || [];
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            els.modelSelect.appendChild(opt);
        });
    }
}

function handleRangeChange(e) {
    const val = parseInt(e.target.value);
    let label = "标准";
    if (val < 1500) label = "精简";
    else if (val > 5000) label = "详尽";
    
    els.detailLabel.textContent = `${label} (${val}字)`;
    autoSave();
}

async function startGeneration() {
    const apiKey = els.apiKey.value.trim();
    const provider = els.provider.value;
    const model = els.modelSelect.value;
    const url = els.customUrl.value || CONFIG.endpoints[provider];
    const docType = els.docType.value || "教学文档";
    const minWords = els.rangeSlider.value;
    const maxWords = 10000; // 简化处理，上限固定

    if (!apiKey) return alert("请输入 API Key");
    if (!els.courseName.value.trim()) return alert("请输入课程名称");
    if (!model && provider !== 'custom') return alert("请选择模型");

    setLoading(true);
    updateStatus("正在构建提示词...");
    setProgress(10);

    try {
        const prompt = buildPrompt(docType, minWords, maxWords);
        updateStatus(`正在调用 ${CONFIG.models[provider]?.find(m=>m.value===model)?.label || provider} ...`);
        setProgress(40);

        const response = await callAIApi(apiKey, model, url, prompt, provider);
        
        if (!response || !response.choices || response.choices.length === 0) {
            throw new Error("AI 返回数据异常");
        }

        generatedContent = response.choices[0].message.content;
        renderMarkdown(generatedContent);
        updateStatus("✅ 生成完成");
        setProgress(100);
        els.timeStamp.textContent = `生成时间：${new Date().toLocaleTimeString()}`;
        els.saveDocBtn.disabled = false;
        addToHistory(els.courseName.value, generatedContent.substring(0, 30));

    } catch (error) {
        console.error(error);
        alert(`错误：${error.message}`);
        updateStatus("❌ 生成失败");
        setProgress(0);
    } finally {
        setLoading(false);
    }
}

function buildPrompt(docType, minWords, maxWords) {
    return `你是一名专业的教学文档专家。请根据以下信息生成一份【${docType}】。
    
【课程信息】
- 课程名称：${els.courseName.value}
- 专业：${els.major.value}
- 对象：${els.audience.value}
- 课时：${els.hours.value || '未知'}
- 目标：${els.taskDesc.value}
- 考核：${els.assessment.value}

【严格要求】
1. 严格控制字数在 ${minWords}-${maxWords} 字之间。
2. 内容专业、结构清晰、逻辑严密。
3. 直接输出 Markdown 格式，不要包含任何解释性文字。`;
}

async function callAIApi(key, model, url, prompt, provider) {
    let payload = {};
    let headers = { "Content-Type": "application/json" };

    if (provider === 'qwen') {
        headers["Authorization"] = `Bearer ${key}`;
        payload = { input: { messages: [{ role: "user", content: prompt }] }, parameters: { result_format: "message" } };
    } else if (provider === 'ollama') {
        payload = { model: model, prompt: prompt, stream: false };
    } else {
        headers["Authorization"] = `Bearer ${key}`;
        payload = {
            model: model,
            messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: prompt }],
            temperature: 0.7
        };
    }

    const response = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(payload) });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    let data = await response.json();
    
    if (provider === 'qwen') return { choices: [{ message: { content: data.output?.choices?.[0]?.message?.content } }] };
    if (provider === 'ollama') return { choices: [{ message: { content: data.response } }] };
    return data;
}

function renderMarkdown(text) {
    els.previewArea.innerHTML = marked.parse(text);
    updateWordCount(text);
}

function updateWordCount(text) {
    const count = text.replace(/\s/g, '').length;
    els.wordCount.textContent = `${count} 字`;
    els.wordCount.classList.remove('opacity-0');
}

function setLoading(state) {
    els.generateBtn.disabled = state;
    els.generateBtn.innerHTML = state ? `<div class="loading-dots"><span></span><span></span><span></span></div> 生成中...` : `<i class="fa-solid fa-bolt group-hover:rotate-12 transition-transform"></i> <span>生成文档</span>`;
    els.progressBar.style.width = state ? "60%" : "0%";
}

function updateStatus(msg) { els.statusText.textContent = msg; }
function setProgress(pct) { els.progressBar.style.width = `${pct}%`; }

function copyToClipboard() {
    if (!generatedContent) return;
    navigator.clipboard.writeText(generatedContent).then(() => {
        const original = els.copyBtn.innerHTML;
        els.copyBtn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> 已复制';
        setTimeout(() => els.copyBtn.innerHTML = original, 2000);
    });
}

function saveAsWord() {
    if (!generatedContent) return;
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
    const lines = generatedContent.split('\n');
    const children = [];
    lines.forEach(line => {
        if (line.startsWith('# ')) children.push(new Paragraph({ text: line.substring(2), heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }));
        else if (line.startsWith('## ')) children.push(new Paragraph({ text: line.substring(3), heading: HeadingLevel.HEADING_2, spacing: { after: 160 } }));
        else if (line.startsWith('### ')) children.push(new Paragraph({ text: line.substring(4), heading: HeadingLevel.HEADING_3, spacing: { after: 120 } }));
        else if (line.trim() !== '') children.push(new Paragraph({ text: line, spacing: { after: 100 } }));
    });
    const doc = new Document({ sections: [{ properties: {}, children }] });
    Packer.toBlob(doc).then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${els.courseName.value}_${els.docType.value}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    });
}

// --- 配置持久化 ---

function getConfigObject() {
    return {
        apiKey: els.apiKey.value,
        provider: els.provider.value,
        model: els.modelSelect.value,
        customUrl: els.customUrl.value,
        courseName: els.courseName.value,
        major: els.major.value,
        audience: els.audience.value,
        hours: els.hours.value,
        taskDesc: els.taskDesc.value,
        assessment: els.assessment.value,
        docType: els.docType.value,
        minWordCount: els.rangeSlider.value,
        wallpaper: currentWallpaper,
        theme: currentTheme
    };
}

function fillForm(config) {
    els.apiKey.value = config.apiKey || '';
    els.provider.value = config.provider || 'deepseek';
    els.modelSelect.value = config.model || '';
    els.customUrl.value = config.customUrl || '';
    els.courseName.value = config.courseName || '';
    els.major.value = config.major || '';
    els.audience.value = config.audience || '';
    els.hours.value = config.hours || '';
    els.taskDesc.value = config.taskDesc || '';
    els.assessment.value = config.assessment || '';
    els.docType.value = config.docType || '';
    els.rangeSlider.value = config.minWordCount || 3000;
    handleRangeChange({ target: els.rangeSlider });
    
    if (config.wallpaper) setWallpaper(config.wallpaper);
    if (config.theme) setThemeColor(config.theme);
}

function loadFromStorage() {
    const saved = localStorage.getItem('docGenConfig');
    if (saved) {
        try {
            fillForm(JSON.parse(saved));
        } catch (e) {}
    }
}

function autoSave() {
    const config = getConfigObject();
    localStorage.setItem('docGenConfig', JSON.stringify(config));
    els.statusText.textContent = "配置已保存";
    setTimeout(() => els.statusText.textContent = "就绪", 2000);
}

// --- 导入导出 & 历史 ---

function exportConfig() {
    const config = getConfigObject();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `docgen_config_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function importConfig(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            fillForm(JSON.parse(e.target.result));
            autoSave();
            alert("配置已导入");
        } catch (err) { alert("文件格式错误"); }
    };
    reader.readAsText(file);
    input.value = '';
}

function toggleHistory() { els.historyModal.classList.toggle('hidden'); }
function closeHistory() { els.historyModal.classList.add('hidden'); }

function addToHistory(title, snippet) {
    historyData.unshift({ title, snippet, date: new Date().toISOString() });
    if (historyData.length > 10) historyData.pop();
    localStorage.setItem('docGenHistory', JSON.stringify(historyData));
    loadHistory();
}

function loadHistory() {
    els.historyList.innerHTML = '';
    historyData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700 cursor-pointer transition border border-white/5';
        div.innerHTML = `<div class="font-bold text-sm text-blue-200 truncate">${item.title}</div>`;
        div.innerHTML += `<div class="text-xs text-slate-400 mt-1 truncate">${item.snippet}...</div>`;
        div.onclick = () => alert("完整内容需重新生成或使用导出功能查看");
        els.historyList.appendChild(div);
    });
}

function clearHistory() {
    if(confirm('确定清空？')) {
        historyData = [];
        localStorage.removeItem('docGenHistory');
        loadHistory();
    }
}