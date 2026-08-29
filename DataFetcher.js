import { Order } from "./Order.js";
import { Task } from "./Task.js";

export class DataFetcher {

    static apiKey = null;

    // Prodcell posts its own API root in via postMessage (prodcell_api_url), so the
    // board follows whichever tenant embeds it instead of pinning one host.
    static apiBase = "https://keraplast.prodcell.com/api";

    static setApiBase(url) {
        if (!url) return;
        DataFetcher.apiBase = String(url).replace(/\/+$/, "");
    }

    async request(path, options = {}) {
        if (!DataFetcher.apiKey) {
            throw new Error("API key puudub, tahvel ei saa Prodcelliga ühendust.");
        }

        const headers = {
            "X-API-KEY": DataFetcher.apiKey,
            "Accept": "application/json",
            ...(options.headers || {})
        };

        const response = await fetch(`${DataFetcher.apiBase}${path}`, { ...options, headers });

        if (options.raw) return response;

        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }

        if (!response.ok || (payload && payload.error)) {
            const message = (payload && (payload.error || payload.message)) || response.statusText;
            throw new Error(`${options.method || "GET"} ${path}: ${message}`);
        }

        return payload;
    }

    async getObjects(objectName, params = "") {
        return await this.request(`/objects/${objectName}?limit=1000${params}`);
    }

    async getOrders() {
        let newOrders = [];

        const ordersJSON = await this.getObjects("Order");
        const orders = ordersJSON.data;

        for (const order of orders) {

            const ordr = DataFetcher.orderFromJSON(order);

            if (ordr.getTask() != null)
                newOrders.push(ordr);

        }

        return newOrders;
    }

    static orderFromJSON(order) {
        return new Order(
            order.guid,
            order.number,
            order.invoiceNumber,
            order.clientName,
            order.productQuantity,
            order.productSpec,
            order.material,
            null,
            order.comments,
            order.status
        );
    }

    /**
     * Production operations as configured in Prodcell. Operation.id IS the code
     * ("L", "N", "P", "K"), so the board never hard-codes the operation set -
     * only the order they run in, which the API does not carry.
     */
    async getOperations(sequence = []) {
        const json = await this.getObjects("Operation");
        const all = (json.data || []).map(op => ({
            id: op.id,
            code: String(op.id || "").trim(),
            // The API serialises the localised columns, not a resolved "name".
            name: (op.nameEt || op.name || op.nameEn || op.fullName || op.id || "").trim(),
            department: (op.department && op.department.id) || op.department || null
        }));

        // Keraplast's board is about L/N/P/K; anything else in the Operation
        // table belongs to another tenant or another process. Fall back to the
        // full list if the configured sequence matches nothing.
        const wanted = all.filter(op => sequence.includes(op.code));
        const operations = wanted.length ? wanted : all;

        const rank = code => {
            const i = sequence.indexOf(code);
            return i === -1 ? sequence.length : i;
        };

        operations.sort((a, b) => {
            const ra = rank(a.code), rb = rank(b.code);
            if (ra !== rb) return ra - rb;
            return a.code.localeCompare(b.code);
        });

        return operations;
    }

    /**
     * Every task the current key may read, indexed by order GUID and operation id.
     * The tasks API has no order filter, so one wide read beats one call per row.
     */
    async getTasks() {
        const json = await this.request(`/tasks?limit=10000`);
        return (json.data || []).map(t => new Task(
            t.guid,
            t.operation,
            t.status,
            t.realStart,
            t.order,
            t.operationName,
            t.realEnd
        ));
    }

    async getTasksByOrder() {
        const byOrder = new Map();
        for (const task of await this.getTasks()) {
            if (!task.order) continue;
            if (!byOrder.has(task.order)) byOrder.set(task.order, []);
            byOrder.get(task.order).push(task);
        }
        return byOrder;
    }

    /**
     * Create the Task that carries one operation of one order.
     */
    async createTask(orderGuid, operationId) {
        const json = await this.request(
            `/orders/${orderGuid}/create_task?operation=${encodeURIComponent(operationId)}`,
            { method: "POST" }
        );
        const t = json.data || json;
        return new Task(
            t.guid,
            typeof t.operation === "object" && t.operation ? t.operation.id : t.operation,
            t.status,
            t.realStart,
            t.order,
            t.operationName,
            t.realEnd
        );
    }

    /**
     * start | pause | resume | end on one task. This is what actually books work
     * per operation; the order-level route can only ever touch a single task.
     */
    async taskOperation(taskGuid, operation, performance = {}) {
        const json = await this.request(`/tasks/${taskGuid}/${operation}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(performance)
        });
        const t = json.data || json;
        return new Task(t.guid, t.operation, t.status, t.realStart, t.order, t.operationName, t.realEnd);
    }

    async getObjectPDFGuid(object_id) {

        const responseDataList = (await this.getOrderFilesList(object_id)) || [];

        if (responseDataList.length === 0)
            return null;

        for (let dataObj of responseDataList) {

            if (dataObj["name"] == null)
                continue;

            if (dataObj["name"].includes("pdf"))
                return dataObj["guid"];

        }
        return null;
    }

    async getObjectPDFBytes(object_id) {

        let pdf_guid = await this.getObjectPDFGuid(object_id);

        if (pdf_guid == null) return null;

        const response = await this.request(
            `/objects/Order/${object_id}/files/${pdf_guid}/download`,
            { raw: true }
        );

        return await response.arrayBuffer();

    }

    async getObjectJSONBytes(object_id) {

        let json_guid = await this.getOrderFileGUID(object_id, "taskFields");

        if (json_guid == null) return null;

        const response = await this.request(
            `/objects/Order/${object_id}/files/${json_guid}/download`,
            { raw: true }
        );

        return await response.arrayBuffer();

    }

    async getOrderByGUID(guid) {
        const orderJSON = await this.request(`/objects/Order/${guid}`);
        return DataFetcher.orderFromJSON(orderJSON.data || orderJSON);
    }

    async createJsonFile(guid, jsonBytes) {
        return await this.request(
            `/objects/Order/${guid}/files?name=taskFields&mimetype=application/json`,
            { method: "POST", body: jsonBytes }
        );
    }

    async replaceJsonFile(order_guid, file_guid, jsonBytes) {
        return await this.request(
            `/objects/Order/${order_guid}/files/${file_guid}?name=taskFields&mimetype=application/json`,
            { method: "POST", body: jsonBytes }
        );
    }

    async getOrderFilesList(guid) {
        const orderFileListJSON = await this.request(`/objects/Order/${guid}/files?deleted=0`);
        return orderFileListJSON.data || [];
    }

    async hasTaskFieldsJSON(guid) {
        return (await this.getOrderFileGUID(guid, "taskFields")) != null;
    }

    async getOrderFileGUID(guid, fileName) {
        const filesList = await this.getOrderFilesList(guid);

        for (const fileObj of filesList) {
            if (fileObj.name == fileName) {
                return fileObj.guid;
            }
        }

        return null;
    }

    async deleteOrderFile(guid, fileName) {

        let fGUID = await this.getOrderFileGUID(guid, fileName);

        if (fGUID == null) return;

        return await this.request(
            `/objects/Order/${guid}/files/${fGUID}`,
            { method: "DELETE" }
        );
    }

    async getMyInfo() {
        return await this.request(`/me`);
    }

    async getMyRoles() {
        let infoJSON = await this.getMyInfo();
        return (infoJSON && infoJSON.user && infoJSON.user.roles) || [];
    }

};
