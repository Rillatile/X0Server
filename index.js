const port = 8080;
const io = require('socket.io')(port);
const uuid = require('uuid');
const getGameStatus = require('./gameLogic').getGameStatus;
const clientStatus = require('./status').ClientStatus;
const lobbyStatus = require('./status').LobbyStatus;
const gameStatus = require('./status').GameStatus;
// Массив, хранящий подключенных клиентов
let clients = [];
// Массив, хранящий существующие лобби
let lobbies = [];
// Переменная, используемая для задания ID нового лобби
let lastLobbyID = 0;
// Функция, возвращающая матрицу n на m, заполненную нулями
const makeEmptyMatrix = (n, m) => {
    const matrix = [];

    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < m; j++)
            matrix[i][j] = 0;
    }

    return matrix;
};
// Функция, проверяющая возможность подключиться к существующему лобби.
// Возвращает объект, имеющий 2 свойства: CanConnect - возможность подключения (true / false),
// Side - сторона, за которую будет играть второй игрок ('x' / 'z' / '').
// 'x' - для крестиков, 'z' - для ноликов, '' - если игрок переподключается.
// Если клиент не имеет права подключаться, возвращаемый объект не будет иметь свойства Side,
// а свойство CanConnect будет равно false
const checkLobbyToConnect = (lobby, clientID, password) => {
    const connect = { CanConnect: false };

    if (lobby.password == password) {
        if (lobby.playersCount < 2)
            connect.Side = lobby.xPlayerID == '' ? 'x' : 'z';
        else
            if (lobby.xPlayerID == clientID)
                connect.Side = 'x';
            else if (lobby.zPlayerID == clientID)
                connect.Side = 'z';

        if ('Side' in connect)
            connect.CanConnect = true;
    }

    return connect;
};
// Функция для изменения статуса клиента
const changeClientStatus = (socketID, newStatus) => {
    clients[clients.findIndex((element) => { return element.id == socketID; })].status = newStatus;
};
// Функция для отправки события, извещающего об изменении массива лобби, и самого обновлённого массива лобби
const lobbiesUpdated = (socket, lobbies) => {
    clients.forEach(element => {
        if (element.status == clientStatus.InLobbiesList)
            socket.to(element.id).emit('lobbiesUpdated', lobbies);
    });
};
// Получение массива с лобби для отправки клиенту
const getLobbiesForClient = () => {
    const buf1 = lobbies.filter((lobby) => { return lobby.status == lobbyStatus.Open; });
    let buf2 = [];

    for (let i = 0; i < buf1.length; i++) {
        buf2[i] = {
            id: buf1[i].id,
            name: buf1[i].name,
            playersCount: buf1[i].playersCount,
            hasPassword: buf1[i].password != '' ? true : false
        };
    }

    return buf2;
};

console.log('Сервер запущен.\n');

io.sockets.on('connection', (socket) => {
    // При подключении клиента добавляем информацию о нём в соответствующий массив
    clients.push({ id: socket.id, status: clientStatus.InMenu });
    console.log(`Новое подключение: ${socket.id}.\n`);
    // Клиент отключился
    socket.on('disconnect', () => {
        const idx = clients.findIndex((element) => { return element.id == socket.id });
        // Удаляем информацию о клиенте из массива
        clients.splice(idx, 1);
        console.log(`Клиент ${socket.id} отключился.\n`);
    });
    // Клиент запрашивает уникальный ID
    socket.on('getUniqueID', (data) => {
        // Отправляем клиенту уникальный ID
        data(uuid.v4());
    });
    // Клиент запрашивает список существующих лобби
    socket.on('getLobbies', (data) => {
        // Отправляем клиенту список лобби
        data(getLobbiesForClient());
        // Обновляем статус клиента
        changeClientStatus(socket.id, clientStatus.InLobbiesList);
    });
    // Клиент запрашивает создание нового лобби
    socket.on('createLobby', ({ name, password, makerID, makerName }) => {
        // Определяем сторону, за которую будет играть создатель лобби
        const randomFlag = (Math.random() * 100) % 2 == 0;
        const newLobby = {
            id: lastLobbyID.toString(),
            name: name,
            password: password,
            playersCount: 1,
            [randomFlag ? 'xPlayerID' : 'zPlayerID']: makerID,
            [!randomFlag ? 'xPlayerID' : 'zPlayerID']: '',
            [randomFlag ? 'xPlayerName' : 'zPlayerName']: makerName,
            [!randomFlag ? 'xPlayerName' : 'zPlayerName']: '',
            status: lobbyStatus.Open,
            xPlayerReady: false,
            zPlayerReady: false,
            turn: (Math.random() * 100) % 2 == 0, // Определяем, кто будет ходить первым. false - нолики, true - крестики.
            field: { matrix: makeEmptyMatrix(15, 15), emptyCount: 225 }
        };

        lastLobbyID++;

        try {
            // Создаём новую комнату
            socket.join(newLobby.id);
            // Добавляем новое лобби в массив
            lobbies.push(newLobby);
            // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
            // массив лобби обновился, и отправляем им обновлённый массив
            lobbiesUpdated(socket, getLobbiesForClient());
            // Обновляем статус клиента
            changeClientStatus(socket.id, clientStatus.InLobby);
            // Уведомляем запросившего клиента о том, что лобби успешно создано и отправляем ID лобби
            socket.emit('lobbyCreated', newLobby.id);
        } catch (error) {
            // Уведомляем клиента о том, что лобби не было создано
            socket.emit('lobbyIsNotCreated');
            console.log(error);
        }
    });
    // Клиент запрашивает подключение к существующему лобби
    socket.on('joinLobby', ({ lobbyID, password, clientID, clientName }) => {
        const lobby = lobbies.find((element) => { return element.id == lobbyID; });
        // Если такое лобби существует ...
        if (lobby !== undefined) {
            // Получаем информацию о возможности подключения к лобби
            const connect = checkLobbyToConnect(lobby, clientID, password);
            // Если подключиться можно ...
            if (connect.CanConnect) {
                try {
                    // Добавляем клиента в комнату
                    socket.join(lobbyID);
                    // Если игрок впервые подключается к лобби, а не переподключается после обрыва соединения
                    if (connect.Side != '') {
                        lobby[connect.Side + 'PlayerID'] = clientID;
                        lobby[connect.Side + 'PlayerName'] = clientName;
                        lobby.playersCount++;
                        // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
                        // массив лобби обновился, и отправляем им обновлённый массив
                        lobbiesUpdated(socket, getLobbiesForClient());
                    }

                    const lobbyInfo = {
                        id: lobbyID,
                        status: lobby.status,
                        field: lobby.field.matrix,
                    }
                    // Уведомляем клиента об успешном подключении к лобби
                    socket.emit('successJoin', lobbyInfo);
                    // Обновляем статус клиента
                    changeClientStatus(socket.id, lobbyInfo.status == lobbyStatus.Game ? clientStatus.InGame : clientStatus.InLobby);
                } catch {
                    // Уведомляем клиента о неуспешной попытке подключения к лобби
                    socket.emit('failureJoin');
                }
            }
            else
            {
                // Уведомляем клиента о неуспешной попытке подключения к лобби
                socket.emit('failureJoin');
            }
        }
        else
        {
            // Уведомляем клиента о неуспешной попытке подключения к лобби
            socket.emit('failureJoin');
        }
    });
    // Клиент готов к началу игры
    socket.on('ready', ({ lobbyID, clientID }) => {
        const lobby = lobbies.find((element) => { return element.id == lobbyID; });

        if (lobby !== undefined) {
            switch (clientID) {
                case lobby.xPlayerID:
                    lobby.xPlayerReady = true;
                    break;
                case lobby.zPlayerID:
                    lobby.zPlayerReady = true;
                    break;
                default:
                    break;
            }
            // Если оба игрока готовы ...
            if (lobby.xPlayerReady && lobby.zPlayerReady) {
                // Уведомляем клиентов о старте игры и отправляем ID игрока, который делает первый ход
                io.in(lobby.id).emit('gameStarted', lobby.turn ? lobby.xPlayerID : lobby.zPlayerID);
                // Обновляем статус лобби
                lobby.status = lobbyStatus.Game;
                // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
                // массив лобби обновился, и отправляем им обновлённый массив
                lobbiesUpdated(socket, getLobbiesForClient());

                const roomSockets = io.sockets.adapter.rooms[lobby.id].sockets;
        
                for (let roomSocket in roomSockets)
                    changeClientStatus(roomSocket, clientStatus.InGame);
            }
        }
    });
    // Клиент отменил готовность к началу игры
    socket.on('notReady', ({ lobbyID, clientID }) => {
        const lobby = lobbies.find((element) => { return element.id == lobbyID; });

        if (lobby !== undefined) {
            switch (clientID) {
                case lobby.xPlayerID:
                    lobby.xPlayerReady = false;
                    break;
                case lobby.zPlayerID:
                    lobby.zPlayerReady = false;
                    break;
                default:
                    break;
            }
        }
    });
    // Клиент делает ход
    socket.on('makeMove', ({ lobbyID, clientID, point }) => {
        const lobby = lobbies.find((element) => { return element.id == lobbyID; });

        if (lobby !== undefined) {
            // Если сейчас ход клиента ...
            if (lobby.turn && lobby.xPlayerID == clientID
                || !lobby.turn && lobby.zPlayerID == clientID) {
                // Если клетка пустая ...
                if (lobby.field.matrix[point.X][point.Y] == 0) {
                    lobby.field.matrix[point.X][point.Y] = lobby.turn ? 1 : 2;
                    lobby.field.emptyCount--;
                    lobby.turn = !lobby.turn;
                    io.in(lobby.id).emit('moveIsCorrect',
                        { point: point, figure: lobby.turn });

                    const gs = getGameStatus(lobby.field, 5, point);
                    // Если игрок победил ...
                    if (gs == gameStatus.Win) {
                        // Уведомляем клиентов в комнате
                        io.in(lobbyID.toString()).emit('gameEnded', { status: gameStatus.Win, winnerID: clientID });
                        lobby.status = lobbyStatus.Close;
                    // Если ничья ...
                    } else if (gs == gameStatus.Draw) {
                        // Уведомляем клиентов в комнате
                        io.in(lobbyID.toString()).emit('gameEnded', { status: gameStatus.Draw });
                        lobby.status = lobbyStatus.Close;
                    } else {
                        io.in(lobbyID.toString()).emit('nowMove', lobby.turn ? lobby.xPlayerID : lobby.zPlayerID);
                    }

                    if (lobby.status == lobbyStatus.Close) {
                        const idx = lobbies.findIndex((element) => { return element.id == lobbyID; });

                        lobbies.splice(idx, 1);
                    }
                } else
                    socket.emit('moveIsNotCorrect');             
            } else
                socket.emit('moveIsNotCorrect');
        }
    });
});