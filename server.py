from flask import Flask, send_file, send_from_directory
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

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@socketio.on('connect')
def handle_connect():
    print('Клиент подключился')
    # Отправляем историю сообщений новому пользователю
    for msg in messages[-50:]:
        emit('message', msg)

@socketio.on('disconnect')
def handle_disconnect():
    print('Клиент отключился')

@socketio.on('message')
def handle_message(data):
    print(f'Получено сообщение: {data}')
    # Добавляем в историю
    messages.append(data)
    # Ограничиваем историю 100 сообщениями
    if len(messages) > 100:
        messages.pop(0)
    # Отправляем всем
    emit('message', data, broadcast=True)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    print(f"Сервер запускается на порту {port}")
    print(f"Текущая директория: {os.getcwd()}")
    socketio.run(app, host='0.0.0.0', port=port, debug=False)

