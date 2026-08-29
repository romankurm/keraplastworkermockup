/**
 * One operation of one order. Prodcell task statuses:
 *   A new, B blocked, G ready to go, W working, P paused, R interrupted,
 *   Y done, Z accepted, X cancelled
 */
export class Task {

    static NEW = "A";
    static BLOCKED = "B";
    static READY = "G";
    static WORKING = "W";
    static DONE = "Y";
    static ACCEPTED = "Z";
    static PAUSED = "P";
    static INTERRUPTED = "R";
    static CANCELLED = "X";

    constructor(guid, operation, status, startDate, order, operationName, endDate) {
        this.guid = guid;
        this.operation = operation;
        this.status = status;
        this.startDate = startDate;
        this.order = order;
        this.operationName = operationName;
        this.endDate = endDate;
    }

    isWorking() {
        return this.status === Task.WORKING;
    }

    isPaused() {
        return this.status === Task.PAUSED || this.status === Task.INTERRUPTED;
    }

    isDone() {
        return this.status === Task.DONE || this.status === Task.ACCEPTED;
    }

    isCancelled() {
        return this.status === Task.CANCELLED;
    }

    /** Not started yet and not closed. */
    isOpen() {
        return !this.isDone() && !this.isCancelled();
    }

    /** Which lifecycle verb the big button should send next. */
    nextOperation() {
        if (this.isWorking()) return "end";
        if (this.isPaused()) return "resume";
        if (this.isDone() || this.isCancelled()) return null;
        return "start";
    }

    statusText() {
        if (this.isWorking()) return "Töös";
        if (this.isPaused()) return "Peatatud";
        if (this.isDone()) return "Tehtud";
        if (this.isCancelled()) return "Tühistatud";
        return "Ootel";
    }
}
