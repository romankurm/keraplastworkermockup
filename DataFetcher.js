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

    // Without this a half open connection never settles, the action that is
    // waiting on it never finishes, and every later press of Alusta is dropped
    // on the floor by the busy flag with nothing shown to the worker.
    static REQUEST_TIMEOUT_MS = 20000;

    async request(path, options = {}) {
        if (!DataFetcher.apiKey) {
            throw new Error("API key puudub, tahvel ei saa Prodcelliga ühendust.");
        }

        const headers = {
            "X-API-KEY": DataFetcher.apiKey,
            "Accept": "application/json",
            ...(options.headers || {})
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DataFetcher.REQUEST_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(`${DataFetcher.apiBase}${path}`, {
                ...options,
                headers,
                signal: controller.signal
            });
        } catch (e) {
            if (e.name === "AbortError") {
                throw new Error(`${options.method || "GET"} ${path}: Prodcell ei vastanud ${DataFetcher.REQUEST_TIMEOUT_MS / 1000} sekundi jooksul`);
            }
            throw new Error(`${options.method || "GET"} ${path}: ${e.message}`);
        } finally {
            clearTimeout(timer);
        }

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
     * A row count from the API, or null when the value cannot be one.
     *
     * Not Number(): that reads null, false and "" as 0, so a response carrying
     * any of them would look like a trustworthy empty page and the board would
     * conclude that no operation has been started on anything.
     */
    static rowCount(raw) {
        if (typeof raw === "number") return Number.isInteger(raw) && raw >= 0 ? raw : null;
        if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
        return null;
    }

    static PAGE_SIZE = 1000;
    static MAX_PAGES = 50;

    /**
     * Tasks for the given operations, fully paged.
     *
     * A single unpaged read looks fine until the tenant passes the API's row cap,
     * and then a task that exists silently drops out of the answer, the board
     * calls its operation unstarted and Alusta opens a second task beside the
     * real one. So: scope by operation, sort deterministically (paging without a
     * stable sort can repeat and skip rows), and keep reading until the server's
     * own total is covered.
     */
    async getTasks(operationIds = []) {
        const filters = operationIds.length
            ? operationIds.map(id => `&operation=${encodeURIComponent(id)}`)
            : [""];

        const tasks = [];

        for (const filter of filters) {
            let page = 1;
            let fetched = 0;
            let total = Infinity;

            while (fetched < total && page <= DataFetcher.MAX_PAGES) {
                const json = await this.request(
                    `/tasks?limit=${DataFetcher.PAGE_SIZE}&page=${page}&sortField=guid&sortOrder=ASC${filter}`
                );

                if (!json || !Array.isArray(json.data)) {
                    throw new Error(`Taskide vastuses ei ole massiivi`);
                }
                const rows = json.data;

                const reported = DataFetcher.rowCount(json.total);
                if (reported === null) {
                    throw new Error(`Taskide vastuses ei ole kasutatavat total-i: ${JSON.stringify(json.total)}`);
                }
                total = reported;

                for (const t of rows) {
                    tasks.push(new Task(
                        t.guid,
                        t.operation,
                        t.status,
                        t.realStart,
                        t.order,
                        t.operationName,
                        t.realEnd
                    ));
                }

                fetched += rows.length;
                if (fetched > total) {
                    throw new Error(`Taskide vastus andis ${fetched} rida, total on ${total}`);
                }

                if (!rows.length) break;
                page++;
            }

            if (fetched < total) {
                throw new Error(`Taske loeti ${fetched} ${total}-st, seis on puudulik`);
            }
        }

        return tasks;
    }

    async getTasksByOrder(operationIds = []) {
        const byOrder = new Map();
        for (const task of await this.getTasks(operationIds)) {
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
    /**
     * One task with its booked time. The task list leaves runTimeSec out, and
     * the number has to come from the server anyway: it is the sum of the
     * task's finished work plus the segment running right now, so it survives a
     * page reload and reads the same on every screen.
     */
    async getTask(taskGuid) {
        const json = await this.request(`/tasks/${encodeURIComponent(taskGuid)}`);
        return json.data || json;
    }

    async taskOperation(taskGuid, operation, performance = {}) {
        const json = await this.request(`/tasks/${taskGuid}/${operation}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(performance)
        });
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
