/* ==============================
   NEXUSAI CHATBOT — MAIN SCRIPT
   Premium Edition
   ============================== */

(function () {
    'use strict';

    // ========== CONFIG ==========
    const API_URL = 'https://ai-chatbot-llpf.onrender.com/chat';
    const TYPING_SPEED = 10;
    const MAX_CHARS = 4000;
    const SPLASH_MIN_DURATION = 1200;
    const SCROLL_THRESHOLD = 150;

    // ========== DOM ==========
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

    const els = {
        splash: $('#splashScreen'),
        app: $('#appContainer'),
        chatArea: $('#chatArea'),
        chatScroll: $('#chatScroll'),
        messages: $('#messagesContainer'),
        welcome: $('#welcomeScreen'),
        input: $('#messageInput'),
        sendBtn: $('#sendBtn'),
        clearBtn: $('#clearBtn'),
        newChatBtn: $('#newChatBtn'),
        menuBtn: $('#menuBtn'),
        sidebarClose: $('#sidebarClose'),
        sidebar: $('#sidebar'),
        overlay: $('#sidebarOverlay'),
        charCount: $('#charCount'),
        inputContainer: $('#inputContainer'),
        inputArea: $('#inputArea'),
        historyList: $('#chatHistoryList'),
        scrollBtn: $('#scrollBottomBtn'),
    };

    const suggestionCards = $$('.suggestion-card');

    // ========== STATE ==========
    let chatHistory = [];
    let isWaiting = false;
    let conversationId = generateId();
    let savedConversations = loadConversations();
    let isNearBottom = true;
    let touchStartX = 0;
    let touchStartY = 0;
    let resizeTimer = null;

    // ========== INIT ==========
    function init() {
        bindEvents();
        renderSavedConversations();
        handleSplash();
        setupScrollObserver();
        setupMobileViewport();
    }

    // ========== SPLASH ==========
    function handleSplash() {
        const start = Date.now();
        window.addEventListener('load', () => {
            const elapsed = Date.now() - start;
            const remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);
            setTimeout(() => {
                els.splash.classList.add('hidden');
                els.input.focus();
            }, remaining);
        });
        // Fallback
        setTimeout(() => {
            els.splash.classList.add('hidden');
        }, 3000);
    }

    // ========== MOBILE VIEWPORT FIX ==========
    function setupMobileViewport() {
        // Fix for mobile keyboard pushing layout
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        setVH();
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(setVH, 100);
        });

        // Prevent iOS rubber-banding on body
        document.body.addEventListener('touchmove', (e) => {
            if (e.target === document.body) e.preventDefault();
        }, { passive: false });

        // Handle visual viewport resize (keyboard open/close)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                requestAnimationFrame(() => {
                    document.documentElement.style.setProperty(
                        '--keyboard-offset',
                        `${window.innerHeight - window.visualViewport.height}px`
                    );
                });
            });
        }
    }

    // ========== SCROLL OBSERVER ==========
    function setupScrollObserver() {
        els.chatScroll.addEventListener('scroll', handleScroll, { passive: true });
    }

    function handleScroll() {
        const { scrollTop, scrollHeight, clientHeight } = els.chatScroll;
        const distFromBottom = scrollHeight - scrollTop - clientHeight;
        isNearBottom = distFromBottom < SCROLL_THRESHOLD;

        if (distFromBottom > 300) {
            els.scrollBtn.classList.add('visible');
        } else {
            els.scrollBtn.classList.remove('visible');
        }
    }

    // ========== EVENT BINDING ==========
    function bindEvents() {
        // Send
        els.sendBtn.addEventListener('click', handleSend);
        els.input.addEventListener('keydown', handleKeyDown);
        els.input.addEventListener('input', handleInputChange);

        // Sidebar
        els.menuBtn.addEventListener('click', openSidebar);
        els.sidebarClose.addEventListener('click', closeSidebar);
        els.overlay.addEventListener('click', closeSidebar);

        // Clear / New
        els.clearBtn.addEventListener('click', clearChat);
        els.newChatBtn.addEventListener('click', newChat);

        // Scroll to bottom
        els.scrollBtn.addEventListener('click', () => scrollToBottom(true));

        // Suggestions
        suggestionCards.forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                if (prompt && !isWaiting) {
                    // Add ripple effect
                    addRipple(card);
                    els.input.value = prompt;
                    handleInputChange();
                    setTimeout(handleSend, 200);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + N = new chat
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                newChat();
            }
            // Escape = close sidebar
            if (e.key === 'Escape') {
                closeSidebar();
            }
        });

        // Mobile swipe to open sidebar
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });

        // Focus trap for accessibility
        els.input.addEventListener('focus', () => {
            els.inputContainer.classList.add('focused');
        });
        els.input.addEventListener('blur', () => {
            els.inputContainer.classList.remove('focused');
        });
    }

    // ========== TOUCH GESTURES ==========
    let swipeState = { active: false, direction: null };

    function handleTouchStart(e) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        swipeState.active = false;
        swipeState.direction = null;
    }

    function handleTouchMove(e) {
        if (!e.touches[0]) return;
        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;

        // Only handle horizontal swipes
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
            swipeState.active = true;
            swipeState.direction = deltaX > 0 ? 'right' : 'left';
        }
    }

    function handleTouchEnd() {
        if (!swipeState.active) return;

        const sidebarOpen = els.sidebar.classList.contains('open');

        if (swipeState.direction === 'right' && touchStartX < 40 && !sidebarOpen) {
            openSidebar();
        } else if (swipeState.direction === 'left' && sidebarOpen) {
            closeSidebar();
        }

        swipeState.active = false;
    }

    // ========== RIPPLE ==========
    function addRipple(element) {
        const ripple = document.createElement('span');
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(167, 139, 250, 0.15);
            transform: scale(0);
            animation: rippleAnim 0.6s ease-out forwards;
            pointer-events: none;
            width: 100px; height: 100px;
            left: 50%; top: 50%;
            margin-left: -50px; margin-top: -50px;
        `;
        element.style.position = 'relative';
        element.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // Add ripple keyframe
    const style = document.createElement('style');
    style.textContent = `@keyframes rippleAnim { to { transform: scale(4); opacity: 0; } }`;
    document.head.appendChild(style);

    // ========== INPUT HANDLING ==========
    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function handleInputChange() {
        autoResizeTextarea();
        updateCharCount();
        updateSendButton();
    }

    function autoResizeTextarea() {
        els.input.style.height = 'auto';
        const maxH = window.innerWidth < 600 ? 120 : 180;
        els.input.style.height = Math.min(els.input.scrollHeight, maxH) + 'px';
    }

    function updateCharCount() {
        const len = els.input.value.length;
        if (len === 0) {
            els.charCount.textContent = '';
            els.charCount.className = 'char-count';
            return;
        }
        els.charCount.textContent = len.toLocaleString();
        if (len > MAX_CHARS * 0.9) {
            els.charCount.className = 'char-count danger';
        } else if (len > MAX_CHARS * 0.75) {
            els.charCount.className = 'char-count warning';
        } else {
            els.charCount.className = 'char-count';
        }
    }

    function updateSendButton() {
        els.sendBtn.disabled = els.input.value.trim().length === 0 || isWaiting;
    }

    function setWaiting(waiting) {
        isWaiting = waiting;
        els.input.disabled = waiting;
        updateSendButton();

        // Toggle stop icon
        const sendIcon = els.sendBtn.querySelector('.send-icon');
        const stopIcon = els.sendBtn.querySelector('.stop-icon');
        if (waiting) {
            sendIcon.style.display = 'none';
            stopIcon.style.display = 'block';
        } else {
            sendIcon.style.display = 'block';
            stopIcon.style.display = 'none';
            requestAnimationFrame(() => els.input.focus());
        }
    }

    // ========== SENDING ==========
    async function handleSend() {
        const text = els.input.value.trim();
        if (!text || isWaiting) return;

        // Hide welcome
        if (els.welcome && !els.welcome.classList.contains('hidden')) {
            els.welcome.classList.add('hidden');
        }

        // Add user message
        addMessage('user', text);
        chatHistory.push({ role: 'user', content: text });

        // Reset input
        els.input.value = '';
        els.input.style.height = 'auto';
        els.charCount.textContent = '';
        updateSendButton();

        // Typing indicator
        setWaiting(true);
        const typingEl = showTypingIndicator();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply || 'No response received.';

            removeTypingIndicator(typingEl);

            const aiMsgEl = addMessage('ai', '', true);
            await typeText(aiMsgEl.querySelector('.message-bubble'), reply);

            chatHistory.push({ role: 'assistant', content: reply });
            saveCurrentConversation();

        } catch (error) {
            removeTypingIndicator(typingEl);
            let errorMsg = 'Something went wrong. Please try again.';
            if (error.name === 'AbortError') {
                errorMsg = 'Request timed out. Please try again.';
            } else if (error.message) {
                errorMsg = error.message;
            }
            addMessage('ai', `⚠️ ${errorMsg}`, false, true);
        } finally {
            setWaiting(false);
        }
    }

    // ========== MESSAGE RENDERING ==========
    function addMessage(role, content, isEmpty = false, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;

        const time = formatTime(new Date());
        const isUser = role === 'user';

        const avatarSVG = isUser
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

        const bubbleClass = isError ? 'message-bubble error-bubble' : 'message-bubble';
        const processedContent = isEmpty ? '' : renderMarkdown(content);

        const actionsHTML = !isUser && !isEmpty && !isError ? `
            <div class="message-actions">
                <button class="msg-action-btn copy-msg-btn" title="Copy">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                </button>
            </div>
        ` : '';

        messageDiv.innerHTML = `
            <div class="message-avatar"><div class="avatar-inner">${avatarSVG}</div></div>
            <div class="message-content">
                <div class="${bubbleClass}">${processedContent}</div>
                ${actionsHTML}
                <div class="message-time">${time}</div>
            </div>
        `;

        // Bind copy button
        const copyBtn = messageDiv.querySelector('.copy-msg-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const bubble = messageDiv.querySelector('.message-bubble');
                const text = bubble ? bubble.textContent : '';
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
                    setTimeout(() => {
                        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
                    }, 2000);
                });
            });
        }

        els.messages.appendChild(messageDiv);
        scrollToBottom();

        return messageDiv;
    }

    // ========== TYPING EFFECT ==========
    async function typeText(element, text) {
        const rendered = renderMarkdown(text);

        if (text.length < 30) {
            element.innerHTML = rendered;
            addCopyButtons(element);
            scrollToBottom();
            return;
        }

        element.innerHTML = '';
        element.classList.add('typing-text-cursor');

        const words = text.split(/(\s+)/);
        let currentText = '';
        let wordIdx = 0;

        return new Promise((resolve) => {
            function typeNextWord() {
                if (wordIdx < words.length) {
                    // Type 1-3 words at a time for natural speed
                    const count = Math.min(Math.ceil(Math.random() * 2) + 1, words.length - wordIdx);
                    for (let i = 0; i < count; i++) {
                        currentText += words[wordIdx];
                        wordIdx++;
                    }

                    element.innerHTML = renderMarkdown(currentText);

                    if (isNearBottom) scrollToBottom();

                    // Variable delay for natural feel
                    const lastChunk = words[wordIdx - 1] || '';
                    let delay = TYPING_SPEED;
                    if (/[.!?]$/.test(lastChunk.trim())) delay = TYPING_SPEED * 10;
                    else if (/[,;:]$/.test(lastChunk.trim())) delay = TYPING_SPEED * 5;
                    else if (/\n/.test(lastChunk)) delay = TYPING_SPEED * 6;
                    else delay = TYPING_SPEED + Math.random() * TYPING_SPEED;

                    setTimeout(typeNextWord, delay);
                } else {
                    element.classList.remove('typing-text-cursor');
                    element.innerHTML = rendered;
                    addCopyButtons(element);
                    scrollToBottom();
                    resolve();
                }
            }
            typeNextWord();
        });
    }

    // ========== TYPING INDICATOR ==========
    function showTypingIndicator() {
        const wrapper = document.createElement('div');
        wrapper.className = 'typing-indicator-wrapper';
        wrapper.id = 'typingIndicator';

        wrapper.innerHTML = `
            <div class="message-avatar">
                <div class="avatar-inner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
            </div>
            <div class="typing-bubble">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        els.messages.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    }

    function removeTypingIndicator(el) {
        if (!el || !el.parentNode) return;
        el.style.transition = 'all 0.25s ease-out';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px) scale(0.95)';
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 250);
    }

    // ========== MARKDOWN ==========
    function renderMarkdown(text) {
        if (!text) return '';

        let html = escapeHtml(text);

        // Code blocks
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
            return `<div class="code-block-wrapper">${langLabel}<pre><code>${code.trim()}</code></pre></div>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

        // Headers
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Unordered lists
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

        // Ordered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // Horizontal rules
        html = html.replace(/^---$/gm, '<hr>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        if (!/^<[hublodp]/i.test(html) && !/^<blockquote/.test(html) && !/^<hr/.test(html) && !/^<div/.test(html)) {
            html = '<p>' + html + '</p>';
        }

        // Cleanup
        html = html.replace(/<p>\s*<\/p>/g, '');
        html = html.replace(/<p><br>\s*<\/p>/g, '');

        return html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function addCopyButtons(container) {
        const blocks = container.querySelectorAll('.code-block-wrapper');
        blocks.forEach(wrapper => {
            if (wrapper.querySelector('.copy-code-btn')) return;
            const btn = document.createElement('button');
            btn.className = 'copy-code-btn';
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
            btn.addEventListener('click', () => {
                const code = wrapper.querySelector('code');
                if (!code) return;
                navigator.clipboard.writeText(code.textContent).then(() => {
                    btn.classList.add('copied');
                    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
                    }, 2000);
                }).catch(() => {
                    btn.textContent = 'Failed';
                    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
                });
            });
            wrapper.appendChild(btn);
        });
    }

    // ========== SCROLL ==========
    function scrollToBottom(force = false) {
        if (!isNearBottom && !force) return;
        requestAnimationFrame(() => {
            els.chatScroll.scrollTo({
                top: els.chatScroll.scrollHeight,
                behavior: force ? 'smooth' : 'auto',
            });
        });
    }

    // ========== CHAT MANAGEMENT ==========
    function clearChat() {
        if (chatHistory.length === 0 && els.welcome && !els.welcome.classList.contains('hidden')) return;

        // Animate out messages
        const msgs = els.messages.querySelectorAll('.message');
        msgs.forEach((msg, i) => {
            msg.style.transition = `all 0.3s ease ${i * 0.03}s`;
            msg.style.opacity = '0';
            msg.style.transform = 'translateY(-10px) scale(0.95)';
        });

        setTimeout(() => {
            els.messages.innerHTML = '';
            chatHistory = [];
            if (els.welcome) els.welcome.classList.remove('hidden');
            conversationId = generateId();
            els.input.focus();
        }, msgs.length > 0 ? 350 : 0);
    }

    function newChat() {
        if (chatHistory.length > 0) {
            saveCurrentConversation();
        }
        clearChat();
        closeSidebar();
    }

    // ========== PERSISTENCE ==========
    function saveCurrentConversation() {
        if (chatHistory.length === 0) return;

        const firstUserMsg = chatHistory.find(m => m.role === 'user');
        const title = firstUserMsg
            ? firstUserMsg.content.substring(0, 45) + (firstUserMsg.content.length > 45 ? '…' : '')
            : 'New conversation';

        const conversation = {
            id: conversationId,
            title,
            messages: [...chatHistory],
            timestamp: Date.now(),
        };

        const idx = savedConversations.findIndex(c => c.id === conversationId);
        if (idx >= 0) {
            savedConversations[idx] = conversation;
        } else {
            savedConversations.unshift(conversation);
        }

        savedConversations = savedConversations.slice(0, 30);

        try {
            localStorage.setItem('nexusai_conversations', JSON.stringify(savedConversations));
        } catch (e) { /* Storage full */ }

        renderSavedConversations();
    }

    function loadConversations() {
        try {
            return JSON.parse(localStorage.getItem('nexusai_conversations') || '[]');
        } catch { return []; }
    }

    function loadConversation(id) {
        const conv = savedConversations.find(c => c.id === id);
        if (!conv) return;

        if (chatHistory.length > 0) saveCurrentConversation();

        conversationId = conv.id;
        chatHistory = [...conv.messages];
        els.messages.innerHTML = '';
        if (els.welcome) els.welcome.classList.add('hidden');

        conv.messages.forEach((msg, i) => {
            const el = addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
            // Stagger animation
            el.style.animationDelay = `${i * 0.05}s`;
        });

        els.messages.querySelectorAll('.code-block-wrapper').forEach(wrapper => {
            addCopyButtons(wrapper.closest('.message-bubble') || wrapper);
        });

        renderSavedConversations();
        closeSidebar();
        setTimeout(() => scrollToBottom(true), 100);
    }

    function renderSavedConversations() {
        els.historyList.querySelectorAll('.history-item').forEach(item => item.remove());

        savedConversations.forEach((conv, i) => {
            const item = document.createElement('div');
            item.className = 'history-item' + (conv.id === conversationId ? ' active' : '');
            item.style.animationDelay = `${i * 0.03}s`;
            item.innerHTML = `
                <span class="history-item-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </span>
                <span>${escapeHtml(conv.title)}</span>
            `;
            item.addEventListener('click', () => loadConversation(conv.id));
            els.historyList.appendChild(item);
        });
    }

    // ========== SIDEBAR ==========
    function openSidebar() {
        els.sidebar.classList.add('open');
        els.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        els.sidebar.classList.remove('open');
        els.overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ========== UTILITIES ==========
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function generateId() {
        return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    }

    // ========== GO ==========
    init();

})();
