/* ==============================
   NEXUSAI CHATBOT — MAIN SCRIPT
   ============================== */

(function () {
    'use strict';

    // ========== CONFIG ==========
    const API_URL = 'https://ai-chatbot-llpf.onrender.com/chat';
    const TYPING_SPEED = 12; // ms per character
    const MAX_CHARS = 4000;

    // ========== DOM ELEMENTS ==========
    const chatArea = document.getElementById('chatArea');
    const chatScroll = document.getElementById('chatScroll');
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const menuBtn = document.getElementById('menuBtn');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const charCount = document.getElementById('charCount');
    const inputContainer = document.getElementById('inputContainer');
    const chatHistoryList = document.getElementById('chatHistoryList');
    const suggestionCards = document.querySelectorAll('.suggestion-card');

    // ========== STATE ==========
    let chatHistory = [];
    let isWaiting = false;
    let conversationId = generateId();
    let savedConversations = loadConversations();

    // ========== INITIALIZATION ==========
    function init() {
        bindEvents();
        messageInput.focus();
        renderSavedConversations();
    }

    // ========== EVENT BINDING ==========
    function bindEvents() {
        // Send message
        sendBtn.addEventListener('click', handleSend);
        messageInput.addEventListener('keydown', handleKeyDown);
        messageInput.addEventListener('input', handleInputChange);

        // Sidebar
        menuBtn.addEventListener('click', openSidebar);
        sidebarClose.addEventListener('click', closeSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);

        // Clear / New chat
        clearBtn.addEventListener('click', clearChat);
        newChatBtn.addEventListener('click', newChat);

        // Suggestion cards
        suggestionCards.forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                if (prompt && !isWaiting) {
                    messageInput.value = prompt;
                    handleInputChange();
                    handleSend();
                }
            });
        });
    }

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
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
    }

    function updateCharCount() {
        const len = messageInput.value.length;
        if (len === 0) {
            charCount.textContent = '';
            charCount.className = 'char-count';
            return;
        }
        charCount.textContent = len;
        if (len > MAX_CHARS * 0.9) {
            charCount.className = 'char-count danger';
        } else if (len > MAX_CHARS * 0.75) {
            charCount.className = 'char-count warning';
        } else {
            charCount.className = 'char-count';
        }
    }

    function updateSendButton() {
        sendBtn.disabled = messageInput.value.trim().length === 0 || isWaiting;
    }

    function setWaiting(waiting) {
        isWaiting = waiting;
        messageInput.disabled = waiting;
        updateSendButton();
        if (!waiting) {
            messageInput.focus();
        }
    }

    // ========== MESSAGE SENDING ==========
    async function handleSend() {
        const text = messageInput.value.trim();
        if (!text || isWaiting) return;

        // Hide welcome screen
        if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
            welcomeScreen.classList.add('hidden');
        }

        // Add user message
        addMessage('user', text);
        chatHistory.push({ role: 'user', content: text });

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        charCount.textContent = '';
        updateSendButton();

        // Show typing indicator
        setWaiting(true);
        const typingEl = showTypingIndicator();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply || 'No response received.';

            // Remove typing indicator
            removeTypingIndicator(typingEl);

            // Add AI message with typing effect
            const aiMsgEl = addMessage('ai', '', true);
            await typeText(aiMsgEl.querySelector('.message-bubble'), reply);

            chatHistory.push({ role: 'assistant', content: reply });
            saveCurrentConversation();

        } catch (error) {
            removeTypingIndicator(typingEl);
            addMessage('ai', `⚠️ ${error.message || 'Something went wrong. Please try again.'}`, false, true);
        } finally {
            setWaiting(false);
        }
    }

    // ========== MESSAGE RENDERING ==========
    function addMessage(role, content, isEmpty = false, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;

        const time = formatTime(new Date());

        const avatarHTML = role === 'user'
            ? `<div class="message-avatar"><div class="avatar-inner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
               </div></div>`
            : `<div class="message-avatar"><div class="avatar-inner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
               </div></div>`;

        const bubbleClass = isError ? 'message-bubble error-bubble' : 'message-bubble';
        const processedContent = isEmpty ? '' : renderMarkdown(content);

        messageDiv.innerHTML = `
            ${avatarHTML}
            <div class="message-content">
                <div class="${bubbleClass}">${processedContent}</div>
                <div class="message-time">${time}</div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();

        return messageDiv;
    }

    // ========== TYPING EFFECT ==========
    async function typeText(element, text) {
        const rendered = renderMarkdown(text);
        
        // For short responses, just set it directly
        if (text.length < 20) {
            element.innerHTML = rendered;
            scrollToBottom();
            return;
        }

        // Create a temp container to parse the rendered HTML
        const temp = document.createElement('div');
        temp.innerHTML = rendered;

        element.innerHTML = '';
        element.classList.add('typing-text-cursor');

        // We'll type character-by-character using the raw text
        // then render the full markdown at the end for proper formatting
        const chars = text.split('');
        let currentText = '';
        let charIndex = 0;

        return new Promise((resolve) => {
            function typeNext() {
                if (charIndex < chars.length) {
                    // Type in chunks for speed
                    const chunkSize = Math.ceil(Math.random() * 3) + 1;
                    const chunk = chars.slice(charIndex, charIndex + chunkSize).join('');
                    currentText += chunk;
                    charIndex += chunkSize;

                    // Render partial markdown
                    element.innerHTML = renderMarkdown(currentText);
                    scrollToBottom();

                    // Variable speed for natural feeling
                    const delay = /[.!?\n]/.test(chunk) ? TYPING_SPEED * 8 : TYPING_SPEED;
                    setTimeout(typeNext, delay);
                } else {
                    element.classList.remove('typing-text-cursor');
                    element.innerHTML = rendered;
                    addCopyButtons(element);
                    scrollToBottom();
                    resolve();
                }
            }
            typeNext();
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
            </div>
            <div class="typing-bubble">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        messagesContainer.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    }

    function removeTypingIndicator(el) {
        if (el && el.parentNode) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            el.style.transition = 'all 0.2s ease';
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 200);
        }
    }

    // ========== MARKDOWN RENDERING ==========
    function renderMarkdown(text) {
        if (!text) return '';

        let html = escapeHtml(text);

        // Code blocks (```)
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function (match, lang, code) {
            const langLabel = lang ? `<span style="color:var(--text-muted);font-size:0.7rem;position:absolute;top:6px;left:12px;">${lang}</span>` : '';
            return `<div class="code-block-wrapper">${langLabel}<pre><code>${code.trim()}</code></pre></div>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Headers
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Unordered lists
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

        // Ordered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // Horizontal rules
        html = html.replace(/^---$/gm, '<hr>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Line breaks (convert double newlines to paragraphs)
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        // Wrap in paragraph if not already wrapped
        if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<div') && !html.startsWith('<blockquote') && !html.startsWith('<hr')) {
            html = '<p>' + html + '</p>';
        }

        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p><br><\/p>/g, '');

        return html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function addCopyButtons(container) {
        const codeBlocks = container.querySelectorAll('.code-block-wrapper');
        codeBlocks.forEach(wrapper => {
            if (wrapper.querySelector('.copy-code-btn')) return;
            const btn = document.createElement('button');
            btn.className = 'copy-code-btn';
            btn.textContent = 'Copy';
            btn.addEventListener('click', () => {
                const code = wrapper.querySelector('code');
                if (code) {
                    navigator.clipboard.writeText(code.textContent).then(() => {
                        btn.textContent = 'Copied!';
                        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
                    }).catch(() => {
                        btn.textContent = 'Failed';
                        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
                    });
                }
            });
            wrapper.appendChild(btn);
        });
    }

    // ========== SCROLL ==========
    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatScroll.scrollTo({
                top: chatScroll.scrollHeight,
                behavior: 'smooth'
            });
        });
    }

    // ========== CHAT MANAGEMENT ==========
    function clearChat() {
        if (chatHistory.length === 0) return;
        
        messagesContainer.innerHTML = '';
        chatHistory = [];
        welcomeScreen.classList.remove('hidden');
        conversationId = generateId();
        messageInput.focus();
    }

    function newChat() {
        if (chatHistory.length > 0) {
            saveCurrentConversation();
        }
        clearChat();
        closeSidebar();
    }

    // ========== CONVERSATION PERSISTENCE ==========
    function saveCurrentConversation() {
        if (chatHistory.length === 0) return;

        const firstUserMsg = chatHistory.find(m => m.role === 'user');
        const title = firstUserMsg
            ? firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')
            : 'New conversation';

        const conversation = {
            id: conversationId,
            title: title,
            messages: [...chatHistory],
            timestamp: Date.now()
        };

        // Update or add
        const idx = savedConversations.findIndex(c => c.id === conversationId);
        if (idx >= 0) {
            savedConversations[idx] = conversation;
        } else {
            savedConversations.unshift(conversation);
        }

        // Keep max 20
        if (savedConversations.length > 20) {
            savedConversations = savedConversations.slice(0, 20);
        }

        try {
            localStorage.setItem('nexusai_conversations', JSON.stringify(savedConversations));
        } catch (e) {
            // Storage full, ignore
        }

        renderSavedConversations();
    }

    function loadConversations() {
        try {
            const data = localStorage.getItem('nexusai_conversations');
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    function loadConversation(id) {
        const conv = savedConversations.find(c => c.id === id);
        if (!conv) return;

        // Save current first
        if (chatHistory.length > 0) {
            saveCurrentConversation();
        }

        conversationId = conv.id;
        chatHistory = [...conv.messages];
        messagesContainer.innerHTML = '';
        welcomeScreen.classList.add('hidden');

        conv.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'user' : 'ai';
            addMessage(role, msg.content);
        });

        // Add copy buttons to all code blocks
        messagesContainer.querySelectorAll('.code-block-wrapper').forEach(wrapper => {
            addCopyButtons(wrapper.closest('.message-bubble') || wrapper);
        });

        renderSavedConversations();
        closeSidebar();
        scrollToBottom();
    }

    function renderSavedConversations() {
        // Remove old items (keep section title)
        const existingItems = chatHistoryList.querySelectorAll('.history-item');
        existingItems.forEach(item => item.remove());

        savedConversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'history-item' + (conv.id === conversationId ? ' active' : '');
            item.innerHTML = `
                <span class="history-item-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </span>
                <span>${escapeHtml(conv.title)}</span>
            `;
            item.addEventListener('click', () => loadConversation(conv.id));
            chatHistoryList.appendChild(item);
        });
    }

    // ========== SIDEBAR ==========
    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }

    // ========== UTILITIES ==========
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function generateId() {
        return 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }

    // ========== LAUNCH ==========
    init();

})();