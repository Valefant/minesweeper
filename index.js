let gameField = null;
const toolbar = {
    flagCounter: 0,
    seconds: 0,
};
let difficulty = "beginner";

const documentEl = getComputedStyle(document.documentElement);
const gameFieldEl = document.querySelector("#gameField");
const difficultyEl = document.querySelector("#difficulty");
const flagCounterEl = document.querySelector("#flagCounter");
const resetEl = document.querySelector("#reset");
const elapsedSecondsEl = document.querySelector("#elapsedSeconds");
const replayEl = document.querySelector("#replay");
const gameEndedEl = document.querySelector("#gameEnded");

// avoid caching of the selected option on page refresh
difficultyEl.value = "beginner";

const numberColors = ["blue", "green", "red", "darkblue", "brown", "turquoise", "black", "grey"];

const handler = {
    set(obj, prop, value) {
        switch (prop) {
            case "flagCounter":
                flagCounterEl.textContent = `${value}`;
                break;
            case "seconds":
                elapsedSecondsEl.textContent = `${value}`;
                break;
        }

        return Reflect.set(...arguments);
    }
};

const toolbarProxy = new Proxy(toolbar, handler);

function initializeEventListeners() {
    replayEl.addEventListener("input", e => {
        const index = Number(e.target.value) - 1;
        gameField.render(index);
    });

    document.addEventListener("mousedown", e => {
        if (!gameField?.blockInput) {
            resetEl.textContent = "🧐";
        }
    });

    document.addEventListener("mouseup", e => {
        if (!gameField?.blockInput) {
            resetEl.textContent = "🙂";
        }
    });

    resetEl.addEventListener("click", e => {
        restart();
    });

    difficultyEl.addEventListener("change", e => {
        gameFieldEl.classList.replace(difficulty, e.target.value);
        difficulty = e.target.value;
        restart();
    });
}

function getGameSettings(difficulty) {
    const rows = Number(documentEl.getPropertyValue(`--${difficulty}-rows`));
    const columns = Number(documentEl.getPropertyValue(`--${difficulty}-columns`));
    const mines = Number(documentEl.getPropertyValue(`--${difficulty}-mines`));

    return {rows, columns, mines};
}

function restart() {
    const {rows, columns, mines} = getGameSettings(difficulty);
    toolbarProxy.flagCounter = mines;

    gameField?.stopTimer();
    gameField = new GameField(rows, columns, mines);
    gameField.render();
    gameField.onGameEnded((gameFieldInstance, gameState) => {
        if (gameState === 'won') {
            gameEndedEl.textContent = 'You won the game. Awesome!';
            gameFieldInstance.placeFlagsOnRemainingMines();
            flagCounterEl.textContent = '0';
        } else if (gameState === 'lost') {
            gameEndedEl.textContent = 'You lost the game!';
            gameFieldInstance.revealMines();
            resetEl.textContent = "🤯";
        }
        gameFieldInstance.saveState();
        gameFieldInstance.render();
        gameFieldInstance.blockInput = true;
        gameFieldInstance.stopTimer();

        replayEl.max = gameFieldInstance.states.length;
        replayEl.value = replayEl.max;
        replayEl.disabled = false;
    });
    gameField.onMineEvent(() => {});
    gameField.onFlagEvent((flag) => {
        toolbarProxy.flagCounter += flag;
    });

    resetEl.textContent = "🙂";
    toolbarProxy.seconds = 0;
    gameEndedEl.textContent = "";
    replayEl.disabled = true;
}

class Cell {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.revealed = false;
        this.flag = false;
        this.mine = false;
        this.data = -1;
    }

    forEachNeighbour(gameField, f) {
        const horizontal = [this.x - 1, this.x, this.x + 1];
        const vertical = [this.y - 1, this.y, this.y + 1];

        for (const x of horizontal) {
            for (const y of vertical) {
                // don"t count the cell itself
                if (x === this.x && y === this.y) {
                    continue;
                }

                if (gameField.outOfBounce(x, y)) {
                    continue;
                }

                f(gameField.cells[y][x]);
            }
        }
    }

    setNeighbourMinesCounter(gameField) {
        // we don"t need to count the neighbours if the cell is a mine
        if (this.mine) {
            return;
        }

        let neighbourMines = 0;
        this.forEachNeighbour(gameField, c => {
            neighbourMines += c.mine;
        })
        this.data = neighbourMines;
    }

    revealNeighbours(gameField, mine = false) {
        this.forEachNeighbour(gameField, c => {
            if (!mine && c.mine) {
                return;
            }

            c.revealed = true;
            c.flag = false;
        })
    }
}

function nestedCopy(array) {
    return JSON.parse(JSON.stringify(array))
}

class GameField {
    constructor(rows, columns, mines) {
        this.rows = rows;
        this.columns = columns;
        this.mines = mines;
        this.cells = this.generate(rows, columns, mines);
        this.forEachCell(c => c.setNeighbourMinesCounter(this));
        this.intervalId = null;
        this.blockInput = false;
        this.states = [nestedCopy(this.cells)];
        this.playerRevealedMine = null;
    }

    onGameEnded(f) {
        this.gameEndedListenerFunc = f;
    }

    onMineEvent(f) {
        this.mineListenerFunc = f;
    }

    onFlagEvent(f) {
        this.flagListenerFunc = f;
    }

    forEachCell(f) {
        this.cells.flatMap(row => row).forEach(f);
    }

    flattenedCells() {
        return this.cells.flatMap(row => row);
    }

    outOfBounce(x, y) {
        return (x < 0 || x >= this.columns || y < 0 || y >= this.rows);
    }

    debug() {
        this.forEachCell(c => c.revealed = true);
        this.render();
    }

    generate() {
        const cells = Array(this.rows).fill(0).map((_, r) => {
            return Array(this.columns).fill(0).map((_, c) => new Cell(c, r));
        });

        return this.generateMines(cells);
    }

    generateMines(cells) {
        const pool = cells.flatMap(row => row);

        for (let i = 0; i < this.mines; i++) {
            const index = Math.floor(Math.random() * pool.length);
            const chosenCell = pool[index];
            chosenCell.mine = true;
            pool.splice(index, 1);
        }

        return cells;
    }

    startTimer() {
        if (!this.intervalId) {
            this.intervalId = setInterval(() => {
                toolbarProxy.seconds = Math.min(++toolbar.seconds, 999);
            }, 1000);
        }
    }

    stopTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    updateState(cell, action) {
        this.startTimer();

        if (action === "quick-reveal") {
            if (cell.revealed) {
                let flaggedCells = 0;
                cell.forEachNeighbour(this, c => {
                    flaggedCells += c.flag;
                });
                // quick reveal is only allowed, when the player has placed the amount of flags,
                // which equal to the neighbour count of the mines
                if (flaggedCells !== cell.data) {
                    return;
                }

                let flaggedMines = 0;
                cell.forEachNeighbour(this, c => {
                    flaggedMines += c.mine && c.flag;
                })

                cell.forEachNeighbour(this, c => {
                   this.revealNeighbours(c.x, c.y);
                })
                // reveal mines only, when the player guessed wrong
                cell.revealNeighbours(this, flaggedMines !== cell.data);
                this.revealSurroundingsOfOpenCells();

                // set one of the revealed mines
                cell.forEachNeighbour(this, c => {
                    if (c.revealed && c.mine) {
                        this.playerRevealedMine = c;
                        this.mineListenerFunc(c);
                    }
                });
            }
        }

        if (action === "reveal") {
            if (!cell.revealed) {
                // neighbours should only be revealed when clicking on an empty cell
                if (!cell.data) {
                    this.revealNeighbours(cell.x, cell.y);
                    this.revealSurroundingsOfOpenCells();
                    // Revealing cells can also lead to a case where a flagged cell is revealed.
                    // To avoid a mismatch between the displayed flags and the flag counter,
                    // we need to update the flag counter with the currently active flags
                    this.updateFlagCounter();
                } else if (cell.mine) {
                    cell.revealed = true;
                    this.playerRevealedMine = cell;
                    this.mineListenerFunc(cell);
                } else if (cell.data) {
                    cell.revealed = true;
                }
            }
        }

        if (action === "flag" && !cell.revealed) {
            cell.flag = !cell.flag;
            this.flagListenerFunc(!cell.flag ? 1 : -1);
        }

        this.saveState();

        if (this.playerWon()) {
            this.gameEndedListenerFunc(this, 'won');
        } else if (this.playerLost()) {
            this.gameEndedListenerFunc(this, 'lost');
        }
    }

    saveState() {
        this.states.push(nestedCopy(this.cells));
    }

    playerWon() {
        const cellsToReveal = this.rows * this.columns - this.mines;
        let cellsRevealed = 0;
        this.forEachCell(c => {
            if (c.revealed && !c.mine) {
                cellsRevealed++;
            }
        })

        return cellsRevealed >= cellsToReveal;
    }

    playerLost() {
        return this.flattenedCells().some(c => c.revealed && c.mine);
    }

    revealMines() {
        this.forEachCell(c => {
            if (c.mine) {
                c.revealed = true;
            }
        });
    }

    placeFlagsOnRemainingMines() {
        this.forEachCell(c => {
            if (!c.revealed && c.mine) {
                c.flag = true;
            }
        });
    }

    // implements the flood fill algorithm to reveal empty neighbour cells
    revealNeighbours(x, y) {
        if (this.outOfBounce(x, y)) {
            return;
        }

        const cell = this.cells[y][x];
        if (!cell.revealed && !cell.data) {
            cell.revealed = true;
            cell.flag = false;

            // north
            this.revealNeighbours(x, y - 1);
            // west
            this.revealNeighbours(x - 1, y);
            // south
            this.revealNeighbours(x, y + 1);
            // east
            this.revealNeighbours(x + 1, y);
        }
    }

    revealSurroundingsOfOpenCells() {
        this.forEachCell(c => {
            if (c.revealed && !c.data) {
                c.revealNeighbours(this);
            }
        });
    }

    render(i) {
        const container = document.querySelector("#gameField");

        const cells = [];
        const flattenedCells = this.states[i ?? this.states.length - 1].flatMap(row => row);
        for (const cell of flattenedCells) {
            const cellContainer = document.createElement("button");
            cellContainer.dataset.x = `${cell.x}`;
            cellContainer.dataset.y = `${cell.y}`;
            cellContainer.classList.add("base-cell");

            if (cell.flag) {
                cellContainer.textContent = "🚩";
            }
            if (cell.revealed) {
                cellContainer.classList.add("revealed-cell");
                cellContainer.textContent = cell.mine ? "💣" : (cell.data ? cell.data : "");
                cellContainer.style.fontWeight = "bold";
                cellContainer.style.color = numberColors[(cell.data - 1) ?? 0];

                if (this.playerRevealedMine && cell.x === this.playerRevealedMine.x && cell.y === this.playerRevealedMine.y) {
                    cellContainer.style.background = 'red';
                }
            }

            const clickHandler = (cell, action) => {
                this.updateState(cell, action);
                this.render();
            }
            cellContainer.addEventListener("mouseup", e => {
                if (this.blockInput) {
                    return;
                }

                const cell = this.targetToCell(e.target);

                if (e.button === 0 && !cell.flag) {
                    clickHandler(cell, "reveal")
                }

                if (e.button === 1) {
                    clickHandler(cell, "quick-reveal")
                }

                if (e.button === 2) {
                    clickHandler(cell, "flag");
                }
            });
            cellContainer.addEventListener("contextmenu", e => {
                e.preventDefault();
            });

            cells.push(cellContainer);
        }

        container.replaceChildren(...cells)
    }

    targetToCell(target) {
        const x = Number(target.dataset.x);
        const y = Number(target.dataset.y);
        return this.cells[y][x];
    }

    updateFlagCounter() {
        let activeFlags = this.mines;
        this.forEachCell(c => {
            if (c.flag) {
                activeFlags--;
            }
        });
        toolbarProxy.flagCounter = activeFlags;
    }
}

initializeEventListeners();
restart();