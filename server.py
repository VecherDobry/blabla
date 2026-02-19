from flask import Flask, send_file, send_from_directory, request  # Добавлен request
from flask_socketio import SocketIO, emit
import os
import eventlet
import eventlet.wsgi

# Патч для eventlet
eventlet.monkey_patch()

app = Flask(__name__, static_folder='.')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Хранилище сообщений (последние 50)
messages = []
# Хранилище пользователей
users = {}  # {socket_id: {'name': username, 'status': 'online'}}

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@socketio.on('connect')
def handle_connect():
    print('Клиент подключился')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Клиент {users.get(request.sid, {}).get("name", "Unknown")} отключился')
    if request.sid in users:
        # Удаляем пользователя
        del users[request.sid]
        # Отправляем обновленный список пользователей всем
        emit('users_update', [{'id': sid, 'name': data['name'], 'status': 'offline'} 
                              for sid, data in users.items()], broadcast=True)

@socketio.on('register_user')
def handle_register(data):
    username = data.get('username', 'Аноним')
    print(f'Пользователь зарегистрирован: {username} (ID: {request.sid})')
    
    # Сохраняем пользователя
    users[request.sid] = {
        'name': username,
        'status': 'online'
    }
    
    # Отправляем подтверждение регистрации
    emit('registration_success', {'id': request.sid, 'name': username})
    
    # Отправляем список всех пользователей новому пользователю
    emit('users_update', [{'id': sid, 'name': data['name'], 'status': data['status']} 
                          for sid, data in users.items()])
    
    # Отправляем историю сообщений
    for msg in messages[-50:]:
        emit('message', msg)
    
    # Оповещаем всех о новом пользователе
    emit('user_joined', {'id': request.sid, 'name': username}, broadcast=True)

@socketio.on('message')
def handle_message(data):
    print(f'Сообщение от {data.get("senderName")}: {data.get("text")}')
    
    # Добавляем информацию об отправителе
    if 'senderId' not in data:
        data['senderId'] = request.sid
    
    # Добавляем в историю
    messages.append(data)
    # Ограничиваем историю 100 сообщениями
    if len(messages) > 100:
        messages.pop(0)
    
    # Отправляем сообщение конкретному получателю или всем
    if data.get('recipient') and data['recipient'] != 'всем' and data.get('recipientId') and data['recipientId'] != 'всем':
        # Отправляем личное сообщение
        recipient_id = data.get('recipientId')
        if recipient_id:
            # Отправляем получателю
            emit('message', data, room=recipient_id)
            # Отправляем копию отправителю
            emit('message', data, room=request.sid)
    else:
        # Отправляем всем (общий чат)
        emit('message', data, broadcast=True)

@socketio.on('typing')
def handle_typing(data):
    """Обработка индикатора набора текста"""
    recipient_id = data.get('recipientId')
    if recipient_id and recipient_id != 'всем':
        emit('typing', {
            'userId': request.sid,
            'username': users.get(request.sid, {}).get('name', 'Неизвестно'),
            'isTyping': data.get('isTyping', True)
        }, room=recipient_id)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    print(f"Сервер запускается на порту {port}")
    print(f"Текущая директория: {os.getcwd()}")
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
