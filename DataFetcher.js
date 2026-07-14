import { Order } from "./Order.js";

export let data = [
    {
        t_nr: "T1221",
        material: "P",
        so_nr: 4042,
        client: "EhitusFirma",
        object: "Ehitusplats",
        order_task: "23/01: 1200*2400 750/70 RR20/Zn",
        amount: 5,
        state: "lnpk",
        status: "active",
        completion_date: null
    },
    {
        t_nr: "T1231",
        material: "P",
        so_nr: 4043,
        client: "Lammutusfirma",
        object: "Lammutusplats",
        order_task: "23/01/K: 1000*1000 300/70 Zn/Zn 500N:1tk",
        amount: 1,
        state: "p",
        status: "done",
        completion_date: "2026-05-24"
    },
    {
        t_nr: "T1331",
        material: "P",
        so_nr: 4044,
        client: "LaheFirma",
        object: "Lahe koht ehitamiseks",
        order_task: "23/PC: 1200*1200 850/70 RR20/RR23",
        amount: 2,
        state: "pk",
        status: "active",
        completion_date: null
    },
];

export class DataFetcher {

    async getObjects(objectName) {
        const url = new URL(
            `https://keraplast.prodcell.com/api/objects/${objectName}`
        );

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-API-KEY": "nW1gnRO8SUWVuqhGN5V9xH05PiGTNtdl",
                "Accept": "application/json"
            }
        });

        return await response.json();
    }

    async getOrders() {
        let newOrders = [];

        const ordersJSON = await this.getObjects("Order");
        const orders = ordersJSON.data;

        for (const order of orders) {

            const guid = order.guid;
            const t_nr = order.number;
            const so_nr = order.invoiceNumber;
            const client = order.clientName;
            const amount = order.productQuantity;
            const task = order.productSpec;
            const material = order.material;
            const comments = order.comments;
            const status = order.status;

            let ordr = new Order(guid, t_nr, so_nr, client, amount, task, material, "test.pdf", comments, status);

            if (task != null)
                newOrders.push(ordr);

        }

        return newOrders;
    }

    async getObjectPDFGuid(object_id) {
        const url = new URL(
            `https://keraplast.prodcell.com/api/objects/Order/${object_id}/files`
        );

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-API-KEY": "nW1gnRO8SUWVuqhGN5V9xH05PiGTNtdl",
                "Accept": "application/json"
            }
        });

        let responseJson = await response.json();

        let responseDataList = responseJson["data"];

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

        const url = new URL(
            `https://keraplast.prodcell.com/api/objects/Order/${object_id}/files/${pdf_guid}/download`
        );

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-API-KEY": "nW1gnRO8SUWVuqhGN5V9xH05PiGTNtdl",
                "Accept": "application/json"
            }
        });

        return await response.arrayBuffer();

    }
};