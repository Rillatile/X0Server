const port = 8080;
const io = require('socket.io')(port).set('origins', '*:*');

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
let lastLobbyID = 1;
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
// Возвращает объект, имеющий 3 свойства: CanConnect - возможность подключения (true / false),
// Reconnected - производится ли переподключение,
// Side - сторона, за которую будет играть второй игрок ('x' / 'z').
// 'x' - для крестиков, 'z' - для ноликов.
// Если клиент не имеет права подключаться, возвращаемый объект не будет иметь свойства Side,
// а свойство CanConnect будет равно false
const checkLobbyToConnect = (lobby, clientID, password) => {
    const connect = { CanConnect: false, Reconnected: false };
    
    if (lobby.userHistory.length == 2) {
        if (lobby.userHistory.indexOf(clientID) != -1)
            connect.Reconnected = true;
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
                connect.Reconnected = true;
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

console.log(`Server is running on ${port}.\n`);

io.sockets.on('connection', (socket) => {
    console.log(socket.id, "connected.\n");
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
    socket.on('createLobby', ({ name, password, makerID }) => {
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
            turn: (Math.floor((Math.random() * 100)) % 2) == true ? symbolStatus.Cross : symbolStatus.Nought,
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
            // Обновляем статус клиента
            changeClientStatus(socket.id, clientStatus.InLobby);
            // Уведомляем запросившего клиента о том, что лобби успешно создано и отправляем ID лобби
            socket.emit('lobbyCreated', { id: newLobby.id });
            // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
            // массив лобби обновился, и отправляем им обновлённый массив
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
                    if (!connect.Reconnected) {
                        lobby[connect.Side + 'PlayerID'] = clientID;
                        lobby[connect.Side + 'PlayerName'] = clientName;
                        lobby.playersCount++;
                        lobby.userHistory.push(clientID);
                        // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
                        // массив лобби обновился, и отправляем им обновлённый массив
                        lobbiesUpdated(socket, getLobbiesForClient());
                    }

                    const lobbyInfo = {
                        id: lobbyID,
                        xPlayer: lobby.xPlayerID,
                        zPlayer: lobby.zPlayerID,
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

            if (connect.Reconnected)
                io.in(lobby.id).emit('lobbyResumed');
        }
        else {
            // Уведомляем клиента о неуспешной попытке подключения к лобби
            socket.emit('failureJoin');
        }
    });
    // Клиент отключается от лобби
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
            changeClientStatus(socket.id, clientStatus.InLobbiesList);
            io.sockets.connected[socket.id].leave(lobby.id);

            if (lobby.playersCount === 0) {
                const idx = lobbies.findIndex((element) => { return element.id == lobbyID; });
                
                lobbies.splice(idx, 1);
            } else {
                io.in(lobby.id).emit('lobbyPaused');
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
                // Уведомляем клиентов о старте игры и отправляем объект, хранящий ID игрока, чей ход,
                // и матрицу, описывающую состояние игрового поля
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
                    if (point.X > -1 && point.X < 15 && point.Y > -1 && point.Y < 15) {
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
                                io.in(lobbyID.toString()).emit('nowMove',
                                    { id: (lobby.turn === symbolStatus.Cross) ? lobby.xPlayerID : lobby.zPlayerID });
                            }

                            if (lobby.status == lobbyStatus.Close) {
                                const idx = lobbies.findIndex((element) => { return element.id == lobbyID; });

                                Object.keys(socket.adapter.rooms[lobbies[idx].id].sockets).forEach((el) => {
                                    changeClientStatus(el, clientStatus.InLobbiesList);
                                    io.sockets.connected[el].leave(lobbies[idx].id);
                                });

                                lobbies.splice(idx, 1);
                                lobbiesUpdated(socket, getLobbiesForClient());
                            }
                        } else {
                            socket.emit('moveIsNotCorrect');
                        }
                    } else {
                        socket.emit('moveIsNotCorrect');
                    }
            } else {
                socket.emit('moveIsNotCorrect');
            }
        }
    });
});