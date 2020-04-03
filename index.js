const port = 8080;
// also, every 3 secs emit ping-package. if emited host will not response for 90 sec, drop it 
const io = require('socket.io')(port, { 'pingTimeout': 90000, 'pingInterval': 3000 }).set('origins', '*:*');

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
// Side - сторона, за которую будет играть второй игрок ('x' / 'o').
// 'x' - для крестиков, 'o' - для ноликов.
// Если клиент не имеет права подключаться, возвращаемый объект не будет иметь свойства Side,
// а свойство CanConnect будет равно false
const checkLobbyToConnect = (lobby, clientID, password) => {
    const connect = { CanConnect: false, Reconnected: false };

    let idx = lobby.userHistory.findIndex((element) => { return element.uid === clientID; });
    if (idx != -1)
        connect.Reconnected = true;

    if (lobby.password == password) {
        // define the symbol for the first player
        if (lobby.playersCount === 0)
            connect.Side = (Math.floor((Math.random() * 100)) % 2) == true ? 'x' : 'o';

        if (lobby.playersCount === 1) {
            if (lobby.xPlayerID === '')
                connect.Side = 'x';
            else if (lobby.oPlayerID === '')
                connect.Side = 'o';
        }

        if (lobby.playersCount === 2) {
            if (lobby.xPlayerID === clientID)
                connect.Side = 'x';
            if (lobby.oPlayerID === clientID)
                connect.Side = 'o';
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
        //if (element.status == clientStatus.InLobbiesList)
        socket.to(element.id).emit('lobbiesUpdated', lobbies);
    });
};
// Получение массива с лобби для отправки клиенту
const getLobbiesForClient = () => {
    const buf1 = lobbies.filter((lobby) => { return lobby.status != lobbyStatus.Close; });
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
        // ADDED: hard disconnect fixes. Now it's handling all lobbies where our player has been before disconnecting or closed app
        // finda all lobbies where this socket_id was 
        let lobbiesWherePlayerWasBeforeDisconnect = lobbies.filter((element) => { return (element.userHistory.filter(el => el.sid == socket.id)).length > 0});
        
        // remap for lobby-side tokens
        let filteredLobbies = lobbiesWherePlayerWasBeforeDisconnect.map((lobby) => {            
            let side = lobby.userHistory.filter(el => el.sid === socket.id);
            side = side.pop().side;
            return {lobby, side};
        });

        filteredLobbies.forEach(el => {
            // drop user in hardDisconnect
            el.lobby[el.side + 'PlayerID'] = "";
            el.lobby[el.side + 'PlayerName'] = "";
            el.lobby.playersCount--;

            // clear lobbies if its necessary
            if (el.playersCount === 0) {
                const idx = lobbies.findIndex(intEl => intEl == el.lobby);
                lobbies.splice(idx, 1);
            }
        });
        
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

            oPlayerID: '',
            oPlayerName: '',
            oPlayerReady: false,

            status: lobbyStatus.Open,
            turn: (Math.floor((Math.random() * 100)) % 2) == true ? symbolStatus.Cross : symbolStatus.Nought,
            field: { matrix: makeEmptyMatrix(15, 15), emptyCount: 225 },

            paused: false,
            userHistory: []
        };

        lastLobbyID++;

        try {
            // Создаём новую комнату
            socket.join(newLobby.id);
            // Добавляем новое лобби в массив
            lobbies.push(newLobby);
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
                    lobby[connect.Side + 'PlayerID'] = clientID;
                    lobby[connect.Side + 'PlayerName'] = clientName;
                    lobby.playersCount++;
                    lobby.userHistory.push({uid: clientID, sid: socket.id, side: connect.Side});
                    // Уведомляем всех клиентов, которые имеют статус "В списке лобби", о том, что
                    // массив лобби обновился, и отправляем им обновлённый массив
                    lobbiesUpdated(socket, getLobbiesForClient());

                    const lobbyInfo = {
                        id: lobbyID,
                        xPlayer: lobby.xPlayerID,
                        oPlayer: lobby.oPlayerID,
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
            if (lobby.oPlayerID === clientID) {
                lobby.oPlayerID = '';
                lobby.oPlayerName = '';
                lobby.oPlayerReady = false;
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
            } else
                io.in(lobby.id).emit('lobbyPaused');
        }

        lobbiesUpdated(socket, getLobbiesForClient());
    });
    // Клиент готов к началу игры
    socket.on('ready', ({ lobbyID, clientID }) => {
        const lobby = lobbies.find((element) => { return element.id == lobbyID; });

        if (lobby !== undefined) {
            // console.log(lobby);
            switch (clientID) {
                case lobby.xPlayerID:
                    lobby.xPlayerReady = true;
                    break;
                case lobby.oPlayerID:
                    lobby.oPlayerReady = true;
                    break;
                default:
                    break;
            }
            // Если оба игрока готовы ...
            if (lobby.xPlayerReady && lobby.oPlayerReady) {
                // Уведомляем клиентов о старте игры и отправляем объект, хранящий ID игрока, чей ход,
                // и матрицу, описывающую состояние игрового поля
                io.in(lobby.id).emit('gameStarted', {
                    turn: lobby.turn === symbolStatus.Cross ? lobby.xPlayerID : lobby.oPlayerID,
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
                case lobby.oPlayerID:
                    lobby.oPlayerReady = false;
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
                (lobby.turn === symbolStatus.Nought && lobby.oPlayerID === clientID)) {
                // Если клетка пустая ...
                if (lobby.field.matrix[point.X][point.Y] == symbolStatus.Empty) {
                    lobby.field.matrix[point.X][point.Y] = lobby.turn;
                    lobby.field.emptyCount--;

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
                        io.in(lobbyID.toString()).emit('nowMove', (lobby.turn === symbolStatus.Cross) ? lobby.xPlayerID : lobby.oPlayerID);
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


                    if (lobby.turn === symbolStatus.Cross)
                        lobby.turn = symbolStatus.Nought;
                    else
                        lobby.turn = symbolStatus.Cross;
                } else
                    socket.emit('moveIsNotCorrect');
            } else
                socket.emit('moveIsNotCorrect');
        }
    });
});

exports.server = io;