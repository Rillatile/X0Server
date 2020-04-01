const port = 8080;
const io = require('socket.io-client');
const expect = require('chai').expect;
const app = require('../index');

describe('Проверка возможности подключения к серверу и корректности получения уникального ID', () => {
    let client;
    
    after((done) => {
        app.server.close();
        done();
    });

    beforeEach((done) => {
        client = io('http://localhost:' + port.toString());
        done();
    });

    afterEach((done) => {
        client.close();
        done();
    });

    it('Проверка возможности подключения к серверу', (done) => {
        client.on('connect', () => {
            expect(client.connected).to.equal(true, 'Нет подключения к серверу');
            done();
        });
    });

    it('Проверка корректности получения уникального ID', (done) => {
        client.on('connect', () => {
            client.emit('getUniqueID', (data) => {
                expect(data).to.have.property('id');
                expect(data.id).to.be.a('string', 'Идентификатор не является строкой');
                expect(data.id.length).to.not.equal(0, 'Идентификатор пустой');
                done();
            });
        });
    });
});

describe('Проверка корректности работы сервера', () => {
    let client1;
    let client2;

    before((done) => {
        app.server.listen(8080).set('origins', '*:*');
        done();
    });

    after((done) => {
        app.server.close();
        done();
    });

    beforeEach((done) => {
        client1 = io('http://localhost:' + port.toString());
        client2 = io('http://localhost:' + port.toString());
        done();
    });

    afterEach((done) => {
        client1.close();
        client2.close();
        done();
    });

    it('Проверка, что изначально массив лобби пуст', (done) => {
        client1.on('connect', () => {
            client1.emit('getLobbies', (data) => {
                expect(data).to.be.a('array', 'Это не массив');
                expect(data.length).to.equal(0, 'Длина массива отличается от нуля');
                done();
            });
        });
    });

    it('Проверка создания лобби', (done) => {
        client1.on('connect', () => {
            let id = '';

            client1.emit('getUniqueID', (data) => {
                id = data.id;
                client1.emit('createLobby', { name: 'Test', password: '', makerID: id });

                client1.on('lobbyCreated', (data) => {
                    expect(data).to.have.property('id');
                    expect(data.id).to.be.a('string', 'Идентификатор не является строкой');
                    expect(data.id.length).to.not.equal(0, 'Идентификатор пустой');
                    expect(data.id).to.equal('1');
                    done();
                });
            });
        });
    });

    it('Проверка корректного подключения к лобби', (done) => {
        client1.on('connect', () => {
            let id = '';

            client1.emit('getUniqueID', (data) => {
                id = data.id;
                client1.emit('createLobby', { name: 'Test', password: '', makerID: id });

                client1.on('lobbyCreated', (data) => {
                    const client2 = io('http://localhost:' + port.toString());

                    client2.on('connect', () => {
                        let id2 = '';

                        client2.emit('getUniqueID', (data) => {
                            id2 = data.id;
                            client2.emit('joinLobby', { lobbyID: '2', password: '', clientID: id2, clientName: 'Ivan' });

                            client2.on('successJoin', (data) => {
                                expect(data.id).to.equal('2');
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    it('Проверка подключения к несуществующему лобби', (done) => {
        client1.on('connect', () => {
            let id = '';

            client1.emit('getUniqueID', (data) => {
                id = data.id;
                client1.emit('joinLobby', { lobbyID: '3', password: '', clientID: id, clientName: 'Roman' });

                client1.on('successJoin', (data) => {
                    expect(1).to.equal(2, 'От сервера пришло сообщение об успешном подключении');
                    done();
                });

                client1.on('failureJoin', () => {
                    expect(1).to.equal(1);
                    done();
                });
            });
        });
    });

    it('Проверка попытки подключения к лобби, используя неправильный пароль', (done) => {
        client1.on('connect', () => {
            let id = '';

            client1.emit('getUniqueID', (data) => {
                id = data.id;
                client1.emit('createLobby', { name: 'Lobby 3', password: '1234', makerID: id });

                client1.on('lobbyCreated', (data) => {
                    client1.emit('joinLobby', { lobbyID: '3', password: '123', clientID: id, clientName: 'Roman' });

                    client1.on('successJoin', (data) => {
                        expect(1).to.equal(2, 'От сервера пришло сообщение об успешном подключении');
                        done();
                    });

                    client1.on('failureJoin', () => {
                        expect(1).to.equal(1);
                        done();
                    });
                });
            });
        });
    });

    /*it('Проверка отключения от лобби', (done) => {
        client1.on('connect', () => {
            let id = '';

            client1.emit('getUniqueID', (data) => {
                id = data.id;
                client1.emit('createLobby', { name: 'Lobby 4', password: '', makerID: id });

                client1.on('lobbyCreated', (data) => {
                    client1.emit('joinLobby', { lobbyID: '4', password: '', clientID: id, clientName: 'Roman' });

                    client1.on('successJoin', (data) => {
                        client1.emit('leaveLobby', { lobbyID: '4', clientID: id });

                        client1.on('lobbiesUpdated', (data) => {
                            const idx = data.findIndex((element) => { return element.id == '4'; });

                            expect(idx).to.equal(-1, 'Лобби не было удалено');
                            done();
                        });
                    });
                });
            });
        });
    });*/
});

describe('Проверка некорректной партии', () => {
    let client1;
    let client2;
    let id1;
    let id2;
    let gameInfo = {};
    let xPlayer = {};
    let zPlayer = {};

    before((done) => {
        app.server.listen(8080).set('origins', '*:*');
        client1 = io('http://localhost:' + port.toString());
        client2 = io('http://localhost:' + port.toString());
        client1.emit('getUniqueID', (data1) => {
            id1 = data1.id;
            client1.emit('createLobby', { name: 'Test lobby', password: '1234', makerID: id1 });
            client1.on('lobbyCreated', (lobbyInfo) => {
                client1.emit('joinLobby', { lobbyID: lobbyInfo.id, password: '1234', clientID: id1, clientName: 'Roman' });
                client1.on('successJoin', (data2) => {
                    client2.emit('getUniqueID', (data3) => {
                        id2 = data3.id;
                        client2.emit('joinLobby', { lobbyID: lobbyInfo.id, password: '1234', clientID: id2, clientName: 'Ivan' });
                        client2.on('successJoin', (data4) => {
                            console.log(data4);
                            const flag = data4.xPlayer === id1;
                            console.log(`Крестики: ${flag ? 'client1' : 'client2'}, нолики: ${!flag ? 'client1' : 'client2'}`);
                            console.log(`Первыми ходят ${data4.currentTurn ? 'нолики' : 'крестики'}`);
                            if (flag) {
                                xPlayer = { client: client1, id: id1 };
                                zPlayer = { client: client2, id: id2 };
                            } else {
                                xPlayer = { client: client2, id: id2 };
                                zPlayer = { client: client1, id: id1 };
                            }
                            client1.emit('ready', { lobbyID: data4.id, clientID: id1 });
                            client2.emit('ready', { lobbyID: data4.id, clientID: id2 });
                            client1.on('gameStarted', (data) => {
                                gameInfo = data;
                                gameInfo.id = data4.id;
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    after((done) => {
        client1.close();
        client2.close();
        app.server.close();
        done();
    });

    const makeIncorrectMove = (player, point) => {
        player.client.emit('makeMove',
            {
                lobbyID: gameInfo.id,
                clientID: player.id,
                point: point
            });
        
        player.client.on('moveIsNotCorrect', () => {
            expect(1).to.equal(1);
        });
    
        player.client.on('moveIsCorrect', (data) => {
            expect(1).to.equal(2, 'От сервера пришёл ответ, что ход корректен');
        });
    };

    it('Проверка попытки сделать ход вне очереди', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(zPlayer, { X: 0, Y: 0 });
        } else {
            makeIncorrectMove(xPlayer, { X: 0, Y: 0 });
        }

        done();
    });

    it('Проверка попытки сделать ход по некорректным координатам №1', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(xPlayer, { X: -1, Y: 0 });
        } else {
            makeIncorrectMove(zPlayer, { X: -1, Y: 0 });
        }

        done();
    });

    it('Проверка попытки сделать ход по некорректным координатам №2', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(xPlayer, { X: 0, Y: -1 });
        } else {
            makeIncorrectMove(zPlayer, { X: 0, Y: -1 });
        }

        done();
    });

    it('Проверка попытки сделать ход по некорректным координатам №3', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(xPlayer, { X: -1, Y: -1 });
        } else {
            makeIncorrectMove(zPlayer, { X: -1, Y: -1 });
        }

        done();
    });

    it('Проверка попытки сделать ход по некорректным координатам №4', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(xPlayer, { X: 15, Y: 0 });
        } else {
            makeIncorrectMove(zPlayer, { X: 15, Y: 0 });
        }

        done();
    });

    it('Проверка попытки сделать ход по некорректным координатам №5', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(xPlayer, { X: 0, Y: 15 });
        } else {
            makeIncorrectMove(zPlayer, { X: 0, Y: 15 });
        }

        done();
    });

    it('Проверка попытки сделать ход по некорректным координатам №6', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeIncorrectMove(xPlayer, { X: 15, Y: 15 });
        } else {
            makeIncorrectMove(zPlayer, { X: 15, Y: 15 });
        }

        done();
    });
});

describe('Проверка корректной победной партии', () => {
    let client1;
    let client2;
    let id1;
    let id2;
    let gameInfo = {};
    let xPlayer = {};
    let zPlayer = {};

    before((done) => {
        app.server.listen(8080).set('origins', '*:*');
        client1 = io('http://localhost:' + port.toString());
        client2 = io('http://localhost:' + port.toString());
        client1.emit('getUniqueID', (data1) => {
            id1 = data1.id;
            client1.emit('createLobby', { name: 'Test lobby', password: '1234', makerID: id1 });
            client1.on('lobbyCreated', (lobbyInfo) => {
                client1.emit('joinLobby', { lobbyID: lobbyInfo.id, password: '1234', clientID: id1, clientName: 'Roman' });
                client1.on('successJoin', (data2) => {
                    client2.emit('getUniqueID', (data3) => {
                        id2 = data3.id;
                        client2.emit('joinLobby', { lobbyID: lobbyInfo.id, password: '1234', clientID: id2, clientName: 'Ivan' });
                        client2.on('successJoin', (data4) => {
                            console.log(data4);
                            const flag = data4.xPlayer === id1;
                            console.log(`Крестики: ${flag ? 'client1' : 'client2'}, нолики: ${!flag ? 'client1' : 'client2'}`);
                            console.log(`Первыми ходят ${data4.currentTurn ? 'нолики' : 'крестики'}`);
                            if (flag) {
                                xPlayer = { client: client1, id: id1 };
                                zPlayer = { client: client2, id: id2 };
                            } else {
                                xPlayer = { client: client2, id: id2 };
                                zPlayer = { client: client1, id: id1 };
                            }
                            client1.emit('ready', { lobbyID: data4.id, clientID: id1 });
                            client2.emit('ready', { lobbyID: data4.id, clientID: id2 });
                            client1.on('gameStarted', (data) => {
                                gameInfo.turn = data.turn;
                                gameInfo.id = data4.id;
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    after((done) => {
        client1.close();
        client2.close();
        app.server.close();
        done();
    });

    const makeCorrectMove = (player, point) => {
        player.client.emit('makeMove',
            {
                lobbyID: gameInfo.id,
                clientID: player.id,
                point: point
            });
        
        player.client.on('moveIsNotCorrect', () => {
            expect(1).to.equal(2, 'От сервера пришёл ответ, что ход некорректен');
        });
    
        player.client.on('moveIsCorrect', (data) => {
            expect(1).to.equal(1);
        });

        player.client.on('nowMove', (data) => {
            gameInfo.turn = data.id;
        });

        player.client.on('gameEnded', (data2) => {
            expect(data2).to.have.property('status');
            expect(data2).to.have.property('winnerID');
            expect(data2.status).to.be.a('number', 'Статус не является целым числом');
            expect(data2.winnerID).to.be.a('string', 'ID победителя не является строкой');
            expect(data2.status).to.equal(0, 'Статус игры не равен победе');
        });
    };

    it('Проверка попытки сделать корректный ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 0, Y: 0 });
        } else {
            makeCorrectMove(zPlayer, { X: 0, Y: 0 });
        }

        done();
    });

    it('Второй ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 1, Y: 0 });
        } else {
            makeCorrectMove(zPlayer, { X: 1, Y: 0 });
        }

        done();
    });

    it('Третий ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 0, Y: 1 });
        } else {
            makeCorrectMove(zPlayer, { X: 0, Y: 1 });
        }

        done();
    });

    it('Четвёртый ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 2, Y: 0 });
        } else {
            makeCorrectMove(zPlayer, { X: 2, Y: 0 });
        }

        done();
    });

    it('Пятый ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 0, Y: 2 });
        } else {
            makeCorrectMove(zPlayer, { X: 0, Y: 2 });
        }

        done();
    });

    it('Шестой ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 3, Y: 0 });
        } else {
            makeCorrectMove(zPlayer, { X: 3, Y: 0 });
        }

        done();
    });

    it('Седьмой ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 0, Y: 3 });
        } else {
            makeCorrectMove(zPlayer, { X: 0, Y: 3 });
        }
        
        done();
    });

    it('Восьмой ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 4, Y: 0 });
        } else {
            makeCorrectMove(zPlayer, { X: 4, Y: 0 });
        }

        done();
    });

    it('Девятый ход', (done) => {
        if (gameInfo.turn === xPlayer.id) {
            makeCorrectMove(xPlayer, { X: 0, Y: 4 });
        } else {
            makeCorrectMove(zPlayer, { X: 0, Y: 4 });
        }

        done();
    });
});