export class Task {
    constructor(guid, operation, status, startDate) {
        this.guid = guid;
        this.operation = operation;
        this.status = status;
        this.startDate = startDate;
    }
}