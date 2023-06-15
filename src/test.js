require('dotenv').config();
const parser = require("./parser");

async function main() {

    await parser.runParseOath(console.log)
  
}

main();
