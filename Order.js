export class Order {

    static currentOrders = [];

    constructor(guid, t_nr, so_nr, client, amount, task, material, pdf) {
        this.guid = guid;
        this.t_nr = t_nr;
        this.so_nr = so_nr;
        this.client = client;
        this.amount = amount;
        this.task = task;
        this.material = material;
        this.pdf = pdf;
    }

    getGuid() {
        return this.guid;
    }

    setGuid(value) {
        this.guid = value;
    }

    getTNr() {
        return this.t_nr;
    }

    setTNr(value) {
        this.t_nr = value;
    }

    getSoNr() {
        return this.so_nr;
    }

    setSoNr(value) {
        this.so_nr = value;
    }

    getClient() {
        return this.client;
    }

    setClient(value) {
        this.client = value;
    }

    getAmount() {
        return this.amount;
    }

    setAmount(value) {
        this.amount = value;
    }

    getTask() {
        return this.task;
    }

    setTask(value) {
        this.task = value;
    }

    getMaterial() {
        return this.material;
    }

    setMaterial(value) {
        this.material = value;
    }

    getPdf() {
        return this.pdf;
    }

    setPdf(value) {
        this.pdf = value;
    }

    async startTask() {

        const url = `https://keraplast.prodcell.com/api/orders/${this.getGuid()}/start`

        const response = await fetch(url, 
            {
                method: "POST",
                headers: {
                    "X-API-KEY": "nW1gnRO8SUWVuqhGN5V9xH05PiGTNtdl"
                }
            }
        );

    }

    async endTask() {

        const url = `https://keraplast.prodcell.com/api/orders/${this.getGuid()}/end`

        const response = await fetch(url, 
            {
                method: "POST",
                headers: {
                    "X-API-KEY": "nW1gnRO8SUWVuqhGN5V9xH05PiGTNtdl"
                }
            }
        );

    }

}