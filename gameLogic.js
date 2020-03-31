const gameStatus = require('./status').GameStatus;

checkDiagonals = (matrix, point, winCount) => {
    const figure = matrix[point.X][point.Y];
    let count = 1;

    for (let i = point.X + 1, j = point.Y + 1;
        (i < matrix[0].length) && (i < i + winCount) && (j < matrix[0].length) && (j < j + winCount); i++, j++) {
        if (matrix[i][j] == figure)
            count++;
        else
            break;
    }

    if (count < winCount) {
        for (let i = point.X - 1, j = point.Y - 1;
            (i > i - winCount) && (i > -1)
            && (j > j - winCount) && (j > -1); i--, j--) {
            if (matrix[i][j] == figure)
                count++;
            else
                break;
        }
    }

    if (count < winCount) {
        for (let i = point.X + 1, j = point.Y - 1;
            (i < i + winCount) && (i < matrix[0].length)
            && (j > j - winCount) && (j > -1); i++, j--) {
            if (matrix[i][j] == figure)
                count++;
            else
                break;
        }
    }

    if (count < winCount) {
        for (let i = point.X - 1, j = point.Y + 1;
            (i > i - winCount) && (i > -1)
            && (j < j + winCount) && (j > matrix[0].length); i--, j++) {
            if (matrix[i][j] == figure)
                count++;
            else
                break;
        }
    }

    return !(count < 5);
};

checkHorizontal = (matrix, point, winCount) => {
    const figure = matrix[point.X][point.Y];
    let count = 1;

    for (let j = point.Y + 1; (j < j + winCount) && (j < matrix[0].length); j++) {
        if (matrix[point.X][j] == figure)
            count++;
        else
            break;
    }

    if (count < winCount) {
        for (let j = point.Y - 1; (j > j - winCount) && (j > -1); j--)
            if (matrix[point.X][j] == figure)
                count++;
            else
                break;
    }

    return !(count < 5);
};

checkVertical = (matrix, point, winCount) => {
    const figure = matrix[point.X][point.Y];
    let count = 1;

    for (let i = point.X + 1; (i < i + winCount) && (i < matrix[point.Y].length); i++) {
        if (matrix[i][point.Y] == figure)
            count++;
        else
            break;
    }

    if (count < winCount) {
        for (let i = point.X - 1; (i > i - winCount) && (i > -1); i--)
            if (matrix[i][point.Y] == figure)
                count++;
            else
                break;
    }

    return !(count < 5);
};

exports.getGameStatus = (field, winCount, point) => {
    if (checkHorizontal(field.matrix, point, winCount)
        || checkVertical(field.matrix, point, winCount)
        || checkDiagonals(field.matrix, point, winCount)) {
        return gameStatus.Win;
    } else if (field.emptyCount == 0) {
        return gameStatus.Draw;
    } else {
        return gameStatus.InProcess;
    }
};