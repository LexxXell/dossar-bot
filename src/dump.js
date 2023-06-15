require('dotenv').config();
const fs = require('fs');
const parser = require('./parser');
const BotSettings = require('./models/botSettings.model');
const Owner = require('./models/owner.model');

async function dump() {
  const botSettings = await BotSettings.findOne();
  const settings = { token: botSettings.token };

  const botOwner = await Owner.findOne();
  const owner = {
    id: botOwner.id,
    name: botOwner.name,
    contacts: botOwner.contacts,
    phone: botOwner.phone,
  };

  const appsWithSub = await parser.models.Application.find({ subscribers: { $ne: [] } });
  const applications = [];
  for (let app of appsWithSub) {
    applications.push({
      index: app.index,
      subscribers: app.subscribers,
    });
  }

  try {
    fs.writeFileSync(`dumps/dossar_bot_${Date.now()}.dump.json`, JSON.stringify({ owner, settings, applications }), {
      encoding: 'utf8',
    });
  } catch (e) {
    console.log('[ERROR] Dump error: ' + e);
  }
}

async function main() {
  require('./db');
  await dump();
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = dump;
