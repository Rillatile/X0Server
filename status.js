exports.ClientStatus = Object.freeze({
  InMenu: 0, InLobbiesList: 1, InLobby: 2, InGame: 3,
});
exports.LobbyStatus = Object.freeze({
  Open: 0, Game: 1, Close: 2, Paused: 3,
});
exports.GameStatus = Object.freeze({ Win: 0, Draw: 1, InProcess: 2 });
exports.SymbolStatus = Object.freeze({ Cross: 0, Nought: 1, Empty: 2 });
