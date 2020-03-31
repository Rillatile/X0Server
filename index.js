const port = 8080;
const io = require('socket.io')(port);
io.set('origins', '*:*');

const uuid = require('uuid');

const getGameStatus = require('./gameLogic').getGameStatus;

const clientStatus = require('./status').ClientStatus;
const lobbyStatus = require('./status').LobbyStatus;
const gameStatus = require('./status').GameStatus;
const symbolStatus = require('./status').SymbolStatus;

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
            matrix[i][j] = symbolStatus.Empty;
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
    const connect = { CanConnect: false, reconected: false };
    
    if (lobby.userHistory.length == 2) {
        if (lobby.userHistory.indexOf(clientID) != -1)
            connect.reconected = true;
        else
            return connect;
    }

    if (lobby.password == password) {
        // define the symbol for the first player
        if (lobby.playersCount === 0)
            connect.Side = (Math.floor((Math.random() * 100)) % 2) == true ? 'x' : 'z';

        if (lobby.playersCount === 1) {
            if (lobby.xPlayerID === '')
                connect.Side = 'x';
            else if (lobby.zPlayerID === '')
                connect.Side = 'z';
        }

        if (lobby.playersCount === 2) {
            if (lobby.xPlayerID === clientID)
                connect.Side = 'x';
            if (lobby.zPlayerID === clientID)
                connect.Side = 'z';
            if ('Side' in connect)
                connect.reconected = true;
        }

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
    const buf1 = lobbies.filter((lobby) => { return lobby.status == lobbyStatus.Open || lobby.status == lobbyStatus.Game; });
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

console.log(`Server running on ${port}`);

io.sockets.on('connection', (socket) => {
    console.log(socket.id, "connected");
    // При подключении клиента добавляем информацию о нём в соответствующий массив
    clients.push({ id: socket.id, status: clientStatus.InMenu });
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
        data({ id: uuid.v4() });
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
        const newLobby = {
            id: lastLobbyID.toString(),

            name: name,
            password: password,
            playersCount: 0,
            creatorID: makerID,

            xPlayerID: '',
            xPlayerName: '',
            xPlayerReady: false,

            zPlayerID: '',
            zPlayerName: '',
            zPlayerReady: false,

            status: lobbyStatus.Open,
            turn: (Math.floor((Math.random() * 100)) % 2) == true ? symbolStatus.Cross : symbolStatus.Nought, // false - нолики, true - крестики. Блять, додик Патау, проверяй ту поеботу, что пишешь
            field: { matrix: makeEmptyMatrix(15, 15), emptyCount: 225 },

            paused: false,
            userHistory: [],
        };

        lastLobbyID++;

        try {
            // Создаём новую комнату
            socket.join(newLobby.id);
            // Добавляем новое лобби в массив
            lobbies.push(newLobby);
            // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
            // массив лобби обновился, и отправляем им обновлённый массив
            // Обновляем статус клиента
            changeClientStatus(socket.id, clientStatus.InLobby);
            // Уведомляем запросившего клиента о том, что лобби успешно создано и отправляем ID лобби
            socket.emit('lobbyCreated', { id: newLobby.id });
            lobbiesUpdated(socket, getLobbiesForClient());
        } catch (error) {
            // Уведомляем клиента о том, что лобби не было создано
            socket.emit('lobbyIsNotCreated');
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

                    if (!connect.reconected) {
                        lobby.userHistory.push(clientID);
                    }

                    const lobbyInfo = {
                        id: lobbyID,
                        xPlayer: lobby.xPlayerID,
                        oPlayer: lobby.zPlayerID,
                        currentTurn: lobby.turn
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
            else {
                // Уведомляем клиента о неуспешной попытке подключения к лобби
                socket.emit('failureJoin');
            }
            if (connect.reconected)
                io.in(lobby.id).emit('lobbyResumed');
        }
        else {
            // Уведомляем клиента о неуспешной попытке подключения к лобби
            socket.emit('failureJoin');
        }
    });
    socket.on('leaveLobby', ({ lobbyID, clientID }) => {
        const lobby = lobbies.find((element) => { return element.id == lobbyID; });
        if (lobby !== undefined) {
            if (lobby.zPlayerID === clientID) {
                lobby.zPlayerID = '';
                lobby.zPlayerName = '';
                lobby.zPlayerReady = false;
            } else if (lobby.xPlayerID === clientID) {
                lobby.xPlayerID = '';
                lobby.xPlayerName = '';
                lobby.xPlayerReady = false;
            }
            lobby.playersCount--;

            if (clientID === lobby.creatorID) {
                const idx = lobbies.findIndex((element) => { return element.id == lobbyID; });
                lobbies.splice(idx, 1);

                io.in(lobby.id).emit('lobbyDeleted');

                Object.keys(socket.adapter.rooms[lobby.id].sockets).forEach((el) => {
                    changeClientStatus(el, clientStatus.InLobbiesList);
                    io.sockets.connected[el].leave(lobby.id);
                });
            } else {
                io.in(lobby.id).emit('lobbyPaused');
                changeClientStatus(socket.id, clientStatus.InLobbiesList);
                io.sockets.connected[socket.id].leave(lobby.id);
            }
        }
        lobbiesUpdated(socket, getLobbiesForClient());
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
                io.in(lobby.id).emit('gameStarted', {
                    turn: lobby.turn === symbolStatus.Cross ? lobby.xPlayerID : lobby.zPlayerID,
                    board: lobby.field.matrix
                });
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
            if ((lobby.turn === symbolStatus.Cross && lobby.xPlayerID === clientID) ||
                (lobby.turn === symbolStatus.Nought && lobby.zPlayerID === clientID)) {
                // Если клетка пустая ...
                if (lobby.field.matrix[point.X][point.Y] == symbolStatus.Empty) {
                    lobby.field.matrix[point.X][point.Y] = lobby.turn;
                    lobby.field.emptyCount--;

                    if (lobby.turn === symbolStatus.Cross)
                        lobby.turn = symbolStatus.Nought;
                    else
                        lobby.turn = symbolStatus.Cross;
                    
                    io.in(lobby.id).emit('moveIsCorrect', { point: point, figure: lobby.turn });

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
                        io.in(lobbyID.toString()).emit('nowMove', (lobby.turn === symbolStatus.Cross) ? lobby.xPlayerID : lobby.zPlayerID);
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