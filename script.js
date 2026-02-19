// Подключаемся к серверу
const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

let currentRecipient = null;
let currentRecipientId = null;
let mySocketId = null;
let myUsername = null;
let messageQueue = new Set(); // Очередь отправленных сообщений
let users = {}; // Список пользователей
let typingTimeout = null;

// Элементы DOM
const messagesDiv = document.getElementById('messages');
const recipientSpan = document.getElementById('recipient');
const connectionStatus = document.getElementById('connection-status');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const usersList = document.getElementById('users-list');
const currentUsernameSpan = document.getElementById('current-username');

// Функция отправки имени
window.submitName = function() {
    const usernameInput = document.getElementById('usernameInput');
    const username = usernameInput.value.trim();
    
    if (!username) {
        alert('Пожалуйста, введите имя');
        return;
    }
    
    myUsername = username;
    
    // Скрываем модальное окно
    document.getElementById('nameModal').style.display = 'none';
    
    // Регистрируем пользователя на сервере
    socket.emit('register_user', { username: username });
    
    // Показываем имя в статус-баре
    if (currentUsernameSpan) {
        currentUsernameSpan.textContent = username;
    }
};

// Подключение к серверу
socket.on('connect', function() {
    mySocketId = socket.id;
    console.log('Подключено к серверу. ID:', mySocketId);
    
    if (connectionStatus) {
        connectionStatus.textContent = 'Онлайн';
        connectionStatus.style.color = '#2ecc71';
    }
    
    // Если имя уже было введено (например, при переподключении)
    if (myUsername) {
        socket.emit('register_user', { username: myUsername });
    }
    
    addSystemMessage('Вы подключены к чату');
});

socket.on('disconnect', function() {
    console.log('Отключено от сервера');
    if (connectionStatus) {
        connectionStatus.textContent = 'Офлайн';
        connectionStatus.style.color = '#e74c3c';
    }
    addSystemMessage('Отключено от сервера');
    
    // Блокируем ввод
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
});

socket.on('connect_error', function(error) {
    console.error('Ошибка подключения:', error);
    if (connectionStatus) {
        connectionStatus.textContent = 'Ошибка';
        connectionStatus.style.color = '#f39c12';
    }
    addSystemMessage('Ошибка подключения к серверу');
});

// Успешная регистрация
socket.on('registration_success', function(data) {
    mySocketId = data.id;
    myUsername = data.name;
    console.log('Регистрация успешна:', data);
    enableChat();
});

// Обновление списка пользователей
socket.on('users_update', function(usersList) {
    console.log('Обновление списка пользователей:', usersList);
    users = {};
    usersList.forEach(user => {
        users[user.id] = user;
    });
    renderUsersList();
});

// Новый пользователь присоединился
socket.on('user_joined', function(data) {
    console.log('Пользователь присоединился:', data);
    addSystemMessage(`Пользователь ${data.name} присоединился к чату`);
});

// Получение сообщений
socket.on('message', function(data) {
    console.log('Получено сообщение от сервера:', data);
    
    // Проверяем, не отправили ли мы это сообщение сами
    if (data.id && messageQueue.has(data.id)) {
        console.log('Это наше сообщение (по ID), пропускаем');
        messageQueue.delete(data.id);
        return;
    }
    
    // Проверяем отправителя
    if (data.senderId === mySocketId || data.sender === mySocketId) {
        console.log('Это наше сообщение, пропускаем');
        return;
    }
    
    // Если сообщение личное и не для нас - игнорируем
    if (data.recipientId && data.recipientId !== 'всем' && 
        data.recipientId !== mySocketId && data.senderId !== mySocketId) {
        console.log('Сообщение не для нас, игнорируем');
        return;
    }
    
    // Показываем сообщение
    addMessage(data, false);
});

// Индикатор набора текста
socket.on('typing', function(data) {
    const userId = data.userId;
    const username = data.username;
    const isTyping = data.isTyping;
    
    // Показываем индикатор только если это пользователь из текущего чата
    if (userId === currentRecipientId) {
        let typingIndicator = document.getElementById('typing-indicator');
        if (!typingIndicator) {
            typingIndicator = document.createElement('div');
            typingIndicator.id = 'typing-indicator';
            typingIndicator.className = 'typing-indicator';
            messagesDiv.appendChild(typingIndicator);
        }
        
        if (isTyping) {
            typingIndicator.textContent = `${username} печатает...`;
        } else {
            typingIndicator.textContent = '';
        }
    }
});

function renderUsersList() {
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    // Добавляем опцию "Общий чат"
    const generalChatItem = createUserListItem('всем', 'Общий чат', null, true);
    usersList.appendChild(generalChatItem);
    
    // Добавляем всех пользователей
    Object.values(users).forEach(user => {
        if (user.id !== mySocketId) { // Не показываем себя
            const userItem = createUserListItem(user.id, user.name, user.status);
            usersList.appendChild(userItem);
        }
    });
    
    // Добавляем себя в список (для отправки самому себе)
    if (mySocketId && myUsername) {
        const selfItem = createUserListItem(mySocketId, `${myUsername} (себе)`, 'online');
        usersList.appendChild(selfItem);
    }
}

function createUserListItem(id, name, status, isGeneral = false) {
    const div = document.createElement('div');
    div.className = `user-item ${id === currentRecipientId ? 'selected' : ''}`;
    div.setAttribute('data-user-id', id);
    
    if (isGeneral) {
        div.innerHTML = `
            <div class="user-avatar" style="background: #9b59b6;">🌐</div>
            <div class="user-info">
                <div class="user-name">${name}</div>
                <div class="user-status online">Общий чат</div>
            </div>
        `;
    } else {
        const statusClass = status === 'online' ? 'online' : 'offline';
        const avatarLetter = name ? name.charAt(0).toUpperCase() : '?';
        
        div.innerHTML = `
            <div class="user-avatar">${avatarLetter}</div>
            <div class="user-info">
                <div class="user-name">${name}</div>
                <div class="user-status ${statusClass}">${status || 'offline'}</div>
            </div>
        `;
    }
    
    div.onclick = function() {
        selectUser(id, name);
    };
    
    return div;
}

function selectUser(userId, userName) {
    currentRecipientId = userId;
    currentRecipient = userName;
    
    if (recipientSpan) {
        recipientSpan.textContent = userName;
    }
    
    // Обновляем выделение в списке
    document.querySelectorAll('.user-item').forEach(item => {
        if (item.getAttribute('data-user-id') === userId) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Очищаем индикатор набора текста
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.textContent = '';
    }
    
    console.log('Выбран пользователь:', userName, 'ID:', userId);
}

function enableChat() {
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.focus();
    }
    if (sendButton) {
        sendButton.disabled = false;
    }
    
    // Выбираем общий чат по умолчанию
    selectUser('всем', 'Общий чат');
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    } else {
        // Отправляем индикатор набора текста
        if (!typingTimeout && currentRecipientId && currentRecipientId !== 'всем') {
            socket.emit('typing', {
                recipientId: currentRecipientId,
                isTyping: true
            });
        } else if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        typingTimeout = setTimeout(() => {
            if (currentRecipientId && currentRecipientId !== 'всем') {
                socket.emit('typing', {
                    recipientId: currentRecipientId,
                    isTyping: false
                });
            }
            typingTimeout = null;
        }, 1000);
    }
}

function sendMessage() {
    if (!messageInput || !messageInput.value.trim()) return;
    if (!currentRecipient) {
        alert('Выберите получателя');
        return;
    }
    
    const text = messageInput.value.trim();
    
    // Создаем уникальный ID для сообщения
    const messageId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const message = {
        id: messageId,
        senderId: mySocketId,
        senderName: myUsername || 'Я',
        sender: myUsername || 'Я',
        recipient: currentRecipient,
        recipientId: currentRecipientId !== 'всем' ? currentRecipientId : null,
        text: text,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    };
    
    console.log('Отправляем сообщение:', message);
    
    // Добавляем ID в очередь отправленных
    messageQueue.add(messageId);
    
    // Отправляем на сервер
    socket.emit('message', message);
    
    // Показываем в чате локально
    addMessage({
        ...message,
        sender: 'Я'
    }, true);
    
    // Очищаем поле ввода
    messageInput.value = '';
    
    // Отправляем сигнал о прекращении набора текста
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        if (currentRecipientId && currentRecipientId !== 'всем') {
            socket.emit('typing', {
                recipientId: currentRecipientId,
                isTyping: false
            });
        }
        typingTimeout = null;
    }
}

function addMessage(data, isOwn) {
    if (!messagesDiv) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOwn ? 'own' : 'their'}`;
    
    // Определяем отправителя для отображения
    let displaySender = data.senderName || data.sender;
    if (displaySender === mySocketId || displaySender === myUsername) {
        displaySender = 'Я';
    }
    
    // Добавляем информацию о получателе для личных сообщений
    let recipientInfo = '';
    if (data.recipient && data.recipient !== 'Общий чат' && data.recipient !== 'всем' && !isOwn) {
        recipientInfo = ` → ${data.recipient}`;
    }
    
    messageElement.innerHTML = `<b>${displaySender}${recipientInfo}</b> (${data.time})<br>${data.text}`;
    messagesDiv.appendChild(messageElement);
    
    // Прокручиваем вниз
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
    if (!messagesDiv) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message their';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontStyle = 'italic';
    messageElement.style.backgroundColor = '#f0f0f0';
    messageElement.style.maxWidth = '100%';
    
    messageElement.innerHTML = `<i>${text}</i>`;
    messagesDiv.appendChild(messageElement);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Для отладки
window.clearMessageQueue = function() {
    messageQueue.clear();
    console.log('Очередь сообщений очищена');
};
