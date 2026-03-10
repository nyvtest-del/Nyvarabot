const content = 'Si quieres, puedo intentar buscar información sobre Fusicare utilizando la función de búsqueda de conocimiento. <function=knowledge_search{"query": "Fusicare"}></function>';

const toolCalls: any[] = [];
let newContent = content;

const exactRegex = /<function=([a-zA-Z0-9_]+)(\{.*?\})?>(?:.*?<\/function>)?/g;

let match;
while ((match = exactRegex.exec(newContent)) !== null) {
    const name = match[1];
    const argsStr = match[2] || "{}";

    toolCalls.push({
        id: `call_manual_123`,
        type: "function",
        function: { name, arguments: argsStr }
    });

    newContent = newContent.replace(match[0], "").trim();
}

console.log("New Content:", newContent);
console.log("Tool Calls:", JSON.stringify(toolCalls, null, 2));
