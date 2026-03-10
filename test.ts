import { knowledgeSearchTool } from "./src/tools/knowledge-search.js";

async function run() {
    const result = await knowledgeSearchTool.execute({
        query: "LION"
    }, {} as any);
    console.log("Result:", result);
}

run().catch(console.error);
