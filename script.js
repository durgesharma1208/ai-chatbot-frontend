// static/script.js

const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesList = document.getElementById('messagesList');
const messagesContainer = document.getElementById('messagesContainer');
const typingIndicator = document.getElementById('typingIndicator');
const welcomeScreen = document.getElementById('welcomeScreen');
const newChatBtn = document.getElementById('newChatBtn');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');
const chips = document.querySelectorAll('.chip');

let isWaiting = false;

// ===== AUTO-RESIZE TEXTAREA =====
messageInput.addEventListener('input', () => {
    // Reset height to auto to shrink if text is deleted
    messageInput.style.height = 'auto';
    // Set height to scrollHeight to expand
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    // Enable/disable send button
    sendBtn.disabled = !messageInput.value.trim();
});

// ===== SEND MESSAGE ON ENTER (Shift+Enter for new line) =====
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isWaiting && messageInput.value.trim()) {
            sendMessage();
        }
    }
});

// ===== SEND BUTTON CLICK =====
sendBtn.addEventListener('click', () => {
    if (!isWaiting && messageInput.value.trim()) {
        sendMessage();
    }
});

// ===== SUGGESTION CHIPS =====
chips.forEach(chip => {
    chip.addEventListener('click', () => {
        const message = chip.getAttribute('data-message');
        messageInput.value = message;
        sendBtn.disabled = false;
        sendMessage();
    });
});

// ===== NEW CHAT =====
newChatBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/reset', { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            // Clear messages
            messagesList.innerHTML = '';
            // Show welcome screen
            welcomeScreen.style.display = 'flex';
            // Close sidebar on mobile
            sidebar.classList.remove('open');
        } else {
            console.error('Failed to reset:', data.error);
        }
    } catch (error) {
        console.error('Reset error:', error);
    }
});

// ===== MOBILE MENU TOGGLE =====
menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !menuToggle.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

// ===== SEND MESSAGE FUNCTION =====
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isWaiting) return;

    // Hide welcome screen
    welcomeScreen.style.display = 'none';

    // Add user message to UI
    appendMessage('user', text);

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Show typing indicator
    isWaiting = true;
    typingIndicator.style.display = 'flex';
    scrollToBottom();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();

        // Hide typing indicator
        typingIndicator.style.display = 'none';

        if (response.ok) {
            appendMessage('bot', data.reply);
            setStatus('online', 'Online');
        } else {
            appendMessage('error', data.error || 'Something went wrong');
            setStatus('error', 'Error');
        }
    } catch (error) {
        typingIndicator.style.display = 'none';
        appendMessage('error', 'Failed to connect to server. Is the backend running?');
        setStatus('error', 'Disconnected');
    }

    isWaiting = false;
    scrollToBottom();
}

// ===== APPEND MESSAGE TO DOM =====
function appendMessage(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar');

    const content = document.createElement('div');
    content.classList.add('message-content');

    if (type === 'user') {
        avatar.textContent = 'Y';
        content.textContent = text;
    } else if (type === 'bot') {
        avatar.textContent = '✦';
        content.innerHTML = formatMarkdown(text);
    } else if (type === 'error') {
        avatar.textContent = '⚠';
        content.textContent = text;
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesList.appendChild(messageDiv);

    scrollToBottom();
}

// ===== BASIC MARKDOWN FORMATTER =====
function formatMarkdown(text) {
    // Escape HTML first
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code (`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Unordered lists
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Line breaks (double newline = paragraph)
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph
    if (!html.startsWith('<')) {
        html = `<p>${html}</p>`;
    }

    return html;
}

// ===== SCROLL TO BOTTOM =====
function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// ===== SET STATUS =====
function setStatus(type, text) {
    statusDot.className = 'status-dot ' + type;
    document.querySelector('.status-text').textContent = text;
}
