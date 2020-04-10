const gameStatus = require('./status').GameStatus;

const checkDiagonals = (matrix, point, winCount) => {
  const figure = matrix[point.X][point.Y];
  let count = 1;

  for (let i = point.X + 1, j = point.Y + 1;
    (i < matrix[0].length) && (i < point.X + winCount)
    && (j < matrix[0].length) && (j < point.Y + winCount); i += 1, j += 1) {
    if (matrix[i][j] === figure) { count += 1; } else { break; }
  }

  if (count < winCount) {
    for (let i = point.X - 1, j = point.Y - 1;
      (count < winCount) && (i > -1) && (i > point.X - winCount)
      && (j > -1) && (j > point.Y - winCount); i -= 1, j -= 1) {
      if (matrix[i][j] === figure) { count += 1; } else { break; }
    }
  }

  if (count < winCount) {
    count = 1;
    for (let i = point.X + 1, j = point.Y - 1;
      (count < winCount) && (i < matrix[0].length) && (i < point.X + winCount)
      && (j > -1) && (j > point.Y - winCount); i += 1, j -= 1) {
      if (matrix[i][j] === figure) { count += 1; } else { break; }
    }
  }

  if (count < winCount) {
    for (let i = point.X - 1, j = point.Y + 1;
      (count < winCount) && (i > -1) && (i > point.X - winCount)
      && (j < matrix[0].length) && (j < point.Y + winCount); i -= 1, j += 1) {
      if (matrix[i][j] === figure) { count += 1; } else { break; }
    }
  }

  return !(count < 5);
};

const checkHorizontal = (matrix, point, winCount) => {
  const figure = matrix[point.X][point.Y];
  let count = 1;

  for (let j = point.Y + 1; (j < matrix[0].length) && (j < point.Y + winCount); j += 1) {
    if (matrix[point.X][j] === figure) { count += 1; } else { break; }
  }

  if (count < winCount) {
    for (let j = point.Y - 1; (count < winCount) && (j > -1) && (j > point.Y - winCount); j -= 1) {
      if (matrix[point.X][j] === figure) { count += 1; } else { break; }
    }
  }

  return !(count < 5);
};

const checkVertical = (matrix, point, winCount) => {
  const figure = matrix[point.X][point.Y];
  let count = 1;

  for (let i = point.X + 1; (i < matrix[0].length) && (i < point.X + winCount); i += 1) {
    if (matrix[i][point.Y] === figure) { count += 1; } else { break; }
  }

  if (count < winCount) {
    for (let i = point.X - 1; (count < winCount) && (i > -1) && (i > point.X - winCount); i -= 1) {
      if (matrix[i][point.Y] === figure) { count += 1; } else { break; }
    }
  }

  return !(count < 5);
};

exports.getGameStatus = (field, winCount, point) => {
  if (checkHorizontal(field.matrix, point, winCount)
        || checkVertical(field.matrix, point, winCount)
        || checkDiagonals(field.matrix, point, winCount)) {
    return gameStatus.Win;
  } if (field.emptyCount === 0) {
    return gameStatus.Draw;
  }

  return gameStatus.InProcess;
};
