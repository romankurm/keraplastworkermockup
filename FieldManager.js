export class FieldManager {

    constructor(selectedOrder, fetcher) {
        this.selectedOrder = selectedOrder;
        this.fetcher = fetcher;
    }

    async drawFields(pdf, pageNumber) {
        const page = await pdf.getPage(pageNumber);

        const textContent = await page.getTextContent();

        const viewport = page.getViewport({
            scale: 1.5
        });

        const pageContainer = document.createElement("div");
        pageContainer.style.position = "relative";
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        const hasTaskFieldsJSON = await this.fetcher.hasTaskFieldsJSON(this.selectedOrder.getGuid());

        let found = await this.isTextOnPage(page, "Tellimus valmis:");

        if (found && found.transform[5] > 700) {
            await this.drawTaskFields(page, hasTaskFieldsJSON, pageContainer);
        } else if (await this.isTextOnPage(page, "Katseraport")) {
            await this.drawReportFields(page, hasTaskFieldsJSON, pageContainer);
        }

        return pageContainer;

    }

    async drawReportFields(page, hasTaskFieldsJSON, pageContainer) {

        const viewport = page.getViewport({
            scale: 1.5
        });

        let textContent = await page.getTextContent();

        let krIndex = textContent.items.findLastIndex(item => (item.str.includes("Katseraport")));

        let krSheetItems = textContent.items.slice(krIndex, textContent.items.length - 1);

        let validFieldStrings = new Map([
            ["Kuupäev", 200],
            ["Avamisnurk", 80],
            ["Avamisaeg", 80],
            ["MAX voolutarve", 100],
            ["Mehaanilised", 300],
            ["Elektrilise", 300],
            ["Muu", 300],
            ["Kontrollis", 400]
        ]);

        let distances = new Map([
            ["Kuupäev", 110],
            ["Avamisnurk", 115],
            ["Avamisaeg", 115],
            ["MAX voolutarve", 150],
            ["Mehaanilised", 125],
            ["Elektrilise", 100],
            ["Muu", 50],
            ["Kontrollis", 125]
        ]);

        if (hasTaskFieldsJSON) {
            const jsonBytes = await this.fetcher.getObjectJSONBytes(this.selectedOrder.getGuid());

            const jsonString = new TextDecoder().decode(jsonBytes);

            let fieldsMap = JSON.parse(jsonString);

            let fieldsList = fieldsMap[2];

            for (let fieldObj of fieldsList) {
                if (fieldObj.type == "checkbox") {
                    this.createCheckbox(
                        pageContainer,
                        fieldObj.x,
                        fieldObj.y,
                        2,
                        fieldObj.value);
                } else {
                    this.createFieldWithWidth(
                        pageContainer,
                        fieldObj.x,
                        fieldObj.y,
                        fieldObj.value,
                        validFieldStrings.get(fieldObj.value),
                        2
                    );
                }
            }
        } else {
            let krSheetItems = textContent.items.slice(krIndex, textContent.items.length - 1);

            for (const sheetItem of krSheetItems) {

                const tx = pdfjsLib.Util.transform(
                    viewport.transform,
                    sheetItem.transform
                );

                if (sheetItem.str.includes("500")) {
                    this.createCheckbox(pageContainer, tx[4] - 38, tx[5], 2, false);
                } else if (sheetItem.str.includes("CE")) {
                    this.createCheckbox(pageContainer, tx[4] - 35, tx[5] + 5, 2, false);
                }

                for (let key of validFieldStrings.keys()) {
                    if (sheetItem.str.includes(key)) {
                        this.createFieldWithWidth(
                            pageContainer,
                            tx[4] + distances.get(key),
                            tx[5],
                            "",
                            validFieldStrings.get(key),
                            2
                        );
                    }
                }

            }
        }

    }

    async drawTaskFields(page, hasTaskFieldsJSON, pageContainer) {

        const textContent = await page.getTextContent();

        const viewport = page.getViewport({
            scale: 1.5
        });

        if (hasTaskFieldsJSON) {
            const jsonBytes = await this.fetcher.getObjectJSONBytes(this.selectedOrder.getGuid());

            const jsonString = new TextDecoder().decode(jsonBytes);

            let fieldsMap = JSON.parse(jsonString);

            let fieldsList = fieldsMap[1];

            for (let fieldObj of fieldsList) {
                this.createField(
                    pageContainer,
                    fieldObj.x,
                    fieldObj.y,
                    fieldObj.value,
                    1
                );

                if (fieldObj.value.includes("Pakime")) {
                    await this.createSalvestaButton(fieldObj.x - 7, fieldObj.y + 15, pageContainer, this.fetcher);
                }
            }
        } else {
            let startIndex = textContent.items.findIndex(item => (item.str.includes("Valmistaja:"))) + 2;
            let endIndex = textContent.items.findIndex(item => (item.str.includes("Katseraport")));

            let cleanedItems = textContent.items.slice(startIndex, endIndex);
            for (let item of cleanedItems) {
                const tx = pdfjsLib.Util.transform(
                    viewport.transform,
                    item.transform
                );

                this.createField(
                    pageContainer,
                    tx[4],
                    tx[5],
                    item.str,
                    1
                );

                if (item.str.includes("Pakime")) {
                    await this.createSalvestaButton(tx[4] - 7, tx[5] + 15, pageContainer, this.fetcher);
                }

            }
        }
    }

    async isTextOnPage(page, text) {
        return (await page.getTextContent()).items.findLast(
            item => item.str.includes(text)
        );
    }

    async createSalvestaButton(x, y, pageContainer, fetcher) {

        const selectedOrder = this.selectedOrder;

        let salvestaBtn = this.createButton(
            pageContainer,
            x,
            y,
            "salvesta-btn",
            "Salvesta"
        );
        let saving = false;

        salvestaBtn.addEventListener("click", async () => {
            // A second click while the first save is still deciding whether the
            // file exists creates a second taskFields file for the same order,
            // and a later read picks whichever it finds first.
            if (saving) return;
            saving = true;
            salvestaBtn.disabled = true;

            try {
            const allFields = Array.from(document.querySelectorAll(".task-field"));

            let fieldsMap = new Map();
            let fieldsList = [];

            let page_1_Fields = allFields.filter(field => field.dataset.page == "1");
            let page_2_Fields = allFields.filter(field => field.dataset.page == "2");

            fieldsMap[1] = [];

            page_1_Fields.forEach(field => {
                const fieldX = parseFloat(field.style.left);
                const fieldY = parseFloat(field.style.top) + 24;
                fieldsMap[1].push({
                    "value": field.dataset.type == "checkbox" ? field.checked : field.value,
                    "x": fieldX,
                    "y": fieldY,
                    "type": field.dataset.type
                });
            });

            fieldsMap[2] = [];

            page_2_Fields.forEach(field => {
                const fieldX = parseFloat(field.style.left);
                const fieldY = parseFloat(field.style.top) + 24;
                fieldsMap[2].push({
                    "value": field.dataset.type == "checkbox" ? field.checked : field.value,
                    "x": fieldX,
                    "y": fieldY,
                    "type": field.dataset.type
                });
            });

            const jsonFields = JSON.stringify(fieldsMap, null, 4);
            const jsonBytes = new TextEncoder().encode(jsonFields);

            if (!(await this.fetcher.hasTaskFieldsJSON(this.selectedOrder.getGuid()))) {
                await this.fetcher.createJsonFile(this.selectedOrder.getGuid(), jsonBytes);
            } else {
                await this.fetcher.replaceJsonFile(this.selectedOrder.getGuid(), await this.fetcher.getOrderFileGUID(this.selectedOrder.getGuid(), "taskFields"), jsonBytes);
            }
            } finally {
                saving = false;
                salvestaBtn.disabled = false;
            }
        });
    }


    createField(container, x, y, text, pageNr) {

        if (!text || text.trim() === "") return;

        const input = document.createElement("input");

        input.type = "text";

        input.style.position = "absolute";
        input.style.left = `${x}px`;
        input.style.top = `${y - 25}px`;

        // Appearance
        input.style.fontSize = "17px";
        input.style.fontFamily = "Arial, sans-serif";
        input.style.fontWeight = "400";
        input.style.color = "#1f2937";
        input.style.backgroundColor = "#ffffff";

        // Size
        input.style.height = "30px";
        input.style.padding = "3px 9px";

        // Border
        input.style.border = "1px solid #b8c0cc";
        input.style.borderRadius = "6px";

        // Subtle depth
        input.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.12)";

        // Focus appearance
        input.style.outline = "none";

        input.className = "task-field";
        input.dataset.page = pageNr;
        input.dataset.type = "textfield";

        let inputWidth = text.length * 18;

        if (inputWidth > 330) {
            inputWidth = 330;
        } else if (inputWidth < 50)
            inputWidth = 50;

        input.style.width = `${inputWidth}px`;

        input.value = text;

        container.appendChild(input);
    }

    createFieldWithWidth(container, x, y, text, width, pageNr) {

        const input = document.createElement("input");

        input.type = "text";

        input.style.position = "absolute";
        input.style.left = `${x}px`;
        input.style.top = `${y - 27}px`;

        // Appearance
        input.style.fontSize = "17px";
        input.style.fontFamily = "Arial, sans-serif";
        input.style.fontWeight = "400";
        input.style.color = "#1f2937";
        input.style.backgroundColor = "#ffffff";

        // Size
        input.style.height = "30px";
        input.style.padding = "3px 9px";

        // Border
        input.style.border = "1px solid #b8c0cc";
        input.style.borderRadius = "6px";

        // Subtle depth
        input.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.12)";

        input.style.outline = "none";

        input.className = "task-field";
        input.dataset.page = pageNr;
        input.dataset.type = "textfield";

        input.value = text;

        let inputWidth = width;

        input.style.width = `${inputWidth}px`;

        container.appendChild(input);
    }

    createCheckbox(container, x, y, pageNr, value) {

        const input = document.createElement("input");

        input.type = "checkbox";

        input.style.position = "absolute";
        input.style.left = `${x}px`;
        input.style.top = `${y - 24}px`;
        input.style.fontSize = `18px`;
        input.style.borderRadius = "8px";
        input.style.border = "1px solid black";
        input.style.height = "25px";
        input.className = "task-field";
        input.dataset.page = pageNr;
        input.dataset.type = "checkbox";
        input.checked = value;

        input.style.width = `25px`;

        container.appendChild(input);
    }

    createButton(container, x, y, className, value) {
        let btn = document.createElement("button");
        btn.style.position = "absolute";
        btn.style.left = `${x}px`;
        btn.style.top = `${y}px`;
        btn.style.fontSize = `18px`;
        btn.className = className;
        btn.textContent = value;
        btn.id = className;

        container.appendChild(btn);

        return btn;
    }

    async hasKatseraport(pdfBytes) {

        const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(pdfBytes)
        }).promise;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {

            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();

            const found = textContent.items.some(
                item => item.str.includes("Katseraport")
            );

            if (found) {
                return true;
            }
        }

        return false;
    }

}
