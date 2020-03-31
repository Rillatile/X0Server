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